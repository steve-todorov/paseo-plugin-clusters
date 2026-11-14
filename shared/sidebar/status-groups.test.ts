import assert from "node:assert/strict";
import { test } from "node:test";
import { type StatusRowLike, compareStatusRows, orderStatusGroups } from "./status-groups.ts";

// Ported from Paseo's hooks/sidebar-status-view-model (v0.16).

const row = (key: string, fields: Partial<StatusRowLike> = {}): StatusRowLike => ({
  key,
  bucket: "done",
  statusEnteredAt: null,
  projectName: "p",
  name: key,
  ...fields,
});

test("sections follow the urgency order and empty ones are left out", () => {
  const groups = [
    { key: "done", items: [1] },
    { key: "running", items: [1] },
    { key: "needs_input", items: [1] },
    { key: "failed", items: [] },
    { key: "attention", items: [1] },
  ];
  assert.deepEqual(
    orderStatusGroups(groups).map((group) => group.key),
    ["needs_input", "attention", "running", "done"],
  );
});

test("rows put the latest status change first, rows without a time last", () => {
  const rows = [
    row("old", { statusEnteredAt: "2026-01-01T00:00:00.000Z" }),
    row("none"),
    row("new", { statusEnteredAt: "2026-02-01T00:00:00.000Z" }),
  ];
  assert.deepEqual(rows.sort(compareStatusRows).map((r) => r.key), ["new", "old", "none"]);
});

test("rows without times sort by project, then name, then key", () => {
  const rows = [row("c", { projectName: "b", name: "x" }), row("b", { projectName: "a", name: "y" }), row("a", { projectName: "a", name: "x" })];
  assert.deepEqual(rows.sort(compareStatusRows).map((r) => r.key), ["a", "b", "c"]);
});
