import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { parseProgressEvents, progressPluginState, summarizeProgress } from "./progress.ts";

const T0 = Date.parse("2026-11-17T10:00:00.000Z");
const at = (min: number) => new Date(T0 + min * 60_000).toISOString();
const line = (min: number, event: Record<string, unknown>) => JSON.stringify({ v: 1, ts: at(min), ...event });
const file = (...lines: string[]) => `${lines.join("\n")}\n`;
const now = (min: number) => T0 + min * 60_000;

const start = (min = 0, title = "Run") => line(min, { type: "run.start", title });
const add = (min: number, id: string, extra: Record<string, unknown> = {}) =>
  line(min, { type: "ticket.add", id, title: `Ticket ${id}`, estimateMin: 30, ...extra });
const update = (min: number, id: string, extra: Record<string, unknown>) => line(min, { type: "ticket.update", id, ...extra });

describe("parseProgressEvents", () => {
  it("skips a last line without a newline: it may be half written", () => {
    const events = parseProgressEvents(`${start()}\n${add(1, "T01")}`);
    assert.equal(events.length, 1);
  });

  it("skips lines with another version, broken JSON and lines that are not events", () => {
    const text = file(start(), JSON.stringify({ v: 2, ts: at(1), type: "ticket.add", id: "T09" }), "{not json", "42", JSON.stringify({ v: 1, type: "run.start" }), add(2, "T01"));
    assert.deepEqual(
      parseProgressEvents(text).map((event) => event.type),
      ["run.start", "ticket.add"],
    );
  });
});

describe("summarizeProgress", () => {
  it("has no run and no tickets for an empty file", () => {
    assert.deepEqual(summarizeProgress("", now(0)), {
      title: null,
      tickets: [],
      questions: 0,
      stuck: 0,
      stale: false,
      finished: false,
      updatedAt: null,
    });
  });

  it("only counts the latest run", () => {
    const text = file(start(0, "Old"), add(1, "T01"), add(2, "T02"), start(3, "New"), add(4, "T01", { status: "working" }));
    const summary = summarizeProgress(text, now(5));
    assert.equal(summary.title, "New");
    assert.deepEqual(summary.tickets, [{ state: "working", stuck: false }]);
    assert.equal(summary.updatedAt, at(4));
  });

  it("keeps tickets in plan order, leaves skipped ones out and applies updates and removes", () => {
    const text = file(
      start(),
      add(1, "T01"),
      add(1, "T02"),
      add(1, "T03"),
      add(1, "T04"),
      update(2, "T01", { status: "done" }),
      update(2, "T02", { status: "skipped" }),
      update(2, "T03", { status: "working" }),
      line(3, { type: "ticket.remove", id: "T04" }),
      add(3, "T05"),
    );
    assert.deepEqual(
      summarizeProgress(text, now(4)).tickets.map((ticket) => ticket.state),
      ["done", "working", "not_started"],
    );
  });

  it("counts open questions only", () => {
    const ask = (id: string) => line(1, { type: "question.ask", id, title: id, question: "Which?" });
    const text = file(start(), ask("Q1"), ask("Q2"), ask("Q3"), line(2, { type: "question.answer", id: "Q1", choice: "A" }), line(2, { type: "question.remove", id: "Q2" }));
    assert.equal(summarizeProgress(text, now(3)).questions, 1);
  });

  it("calls a blocked ticket stuck unless it waits on an unfinished ticket", () => {
    const text = file(
      start(),
      add(1, "T01"),
      add(1, "T02", { waitsFor: "T01" }),
      add(1, "T03"),
      update(2, "T02", { status: "blocked" }),
      update(2, "T03", { status: "blocked" }),
    );
    const summary = summarizeProgress(text, now(3));
    assert.deepEqual(summary.tickets, [
      { state: "not_started", stuck: false },
      { state: "waiting", stuck: false },
      { state: "blocked", stuck: true },
    ]);
    assert.equal(summary.stuck, 1);
  });

  it("calls a working ticket overdue once its estimate passes with no update, activity resetting the clock", () => {
    const text = file(start(), add(0, "T01", { status: "working", estimateMin: 10 }), line(5, { type: "activity.add", id: "A1", text: "x", ticket: "T01" }));
    assert.equal(summarizeProgress(text, now(15)).stuck, 0);
    const late = summarizeProgress(text, now(15) + 1);
    assert.equal(late.stuck, 1);
    assert.deepEqual(late.tickets, [{ state: "working", stuck: true }]);
  });

  it("counts manual stuck items until cleared", () => {
    const set = (id: string, ticket?: string) => line(1, { type: "stuck.set", id, reason: "No access", ...(ticket ? { ticket } : {}) });
    const text = file(start(), add(0, "T01"), set("S1", "T01"), set("S2"), line(2, { type: "stuck.clear", id: "S2" }));
    const summary = summarizeProgress(text, now(3));
    assert.equal(summary.stuck, 1);
    assert.deepEqual(summary.tickets, [{ state: "not_started", stuck: true }]);
  });

  it("goes stale after 15 silent minutes, but never once finished", () => {
    const text = file(start(), add(0, "T01", { status: "working", estimateMin: 600 }));
    assert.equal(summarizeProgress(text, now(15) - 1).stale, false);
    assert.equal(summarizeProgress(text, now(15)).stale, true);
    const finished = file(start(), add(0, "T01"), line(1, { type: "run.finish", outcome: "Done" }));
    assert.equal(summarizeProgress(finished, now(60)).stale, false);
  });

  it("is finished on run.finish or once every ticket is done or skipped", () => {
    assert.equal(summarizeProgress(file(start(), add(0, "T01"), line(1, { type: "run.finish", outcome: "Ok" })), now(2)).finished, true);
    const settled = file(start(), add(0, "T01"), add(0, "T02"), update(1, "T01", { status: "done" }), update(1, "T02", { status: "skipped" }));
    assert.equal(summarizeProgress(settled, now(2)).finished, true);
    assert.equal(summarizeProgress(file(start()), now(2)).finished, false);
  });

  it("ignores updates to unknown tickets and unknown event types", () => {
    const text = file(start(), update(1, "T09", { status: "done" }), line(1, { type: "future.thing" }), add(2, "T01"));
    assert.deepEqual(summarizeProgress(text, now(3)).tickets, [{ state: "not_started", stuck: false }]);
  });
});

describe("progressPluginState", () => {
  const config = (plugins: unknown, pluginsEnabled: unknown = true) => ({ pluginsEnabled, plugins });

  it("is enabled when the daemon lists it and plugins are on", () => {
    assert.equal(progressPluginState(config({ progress: { source: "directory", path: "/x", enabled: true } })), "enabled");
    // The daemon treats a missing `enabled` as on (`source.enabled !== false`).
    assert.equal(progressPluginState(config({ progress: { source: "directory", path: "/x" } })), "enabled");
  });

  it("is disabled when switched off, or when plugins are off as a whole", () => {
    assert.equal(progressPluginState(config({ progress: { path: "/x", enabled: false } })), "disabled");
    assert.equal(progressPluginState(config({ progress: { path: "/x", enabled: true } }, false)), "disabled");
    assert.equal(progressPluginState({ plugins: { progress: { path: "/x" } } }), "disabled");
  });

  it("is absent when not installed", () => {
    assert.equal(progressPluginState(config({ other: { path: "/x" } })), "absent");
    assert.equal(progressPluginState(config(undefined)), "absent");
  });

  it("is unknown when the config cannot be read as one", () => {
    assert.equal(progressPluginState(null), "unknown");
    assert.equal(progressPluginState("text"), "unknown");
    assert.equal(progressPluginState(config([])), "unknown");
  });
});
