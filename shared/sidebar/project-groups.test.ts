import assert from "node:assert/strict";
import { test } from "node:test";
import {
  buildProjectGrouping,
  iconPlacementOf,
  newWorkspacePlacementOf,
  placementKey,
  projectDisplayNameFromProjectId,
  rekeyStoredOrders,
} from "./project-groups.ts";

// Ported from Paseo's projects/workspace-structure.ts `buildWorkspaceStructureProjects` and
// utils/sidebar-project-row-model.ts (v0.16.0-beta.2), on a real host's project list.

const SRV = "srv_kGchqanPbKSz";
const DIALER = "remote:github.com/overflowleadsllc/overflow-dialer";
// `paseo project ls` on the user's host: overflow-dialer and a worktree added as a project of its
// own, both under the dialer's key, next to a project whose key is its own.
const dialer = {
  projectId: "prj_9daa3e4b993c3ae2",
  projectKey: DIALER,
  projectDisplayName: "overflow-dialer",
  projectCustomName: "(vm) overflowleadsllc/overflow-dialer",
  projectRootPath: "/home/trojan/Desktop/overflowleadsllc/overflow-dialer",
  projectKind: "git",
};
const fox = {
  projectId: "prj_491da42bd352b616",
  projectKey: DIALER,
  projectDisplayName: "magical-fox",
  projectCustomName: null,
  projectRootPath: "/home/trojan/.paseo/worktrees/2hzthn3c/magical-fox",
  projectKind: "git",
};
const infra = {
  projectId: "prj_e0491c02b49a0e0d",
  projectKey: "remote:github.com/overflowleadsllc/overflowleads-infra",
  projectDisplayName: "overflowleads-infra",
  projectCustomName: null,
  projectRootPath: "/home/trojan/Desktop/overflowleadsllc/overflowleads-infra",
  projectKind: "git",
};

test("two projects sharing a key on one host stay two groups, each under its placement key", () => {
  const grouping = buildProjectGrouping(new Map([[SRV, [dialer, fox, infra]]]));
  assert.equal(grouping.keyOf(SRV, dialer.projectId), JSON.stringify([SRV, dialer.projectId]));
  assert.equal(grouping.keyOf(SRV, fox.projectId), JSON.stringify([SRV, fox.projectId]));
  assert.notEqual(grouping.keyOf(SRV, dialer.projectId), grouping.keyOf(SRV, fox.projectId));
});

test("a group is titled by the custom name, else the display name", () => {
  const grouping = buildProjectGrouping(new Map([[SRV, [dialer, fox, infra]]]));
  assert.equal(grouping.groupOf(SRV, dialer.projectId)?.title, "(vm) overflowleadsllc/overflow-dialer");
  assert.equal(grouping.groupOf(SRV, fox.projectId)?.title, "magical-fox");
  assert.equal(grouping.groupOf(SRV, infra.projectId)?.title, "overflowleads-infra");
  assert.equal(grouping.nameOf(SRV, dialer.projectId), "(vm) overflowleadsllc/overflow-dialer");
  assert.equal(grouping.nameOf(SRV, "prj_unknown"), null);
});

test("a key unique on its host is the group key", () => {
  const grouping = buildProjectGrouping(new Map([[SRV, [dialer, fox, infra]]]));
  assert.equal(grouping.keyOf(SRV, infra.projectId), infra.projectKey);
});

test("a project without a key, or one not listed, keys by placement", () => {
  const notes = { projectId: "/home/me/Notes", projectRootPath: "/home/me/Notes" };
  const grouping = buildProjectGrouping(new Map([[SRV, [notes]]]));
  assert.equal(grouping.keyOf(SRV, notes.projectId), placementKey(SRV, notes.projectId));
  assert.equal(grouping.groupOf(SRV, notes.projectId)?.title, "Notes");
  assert.equal(grouping.keyOf(SRV, "prj_unknown"), placementKey(SRV, "prj_unknown"));
  assert.equal(grouping.groupOf(SRV, "prj_unknown"), null);
});

test("the same unique key on two hosts is one group, placed on both hosts in host order", () => {
  const other = { ...infra, projectId: "prj_other", projectCustomName: "Infra", projectRootPath: "/srv/infra" };
  const grouping = buildProjectGrouping(
    new Map([
      ["srv_b", [other]],
      [SRV, [infra]],
    ]),
    [SRV, "srv_b"],
  );
  const group = grouping.groupOf("srv_b", "prj_other");
  assert.equal(grouping.keyOf(SRV, infra.projectId), infra.projectKey);
  assert.equal(grouping.keyOf("srv_b", "prj_other"), infra.projectKey);
  assert.deepEqual(
    group?.placements.map((p) => [p.hostId, p.projectId]),
    [
      [SRV, infra.projectId],
      ["srv_b", "prj_other"],
    ],
  );
  // The first host names the group; a later custom name replaces a plain one.
  assert.equal(group?.title, "Infra");
  // A project's own name stays its own.
  assert.equal(grouping.nameOf(SRV, infra.projectId), "overflowleads-infra");
});

test("a custom name already naming a merged group is kept", () => {
  const a = { ...infra, projectCustomName: "First" };
  const b = { ...infra, projectId: "prj_b", projectCustomName: "Second" };
  const grouping = buildProjectGrouping(
    new Map([
      [SRV, [a]],
      ["srv_b", [b]],
    ]),
  );
  assert.equal(grouping.groupOf("srv_b", "prj_b")?.title, "First");
});

test("a placement key taken by a project key gets a collision key", () => {
  const taken = placementKey(SRV, "prj_x");
  const squatter = { projectId: "prj_y", projectKey: taken, projectRootPath: "/y" };
  const x1 = { projectId: "prj_x", projectKey: "k", projectRootPath: "/x" };
  const x2 = { projectId: "prj_z", projectKey: "k", projectRootPath: "/z" };
  const grouping = buildProjectGrouping(new Map([[SRV, [squatter, x1, x2]]]));
  assert.equal(grouping.keyOf(SRV, "prj_y"), taken);
  assert.equal(grouping.keyOf(SRV, "prj_x"), JSON.stringify(["placement", SRV, "prj_x", 0]));
});

test("titles from ids follow Paseo's projectDisplayNameFromProjectId", () => {
  assert.equal(projectDisplayNameFromProjectId("remote:github.com/acme/app"), "acme/app");
  assert.equal(projectDisplayNameFromProjectId("/home/me/work/"), "work");
  assert.equal(projectDisplayNameFromProjectId("prj_1"), "prj_1");
});

test("the icon comes from the group's first placement with a root path", () => {
  const grouping = buildProjectGrouping(
    new Map([
      [SRV, [{ ...infra, projectRootPath: "  " }]],
      ["srv_b", [{ ...infra, projectId: "prj_b" }]],
    ]),
  );
  const group = grouping.groupOf(SRV, infra.projectId);
  assert.ok(group);
  assert.deepEqual(iconPlacementOf(group) && [iconPlacementOf(group)?.hostId, iconPlacementOf(group)?.projectId], ["srv_b", "prj_b"]);
});

test("a new workspace goes to the preferred host, else the first that can take one", () => {
  const plain = { ...infra, projectKind: "non_git" };
  const grouping = buildProjectGrouping(
    new Map([
      [SRV, [plain]],
      ["srv_b", [{ ...infra, projectId: "prj_b" }]],
      ["srv_c", [{ ...infra, projectId: "prj_c" }]],
    ]),
  );
  const group = grouping.groupOf(SRV, infra.projectId);
  assert.ok(group);
  assert.equal(newWorkspacePlacementOf(group, null)?.hostId, "srv_b");
  assert.equal(newWorkspacePlacementOf(group, "srv_c")?.hostId, "srv_c");
  const lone = buildProjectGrouping(new Map([[SRV, [plain]]])).groupOf(SRV, infra.projectId);
  assert.ok(lone);
  assert.equal(newWorkspacePlacementOf(lone, null), null);
});

test("orders stored under placement keys move to the Paseo group keys", () => {
  const grouping = buildProjectGrouping(new Map([[SRV, [dialer, fox, infra]]]));
  const infraPlacement = placementKey(SRV, infra.projectId);
  const dialerPlacement = placementKey(SRV, dialer.projectId);
  const stored = {
    projectOrder: [dialerPlacement, infraPlacement, "remote:github.com/gone/app", infra.projectKey],
    projectFilters: [infraPlacement],
    workspaceOrderByProject: {
      [infraPlacement]: ["w2", "w1"],
      [infra.projectKey]: ["w3", "w1"],
      [dialerPlacement]: ["w9"],
    },
  };
  const next = rekeyStoredOrders(stored, grouping.keyOf);
  assert.ok(next);
  // A key appended under the new form meanwhile gives way to the user's stored place.
  assert.deepEqual(next.projectOrder, [dialerPlacement, infra.projectKey, "remote:github.com/gone/app"]);
  assert.deepEqual(next.projectFilters, [infra.projectKey]);
  assert.deepEqual(next.workspaceOrderByProject, { [infra.projectKey]: ["w2", "w1", "w3"], [dialerPlacement]: ["w9"] });
  // Nothing left to move: no change.
  assert.equal(rekeyStoredOrders(next, grouping.keyOf), null);
});
