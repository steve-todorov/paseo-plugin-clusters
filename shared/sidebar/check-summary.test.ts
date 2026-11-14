import assert from "node:assert/strict";
import { test } from "node:test";
import { mapCheckStatus, selectCheckSummary, toFilledQuarters } from "./check-summary.ts";
import type { PrHint } from "./pr-hint.ts";

// Ported from Paseo's components/sidebar/workspace-meta-row/check-summary.test.ts (v0.16).

function hint(overrides: Partial<PrHint>): PrHint {
  return { url: "https://github.com/o/r/pull/1", number: 1, state: "open", forge: "github", ...overrides };
}

function checks(...statuses: string[]): PrHint["checks"] {
  return statuses.map((status, index) => ({ name: `check-${index}`, status, url: null }));
}

test("returns nothing without a pull request", () => {
  assert.equal(selectCheckSummary(null), null);
});

test("returns nothing when the pull request reports no checks", () => {
  assert.equal(selectCheckSummary(hint({ checksStatus: "none" })), null);
  assert.equal(selectCheckSummary(hint({ checks: [] })), null);
});

test("passes once every check is terminal and none failed", () => {
  assert.deepEqual(selectCheckSummary(hint({ checks: checks("success", "success", "skipped") })), {
    state: "passed",
    completed: 3,
    total: 3,
  });
});

test("counts terminal checks while others are still pending", () => {
  assert.deepEqual(selectCheckSummary(hint({ checks: checks("success", "skipped", "pending", "pending") })), {
    state: "running",
    completed: 2,
    total: 4,
  });
});

test("fails as soon as one check fails, even mid-run", () => {
  assert.deepEqual(selectCheckSummary(hint({ checks: checks("success", "failure", "pending", "pending") })), {
    state: "failed",
    completed: 4,
    total: 4,
  });
});

test("treats cancelled checks as finished rather than failed", () => {
  assert.deepEqual(selectCheckSummary(hint({ checks: checks("success", "cancelled") })), {
    state: "passed",
    completed: 2,
    total: 2,
  });
});

test("treats an unrecognized status as still running", () => {
  assert.deepEqual(selectCheckSummary(hint({ checks: checks("success", "queued") })), {
    state: "running",
    completed: 1,
    total: 2,
  });
});

test("falls back to the summary status when individual checks are absent", () => {
  assert.deepEqual(selectCheckSummary(hint({ checksStatus: "pending" })), { state: "running", completed: 0, total: 1 });
  assert.deepEqual(selectCheckSummary(hint({ checksStatus: "failure" })), { state: "failed", completed: 1, total: 1 });
});

test("prefers individual checks over the summary status", () => {
  assert.deepEqual(selectCheckSummary(hint({ checks: checks("failure"), checksStatus: "success" })), {
    state: "failed",
    completed: 1,
    total: 1,
  });
});

test("fills nothing before the first quarter completes", () => {
  assert.equal(toFilledQuarters({ state: "running", completed: 0, total: 8 }), 0);
  assert.equal(toFilledQuarters({ state: "running", completed: 1, total: 8 }), 0);
});

test("fills in quarter steps", () => {
  assert.equal(toFilledQuarters({ state: "running", completed: 2, total: 8 }), 0.25);
  assert.equal(toFilledQuarters({ state: "running", completed: 5, total: 10 }), 0.5);
  assert.equal(toFilledQuarters({ state: "running", completed: 6, total: 8 }), 0.75);
});

test("rounds down so an unfinished run never reads as complete", () => {
  assert.equal(toFilledQuarters({ state: "running", completed: 9, total: 10 }), 0.75);
});

test("closes the pie only when every check is in", () => {
  assert.equal(toFilledQuarters({ state: "passed", completed: 10, total: 10 }), 1);
});

test("treats an empty run as empty rather than dividing by zero", () => {
  assert.equal(toFilledQuarters({ state: "running", completed: 0, total: 0 }), 0);
});

test("maps the five known check statuses to themselves and anything else to pending", () => {
  for (const status of ["success", "failure", "pending", "skipped", "cancelled"]) assert.equal(mapCheckStatus(status), status);
  assert.equal(mapCheckStatus("queued"), "pending");
});
