import assert from "node:assert/strict";
import { test } from "node:test";
import {
  matchesLabelFilter,
  mergeWorkspaceLabelCatalogs,
  resolveActiveHostFilters,
  resolveActiveLabelFilter,
  resolveActiveProjectFilters,
} from "./filters.ts";

// Ported from Paseo's sidebar-project-filter, sidebar-labels, workspace-labels/internal/merge and
// use-sidebar-workspaces-list (v0.16).

test("a host filter narrows to the hosts still known, else shows every host", () => {
  assert.deepEqual(resolveActiveHostFilters([], ["a", "b"]), []);
  assert.deepEqual(resolveActiveHostFilters(["b", "gone"], ["a", "b"]), ["b"]);
  assert.deepEqual(resolveActiveHostFilters(["gone"], ["a", "b"]), []);
});

test("a project filter goes inert while none of its projects is in view", () => {
  const available = new Set(["p1", "p2"]);
  assert.deepEqual(resolveActiveProjectFilters([], available), []);
  assert.deepEqual(resolveActiveProjectFilters(["p2", "p9"], available), ["p2"]);
  assert.deepEqual(resolveActiveProjectFilters(["p9"], available), []);
});

test("a label filter drops labels the catalog no longer has, but keeps Unlabelled", () => {
  assert.deepEqual(resolveActiveLabelFilter(["bug", "", "old"], ["Bug"]), ["bug", ""]);
  assert.deepEqual(resolveActiveLabelFilter(["old"], null), ["old"]);
});

test("label filter matches any selected label, and Unlabelled matches none", () => {
  assert.equal(matchesLabelFilter(["Bug"], []), true);
  assert.equal(matchesLabelFilter(["Bug"], ["bug"]), true);
  assert.equal(matchesLabelFilter(["Docs"], ["bug"]), false);
  assert.equal(matchesLabelFilter([], [""]), true);
  assert.equal(matchesLabelFilter(["  "], [""]), true);
  assert.equal(matchesLabelFilter(["Bug"], ["", "docs"]), false);
  assert.equal(matchesLabelFilter(["Docs"], ["", "docs"]), true);
});

test("merged catalogs keep the first host's colour and sort by name", () => {
  const merged = mergeWorkspaceLabelCatalogs([
    { serverId: "b", labels: [{ name: "bug", color: "red" }, { name: "Alpha", color: "sky" }] },
    { serverId: "a", labels: [{ name: "Bug", color: "blue" }] },
  ]);
  assert.deepEqual(merged, [
    { name: "Alpha", color: "sky" },
    { name: "Bug", color: "blue" },
  ]);
});
