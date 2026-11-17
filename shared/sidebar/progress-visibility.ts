/*
 * When a workspace row shows its Progress run. "always" keeps every run on screen; "recent" drops
 * the bar, the pills and the status slot's "?" and stuck dot from a workspace not used for a while,
 * so finished or abandoned runs stop crowding the list. Use is the last prompt, else the creation.
 */

/** In the menu's order. */
export const PROGRESS_VISIBILITIES = ["always", "recent"] as const;
export type ProgressVisibility = (typeof PROGRESS_VISIBILITIES)[number];

export const MIN_PROGRESS_HIDE_AFTER_DAYS = 1;
export const MAX_PROGRESS_HIDE_AFTER_DAYS = 30;
export const DEFAULT_PROGRESS_HIDE_AFTER_DAYS = 3;

const DAY_MS = 24 * 60 * 60 * 1000;

export interface ProgressVisibilityPrefs {
  progressVisibility: ProgressVisibility;
  progressHideAfterDays: number;
}

/** Whole days within the bounds; anything that is not a number reads as the default. */
export function normalizeProgressHideAfterDays(value: unknown): number {
  if (typeof value !== "number" || !Number.isFinite(value)) return DEFAULT_PROGRESS_HIDE_AFTER_DAYS;
  return Math.min(MAX_PROGRESS_HIDE_AFTER_DAYS, Math.max(MIN_PROGRESS_HIDE_AFTER_DAYS, Math.round(value)));
}

/**
 * Whether a workspace last used at `usedAtMs` (0 for never) still shows its progress at `nowMs`. A
 * workspace with no time at all counts as stale: there is nothing to say it is in use.
 */
export function progressIsFresh(usedAtMs: number, nowMs: number, prefs: ProgressVisibilityPrefs): boolean {
  if (prefs.progressVisibility === "always") return true;
  if (usedAtMs <= 0) return false;
  return nowMs - usedAtMs <= prefs.progressHideAfterDays * DAY_MS;
}

/** The menu's − / + step: a day at a time, staying put at either end. */
export function stepProgressHideAfterDays(days: number, delta: 1 | -1): number {
  return normalizeProgressHideAfterDays(normalizeProgressHideAfterDays(days) + delta);
}
