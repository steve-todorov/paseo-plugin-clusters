/*
 * What the 16x20 status slot of a workspace row shows: Paseo's agent status merged with the row's
 * Progress run. An open question ("?") and a stuck run (red dot) take the slot over the quieter
 * agent states, but not over an agent that waits for input or has failed.
 */

export type StatusSlot = "needs_input" | "failed" | "question" | "stuck" | "running" | "attention" | "idle";

/** Most urgent first. */
export const STATUS_SLOT_PRIORITY: readonly StatusSlot[] = ["needs_input", "failed", "question", "stuck", "running", "attention", "idle"];

/** The part of a row's progress the slot reads; null for no run. */
export interface SlotProgress {
  questions: number;
  stuck: boolean;
}

function agentSlot(indicator: string | null): StatusSlot {
  if (indicator === "needs_input" || indicator === "failed" || indicator === "running" || indicator === "attention") return indicator;
  return "idle";
}

/**
 * The slot for an agent status and a progress run. For a folded parent pass its rolled-up agent
 * status and its subtree's aggregated progress: the order is total, so the result is the most
 * urgent of the whole subtree.
 */
export function statusSlotOf(indicator: string | null, progress: SlotProgress | null): StatusSlot {
  const candidates: StatusSlot[] = [agentSlot(indicator)];
  if (progress && progress.questions > 0) candidates.push("question");
  if (progress?.stuck) candidates.push("stuck");
  return candidates.reduce((best, slot) => (STATUS_SLOT_PRIORITY.indexOf(slot) < STATUS_SLOT_PRIORITY.indexOf(best) ? slot : best));
}
