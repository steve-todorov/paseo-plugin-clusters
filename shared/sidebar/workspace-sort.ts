/*
 * The order of Paseo's "Project" grouping (projects/workspace-structure.ts,
 * stores/session-store-hooks/selectors.ts `composeWorkspaceStructure` and
 * hooks/sidebar-workspaces-view-model.ts, v0.16).
 *
 * Projects sort by name, then the user's stored order is laid over them. Inside a project:
 * - Created: newest workspace first.
 * - Last prompt: most recent prompt first, the creation time standing in for none.
 * - Manual: newest first, then the user's stored order laid over it.
 * Hosts too old to report the times sort workspaces by name, except under Manual.
 */
import type { WorkspaceSort } from "./preferences.ts";

export interface SortableWorkspace {
  key: string;
  name: string;
  createdAt: string | null;
  lastPromptAt: string | null;
}

const NAME_ORDER: Intl.CollatorOptions = { numeric: true, sensitivity: "base" };

function ms(value: string | null): number {
  if (!value) return 0;
  const time = Date.parse(value);
  return Number.isNaN(time) ? 0 : time;
}

export function workspaceSortTime(workspace: SortableWorkspace, sort: WorkspaceSort): number {
  return ms(sort === "lastPrompt" ? (workspace.lastPromptAt ?? workspace.createdAt) : workspace.createdAt);
}

/** Paseo's order when it has no times to go by. */
export function compareWorkspaceNames(left: SortableWorkspace, right: SortableWorkspace): number {
  return left.name.localeCompare(right.name, undefined, NAME_ORDER) || left.key.localeCompare(right.key);
}

/**
 * The workspace comparator for a sort. `timesSupported` is false when a host cannot say when its
 * workspaces were made; Paseo then falls back to names unless the sort is Manual.
 */
export function workspaceComparator(
  sort: WorkspaceSort,
  timesSupported: boolean,
): (left: SortableWorkspace, right: SortableWorkspace) => number {
  if (sort !== "manual" && !timesSupported) return compareWorkspaceNames;
  return (left, right) => workspaceSortTime(right, sort) - workspaceSortTime(left, sort) || left.key.localeCompare(right.key);
}

export function compareProjectNames(left: { name: string; key: string }, right: { name: string; key: string }): number {
  return left.name.localeCompare(right.name, undefined, NAME_ORDER) || left.key.localeCompare(right.key);
}

/**
 * Lays a stored order over a list: the stored items take the slots stored items held, in stored
 * order; everything else keeps its place. Unknown and repeated keys are ignored.
 */
export function applyStoredOrdering<T>(input: { items: readonly T[]; storedOrder: readonly string[]; getKey: (item: T) => string }): T[] {
  const items = input.items.slice();
  if (items.length <= 1 || input.storedOrder.length === 0) return items;
  const itemByKey = new Map(items.map((item) => [input.getKey(item), item]));
  const prunedOrder: string[] = [];
  const seen = new Set<string>();
  for (const key of input.storedOrder) {
    if (!itemByKey.has(key) || seen.has(key)) continue;
    seen.add(key);
    prunedOrder.push(key);
  }
  if (prunedOrder.length === 0) return items;
  let orderedIndex = 0;
  return items.map((item) => {
    const key = input.getKey(item);
    if (!seen.has(key)) return item;
    const target = prunedOrder[orderedIndex] ?? key;
    orderedIndex += 1;
    return itemByKey.get(target) ?? item;
  });
}

/** New projects join the stored order at the end. Returns `currentOrder` itself when nothing is new. */
export function appendMissingOrderKeys(currentOrder: readonly string[], visibleKeys: readonly string[]): readonly string[] {
  const existing = new Set(currentOrder);
  const missing = visibleKeys.filter((key) => !existing.has(key));
  return missing.length === 0 ? currentOrder : [...currentOrder, ...missing];
}

/** New workspaces join a manual order at the top. Returns `currentOrder` itself when nothing is new. */
export function prependMissingOrderKeys(currentOrder: readonly string[], visibleKeys: readonly string[]): readonly string[] {
  const existing = new Set(currentOrder);
  const missing = visibleKeys.filter((key) => !existing.has(key));
  return missing.length === 0 ? currentOrder : [...missing, ...currentOrder];
}
