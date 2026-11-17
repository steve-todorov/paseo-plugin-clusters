import assert from "node:assert/strict";
import { appendFileSync, mkdirSync, mkdtempSync, realpathSync, rmSync, symlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, it } from "node:test";
import { createProgressReader, findProgressRoot, progressFolderName, progressStoreDirectory } from "./progress.ts";

describe("progressFolderName (pinned to Progress 1.14.7 server/store.ts outsideDirectory)", () => {
  it("names the folder <basename>-<first 8 hex of sha1(real root)>", () => {
    assert.equal(progressFolderName("/home/trojan/Desktop/steve-todorov/misc"), "misc-9645b1ca");
  });
});

let home: string;
let work: string;

beforeEach(() => {
  home = realpathSync(mkdtempSync(join(tmpdir(), "clusters-progress-")));
  work = join(home, "work");
  mkdirSync(work);
});

afterEach(() => {
  rmSync(home, { recursive: true, force: true });
});

describe("findProgressRoot (Progress server/paths.ts findRoot)", () => {
  it("walks up to the nearest .git entry, a folder or a worktree's file", () => {
    mkdirSync(join(work, "repo", ".git"), { recursive: true });
    mkdirSync(join(work, "repo", "packages", "app"), { recursive: true });
    assert.equal(findProgressRoot(join(work, "repo", "packages", "app")), join(work, "repo"));
    mkdirSync(join(work, "linked"));
    writeFileSync(join(work, "linked", ".git"), "gitdir: elsewhere\n");
    assert.equal(findProgressRoot(join(work, "linked")), join(work, "linked"));
  });

  it("uses the directory itself outside git", () => {
    assert.equal(findProgressRoot(work), work);
  });
});

describe("progressStoreDirectory", () => {
  it("is a direct child of the state root, through the real path", () => {
    const real = join(work, "real");
    mkdirSync(real);
    const link = join(work, "link");
    // A symlinked workspace maps to the same folder as its target.
    symlinkSync(real, link);
    const stateRoot = join(home, ".local", "state", "paseo-progress");
    assert.equal(progressStoreDirectory(link, home), join(stateRoot, progressFolderName(real)));
  });
});

const T0 = Date.parse("2026-11-17T10:00:00.000Z");
const event = (min: number, body: Record<string, unknown>) => `${JSON.stringify({ v: 1, ts: new Date(T0 + min * 60_000).toISOString(), ...body })}\n`;

function writeConfig(plugins: Record<string, unknown> | undefined): void {
  const paseoHome = join(home, ".paseo");
  mkdirSync(paseoHome, { recursive: true });
  writeFileSync(join(paseoHome, "config.json"), JSON.stringify({ pluginsEnabled: true, ...(plugins ? { plugins } : {}) }));
}

function storeFor(directory: string): string {
  const store = progressStoreDirectory(directory, home);
  mkdirSync(store, { recursive: true });
  return join(store, "progress.jsonl");
}

describe("createProgressReader", () => {
  const reader = (clock = { now: T0 + 60_000 }) =>
    createProgressReader({ home, paseoHome: join(home, ".paseo"), now: () => clock.now, availabilityTtlMs: 60_000 });

  it("reads each directory's summary, null for missing files", async () => {
    writeConfig({ progress: { path: "/x", enabled: true } });
    writeFileSync(storeFor(work), event(0, { type: "run.start", title: "Run" }) + event(0, { type: "ticket.add", id: "T01", title: "A", estimateMin: 30 }));
    const other = join(home, "other");
    mkdirSync(other);
    const result = await reader().read([work, other]);
    assert.equal(result.available, true);
    assert.equal(result.summaries[work]?.title, "Run");
    assert.deepEqual(result.summaries[work]?.tickets, [{ state: "not_started", stuck: false }]);
    assert.equal(result.summaries[other], null);
  });

  it("returns null, never throws, for an unreadable file", async () => {
    writeConfig({ progress: { path: "/x" } });
    mkdirSync(storeFor(work)); // a folder where the file should be
    const result = await reader().read([work, "relative/path", ""]);
    assert.equal(result.summaries[work], null);
  });

  it("parses again only when the file changes", async () => {
    writeConfig({ progress: { path: "/x" } });
    const path = storeFor(work);
    writeFileSync(path, event(0, { type: "run.start", title: "One" }));
    const r = reader();
    assert.equal((await r.read([work])).summaries[work]?.title, "One");
    assert.equal(r.parses(), 1);
    await r.read([work]);
    assert.equal(r.parses(), 1);
    appendFileSync(path, event(1, { type: "run.start", title: "Two" }));
    assert.equal((await r.read([work])).summaries[work]?.title, "Two");
    assert.equal(r.parses(), 2);
  });

  it("answers unavailable once, with no summaries, when Progress is absent or disabled", async () => {
    writeConfig({ progress: { path: "/x", enabled: false } });
    writeFileSync(storeFor(work), event(0, { type: "run.start", title: "Run" }));
    assert.deepEqual(await reader().read([work]), { available: false, summaries: {} });
    writeConfig({ other: { path: "/x" } });
    assert.deepEqual(await reader().read([work]), { available: false, summaries: {} });
  });

  it("keeps the availability for its TTL, then looks again", async () => {
    writeConfig(undefined);
    const clock = { now: T0 };
    const r = reader(clock);
    assert.equal((await r.read([work])).available, false);
    writeConfig({ progress: { path: "/x" } });
    clock.now += 59_000;
    assert.equal((await r.read([work])).available, false);
    clock.now += 2_000;
    assert.equal((await r.read([work])).available, true);
  });

  it("falls back to the state folder when the daemon config cannot be read", async () => {
    assert.equal((await reader().read([work])).available, false);
    storeFor(work);
    assert.equal((await reader().read([work])).available, true);
  });
});
