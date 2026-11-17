import { createHash } from "node:crypto";
import { existsSync, realpathSync } from "node:fs";
import { readFile, stat } from "node:fs/promises";
import { homedir } from "node:os";
import { basename, dirname, isAbsolute, join, resolve } from "node:path";
import { type ProgressEventLike, type ProgressSummary, parseProgressEvents, progressPluginState, reduceProgressSummary } from "../shared/progress.ts";
import { PASEO_HOME } from "./paseo-home.ts";

/*
 * Reads the Paseo Progress plugin's files on this daemon's host, as its panel does, for the
 * sidebar's progress bar. The layout is Progress 1.14.7's, which no API exposes:
 * - root: nearest ancestor with a `.git` entry, else the directory (server/paths.ts `findRoot`);
 * - folder: `~/.local/state/paseo-progress/<basename(real root)>-<sha1(real root)[0:8]>`
 *   (server/store.ts `stateRoot`, `outsideDirectory`; XDG_STATE_HOME is ignored there too);
 * - file: `progress.jsonl` (shared/events.ts `PROGRESS_FILE_NAME`).
 * Only files under the state folder are read. Nothing a file holds is logged.
 */

export const PROGRESS_FILE_NAME = "progress.jsonl";

export function progressStateRoot(home = homedir()): string {
  return join(home, ".local", "state", "paseo-progress");
}

/** The nearest directory with a `.git` entry (a folder, or a linked worktree's file); else `directory`. */
export function findProgressRoot(directory: string): string {
  let current = resolve(directory);
  while (true) {
    if (existsSync(join(current, ".git"))) return current;
    const parent = dirname(current);
    if (parent === current) return resolve(directory);
    current = parent;
  }
}

/** The store folder's name for a root already resolved to its real path. */
export function progressFolderName(realRoot: string): string {
  return `${basename(realRoot)}-${createHash("sha1").update(realRoot).digest("hex").slice(0, 8)}`;
}

/** The workspace directory's store folder, a direct child of the state root. */
export function progressStoreDirectory(directory: string, home = homedir()): string {
  const root = findProgressRoot(directory);
  let real = root;
  try {
    real = realpathSync(root);
  } catch {}
  return join(progressStateRoot(home), progressFolderName(real));
}

export interface ProgressReadResult {
  /** False when this host does not run the Progress plugin; then there are no summaries. */
  available: boolean;
  /** Per requested directory; null when it has no readable progress file. */
  summaries: Record<string, ProgressSummary | null>;
}

interface CachedFile {
  size: number;
  mtimeMs: number;
  ctimeMs: number;
  events: ProgressEventLike[];
}

/** How many parsed files are kept; more than any sidebar lists. */
const CACHE_LIMIT = 2_000;

export function createProgressReader(options: {
  home?: string;
  paseoHome?: string;
  now?: () => number;
  /** How long a decision on whether Progress runs here is kept. */
  availabilityTtlMs?: number;
} = {}) {
  const home = options.home ?? homedir();
  const paseoHome = options.paseoHome ?? PASEO_HOME;
  const now = options.now ?? Date.now;
  const ttl = options.availabilityTtlMs ?? 60_000;
  const stateRoot = progressStateRoot(home);
  const files = new Map<string, CachedFile>();
  let availability: { value: boolean; at: number } | null = null;
  let parses = 0;

  /**
   * Plugins cannot list the daemon's plugins (PaseoApi has no plugin list in 0.16), so this reads
   * the daemon's own record, `<PASEO_HOME>/config.json`. Without a readable one, Progress counts
   * as present when its state folder exists.
   */
  async function isAvailable(): Promise<boolean> {
    const at = now();
    if (availability && at - availability.at < ttl) return availability.value;
    let config: unknown = null;
    try {
      config = JSON.parse(await readFile(join(paseoHome, "config.json"), "utf8"));
    } catch {}
    const state = progressPluginState(config);
    const value = state === "enabled" || (state === "unknown" && existsSync(stateRoot));
    availability = { value, at };
    return value;
  }

  async function readDirectory(directory: string, at: number): Promise<ProgressSummary | null> {
    if (!directory || !isAbsolute(directory)) return null;
    const store = progressStoreDirectory(directory, home);
    // basename() of a real path has no separator, but check: nothing outside the state root.
    if (dirname(store) !== stateRoot) return null;
    const path = join(store, PROGRESS_FILE_NAME);
    try {
      const info = await stat(path);
      if (!info.isFile()) return null;
      let cached = files.get(path);
      if (!cached || cached.size !== info.size || cached.mtimeMs !== info.mtimeMs || cached.ctimeMs !== info.ctimeMs) {
        const events = parseProgressEvents(await readFile(path, "utf8"));
        parses += 1;
        cached = { size: info.size, mtimeMs: info.mtimeMs, ctimeMs: info.ctimeMs, events };
        if (files.size >= CACHE_LIMIT) files.clear();
        files.set(path, cached);
      }
      // Stale and overdue move with the clock, so the fold runs on every read; parsing does not.
      return reduceProgressSummary(cached.events, at);
    } catch {
      return null;
    }
  }

  return {
    async read(directories: readonly string[]): Promise<ProgressReadResult> {
      if (!(await isAvailable())) return { available: false, summaries: {} };
      const at = now();
      const unique = [...new Set(directories)];
      const summaries: Record<string, ProgressSummary | null> = {};
      await Promise.all(
        unique.map(async (directory) => {
          summaries[directory] = await readDirectory(directory, at);
        }),
      );
      return { available: true, summaries };
    },
    parses: () => parses,
  };
}

const reader = createProgressReader();

export async function handleReadProgress(input: { directories: string[] }): Promise<ProgressReadResult> {
  try {
    return await reader.read(input.directories);
  } catch {
    return { available: false, summaries: {} };
  }
}
