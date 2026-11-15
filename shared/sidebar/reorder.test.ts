import assert from "node:assert/strict";
import { test } from "node:test";
import {
  computeSidebarOrderUpdates,
  decideLongPressMove,
  dropIndex,
  hasVisibleOrderChanged,
  mergeWithRemainder,
  moveItem,
  orderAfterDrop,
  shiftFor,
} from "./reorder.ts";

// Ported from Paseo's utils/sidebar-reorder, utils/sidebar-gesture-arbitration,
// components/drag-reorder and hooks/sidebar-workspaces-view-model tests (v0.16).

test("the visible order is unchanged when only hidden keys differ", () => {
  assert.equal(hasVisibleOrderChanged({ currentOrder: ["a", "b", "c", "d"], reorderedVisibleKeys: ["a", "b", "c"] }), false);
});

test("a reordered or unknown visible key counts as a change", () => {
  assert.equal(hasVisibleOrderChanged({ currentOrder: ["a", "b", "c", "d"], reorderedVisibleKeys: ["b", "a", "c"] }), true);
  assert.equal(hasVisibleOrderChanged({ currentOrder: ["a", "b"], reorderedVisibleKeys: ["a", "c"] }), true);
});

test("stored keys not on screen follow the reordered ones", () => {
  assert.deepEqual(mergeWithRemainder({ currentOrder: ["a", "x", "b", "y"], reorderedVisibleKeys: ["b", "a"] }), ["b", "a", "x", "y"]);
  assert.deepEqual(mergeWithRemainder({ currentOrder: ["stale", "hidden"], reorderedVisibleKeys: [] }), ["stale", "hidden"]);
});

test("a drop that changes nothing stores nothing", () => {
  assert.equal(orderAfterDrop(["a", "b", "c"], ["a", "b"]), null);
  assert.deepEqual(orderAfterDrop(["a", "b", "c"], ["b", "a"]), ["b", "a", "c"]);
});

test("moving an item takes it out and puts it at the target", () => {
  assert.deepEqual(moveItem(["alpha", "beta", "gamma"], 0, 2), ["beta", "gamma", "alpha"]);
  assert.deepEqual(moveItem(["alpha", "beta", "gamma"], 2, 0), ["gamma", "alpha", "beta"]);
});

const slots = [
  { top: 0, height: 36 },
  { top: 36, height: 100 },
  { top: 136, height: 36 },
];

test("the drop target is the slot whose centre is nearest", () => {
  assert.equal(dropIndex(slots, 0, 0), 0);
  assert.equal(dropIndex(slots, 0, 20), 0);
  assert.equal(dropIndex(slots, 0, 50), 1);
  assert.equal(dropIndex(slots, 0, 130), 2);
  assert.equal(dropIndex(slots, 2, -120), 0);
  assert.equal(dropIndex(slots, 5, 0), 5);
});

test("the rows passed over step aside by the dragged row's height", () => {
  assert.deepEqual([0, 1, 2].map((i) => shiftFor(i, 0, 2, 36)), [0, -36, -36]);
  assert.deepEqual([0, 1, 2].map((i) => shiftFor(i, 2, 1, 36)), [0, 36, 0]);
  assert.deepEqual([0, 1, 2].map((i) => shiftFor(i, 1, 1, 36)), [0, 0, 0]);
});

test("before the hold arms, a move reads as scroll, swipe or cancel", () => {
  const start = { x: 0, y: 0 };
  assert.equal(decideLongPressMove({ dragArmed: false, startPoint: start, currentPoint: { x: 1, y: 7 } }), "vertical_scroll");
  assert.equal(decideLongPressMove({ dragArmed: false, startPoint: start, currentPoint: { x: 9, y: 1 } }), "horizontal_swipe");
  assert.equal(decideLongPressMove({ dragArmed: false, startPoint: start, currentPoint: { x: 8, y: 8 } }), "cancel_long_press");
  assert.equal(decideLongPressMove({ dragArmed: false, startPoint: start, currentPoint: { x: 3, y: 3 } }), "none");
});

test("after the hold arms, moving past the drag slop starts the drag", () => {
  const start = { x: 0, y: 0 };
  assert.equal(decideLongPressMove({ dragArmed: true, startPoint: start, currentPoint: { x: 0, y: 9 } }), "start_drag");
  assert.equal(decideLongPressMove({ dragArmed: true, startPoint: start, currentPoint: { x: 0, y: 8 } }), "none");
  assert.equal(decideLongPressMove({ dragArmed: true, startPoint: null, currentPoint: { x: 0, y: 30 } }), "none");
});

test("new projects join the end of the order and new workspaces the top", () => {
  const projectOrder = ["p1"];
  const orders: Record<string, readonly string[]> = { p1: ["w1"], p2: [] };
  const updates = computeSidebarOrderUpdates({
    projects: [
      { key: "p1", workspaceKeys: ["w2", "w1"] },
      { key: "p2", workspaceKeys: ["w3"] },
    ],
    projectOrder,
    workspaceOrderOf: (key) => orders[key] ?? [],
  });
  assert.deepEqual(updates.projectOrder, ["p1", "p2"]);
  assert.deepEqual(updates.workspaceOrders, [
    { projectKey: "p1", order: ["w2", "w1"] },
    { projectKey: "p2", order: ["w3"] },
  ]);
});

test("nothing new means no updates, and switched-off parts stay untouched", () => {
  const none = computeSidebarOrderUpdates({
    projects: [{ key: "p1", workspaceKeys: ["w1"] }],
    projectOrder: ["p1"],
    workspaceOrderOf: () => ["w1"],
  });
  assert.deepEqual(none, { projectOrder: null, workspaceOrders: [] });
  const off = computeSidebarOrderUpdates({ projects: [{ key: "p1", workspaceKeys: ["w1"] }], projectOrder: null, workspaceOrderOf: null });
  assert.deepEqual(off, { projectOrder: null, workspaceOrders: [] });
  assert.deepEqual(computeSidebarOrderUpdates({ projects: [], projectOrder: [], workspaceOrderOf: null }), { projectOrder: null, workspaceOrders: [] });
});
