import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  DEFAULT_PROGRESS_HIDE_AFTER_DAYS,
  MAX_PROGRESS_HIDE_AFTER_DAYS,
  MIN_PROGRESS_HIDE_AFTER_DAYS,
  normalizeProgressHideAfterDays,
  progressIsFresh,
  stepProgressHideAfterDays,
} from "./progress-visibility.ts";

const DAY = 24 * 60 * 60 * 1000;
const NOW = Date.parse("2026-11-17T12:00:00.000Z");

describe("progressIsFresh", () => {
  it("always shows progress in the always mode, even with no use at all", () => {
    const prefs = { progressVisibility: "always", progressHideAfterDays: 1 } as const;
    assert.equal(progressIsFresh(NOW - 100 * DAY, NOW, prefs), true);
    assert.equal(progressIsFresh(0, NOW, prefs), true);
  });

  it("in the recent mode shows progress up to the limit and hides it past it", () => {
    const prefs = { progressVisibility: "recent", progressHideAfterDays: 3 } as const;
    assert.equal(progressIsFresh(NOW - DAY, NOW, prefs), true);
    assert.equal(progressIsFresh(NOW - 3 * DAY, NOW, prefs), true);
    assert.equal(progressIsFresh(NOW - 3 * DAY - 1, NOW, prefs), false);
  });

  it("hides a workspace with neither a prompt nor a creation time in the recent mode", () => {
    assert.equal(progressIsFresh(0, NOW, { progressVisibility: "recent", progressHideAfterDays: 30 }), false);
  });

  it("keeps a use stamped after now (clock skew between hosts) fresh", () => {
    assert.equal(progressIsFresh(NOW + DAY, NOW, { progressVisibility: "recent", progressHideAfterDays: 1 }), true);
  });
});

describe("normalizeProgressHideAfterDays", () => {
  it("keeps whole days within the bounds and clamps the rest", () => {
    assert.equal(normalizeProgressHideAfterDays(5), 5);
    assert.equal(normalizeProgressHideAfterDays(0), MIN_PROGRESS_HIDE_AFTER_DAYS);
    assert.equal(normalizeProgressHideAfterDays(-3), MIN_PROGRESS_HIDE_AFTER_DAYS);
    assert.equal(normalizeProgressHideAfterDays(400), MAX_PROGRESS_HIDE_AFTER_DAYS);
    assert.equal(normalizeProgressHideAfterDays(2.6), 3);
  });

  it("reads anything that is not a number as the default", () => {
    assert.equal(normalizeProgressHideAfterDays(Number.NaN), DEFAULT_PROGRESS_HIDE_AFTER_DAYS);
    assert.equal(normalizeProgressHideAfterDays("12"), DEFAULT_PROGRESS_HIDE_AFTER_DAYS);
    assert.equal(normalizeProgressHideAfterDays(undefined), DEFAULT_PROGRESS_HIDE_AFTER_DAYS);
  });
});

describe("stepProgressHideAfterDays", () => {
  it("steps a day at a time", () => {
    assert.equal(stepProgressHideAfterDays(3, 1), 4);
    assert.equal(stepProgressHideAfterDays(3, -1), 2);
  });

  it("stays at the ends", () => {
    assert.equal(stepProgressHideAfterDays(MIN_PROGRESS_HIDE_AFTER_DAYS, -1), MIN_PROGRESS_HIDE_AFTER_DAYS);
    assert.equal(stepProgressHideAfterDays(MAX_PROGRESS_HIDE_AFTER_DAYS, 1), MAX_PROGRESS_HIDE_AFTER_DAYS);
  });
});
