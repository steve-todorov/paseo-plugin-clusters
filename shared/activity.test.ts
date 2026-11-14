import assert from "node:assert/strict";
import { test } from "node:test";
import { type AgentLike, compactAgo, inRecents, usedAt } from "./activity.ts";

/** A fixed clock, so nothing here depends on how long the test takes. */
const NOW = Date.parse("2026-09-28T07:56:00.000Z");
const at = (hoursAgo: number) => NOW - hoursAgo * 3600_000;
const iso = (hoursAgo: number) => new Date(at(hoursAgo)).toISOString();

test("use is the user's last message", () => {
  assert.equal(usedAt({ lastUserMessageAt: iso(3), createdAt: iso(200) }), at(3));
});

test("a session never written to counts from when it was created", () => {
  assert.equal(usedAt({ lastUserMessageAt: null, createdAt: iso(5) }), at(5));
});

test("a record the daemon only rewrote is not use", () => {
  // What a daemon restart looks like: every agent re-saved a minute ago, none of them touched by
  // the user in days. Recents must still see them as days old.
  const restarted = { updatedAt: iso(0.01), lastActivityAt: iso(0.01) };
  const agent = { ...restarted, lastUserMessageAt: iso(70), createdAt: iso(180) } as AgentLike;
  assert.equal(usedAt(agent), at(70));
});

test("nothing to go on is not recent", () => {
  assert.equal(usedAt({}), 0);
  assert.equal(usedAt({ lastUserMessageAt: null, createdAt: null }), 0);
  assert.equal(usedAt({ lastUserMessageAt: "not a date" }), 0);
});

test("with a window, a project is in Recents only when used inside it", () => {
  assert.equal(inRecents(at(3), undefined, false), true);
  assert.equal(inRecents(0, undefined, false), false);
});

test("without a limit, every project is in Recents, used or not", () => {
  assert.equal(inRecents(0, undefined, true), true);
  assert.equal(inRecents(at(2000), undefined, true), true);
});

test("a hidden project returns only once used after it was hidden, limit or not", () => {
  for (const unlimited of [false, true]) {
    assert.equal(inRecents(at(5), at(4), unlimited), false);
    assert.equal(inRecents(0, at(4), unlimited), false);
    assert.equal(inRecents(at(1), at(4), unlimited), true);
  }
});

test("compact time reads like the default sidebar's", () => {
  assert.equal(compactAgo(NOW - 20_000, NOW), "now");
  assert.equal(compactAgo(at(0.1), NOW), "6m");
  assert.equal(compactAgo(at(2), NOW), "2h");
  assert.equal(compactAgo(at(72), NOW), "3d");
  assert.equal(compactAgo(Date.parse("2026-01-15T12:00:00Z"), NOW), "Jan 15");
  assert.equal(compactAgo(0, NOW), "");
});
