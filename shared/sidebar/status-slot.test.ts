import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { STATUS_SLOT_PRIORITY, type StatusSlot, statusSlotOf } from "./status-slot.ts";

const question = { questions: 2, stuck: false };
const stuck = { questions: 0, stuck: true };
const both = { questions: 1, stuck: true };

describe("statusSlotOf", () => {
  it("shows the agent status when there is no progress", () => {
    assert.equal(statusSlotOf("needs_input", null), "needs_input");
    assert.equal(statusSlotOf("failed", null), "failed");
    assert.equal(statusSlotOf("running", null), "running");
    assert.equal(statusSlotOf("attention", null), "attention");
    assert.equal(statusSlotOf("done", null), "idle");
    assert.equal(statusSlotOf(null, null), "idle");
    assert.equal(statusSlotOf("something-else", { questions: 0, stuck: false }), "idle");
  });

  it("orders needs_input > failed > question > stuck > running > attention > idle", () => {
    assert.deepEqual(STATUS_SLOT_PRIORITY, ["needs_input", "failed", "question", "stuck", "running", "attention", "idle"]);
  });

  it("keeps needs_input over a question and over stuck", () => {
    assert.equal(statusSlotOf("needs_input", question), "needs_input");
    assert.equal(statusSlotOf("needs_input", stuck), "needs_input");
    assert.equal(statusSlotOf("needs_input", both), "needs_input");
  });

  it("keeps failed over a question and over stuck", () => {
    assert.equal(statusSlotOf("failed", question), "failed");
    assert.equal(statusSlotOf("failed", stuck), "failed");
  });

  it("puts a question over stuck", () => {
    assert.equal(statusSlotOf("done", both), "question");
    assert.equal(statusSlotOf("running", both), "question");
  });

  it("puts a question over running, attention and idle", () => {
    assert.equal(statusSlotOf("running", question), "question");
    assert.equal(statusSlotOf("attention", question), "question");
    assert.equal(statusSlotOf("done", question), "question");
    assert.equal(statusSlotOf(null, question), "question");
  });

  it("puts stuck over running, attention and idle", () => {
    assert.equal(statusSlotOf("running", stuck), "stuck");
    assert.equal(statusSlotOf("attention", stuck), "stuck");
    assert.equal(statusSlotOf("done", stuck), "stuck");
  });

  it("ignores progress with no questions and not stuck", () => {
    const quiet = { questions: 0, stuck: false };
    assert.equal(statusSlotOf("running", quiet), "running");
    assert.equal(statusSlotOf("attention", quiet), "attention");
    assert.equal(statusSlotOf("done", quiet), "idle");
  });

  it("agrees with the priority list for every pairing", () => {
    const agent: Record<StatusSlot, string | null> = {
      needs_input: "needs_input",
      failed: "failed",
      question: null,
      stuck: null,
      running: "running",
      attention: "attention",
      idle: "done",
    };
    const progressFor: Record<StatusSlot, { questions: number; stuck: boolean } | null> = {
      needs_input: null,
      failed: null,
      question: { questions: 1, stuck: false },
      stuck: { questions: 0, stuck: true },
      running: null,
      attention: null,
      idle: null,
    };
    STATUS_SLOT_PRIORITY.forEach((higher, i) => {
      for (const lower of STATUS_SLOT_PRIORITY.slice(i + 1)) {
        const indicator = agent[higher] ?? agent[lower];
        const pq = progressFor[higher];
        const pl = progressFor[lower];
        const progress = pq || pl ? { questions: (pq?.questions ?? 0) + (pl?.questions ?? 0), stuck: Boolean(pq?.stuck || pl?.stuck) } : null;
        // Two agent statuses cannot share a row; those pairs are covered by rollUpStatus.
        if (agent[higher] !== null && agent[lower] !== null) continue;
        assert.equal(statusSlotOf(indicator, progress), higher, `${higher} over ${lower}`);
      }
    });
  });
});
