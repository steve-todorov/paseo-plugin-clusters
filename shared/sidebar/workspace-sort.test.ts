import assert from "node:assert/strict";
import { test } from "node:test";
import {
  type SortableWorkspace,
  appendMissingOrderKeys,
  applyStoredOrdering,
  compareProjectNames,
  prependMissingOrderKeys,
  workspaceComparator,
} from "./workspace-sort.ts";

// Ported from Paseo's projects/workspace-structure and hooks/sidebar-workspaces-view-model (v0.16).

const ws = (key: string, createdAt: string | null, lastPromptAt: string | null = null, name = key): SortableWorkspace => ({
  key,
  name,
  createdAt,
  lastPromptAt,
});
const keys = (items: SortableWorkspace[]) => items.map((item) => item.key);

const a = ws("a", "2026-01-01T00:00:00.000Z", "2026-03-01T00:00:00.000Z");
const b = ws("b", "2026-02-01T00:00:00.000Z");
const c = ws("c", "2026-01-15T00:00:00.000Z", "2026-02-15T00:00:00.000Z");

test("Created puts the newest workspace first", () => {
  assert.deepEqual(keys([a, b, c].sort(workspaceComparator("created", true))), ["b", "c", "a"]);
});

test("Last prompt falls back to the creation time", () => {
  assert.deepEqual(keys([a, b, c].sort(workspaceComparator("lastPrompt", true))), ["a", "c", "b"]);
});

test("Manual starts from creation order", () => {
  assert.deepEqual(keys([a, b, c].sort(workspaceComparator("manual", true))), ["b", "c", "a"]);
});

test("without times, automatic sorts fall back to names, numbers in order", () => {
  const items = [ws("k1", null, null, "ws 10"), ws("k2", null, null, "ws 9"), ws("k3", null, null, "WS 1")];
  assert.deepEqual(keys(items.sort(workspaceComparator("created", false))), ["k3", "k2", "k1"]);
});

test("projects sort by name, case and numbers aside", () => {
  const items = [
    { name: "beta", key: "1" },
    { name: "Alpha 10", key: "2" },
    { name: "alpha 2", key: "3" },
  ];
  assert.deepEqual(items.sort(compareProjectNames).map((p) => p.key), ["3", "2", "1"]);
});

test("a stored order takes the slots of the stored items and leaves the rest", () => {
  const ordered = applyStoredOrdering({ items: ["a", "b", "c", "d"], storedOrder: ["d", "x", "b", "d"], getKey: (k) => k });
  assert.deepEqual(ordered, ["a", "d", "c", "b"]);
});

test("an empty or unknown stored order changes nothing", () => {
  assert.deepEqual(applyStoredOrdering({ items: ["a", "b"], storedOrder: [], getKey: (k) => k }), ["a", "b"]);
  assert.deepEqual(applyStoredOrdering({ items: ["a", "b"], storedOrder: ["x"], getKey: (k) => k }), ["a", "b"]);
});

test("new keys join the end of a project order and the top of a workspace order", () => {
  const current = ["a"];
  assert.equal(appendMissingOrderKeys(current, ["a"]), current);
  assert.deepEqual(appendMissingOrderKeys(current, ["b", "a"]), ["a", "b"]);
  assert.deepEqual(prependMissingOrderKeys(current, ["b", "a"]), ["b", "a"]);
});
