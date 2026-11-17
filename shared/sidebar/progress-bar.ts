import type { ProgressSummary, ProgressTicketSummary } from "../progress.ts";

/*
 * The segmented underline of a workspace row (approved mock "Option 3"): one segment per ticket of
 * the latest run, coloured as the Progress panel's bar (PP 1.14.7 client/panel.tsx `Segment`: done
 * and working in the accent, working faded; blocked and not waiting in danger; the rest grey), with
 * stuck tickets (overdue, manual) red too. A red "stuck" pill marks a stuck run; open questions
 * and a stuck run also take the status slot (`status-slot.ts`).
 */

export type SegmentTone = "done" | "working" | "stuck" | "todo";

export interface ProgressSegment {
  tone: SegmentTone;
  /** Relative width: 1 per ticket on a row, the ticket count of a tone on a folded parent. */
  weight: number;
}

export interface RowProgress {
  segments: ProgressSegment[];
  /** Open questions; 0 shows no "?" in the status slot. */
  questions: number;
  stuck: boolean;
}

export function segmentTone(ticket: ProgressTicketSummary): SegmentTone {
  if (ticket.state === "done") return "done";
  if (ticket.stuck || ticket.state === "blocked") return "stuck";
  if (ticket.state === "working") return "working";
  return "todo";
}

/**
 * What a row shows for its workspace's progress; null for nothing. No run, no bar. A finished run
 * stays all done (as the panel keeps it until the next `run.start`) and is no longer stuck.
 */
export function rowProgressOf(summary: ProgressSummary | null): RowProgress | null {
  if (!summary || summary.title === null) return null;
  const segments: ProgressSegment[] = summary.tickets.map((ticket) => ({
    tone: summary.finished ? "done" : segmentTone(ticket),
    weight: 1,
  }));
  const stuck = !summary.finished && summary.stuck > 0;
  if (segments.length === 0 && summary.questions === 0 && !stuck) return null;
  return { segments, questions: summary.questions, stuck };
}

const TONE_ORDER: readonly SegmentTone[] = ["done", "working", "stuck", "todo"];

/** A folded parent's roll-up: every ticket below it, by tone in proportion; any pill carries up. */
export function aggregateRowProgress(rows: readonly (RowProgress | null)[]): RowProgress | null {
  const present = rows.filter((row): row is RowProgress => row !== null);
  if (present.length === 0) return null;
  const counts = new Map<SegmentTone, number>();
  for (const row of present) for (const segment of row.segments) counts.set(segment.tone, (counts.get(segment.tone) ?? 0) + segment.weight);
  return {
    segments: TONE_ORDER.flatMap((tone) => (counts.get(tone) ? [{ tone, weight: counts.get(tone) ?? 0 }] : [])),
    questions: present.reduce((sum, row) => sum + row.questions, 0),
    stuck: present.some((row) => row.stuck),
  };
}

/** The fewest tickets (summed over a folded parent's subtree) for which a row draws its bar. */
export const MIN_BAR_TICKETS = 2;

/**
 * Whether a row draws the bar: only for 2 or more tickets, as a one-ticket run says nothing a bar
 * can add. The pills do not depend on it. A folded parent counts every ticket below it, so
 * one-ticket children still add up to a roll-up bar.
 */
export function showsProgressBar(progress: RowProgress | null): boolean {
  if (!progress) return false;
  return progress.segments.reduce((sum, segment) => sum + segment.weight, 0) >= MIN_BAR_TICKETS;
}
