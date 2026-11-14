import assert from "node:assert/strict";
import { test } from "node:test";
import { PINNED_LIMIT, byPinnedAtDesc, selectPinnedVisibility } from "./pinned.ts";

// Ported from Paseo's hooks/use-sidebar-pins and components/sidebar/sidebar-group-visibility (v0.16).

const rows = (count: number) => Array.from({ length: count }, (_, index) => `w${index}`);

test("orders pinned workspaces most recently pinned first", () => {
  const items = [
    { id: "a", pinnedAt: "2026-01-01T00:00:00.000Z" },
    { id: "b", pinnedAt: "2026-03-01T00:00:00.000Z" },
    { id: "c", pinnedAt: "2026-02-01T00:00:00.000Z" },
  ];
  assert.deepEqual([...items].sort(byPinnedAtDesc).map((item) => item.id), ["b", "c", "a"]);
});

test("shows every pinned row up to the limit, with nothing to toggle", () => {
  const result = selectPinnedVisibility({ items: rows(PINNED_LIMIT), expanded: false, isOpen: () => false });
  assert.equal(result.visibleItems.length, PINNED_LIMIT);
  assert.equal(result.canToggle, false);
  assert.equal(result.leadingItem, null);
});

test("cuts at 20 and offers to show more", () => {
  const result = selectPinnedVisibility({ items: rows(25), expanded: false, isOpen: () => false });
  assert.deepEqual(result.visibleItems, rows(20));
  assert.equal(result.canToggle, true);
});

test("expanded shows everything", () => {
  const result = selectPinnedVisibility({ items: rows(25), expanded: true, isOpen: () => false });
  assert.equal(result.visibleItems.length, 25);
  assert.equal(result.canToggle, true);
  assert.equal(result.leadingItem, null);
});

test("leads with the open workspace when the cut would hide it", () => {
  const result = selectPinnedVisibility({ items: rows(25), expanded: false, isOpen: (item) => item === "w22" });
  assert.equal(result.leadingItem, "w22");
  assert.ok(!result.visibleItems.includes("w22"));
  assert.equal(result.canToggle, true);
});

test("an open workspace that is the only hidden one leaves nothing to toggle", () => {
  const result = selectPinnedVisibility({ items: rows(21), expanded: false, isOpen: (item) => item === "w20" });
  assert.equal(result.canToggle, false);
  assert.equal(result.leadingItem, null);
  assert.equal(result.visibleItems.length, 21);
});
