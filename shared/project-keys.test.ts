import assert from "node:assert/strict";
import { test } from "node:test";
import { canonicalClusterKey, createKeyMatcher, indexHostProjects, keyMatchesByText, normalizeStoredKey, sidebarKeyOf } from "./project-keys.ts";

// Modelled on a 0.16 daemon: new projects carry an opaque id, older ones a remote id or a path.
const SRV = "srv_local";
const projects = [
  { projectId: "prj_ts", projectKey: "remote:github.com/acme/app-ts", projectRootPath: "/home/me/acme/app-ts" },
  { projectId: "prj_infra", projectKey: "remote:github.com/acme/infra", projectRootPath: "/home/me/acme/infra" },
  { projectId: "remote:github.com/acme/app-py", projectKey: "remote:github.com/acme/app-py", projectRootPath: "/home/me/acme/app-py" },
  { projectId: "/home/me/poc-accountant", projectKey: "remote:github.com/acme/poc-accounting", projectRootPath: "/home/me/poc-accountant" },
  { projectId: "/home/me/Slides", projectKey: `host:${SRV}:/home/me/slides`, projectRootPath: "/home/me/Slides" },
  { projectId: "remote:github.com/acme/OldDialer", projectRootPath: "/home/me/acme/dialer" },
];
const index = new Map([[SRV, indexHostProjects(SRV, projects)]]);
const matches = createKeyMatcher(index);
const ws = (projectId: string, projectRootPath: string, hostId = SRV) => ({ hostId, projectId, projectRootPath });

test("a 0.16 project with an opaque id matches its cluster key", () => {
  assert.equal(matches("remote:github.com/acme/app-ts", ws("prj_ts", "/home/me/acme/app-ts")), true);
  assert.equal(matches("remote:github.com/acme/infra", ws("prj_infra", "/home/me/acme/infra")), true);
  assert.equal(matches("remote:github.com/acme/app-ts", ws("prj_infra", "/home/me/acme/infra")), false);
});

test("a project with a path id and a git remote matches its remote key", () => {
  assert.equal(matches("remote:github.com/acme/poc-accounting", ws("/home/me/poc-accountant", "/home/me/poc-accountant")), true);
});

test("a legacy remote id still matches, with or without a project list", () => {
  assert.equal(matches("remote:github.com/acme/app-py", ws("remote:github.com/acme/app-py", "/home/me/acme/app-py")), true);
  const bare = createKeyMatcher(new Map());
  assert.equal(bare("remote:github.com/acme/app-py", ws("remote:github.com/acme/app-py", "/x")), true);
  assert.equal(bare("remote:github.com/acme/other", ws("remote:github.com/acme/app-py", "/x")), false);
});

test("a remote key matches a legacy id that differs only in case", () => {
  assert.equal(matches("remote:github.com/acme/olddialer", ws("remote:github.com/acme/OldDialer", "/home/me/acme/dialer")), true);
});

test("a local key matches by the project list and by the root path", () => {
  assert.equal(matches(`host:${SRV}:/home/me/slides`, ws("/home/me/Slides", "/home/me/Slides")), true);
  assert.equal(createKeyMatcher(new Map())(`host:${SRV}:/home/me/slides`, ws("/home/me/Slides", "/home/me/Slides")), true);
  assert.equal(matches(`host:${SRV}:/home/me/slides-2`, ws("/home/me/Slides", "/home/me/Slides")), false);
});

test("a local key stored as remote:host: still matches", () => {
  assert.equal(matches(`remote:host:${SRV}:/home/me/slides`, ws("/home/me/Slides", "/home/me/Slides")), true);
});

test("a key matches only the workspaces of the host that lists it", () => {
  assert.equal(matches("remote:github.com/acme/app-ts", ws("prj_ts", "/elsewhere", "srv_other")), false);
});

test("a sidebar placement key matches its own host and project", () => {
  const key = JSON.stringify([SRV, "prj_dup"]);
  assert.equal(matches(key, ws("prj_dup", "/a")), true);
  assert.equal(matches(key, ws("prj_dup", "/a", "srv_other")), false);
  assert.equal(matches(key, ws("prj_ts", "/a")), false);
});

test("stored remote:host: keys read back as host: keys; others unchanged", () => {
  assert.equal(normalizeStoredKey("remote:host:srv_1:/p"), "host:srv_1:/p");
  assert.equal(normalizeStoredKey("remote:github.com/a/b"), "remote:github.com/a/b");
  assert.equal(normalizeStoredKey("host:srv_1:/p"), "host:srv_1:/p");
});

test("a project's own sidebar key is used unchanged", () => {
  assert.equal(sidebarKeyOf(SRV, { projectId: "/p", projectKey: "host:srv_x:/p" }), "host:srv_x:/p");
  assert.equal(sidebarKeyOf(SRV, { projectId: "prj_1", projectKey: "remote:github.com/a/b" }), "remote:github.com/a/b");
});

test("a project without a key gets one derived from its id", () => {
  assert.equal(sidebarKeyOf(SRV, { projectId: "/Home/Me/Work" }), `host:${SRV}:/home/me/work`);
  assert.equal(sidebarKeyOf(SRV, { projectId: "C:\\Work" }), `host:${SRV}:c:\\work`);
  assert.equal(sidebarKeyOf(SRV, { projectId: "remote:github.com/a/b" }), "remote:github.com/a/b");
  assert.equal(sidebarKeyOf(SRV, { projectId: "github.com/a/b", projectKey: null }), "remote:github.com/a/b");
});

test("text matching keeps the pre-0.16 rules", () => {
  assert.equal(keyMatchesByText("host:srv_1:/home/me/work", { projectId: "/Home/Me/Work", projectRootPath: "/Home/Me/Work" }), true);
  assert.equal(keyMatchesByText("remote:github.com/acme/app", { projectId: "remote:github.com/acme/app", projectRootPath: "/srv/app" }), true);
});

// Modelled on a real host: a project and a worktree added as a project of its own share one key,
// so Paseo's sidebar draws each under a placement key (`["<serverId>","<projectId>"]`).
const DIALER = "remote:github.com/overflowleadsllc/overflow-dialer";
const shared = [
  { projectId: "prj_dialer", projectKey: DIALER, projectRootPath: "/home/me/overflowleadsllc/overflow-dialer" },
  { projectId: "prj_fox", projectKey: DIALER, projectRootPath: "/home/me/.paseo/worktrees/x/magical-fox" },
  { projectId: "prj_infra", projectKey: "remote:github.com/overflowleadsllc/overflowleads-infra", projectRootPath: "/home/me/infra" },
  { projectId: "/home/me/Notes", projectRootPath: "/home/me/Notes" },
];
const sharedLists = new Map([[SRV, shared]]);
const sharedMatches = createKeyMatcher(new Map([[SRV, indexHostProjects(SRV, shared)]]));

test("a key shared by two projects names the workspaces of both", () => {
  assert.equal(sharedMatches(DIALER, ws("prj_dialer", "/home/me/overflowleadsllc/overflow-dialer")), true);
  assert.equal(sharedMatches(DIALER, ws("prj_fox", "/home/me/.paseo/worktrees/x/magical-fox")), true);
  assert.equal(sharedMatches(DIALER, ws("prj_infra", "/home/me/infra")), false);
});

test("a stored placement key of a shared-key project names every project under that key", () => {
  const stored = JSON.stringify([SRV, "prj_fox"]);
  assert.equal(sharedMatches(stored, ws("prj_dialer", "/home/me/overflowleadsllc/overflow-dialer")), true);
  assert.equal(sharedMatches(stored, ws("prj_fox", "/home/me/.paseo/worktrees/x/magical-fox")), true);
  assert.equal(sharedMatches(stored, ws("prj_infra", "/home/me/infra")), false);
});

test("the sidebar's placement row keys read as the projects' shared key", () => {
  assert.equal(canonicalClusterKey(JSON.stringify([SRV, "prj_dialer"]), sharedLists), DIALER);
  assert.equal(canonicalClusterKey(JSON.stringify([SRV, "prj_fox"]), sharedLists), DIALER);
});

test("a placement row key of a project without a key reads as its derived local key", () => {
  assert.equal(canonicalClusterKey(JSON.stringify([SRV, "/home/me/Notes"]), sharedLists), `host:${SRV}:/home/me/notes`);
});

test("a placement row key is resolved on any listed host when its own is not known by id", () => {
  const unidentified = new Map([["", shared]]);
  assert.equal(canonicalClusterKey(JSON.stringify([SRV, "prj_fox"]), unidentified), DIALER);
});

test("shared keys and stored legacy keys read as themselves or their canonical form", () => {
  assert.equal(canonicalClusterKey(DIALER, sharedLists), DIALER);
  assert.equal(canonicalClusterKey(`remote:host:${SRV}:/home/me/slides`, sharedLists), `host:${SRV}:/home/me/slides`);
  // An unknown placement stays as it is, so nothing is lost while the project list loads.
  const unknown = JSON.stringify([SRV, "prj_unknown"]);
  assert.equal(canonicalClusterKey(unknown, sharedLists), unknown);
  assert.equal(canonicalClusterKey(JSON.stringify(["placement", SRV, "prj_fox", 0]), sharedLists), DIALER);
});
