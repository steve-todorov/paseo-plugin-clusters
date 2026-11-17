import assert from "node:assert/strict";
import { test } from "node:test";
import { nextRowHover, pressMayDrag } from "./row-hover.ts";

test("a mouse entering the row hovers it and leaving ends the hover", () => {
  assert.equal(nextRowHover(false, { kind: "enter", pointerType: "mouse" }), true);
  assert.equal(nextRowHover(true, { kind: "leave", pointerType: "mouse" }), false);
});

test("a pen hovers like a mouse, and an unknown pointer type counts as a pointer", () => {
  assert.equal(nextRowHover(false, { kind: "enter", pointerType: "pen" }), true);
  assert.equal(nextRowHover(false, { kind: "enter" }), true);
  assert.equal(nextRowHover(true, { kind: "leave", pointerType: null }), false);
});

test("a touch neither starts nor ends a hover", () => {
  assert.equal(nextRowHover(false, { kind: "enter", pointerType: "touch" }), false);
  assert.equal(nextRowHover(true, { kind: "leave", pointerType: "touch" }), true);
});

test("moving from the row onto its button keeps the row hovered", () => {
  // pointerenter/pointerleave do not fire on the row when the pointer crosses into a child, so the
  // only event the row sees is its own enter; it stays hovered until the pointer leaves it.
  let hovered = nextRowHover(false, { kind: "enter", pointerType: "mouse" });
  assert.equal(hovered, true);
  hovered = nextRowHover(hovered, { kind: "leave", pointerType: "mouse" });
  assert.equal(hovered, false);
});

test("a mouse press on a row button never drags the row", () => {
  assert.equal(pressMayDrag({ touch: false, startedOnAction: true }), false);
});

test("a mouse press on the row body may drag it", () => {
  assert.equal(pressMayDrag({ touch: false, startedOnAction: false }), true);
});

test("a touch keeps Paseo's long press anywhere on the row", () => {
  assert.equal(pressMayDrag({ touch: true, startedOnAction: true }), true);
  assert.equal(pressMayDrag({ touch: true, startedOnAction: false }), true);
});
