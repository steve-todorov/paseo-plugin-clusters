/*
 * Which rows of a sidebar group show before "Show more" (components/sidebar/
 * sidebar-group-visibility.ts, v0.16). Pinned shows 20 rows; a project or status group shows 7,
 * plus every workspace that is not done, so nothing asking for attention hides behind the toggle.
 * The open workspace, when the limit would hide it, comes first.
 */

export type SidebarGroupVisibilityPolicy<T> = { kind: "pinned" } | { kind: "workspaces"; isDone: (item: T) => boolean };

export const PINNED_GROUP_LIMIT = 20;
export const WORKSPACE_GROUP_LIMIT = 7;

export interface SidebarGroupVisibility<T> {
  /** The open workspace when the limit would hide it; drawn before `visibleItems`, never in them. */
  leadingItem: T | null;
  visibleItems: T[];
  canToggle: boolean;
}

export function selectSidebarGroupVisibility<T>(input: {
  items: readonly T[];
  expanded: boolean;
  policy: SidebarGroupVisibilityPolicy<T>;
  isOpen: (item: T) => boolean;
}): SidebarGroupVisibility<T> {
  const { items, expanded, policy, isOpen } = input;
  const limit = policy.kind === "pinned" ? PINNED_GROUP_LIMIT : WORKSPACE_GROUP_LIMIT;
  const baseline: T[] = [];
  let leadingItem: T | null = null;
  let canToggle = false;
  items.forEach((item, index) => {
    const inBaseline = index < limit || (policy.kind === "workspaces" && !policy.isDone(item));
    if (inBaseline) baseline.push(item);
    else if (leadingItem === null && isOpen(item)) leadingItem = item;
    else canToggle = true;
  });
  if (expanded || !canToggle) return { leadingItem: null, visibleItems: items.slice(), canToggle };
  return { leadingItem, visibleItems: baseline, canToggle };
}
