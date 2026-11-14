/*
 * The Pinned section of Paseo's default sidebar (hooks/use-sidebar-pins.ts
 * `splitPinnedSidebarGroups` and components/sidebar/sidebar-group-visibility.ts, v0.16).
 *
 * A pinned workspace leaves its project and is listed in Pinned, most recently pinned first. Its
 * project stays even when every workspace went to Pinned: the project row owns its actions. Pinned
 * shows 20 rows until expanded; the open workspace, when it falls past them, comes first.
 */

import { PINNED_GROUP_LIMIT, type SidebarGroupVisibility, selectSidebarGroupVisibility } from "./group-visibility.ts";

/** Rows Pinned shows before "Show more". */
export const PINNED_LIMIT = PINNED_GROUP_LIMIT;

/** Most recently pinned first. `pinnedAt` is an ISO time, so text order is time order. */
export function byPinnedAtDesc(a: { pinnedAt: string | null }, b: { pinnedAt: string | null }): number {
  return (b.pinnedAt ?? "").localeCompare(a.pinnedAt ?? "");
}

export type PinnedVisibility<T> = SidebarGroupVisibility<T>;

/** Which pinned rows show, as `selectSidebarGroupVisibility` with the pinned policy decides. */
export function selectPinnedVisibility<T>(input: {
  items: readonly T[];
  expanded: boolean;
  isOpen: (item: T) => boolean;
}): PinnedVisibility<T> {
  return selectSidebarGroupVisibility({ ...input, policy: { kind: "pinned" } });
}
