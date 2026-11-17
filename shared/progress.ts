/*
 * A compact reading of the Paseo Progress plugin's per-worktree event log (`progress.jsonl`), for
 * the sidebar's progress bar. Ported from @stevecastaneda/paseo-progress 1.14.7:
 * - lines: shared/events.ts (`v: 1`, `ts`, `type`) and shared/dashboard.ts `parseProgress` (a last
 *   line without a newline is skipped; lines of another version or shape are skipped, not fatal);
 * - fold: shared/dashboard.ts `latestRun` + `reduceProgress` (only the last `run.start` counts);
 * - stuck: `stuckItems` (blocked and not waiting, working past its estimate, manual);
 * - stale: `STALE_AFTER_MIN`; finished: `run.finish`, or every ticket done or skipped.
 * Only what the row draws is kept: never question text, notes or ticker.
 */

export const PROGRESS_EVENT_VERSION = 1;
export const STALE_AFTER_MIN = 15;
/** The Progress plugin's id in the daemon's `config.json` `plugins` (its paseo-plugin.json `id`). */
export const PROGRESS_PLUGIN_ID = "progress";

/** A ticket's status as the panel draws it; `waiting` is blocked on a ticket still open. */
export type ProgressTicketState = "not_started" | "working" | "blocked" | "waiting" | "done";

export interface ProgressTicketSummary {
  state: ProgressTicketState;
  /** In the panel's Stuck list: blocked, overdue, or named by a manual stuck item. */
  stuck: boolean;
}

export interface ProgressSummary {
  /** The latest run's title; null when the file has no `run.start`. */
  title: string | null;
  /** Plan order; skipped tickets are left out, as in the panel's bar. */
  tickets: ProgressTicketSummary[];
  /** Open questions waiting for the user. */
  questions: number;
  /** Stuck items, the panel's "N stuck". */
  stuck: number;
  stale: boolean;
  finished: boolean;
  updatedAt: string | null;
}

type TicketStatus = "not_started" | "working" | "blocked" | "done" | "skipped";
const TICKET_STATUSES: readonly string[] = ["not_started", "working", "blocked", "done", "skipped"];

export interface ProgressEventLike {
  type: string;
  ts: string;
  [field: string]: unknown;
}

/** The file's events, oldest first, keeping only lines this version can read. */
export function parseProgressEvents(text: string): ProgressEventLike[] {
  const events: ProgressEventLike[] = [];
  // Whether or not the text ends in a newline, the last piece is empty or unfinished.
  for (const raw of text.split("\n").slice(0, -1)) {
    if (!raw.trim()) continue;
    let json: unknown;
    try {
      json = JSON.parse(raw);
    } catch {
      continue;
    }
    if (typeof json !== "object" || json === null || Array.isArray(json)) continue;
    const record = json as Record<string, unknown>;
    if (record.v !== PROGRESS_EVENT_VERSION) continue;
    if (typeof record.type !== "string" || typeof record.ts !== "string" || Number.isNaN(Date.parse(record.ts))) continue;
    events.push(record as ProgressEventLike);
  }
  return events;
}

const str = (value: unknown): string | undefined => (typeof value === "string" && value.trim() ? value : undefined);
const num = (value: unknown): number | undefined => (typeof value === "number" && Number.isFinite(value) ? value : undefined);
const status = (value: unknown): TicketStatus | undefined =>
  typeof value === "string" && TICKET_STATUSES.includes(value) ? (value as TicketStatus) : undefined;

interface TicketFold {
  id: string;
  status: TicketStatus;
  estimateMin: number;
  stage?: string;
  waitsFor?: string;
  /** Times of the ticket's recorded changes (PP `Ticket.history`). */
  lastChange: number;
}

const settled = (ticket: TicketFold) => ticket.status === "done" || ticket.status === "skipped";

/** Folds the latest run at `now` (ms) into what the row shows. */
export function reduceProgressSummary(all: readonly ProgressEventLike[], now: number): ProgressSummary {
  const startAt = all.findLastIndex((event) => event.type === "run.start" && str(event.title) !== undefined);
  const events = all.slice(Math.max(startAt, 0));
  let title: string | null = null;
  let runFinished = false;
  let updatedAt: string | null = null;
  const tickets = new Map<string, TicketFold>();
  const questions = new Map<string, boolean>();
  const activity = new Map<string, { ticket?: string; at: number }>();
  const manual = new Map<string, { ticket?: string }>();

  for (const event of events) {
    const id = str(event.id);
    const ts = Date.parse(event.ts);
    switch (event.type) {
      case "run.start": {
        const runTitle = str(event.title);
        if (!runTitle) continue;
        title = runTitle;
        break;
      }
      case "run.finish":
        if (title !== null) runFinished = true;
        break;
      case "ticket.add": {
        const estimateMin = num(event.estimateMin);
        if (!id || !str(event.title) || estimateMin === undefined) continue;
        tickets.set(id, {
          id,
          status: status(event.status) ?? "not_started",
          estimateMin,
          stage: str(event.stage),
          waitsFor: str(event.waitsFor),
          lastChange: ts,
        });
        break;
      }
      case "ticket.update": {
        if (!id) continue;
        const ticket = tickets.get(id);
        // An update to an unknown ticket is still a write (PP lists it as an issue).
        if (!ticket) break;
        const next = status(event.status);
        const estimateMin = num(event.estimateMin);
        if (estimateMin !== undefined) ticket.estimateMin = estimateMin;
        const stage = typeof event.stage === "string" ? event.stage.trim() : undefined;
        const statusChanged = next !== undefined && next !== ticket.status;
        const stageChanged = stage !== undefined && stage !== (ticket.stage ?? "");
        // A status, stage or note change is a sign of work (PP history entries).
        if (statusChanged || stageChanged || str(event.note)) ticket.lastChange = ts;
        if (statusChanged) ticket.status = next;
        if (stageChanged) ticket.stage = stage || undefined;
        if (typeof event.waitsFor === "string") ticket.waitsFor = event.waitsFor.trim() || undefined;
        break;
      }
      case "ticket.remove":
        if (id) tickets.delete(id);
        break;
      case "question.ask":
        if (id) questions.set(id, false);
        break;
      case "question.answer":
        if (id && questions.has(id) && str(event.choice)) questions.set(id, true);
        break;
      case "question.remove":
        if (id) questions.delete(id);
        break;
      case "activity.add":
        if (id) activity.set(id, { ticket: str(event.ticket), at: ts });
        break;
      case "activity.remove":
        if (id) activity.delete(id);
        break;
      case "stuck.set":
        if (id && str(event.reason)) manual.set(id, { ticket: str(event.ticket) });
        break;
      case "stuck.clear":
        if (id) manual.delete(id);
        break;
      default:
        // Unknown types still count as a write, as every parsed event does in PP.
        if (!KNOWN_TYPES.has(event.type)) continue;
    }
    updatedAt = event.ts;
  }

  const list = [...tickets.values()];
  const waiting = (ticket: TicketFold) => {
    const other = ticket.waitsFor ? tickets.get(ticket.waitsFor) : undefined;
    return other !== undefined && !settled(other) && !settled(ticket);
  };
  const stuckTickets = new Set<string>();
  let stuck = 0;
  for (const ticket of list) {
    if (ticket.status === "blocked" && !waiting(ticket)) {
      stuck += 1;
      stuckTickets.add(ticket.id);
    } else if (ticket.status === "working") {
      const tagged = [...activity.values()].filter((entry) => entry.ticket === ticket.id).map((entry) => entry.at);
      const lastUpdate = Math.max(ticket.lastChange, ...tagged);
      // Overdue once more than the estimate has passed, so a millisecond after it.
      if (now >= lastUpdate + ticket.estimateMin * 60_000 + 1) {
        stuck += 1;
        stuckTickets.add(ticket.id);
      }
    }
  }
  for (const item of manual.values()) {
    stuck += 1;
    if (item.ticket) stuckTickets.add(item.ticket);
  }
  const finished = runFinished || (list.length > 0 && list.every(settled));
  return {
    title,
    tickets: list
      .filter((ticket) => ticket.status !== "skipped")
      .map((ticket) => ({
        state: ticket.status === "blocked" && waiting(ticket) ? "waiting" : (ticket.status as Exclude<TicketStatus, "skipped">),
        stuck: stuckTickets.has(ticket.id),
      })),
    questions: [...questions.values()].filter((answered) => !answered).length,
    stuck,
    stale: !finished && updatedAt !== null && now >= Date.parse(updatedAt) + STALE_AFTER_MIN * 60_000,
    finished,
    updatedAt,
  };
}

/** Event types PP 1.14.7 writes; an unknown one is a newer plugin's and PP itself would skip it. */
const KNOWN_TYPES = new Set([
  "run.start",
  "run.finish",
  "ticket.add",
  "ticket.update",
  "ticket.remove",
  "stuck.set",
  "stuck.clear",
  "question.ask",
  "question.answer",
  "question.update",
  "question.remove",
  "deliverable.add",
  "deliverable.remove",
  "activity.add",
  "activity.update",
  "activity.remove",
  "ticker.set",
  "ticker.clear",
]);

export function summarizeProgress(text: string, now: number): ProgressSummary {
  return reduceProgressSummary(parseProgressEvents(text), now);
}

export type ProgressPluginState = "enabled" | "disabled" | "absent" | "unknown";

/**
 * Whether the daemon runs the Progress plugin, from its `config.json` as the daemon reads it
 * (Paseo 0.16 server/plugins/index.ts `listPlugins`: an entry under `plugins` is on unless
 * `enabled === false`, and nothing runs unless `pluginsEnabled === true`). "unknown": not a config.
 */
export function progressPluginState(config: unknown): ProgressPluginState {
  if (typeof config !== "object" || config === null || Array.isArray(config)) return "unknown";
  const { plugins, pluginsEnabled } = config as { plugins?: unknown; pluginsEnabled?: unknown };
  if (plugins === undefined) return "absent";
  if (typeof plugins !== "object" || plugins === null || Array.isArray(plugins)) return "unknown";
  const entry = (plugins as Record<string, unknown>)[PROGRESS_PLUGIN_ID];
  if (typeof entry !== "object" || entry === null) return "absent";
  if ((entry as { enabled?: unknown }).enabled === false || pluginsEnabled !== true) return "disabled";
  return "enabled";
}
