import assert from "node:assert/strict";
import { test } from "node:test";
import { selectSidebarGroupVisibility } from "./group-visibility.ts";

// Ported from Paseo's components/sidebar/sidebar-group-visibility.test.ts (v0.16).

const rows = (count: number) => Array.from({ length: count }, (_, index) => `w${index}`);
const allDone = { kind: "workspaces" as const, isDone: () => true };

test("a workspace group shows 7 rows before Show more", () => {
  const result = selectSidebarGroupVisibility({ items: rows(10), expanded: false, policy: allDone, isOpen: () => false });
  assert.deepEqual(result.visibleItems, rows(7));
  assert.equal(result.canToggle, true);
});

test("rows that are not done always show, past the limit too", () => {
  const policy = { kind: "workspaces" as const, isDone: (item: string) => item !== "w9" };
  const result = selectSidebarGroupVisibility({ items: rows(10), expanded: false, policy, isOpen: () => false });
  assert.deepEqual(result.visibleItems, [...rows(7), "w9"]);
  assert.equal(result.canToggle, true);
});

test("a group whose hidden rows are all busy has nothing to toggle", () => {
  const policy = { kind: "workspaces" as const, isDone: () => false };
  const result = selectSidebarGroupVisibility({ items: rows(10), expanded: false, policy, isOpen: () => false });
  assert.equal(result.visibleItems.length, 10);
  assert.equal(result.canToggle, false);
});

test("the open workspace past the limit leads", () => {
  const result = selectSidebarGroupVisibility({ items: rows(10), expanded: false, policy: allDone, isOpen: (item) => item === "w8" });
  assert.equal(result.leadingItem, "w8");
  assert.deepEqual(result.visibleItems, rows(7));
  assert.equal(result.canToggle, true);
});

test("pinned keeps its limit of 20", () => {
  const result = selectSidebarGroupVisibility({ items: rows(21), expanded: false, policy: { kind: "pinned" }, isOpen: () => false });
  assert.equal(result.visibleItems.length, 20);
  assert.equal(result.canToggle, true);
});
