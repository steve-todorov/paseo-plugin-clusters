import assert from "node:assert/strict";
import { test } from "node:test";
import { createPresence } from "./presence.ts";

test("reports only the first claim and the last release", () => {
  const changes: boolean[] = [];
  const presence = createPresence((held) => changes.push(held));
  assert.equal(presence.held(), false);
  const a = presence.claim();
  const b = presence.claim();
  assert.deepEqual(changes, [true]);
  a();
  assert.equal(presence.held(), true);
  assert.deepEqual(changes, [true]);
  b();
  assert.equal(presence.held(), false);
  assert.deepEqual(changes, [true, false]);
});

test("a release called twice counts once", () => {
  const changes: boolean[] = [];
  const presence = createPresence((held) => changes.push(held));
  const a = presence.claim();
  const b = presence.claim();
  a();
  a();
  assert.equal(presence.held(), true);
  b();
  assert.deepEqual(changes, [true, false]);
});
