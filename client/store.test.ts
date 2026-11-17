import assert from "node:assert/strict";
import { afterEach, test } from "node:test";
import {
  type Cluster,
  type SharedState,
  currentDaemon,
  daemonOfKey,
  recentKeys,
  registerHost,
  registerProjectKey,
  setWorkspaceParent,
  workspaceTrees,
  registerProjectPath,
  setRanks,
  topRank,
  focusDaemon,
  getState,
  createCluster,
  deleteCluster,
  mergedClusters,
  moveProject,
  reorderClusters,
  pull,
  resetStore,
  setPersistence,
  setState,
  startDaemon,
  updateCluster,
  NO_RECENT_LIMIT,
  keyMatches,
  normalizeRecentHours,
  stepRecentHours,
} from "./store.ts";

function cluster(name: string): Cluster {
  return { id: name, name, color: "#3b82f6", projects: [`host:x:/${name}`] };
}

/** A daemon that answers with its own id and remembers every write it is sent. */
function fakeDaemon(serverId: string, stored: SharedState | null) {
  const writes: SharedState[] = [];
  return {
    writes,
    get stored() {
      return stored;
    },
    sync: {
      read: async () => ({ serverId, state: stored }),
      write: async (next: SharedState) => {
        stored = next;
        writes.push(next);
      },
    },
  };
}

/** Lets the reads started by `startDaemon` settle. */
const settle = () => new Promise((resolve) => setTimeout(resolve, 0));

afterEach(() => resetStore());

test("an empty daemon stays empty while another connected daemon has clusters", async () => {
  const memory = new Map<string, string>();
  setPersistence({ read: (key) => memory.get(key) ?? null, write: (key, value) => void memory.set(key, value) });

  const mine = fakeDaemon("mine", { clusters: [cluster("work")], revision: 7 });
  const theirs = fakeDaemon("theirs", null);
  const a = startDaemon(mine.sync, { pollMs: 0 });
  const b = startDaemon(theirs.sync, { pollMs: 0 });
  await settle();

  // Several rounds: the empty daemon must not inherit the other one's clusters at any point.
  for (let i = 0; i < 3; i += 1) {
    await pull(a);
    await pull(b);
  }

  assert.deepEqual(
    getState(a).clusters.map((c) => c.name),
    ["work"],
  );
  assert.deepEqual(getState(b).clusters, []);
  assert.deepEqual(theirs.writes, [], "the empty daemon was written to");
  assert.equal(theirs.stored, null, "the empty daemon's file gained clusters");

  // Each daemon caches under its own key, so neither can read the other's copy.
  assert.ok(memory.has("paseo-clusters:v1:mine"));
  assert.equal(memory.get("paseo-clusters:v1:theirs"), undefined);
});

test("the sidebar shows the clusters of the daemon being viewed", async () => {
  setPersistence(null);
  const mine = fakeDaemon("mine", { clusters: [cluster("work")], revision: 1 });
  const theirs = fakeDaemon("theirs", { clusters: [cluster("client")], revision: 1 });
  const a = startDaemon(mine.sync, { pollMs: 0 });
  const b = startDaemon(theirs.sync, { pollMs: 0 });
  await settle();

  focusDaemon(a);
  assert.deepEqual(
    getState(currentDaemon()).clusters.map((c) => c.name),
    ["work"],
  );
  focusDaemon(b);
  assert.deepEqual(
    getState(currentDaemon()).clusters.map((c) => c.name),
    ["client"],
  );
});

test("an edit reaches only the daemon it was made on", async () => {
  setPersistence(null);
  const mine = fakeDaemon("mine", { clusters: [], revision: 1 });
  const theirs = fakeDaemon("theirs", null);
  const a = startDaemon(mine.sync, { pollMs: 0 });
  const b = startDaemon(theirs.sync, { pollMs: 0 });
  await settle();

  setState(a, { ...getState(a), clusters: [cluster("work")] });
  await new Promise((resolve) => setTimeout(resolve, 400));

  assert.equal(mine.writes.length, 1);
  assert.deepEqual(
    mine.writes[0].clusters.map((c) => c.name),
    ["work"],
  );
  assert.deepEqual(theirs.writes, []);
  assert.deepEqual(getState(b).clusters, []);
});

test("a daemon that goes quiet leaves nothing behind for the next one", async () => {
  const memory = new Map<string, string>();
  setPersistence({ read: (key) => memory.get(key) ?? null, write: (key, value) => void memory.set(key, value) });

  const mine = fakeDaemon("mine", { clusters: [cluster("work")], revision: 2 });
  const a = startDaemon(mine.sync, { pollMs: 0 });
  await settle();
  assert.equal(getState(a).clusters.length, 1);
  resetStore();

  // A different daemon connecting later starts from its own (absent) cache, not from the last one.
  setPersistence({ read: (key) => memory.get(key) ?? null, write: (key, value) => void memory.set(key, value) });
  const theirs = fakeDaemon("theirs", null);
  const b = startDaemon(theirs.sync, { pollMs: 0 });
  await settle();
  assert.deepEqual(getState(b).clusters, []);
  assert.deepEqual(theirs.writes, []);
});

test("a project is traced back to the daemon that reported it", async () => {
  setPersistence(null);
  const mine = fakeDaemon("mine", { clusters: [], revision: 1 });
  const theirs = fakeDaemon("theirs", { clusters: [], revision: 1 });
  const a = startDaemon(mine.sync, { pollMs: 0 });
  const b = startDaemon(theirs.sync, { pollMs: 0 });
  await settle();

  registerProjectPath(a, "/home/me/work");
  registerProjectPath(b, "/srv/theirs");
  registerProjectKey(b, "remote:github.com/them/app");

  assert.equal(daemonOfKey("host:app-1:/home/me/work"), a);
  assert.equal(daemonOfKey("host:app-2:/srv/theirs"), b);
  assert.equal(daemonOfKey("remote:github.com/them/app"), b);
  // One matched path names the app's id for that host, so its other projects resolve too.
  assert.equal(daemonOfKey("host:app-1:/home/me/other"), a);
  assert.equal(daemonOfKey("host:unknown:/nowhere"), null);
});

test("a path with capitals, as every macOS home has, still finds its daemon", async () => {
  setPersistence(null);
  const mac = fakeDaemon("mac", { clusters: [], revision: 1 });
  const a = startDaemon(mac.sync, { pollMs: 0 });
  await settle();

  registerProjectPath(a, "/users/me/work");

  assert.equal(daemonOfKey("host:app-9:/Users/me/work"), a);
});

test("Recents spans every connected daemon, each rank stored on its own", async () => {
  setPersistence(null);
  const mine = fakeDaemon("mine", { clusters: [], revision: 1 });
  const theirs = fakeDaemon("theirs", { clusters: [], revision: 1 });
  const a = startDaemon(mine.sync, { pollMs: 0 });
  const b = startDaemon(theirs.sync, { pollMs: 0 });
  await settle();
  registerProjectPath(a, "/home/me/work");
  registerProjectPath(b, "/srv/theirs");
  const keyA = "host:app-1:/home/me/work";
  const keyB = "host:app-2:/srv/theirs";

  setRanks(new Map([[keyA, 1000], [keyB, 2000]]));

  // The bar shows both, the higher rank first.
  assert.deepEqual(recentKeys(), [keyB, keyA]);
  assert.equal(topRank(), 2000);
  // Each daemon only ever holds its own project.
  assert.deepEqual(Object.keys(getState(a).recentRank ?? {}), [keyA]);
  assert.deepEqual(Object.keys(getState(b).recentRank ?? {}), [keyB]);

  await new Promise((resolve) => setTimeout(resolve, 400));
  assert.deepEqual(Object.keys(mine.writes[0].recentRank ?? {}), [keyA]);
  assert.deepEqual(Object.keys(theirs.writes[0].recentRank ?? {}), [keyB]);
  // The list older clients read says the same thing, for that daemon's share of it.
  assert.deepEqual(mine.writes[0].recentOrder, [keyA]);
});

test("a project whose daemon is unknown is not filed anywhere", async () => {
  setPersistence(null);
  const mine = fakeDaemon("mine", { clusters: [], revision: 1 });
  const a = startDaemon(mine.sync, { pollMs: 0 });
  await settle();

  setRanks(new Map([["host:somewhere-else:/not/mine", 1000]]));

  assert.deepEqual(recentKeys(), []);
  assert.deepEqual(getState(a).recentRank ?? {}, {});
});

test("an order saved by an older client is read as ranks, top first", async () => {
  setPersistence(null);
  const keys = ["host:app-1:/a", "host:app-1:/b", "host:app-1:/c"];
  const mine = fakeDaemon("mine", { clusters: [], recentOrder: keys, revision: 4 });
  const a = startDaemon(mine.sync, { pollMs: 0 });
  await settle();
  registerProjectPath(a, "/a");

  assert.deepEqual(recentKeys(), keys);
});

test("a client that has not read the daemon yet never writes over its clusters", async () => {
  setPersistence(null);
  const daemon = fakeDaemon("shared", { clusters: [cluster("work")], revision: 40 });
  const a = startDaemon(daemon.sync, { pollMs: 0 });
  // An edit before the first answer, as Recents makes on a freshly opened app.
  setState(a, { ...getState(a), recentRank: { "host:x:/work": 1000 } });
  await new Promise((resolve) => setTimeout(resolve, 400));

  assert.equal(daemon.writes.length, 0);
  assert.deepEqual(getState(a).clusters, [cluster("work")]);
});

test("clusters with the same name on different daemons are shown apart", async () => {
  setPersistence(null);
  const home = fakeDaemon("home", { clusters: [{ id: "a", name: "Labs", color: "#111", projects: ["host:h:/x"] }], revision: 1 });
  const work = fakeDaemon("work", { clusters: [{ id: "b", name: "Labs", color: "#222", projects: ["host:w:/y"] }], revision: 1 });
  startDaemon(home.sync, { pollMs: 0 });
  startDaemon(work.sync, { pollMs: 0 });
  await settle();

  assert.deepEqual(
    mergedClusters().map((c) => [c.id, c.projects]),
    [
      ["home:a", ["host:h:/x"]],
      ["work:b", ["host:w:/y"]],
    ],
  );
});

test("a project of any daemon joins the cluster it is moved to, and leaves every other", async () => {
  setPersistence(null);
  const home = fakeDaemon("home", { clusters: [{ id: "a", name: "Labs", color: "#111", projects: [] }], revision: 1 });
  const work = fakeDaemon("work", { clusters: [{ id: "b", name: "Labs", color: "#222", projects: ["host:w:/srv/app"] }], revision: 1 });
  const a = startDaemon(home.sync, { pollMs: 0 });
  const b = startDaemon(work.sync, { pollMs: 0 });
  await settle();
  registerProjectPath(b, "/srv/app");

  moveProject("host:w:/srv/app", "home:a");

  assert.deepEqual(getState(a).clusters[0].projects, ["host:w:/srv/app"]);
  assert.deepEqual(getState(b).clusters[0].projects, []);
});

test("renaming or deleting a cluster leaves its namesakes alone", async () => {
  setPersistence(null);
  const home = fakeDaemon("home", { clusters: [{ id: "a", name: "Labs", color: "#111", projects: [] }], revision: 1 });
  const work = fakeDaemon("work", { clusters: [{ id: "b", name: "Labs", color: "#222", projects: [] }], revision: 1 });
  const a = startDaemon(home.sync, { pollMs: 0 });
  const b = startDaemon(work.sync, { pollMs: 0 });
  await settle();

  updateCluster("home:a", { name: "Lab" });
  assert.deepEqual([getState(a).clusters[0].name, getState(b).clusters[0].name], ["Lab", "Labs"]);

  deleteCluster("home:a");
  assert.deepEqual([getState(a).clusters.length, getState(b).clusters.length], [0, 1]);
});

test("a new cluster is created on its daemon even when the name exists elsewhere", async () => {
  setPersistence(null);
  const home = fakeDaemon("home", { clusters: [{ id: "a", name: "Labs", color: "#111", projects: [] }], revision: 1 });
  const work = fakeDaemon("work", { clusters: [], revision: 1 });
  startDaemon(home.sync, { pollMs: 0 });
  const b = startDaemon(work.sync, { pollMs: 0 });
  await settle();

  const id = createCluster(b, { name: "Labs", color: "#999" });
  assert.equal(mergedClusters().length, 2);
  assert.ok(id?.startsWith("work:"));
});

test("clusters of different nodes can be interleaved in the bar", async () => {
  setPersistence(null);
  const home = fakeDaemon("home", {
    clusters: [
      { id: "a", name: "A", color: "#111", projects: [] },
      { id: "b", name: "B", color: "#111", projects: [] },
    ],
    revision: 1,
  });
  const work = fakeDaemon("work", { clusters: [{ id: "c", name: "C", color: "#222", projects: [] }], revision: 1 });
  startDaemon(home.sync, { pollMs: 0 });
  startDaemon(work.sync, { pollMs: 0 });
  await settle();

  reorderClusters(["home:a", "work:c", "home:b"]);

  assert.deepEqual(mergedClusters().map((c) => c.name), ["A", "C", "B"]);
});

test("the Recents window is whole hours from 1 to 48, or no limit", () => {
  assert.equal(normalizeRecentHours(undefined), 24);
  assert.equal(normalizeRecentHours(0), 1);
  assert.equal(normalizeRecentHours(100), 48);
  assert.equal(normalizeRecentHours(5.4), 5);
  assert.equal(normalizeRecentHours(NO_RECENT_LIMIT), NO_RECENT_LIMIT);
  assert.equal(normalizeRecentHours(-7), 1);
});

test("stepping below 1 h turns the limit off, and stepping up from there turns it back on", () => {
  assert.equal(stepRecentHours(2, -1), 1);
  assert.equal(stepRecentHours(1, -1), NO_RECENT_LIMIT);
  assert.equal(stepRecentHours(NO_RECENT_LIMIT, -1), NO_RECENT_LIMIT);
  assert.equal(stepRecentHours(NO_RECENT_LIMIT, 1), 1);
  assert.equal(stepRecentHours(47, 1), 48);
  assert.equal(stepRecentHours(48, 1), 48);
});

test("a sidebar project key matches the workspaces of that project only", () => {
  const local = { projectRootPath: "/Home/Me/Work", projectId: "/Home/Me/Work" };
  assert.equal(keyMatches("host:srv_1:/home/me/work", local), true);
  assert.equal(keyMatches("host:srv_1:/home/me/work-2", local), false);
  const remote = { projectRootPath: "/srv/app", projectId: "remote:github.com/acme/app" };
  assert.equal(keyMatches("remote:github.com/acme/app", remote), true);
  assert.equal(keyMatches("remote:github.com/acme/other", remote), false);
});

test("local keys stored as remote:host: read back as host: keys, order kept and no duplicates", async () => {
  const memory = new Map<string, string>();
  setPersistence({ read: (key) => memory.get(key) ?? null, write: (key, value) => void memory.set(key, value) });
  const projects = ["remote:github.com/a/b", "remote:host:srv_1:/home/me/slides", "host:srv_1:/home/me/slides", "remote:host:srv_1:/home/me/x"];
  const daemon = fakeDaemon("mine", {
    clusters: [{ id: "c", name: "c", color: "#3b82f6", projects }],
    recentRank: { "remote:host:srv_1:/home/me/slides": 5, "host:srv_1:/home/me/slides": 9 },
    recentHidden: { "remote:host:srv_1:/home/me/x": 3 },
    revision: 2,
  });
  const handle = startDaemon(daemon.sync, { pollMs: 0 });
  await settle();
  await pull(handle);
  const state = getState(handle);
  assert.deepEqual(state.clusters[0]?.projects, ["remote:github.com/a/b", "host:srv_1:/home/me/slides", "host:srv_1:/home/me/x"]);
  assert.deepEqual(state.recentRank, { "host:srv_1:/home/me/slides": 9 });
  assert.deepEqual(state.recentHidden, { "host:srv_1:/home/me/x": 3 });
});

test("a workspace is filed under its parent on the daemon of its host, and no other", async () => {
  setPersistence(null);
  const mine = fakeDaemon("mine", { clusters: [], revision: 1 });
  const theirs = fakeDaemon("theirs", { clusters: [], revision: 1 });
  const a = startDaemon(mine.sync, { pollMs: 0 });
  const b = startDaemon(theirs.sync, { pollMs: 0 });
  await settle();
  registerHost(a, "host-a");
  registerHost(b, "host-b");

  assert.equal(setWorkspaceParent("host-a", "child", "epic"), true);
  assert.equal(setWorkspaceParent("host-a", "grandchild", "child"), true);
  assert.equal(setWorkspaceParent("host-c", "x", "y"), false, "a host with no daemon here keeps nothing");

  assert.deepEqual(workspaceTrees().get("host-a"), { child: "epic", grandchild: "child" });
  assert.equal(workspaceTrees().get("host-b"), undefined);
  assert.equal(workspaceTrees(), workspaceTrees(), "one snapshot until something changes");

  // Moving out to top level drops the link.
  setWorkspaceParent("host-a", "grandchild", null);
  assert.deepEqual(getState(a).workspaceTree, { child: "epic" });

  await new Promise((resolve) => setTimeout(resolve, 400));
  assert.deepEqual(mine.writes.at(-1)?.workspaceTree, { child: "epic" });
  assert.equal(theirs.writes.length, 0);
});

test("a nest past two levels, or into its own subtree, is not stored", async () => {
  setPersistence(null);
  const mine = fakeDaemon("mine", { clusters: [], revision: 1, workspaceTree: { b: "a", c: "b" } });
  const a = startDaemon(mine.sync, { pollMs: 0 });
  await settle();
  registerHost(a, "host-a");

  assert.equal(setWorkspaceParent("host-a", "d", "c"), false, "too deep");
  assert.equal(setWorkspaceParent("host-a", "a", "c"), false, "a loop");
  assert.deepEqual(getState(a).workspaceTree, { b: "a", c: "b" });
});

test("a daemon copy without a tree (an older plugin) does not wipe the one this client holds", async () => {
  setPersistence(null);
  const mine = fakeDaemon("mine", { clusters: [], revision: 1, workspaceTree: { child: "epic" } });
  const a = startDaemon(mine.sync, { pollMs: 0 });
  await settle();
  assert.deepEqual(getState(a).workspaceTree, { child: "epic" });

  // An older copy rewrites the state without the field, with a newer revision.
  await mine.sync.write({ clusters: [cluster("work")], revision: 5 });
  await pull(a);
  assert.deepEqual(getState(a).clusters.map((c) => c.name), ["work"]);
  assert.deepEqual(getState(a).workspaceTree, { child: "epic" });
});
