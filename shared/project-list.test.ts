import assert from "node:assert/strict";
import { test } from "node:test";
import { createKeyMatcher, indexHostProjects } from "./project-keys.ts";
import { listScreenProjects, matchesProjectQuery, projectLiveness } from "./project-list.ts";

// Modelled on the real case: the OVL cluster holds the archived "OverflowDialer" repo, and the
// active "overflow-dialer" project (custom name "(vm) …") shares its key with a worktree that was
// added as a project of its own. A second host lists a project only it has.
const SRV = "srv_local";
const OTHER = "srv_vm";
const local = [
  {
    projectId: "remote:github.com/overflowleadsllc/OverflowDialer",
    projectKey: "remote:github.com/overflowleadsllc/overflowdialer",
    projectRootPath: "/home/me/overflowleadsllc/OverflowDialer",
    projectDisplayName: "overflowleadsllc/OverflowDialer",
    projectCustomName: "(vm) overflowleadsllc/overflowdialer-archive",
  },
  {
    projectId: "prj_dialer",
    projectKey: "remote:github.com/overflowleadsllc/overflow-dialer",
    projectRootPath: "/home/me/overflowleadsllc/overflow-dialer",
    projectDisplayName: "overflow-dialer",
    projectCustomName: "(vm) overflowleadsllc/overflow-dialer",
  },
  {
    projectId: "prj_fox",
    projectKey: "remote:github.com/overflowleadsllc/overflow-dialer",
    projectRootPath: "/home/me/.paseo/worktrees/2hzthn3c/magical-fox",
    projectDisplayName: "magical-fox",
    projectCustomName: null,
  },
  { projectId: "/home/me/Slides", projectKey: null, projectRootPath: "/home/me/Slides", projectDisplayName: "Slides" },
];
const remote = [
  {
    projectId: "prj_vm_only",
    projectKey: "remote:github.com/acme/vm-only",
    projectRootPath: "/srv/vm-only",
    projectDisplayName: "vm-only",
    projectCustomName: null,
  },
];
const byHost = new Map([
  [SRV, local],
  [OTHER, remote],
]);

test("every project of every host is listed, once per sidebar key", () => {
  const keys = listScreenProjects(byHost).map((p) => p.key);
  assert.deepEqual([...keys].sort(), [
    "host:srv_local:/home/me/slides",
    "remote:github.com/acme/vm-only",
    "remote:github.com/overflowleadsllc/overflow-dialer",
    "remote:github.com/overflowleadsllc/overflowdialer",
  ]);
});

test("a project shared by two listings is named by its custom name and knows both hosts", () => {
  const twice = new Map([
    [SRV, local],
    [OTHER, [...remote, { ...local[1], projectId: "prj_dialer_vm" }]],
  ]);
  const dialer = listScreenProjects(twice).find((p) => p.key === "remote:github.com/overflowleadsllc/overflow-dialer");
  assert.equal(dialer?.label, "(vm) overflowleadsllc/overflow-dialer");
  assert.deepEqual(dialer?.hostIds, [SRV, OTHER]);
});

test("a project without a custom name is named by its display name", () => {
  const vm = listScreenProjects(byHost).find((p) => p.key === "remote:github.com/acme/vm-only");
  assert.equal(vm?.label, "vm-only");
});

test("the list is ordered by name", () => {
  const labels = listScreenProjects(byHost).map((p) => p.label);
  assert.deepEqual(labels, [...labels].sort((a, b) => a.localeCompare(b, undefined, { sensitivity: "base" })));
});

test("search finds a project by the names the user sees, its path and its key", () => {
  const rows = listScreenProjects(byHost);
  const find = (query: string) => rows.filter((p) => matchesProjectQuery(p, query)).map((p) => p.key);
  const dialer = "remote:github.com/overflowleadsllc/overflow-dialer";
  assert.deepEqual(find("overflow-dialer"), [dialer]);
  assert.deepEqual(find("  Overflow-Dialer "), [dialer]);
  // The display name and the root of every project behind the key, not only the first.
  assert.deepEqual(find("magical-fox"), [dialer]);
  assert.deepEqual(find("/home/me/overflowleadsllc/overflow-dialer"), [dialer]);
  assert.deepEqual(find("overflowdialer-archive"), ["remote:github.com/overflowleadsllc/overflowdialer"]);
  assert.deepEqual(find("slides"), ["host:srv_local:/home/me/slides"]);
  assert.equal(find("").length, rows.length);
  assert.deepEqual(find("no-such-project"), []);
});

test("a listed key is one the cluster matcher resolves to the workspaces of every project behind it", () => {
  const index = new Map([
    [SRV, indexHostProjects(SRV, local)],
    [OTHER, indexHostProjects(OTHER, remote)],
  ]);
  const matches = createKeyMatcher(index);
  const rows = listScreenProjects(byHost);
  const dialer = rows.find((p) => p.label === "(vm) overflowleadsllc/overflow-dialer");
  assert.ok(dialer);
  const main = { hostId: SRV, projectId: "prj_dialer", projectRootPath: "/home/me/overflowleadsllc/overflow-dialer" };
  const fox = { hostId: SRV, projectId: "prj_fox", projectRootPath: "/home/me/.paseo/worktrees/2hzthn3c/magical-fox" };
  const archive = { hostId: SRV, projectId: "remote:github.com/overflowleadsllc/OverflowDialer", projectRootPath: "/home/me/overflowleadsllc/OverflowDialer" };
  assert.equal(matches(dialer.key, main), true);
  assert.equal(matches(dialer.key, fox), true);
  assert.equal(matches(dialer.key, archive), false);
  const vm = rows.find((p) => p.key === "remote:github.com/acme/vm-only");
  assert.ok(vm);
  assert.equal(matches(vm.key, { hostId: OTHER, projectId: "prj_vm_only", projectRootPath: "/srv/vm-only" }), true);
});

test("liveness is unknown until the workspaces and the history are loaded", () => {
  assert.equal(projectLiveness({ loaded: false, liveRoots: [], roots: ["/a"], history: ["/a"] }), null);
});

test("a project whose workspaces were all archived is not live; a new one is", () => {
  assert.equal(projectLiveness({ loaded: true, liveRoots: [], roots: ["/a"], history: ["/a/wt"] }), false);
  assert.equal(projectLiveness({ loaded: true, liveRoots: [], roots: ["/a"], history: [] }), true);
  assert.equal(projectLiveness({ loaded: true, liveRoots: [], roots: [], history: ["/a"] }), true);
});

test("a key with several roots is live when any of them has a live workspace", () => {
  // The worktree project is listed last: its root must not stand in for the main one.
  const roots = ["/home/me/overflowleadsllc/overflow-dialer", "/home/me/.paseo/worktrees/2hzthn3c/magical-fox"];
  const history = roots;
  assert.equal(projectLiveness({ loaded: true, liveRoots: ["/home/me/overflowleadsllc/overflow-dialer"], roots, history }), true);
  assert.equal(projectLiveness({ loaded: true, liveRoots: [], workspaceLive: true, roots, history }), true);
  assert.equal(projectLiveness({ loaded: true, liveRoots: ["/elsewhere"], roots, history }), false);
});
