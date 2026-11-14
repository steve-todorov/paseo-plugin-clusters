/*
 * The "Status" grouping of Paseo's sidebar (hooks/sidebar-status-view-model.ts and
 * utils/sidebar-agent-state.ts `STATUS_BUCKET_ORDER`, v0.16). Unpinned workspaces fall into one
 * section per status, most urgent first; empty sections are left out. Inside a section the
 * workspace that entered its status last comes first.
 */

export type StatusBucket = "needs_input" | "failed" | "attention" | "running" | "done";

/** Section order: what wants you first, then what is ready, what is working, what is finished. */
export const STATUS_BUCKET_ORDER: readonly StatusBucket[] = ["needs_input", "failed", "attention", "running", "done"];

export interface StatusRowLike {
  key: string;
  bucket: StatusBucket;
  statusEnteredAt: string | null;
  projectName: string;
  name: string;
}

function timeOf(value: string | null): number | null {
  if (value === null) return null;
  const ms = Date.parse(value);
  return Number.isNaN(ms) ? null : ms;
}

/** Newest status first; rows without a time after those with one; then project, name and key. */
export function compareStatusRows(a: StatusRowLike, b: StatusRowLike): number {
  const aTime = timeOf(a.statusEnteredAt);
  const bTime = timeOf(b.statusEnteredAt);
  if (aTime !== null && bTime !== null) {
    if (aTime !== bTime) return bTime - aTime;
  } else if (aTime !== null) {
    return -1;
  } else if (bTime !== null) {
    return 1;
  }
  return a.projectName.localeCompare(b.projectName) || a.name.localeCompare(b.name) || a.key.localeCompare(b.key);
}

/** Puts sections in `STATUS_BUCKET_ORDER`, dropping empty ones; their rows keep their order. */
export function orderStatusGroups<G extends { key: string; items: readonly unknown[] }>(groups: readonly G[]): G[] {
  const byKey = new Map(groups.map((group) => [group.key, group]));
  return STATUS_BUCKET_ORDER.flatMap((bucket) => {
    const group = byKey.get(bucket);
    return group && group.items.length > 0 ? [group] : [];
  });
}
