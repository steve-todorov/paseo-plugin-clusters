/*
 * The Pinned section of Paseo's default sidebar (hooks/use-sidebar-pins.ts
 * `splitPinnedSidebarGroups` and components/sidebar/sidebar-group-visibility.ts, v0.16).
 *
 * A pinned workspace leaves its project and is listed in Pinned, most recently pinned first. Its
 * project stays even when every workspace went to Pinned: the project row owns its actions. Pinned
 * shows 20 rows until expanded; the open workspace, when it falls past them, comes first.
 */

/** Rows Pinned shows before "Show more". */
export const PINNED_LIMIT = 20;

/** Most recently pinned first. `pinnedAt` is an ISO time, so text order is time order. */
export function byPinnedAtDesc(a: { pinnedAt: string | null }, b: { pinnedAt: string | null }): number {
  return (b.pinnedAt ?? "").localeCompare(a.pinnedAt ?? "");
}

export interface PinnedVisibility<T> {
  /** The open workspace when the limit would hide it; drawn before `visibleItems`, never in them. */
  leadingItem: T | null;
  visibleItems: T[];
  canToggle: boolean;
}

/** Which pinned rows show, as `selectSidebarGroupVisibility` with the pinned policy decides. */
export function selectPinnedVisibility<T>(input: {
  items: readonly T[];
  expanded: boolean;
  isOpen: (item: T) => boolean;
}): PinnedVisibility<T> {
  const { items, expanded, isOpen } = input;
  const baseline: T[] = [];
  let leadingItem: T | null = null;
  let canToggle = false;
  items.forEach((item, index) => {
    if (index < PINNED_LIMIT) baseline.push(item);
    else if (leadingItem === null && isOpen(item)) leadingItem = item;
    else canToggle = true;
  });
  if (expanded || !canToggle) return { leadingItem: null, visibleItems: items.slice(), canToggle };
  return { leadingItem, visibleItems: baseline, canToggle };
}
