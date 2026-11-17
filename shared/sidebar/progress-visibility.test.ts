import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  DEFAULT_PROGRESS_HIDE_AFTER_HOURS,
  MAX_PROGRESS_HIDE_AFTER_HOURS,
  MIN_PROGRESS_HIDE_AFTER_HOURS,
  normalizeProgressHideAfterHours,
  progressIsFresh,
  stepProgressHideAfterHours,
} from "./progress-visibility.ts";

const HOUR = 60 * 60 * 1000;
const NOW = Date.parse("2026-11-17T12:00:00.000Z");

describe("progressIsFresh", () => {
  it("always shows progress in the always mode, even with no use at all", () => {
    const prefs = { progressVisibility: "always", progressHideAfterHours: 1 } as const;
    assert.equal(progressIsFresh(NOW - 1000 * HOUR, NOW, prefs), true);
    assert.equal(progressIsFresh(0, NOW, prefs), true);
  });

  it("in the recent mode shows progress up to the limit and hides it past it", () => {
    const prefs = { progressVisibility: "recent", progressHideAfterHours: 72 } as const;
    assert.equal(progressIsFresh(NOW - HOUR, NOW, prefs), true);
    assert.equal(progressIsFresh(NOW - 72 * HOUR, NOW, prefs), true);
    assert.equal(progressIsFresh(NOW - 72 * HOUR - 1, NOW, prefs), false);
  });

  it("hides a workspace with neither a prompt nor a creation time in the recent mode", () => {
    assert.equal(progressIsFresh(0, NOW, { progressVisibility: "recent", progressHideAfterHours: 720 }), false);
  });

  it("keeps a use stamped after now (clock skew between hosts) fresh", () => {
    assert.equal(progressIsFresh(NOW + HOUR, NOW, { progressVisibility: "recent", progressHideAfterHours: 1 }), true);
  });
});

describe("normalizeProgressHideAfterHours", () => {
  it("keeps whole hours within the bounds and clamps the rest", () => {
    assert.equal(normalizeProgressHideAfterHours(5), 5);
    assert.equal(normalizeProgressHideAfterHours(0), MIN_PROGRESS_HIDE_AFTER_HOURS);
    assert.equal(normalizeProgressHideAfterHours(-3), MIN_PROGRESS_HIDE_AFTER_HOURS);
    assert.equal(normalizeProgressHideAfterHours(10_000), MAX_PROGRESS_HIDE_AFTER_HOURS);
    assert.equal(normalizeProgressHideAfterHours(2.6), 3);
  });

  it("reads anything that is not a number as the default", () => {
    assert.equal(normalizeProgressHideAfterHours(Number.NaN), DEFAULT_PROGRESS_HIDE_AFTER_HOURS);
    assert.equal(normalizeProgressHideAfterHours("12"), DEFAULT_PROGRESS_HIDE_AFTER_HOURS);
    assert.equal(normalizeProgressHideAfterHours(undefined), DEFAULT_PROGRESS_HIDE_AFTER_HOURS);
  });
});

describe("stepProgressHideAfterHours", () => {
  it("steps by an hour below a day and by a day from there", () => {
    assert.equal(stepProgressHideAfterHours(5, 1), 6);
    assert.equal(stepProgressHideAfterHours(23, 1), 24);
    assert.equal(stepProgressHideAfterHours(24, 1), 48);
    assert.equal(stepProgressHideAfterHours(72, -1), 48);
    assert.equal(stepProgressHideAfterHours(24, -1), 23);
  });

  it("snaps a value off the day grid to the next day either way", () => {
    assert.equal(stepProgressHideAfterHours(30, 1), 48);
    assert.equal(stepProgressHideAfterHours(30, -1), 24);
  });

  it("stays at the ends", () => {
    assert.equal(stepProgressHideAfterHours(MIN_PROGRESS_HIDE_AFTER_HOURS, -1), MIN_PROGRESS_HIDE_AFTER_HOURS);
    assert.equal(stepProgressHideAfterHours(MAX_PROGRESS_HIDE_AFTER_HOURS, 1), MAX_PROGRESS_HIDE_AFTER_HOURS);
  });
});
