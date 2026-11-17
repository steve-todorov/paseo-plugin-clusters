import type { RpcInput } from "@getpaseo/plugin";
import type { PluginHandlerContext } from "@getpaseo/plugin/server";
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { mkdir, readFile, rename, writeFile } from "node:fs/promises";
import { hostname } from "node:os";
import { dirname, join, resolve } from "node:path";
import type { writeState } from "../shared/storage";
import { stateSchema } from "../shared/storage";
import { treeToStore } from "../shared/sidebar/workspace-tree";
import { PLUGIN_VERSION } from "../shared/version";
import { PASEO_HOME } from "./paseo-home";

/** Shared by every client of this daemon, so clusters follow the machine, not the app. */
const HOME = PASEO_HOME;
const FILE = join(HOME, "plugins", "paseo-clusters.json");

/**
 * This daemon's identity: stable across restarts, different for every daemon, and derived rather
 * than stored so nothing new is written. Clients key their local copy of the clusters by it, which
 * is what keeps one daemon's clusters out of another's.
 */
const SERVER_ID = createHash("sha256").update(`${hostname()}\u0000${resolve(HOME)}`).digest("hex").slice(0, 16);

/**
 * The Paseo serving this plugin. The SDK does not tell plugins, so it is read from the package the
 * plugin process was started from; null when that cannot be found.
 */
const PASEO_VERSION = (() => {
  let dir = dirname(process.argv[1] ?? "");
  for (let depth = 0; depth < 10; depth += 1) {
    try {
      const pkg = JSON.parse(readFileSync(join(dir, "package.json"), "utf8")) as { name?: string; version?: string };
      if (pkg.name?.startsWith("@getpaseo/") && pkg.version) return pkg.version;
    } catch {
      // No package.json at this level; keep climbing.
    }
    const parent = dirname(dir);
    if (parent === dir) break;
    dir = parent;
  }
  return null;
})();

/** The id the app knows this daemon's host by: Paseo keeps it in its home. Null when unreadable. */
const HOST_ID = (() => {
  try {
    return readFileSync(join(HOME, "server-id"), "utf8").trim() || null;
  } catch {
    return null;
  }
})();

const identity = {
  serverId: SERVER_ID,
  pluginVersion: PLUGIN_VERSION,
  paseoVersion: PASEO_VERSION,
  hostId: HOST_ID,
  hostName: hostname(),
};

export async function readClusters() {
  try {
    const parsed = stateSchema.safeParse(JSON.parse(await readFile(FILE, "utf8")));
    return { ...identity, state: parsed.success ? parsed.data : null };
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== "ENOENT") {
      console.warn("[paseo-clusters] No se pudo leer el estado guardado", error);
    }
    return { ...identity, state: null };
  }
}

/** Listing pages are capped at 200 by the daemon. */
const PAGE_LIMIT = 200;

/**
 * Ids of this daemon's workspaces that are not archived, background ones included; null when they
 * could not all be listed, so the tree is then kept as sent rather than pruned on partial news.
 */
async function liveWorkspaceIds(context: PluginHandlerContext | undefined): Promise<Set<string> | null> {
  if (!context) return null;
  try {
    const ids = new Set<string>();
    let cursor: string | undefined;
    do {
      const page = await context.paseo.workspaces.list({ filter: { includeBackground: true }, page: { limit: PAGE_LIMIT, cursor } });
      for (const workspace of page.entries) ids.add(workspace.id);
      cursor = page.pageInfo.hasMore ? (page.pageInfo.nextCursor ?? undefined) : undefined;
    } while (cursor);
    return ids;
  } catch (error) {
    console.warn("[paseo-clusters] Could not list workspaces to tidy the workspace tree", error);
    return null;
  }
}

export async function writeClusters({ state }: RpcInput<typeof writeState>, context?: PluginHandlerContext) {
  // A client that has not read this daemon yet starts from revision 0 and an empty copy; letting it
  // write would wipe the clusters every other client shares. It catches up on its next read.
  const stored = (await readClusters()).state;
  if (stored && state.revision < stored.revision) return { revision: stored.revision };
  // Archived parents leave the tree here, so every device reads the promoted subtree back.
  const live = state.workspaceTree && Object.keys(state.workspaceTree).length > 0 ? await liveWorkspaceIds(context) : null;
  const workspaceTree = treeToStore(state.workspaceTree, stored?.workspaceTree, live);
  const next = workspaceTree === undefined ? state : { ...state, workspaceTree };
  await mkdir(dirname(FILE), { recursive: true });
  const temporary = `${FILE}.tmp`;
  await writeFile(temporary, JSON.stringify(next, null, 2), "utf8");
  await rename(temporary, FILE);
  return { revision: state.revision };
}
