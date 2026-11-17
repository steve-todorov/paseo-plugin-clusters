import assert from "node:assert/strict";
import { describe, it } from "node:test";
import type { ProgressSummary, ProgressTicketState } from "../progress.ts";
import { aggregateRowProgress, rowProgressOf, segmentTone } from "./progress-bar.ts";

function summary(states: string, extra: Partial<ProgressSummary> = {}): ProgressSummary {
  const map: Record<string, ProgressTicketState> = { d: "done", w: "working", b: "blocked", t: "waiting", n: "not_started" };
  return {
    title: "Run",
    tickets: [...states].map((k) => ({ state: map[k] ?? "not_started", stuck: k === "b" })),
    questions: 0,
    stuck: 0,
    stale: false,
    finished: false,
    updatedAt: "2026-11-17T10:00:00.000Z",
    ...extra,
  };
}

const tones = (progress: ReturnType<typeof rowProgressOf>) => progress?.segments.map((s) => `${s.tone}:${s.weight}`).join(" ");

describe("segmentTone", () => {
  it("colours as the Progress panel: done, working, red for blocked or stuck, grey otherwise", () => {
    assert.equal(segmentTone({ state: "done", stuck: false }), "done");
    assert.equal(segmentTone({ state: "working", stuck: false }), "working");
    assert.equal(segmentTone({ state: "working", stuck: true }), "stuck");
    assert.equal(segmentTone({ state: "blocked", stuck: true }), "stuck");
    assert.equal(segmentTone({ state: "waiting", stuck: false }), "todo");
    assert.equal(segmentTone({ state: "not_started", stuck: false }), "todo");
  });
});

describe("rowProgressOf", () => {
  it("shows nothing without a summary, a run or tickets and nothing waiting", () => {
    assert.equal(rowProgressOf(null), null);
    assert.equal(rowProgressOf(summary("", { title: null })), null);
    assert.equal(rowProgressOf(summary("")), null);
  });

  it("draws one equal segment per ticket in plan order", () => {
    assert.equal(tones(rowProgressOf(summary("ddwnb", { stuck: 1 }))), "done:1 done:1 working:1 todo:1 stuck:1");
  });

  it("raises the ? pill with the open question count and the stuck pill", () => {
    const progress = rowProgressOf(summary("dw", { questions: 2, stuck: 1 }));
    assert.equal(progress?.questions, 2);
    assert.equal(progress?.stuck, true);
  });

  it("keeps the pills without a bar when a run has no tickets yet", () => {
    const progress = rowProgressOf(summary("", { questions: 1 }));
    assert.deepEqual(progress?.segments, []);
    assert.equal(progress?.questions, 1);
  });

  it("paints a finished run all done and drops its stuck pill", () => {
    const progress = rowProgressOf(summary("dwn", { finished: true, stuck: 1 }));
    assert.equal(tones(progress), "done:1 done:1 done:1");
    assert.equal(progress?.stuck, false);
  });
});

describe("aggregateRowProgress", () => {
  it("is null when no row in the subtree has progress", () => {
    assert.equal(aggregateRowProgress([null, rowProgressOf(null)]), null);
  });

  it("sums ticket states into proportional segments, done first, and keeps any pill", () => {
    const merged = aggregateRowProgress([
      rowProgressOf(summary("ddwn", { questions: 1 })),
      null,
      rowProgressOf(summary("db", { stuck: 1 })),
      rowProgressOf(summary("ww", { finished: true })),
    ]);
    assert.equal(tones(merged), "done:5 working:1 stuck:1 todo:1");
    assert.equal(merged?.questions, 1);
    assert.equal(merged?.stuck, true);
  });
});
