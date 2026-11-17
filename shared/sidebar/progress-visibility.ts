/*
 * When a workspace row shows its Progress run. "always" keeps every run on screen; "recent" drops
 * the bar, the pills and the status slot's "?" and stuck dot from a workspace not used for a while,
 * so finished or abandoned runs stop crowding the list. Use is the last prompt, else the creation.
 */

/** In the menu's order. */
export const PROGRESS_VISIBILITIES = ["always", "recent"] as const;
export type ProgressVisibility = (typeof PROGRESS_VISIBILITIES)[number];

export const MIN_PROGRESS_HIDE_AFTER_HOURS = 1;
/** 30 days. */
export const MAX_PROGRESS_HIDE_AFTER_HOURS = 720;
export const DEFAULT_PROGRESS_HIDE_AFTER_HOURS = 72;

const HOUR_MS = 60 * 60 * 1000;
const DAY_HOURS = 24;

export interface ProgressVisibilityPrefs {
  progressVisibility: ProgressVisibility;
  progressHideAfterHours: number;
}

/** Whole hours within the bounds; anything that is not a number reads as the default. */
export function normalizeProgressHideAfterHours(value: unknown): number {
  if (typeof value !== "number" || !Number.isFinite(value)) return DEFAULT_PROGRESS_HIDE_AFTER_HOURS;
  return Math.min(MAX_PROGRESS_HIDE_AFTER_HOURS, Math.max(MIN_PROGRESS_HIDE_AFTER_HOURS, Math.round(value)));
}

/**
 * Whether a workspace last used at `usedAtMs` (0 for never) still shows its progress at `nowMs`. A
 * workspace with no time at all counts as stale: there is nothing to say it is in use.
 */
export function progressIsFresh(usedAtMs: number, nowMs: number, prefs: ProgressVisibilityPrefs): boolean {
  if (prefs.progressVisibility === "always") return true;
  if (usedAtMs <= 0) return false;
  return nowMs - usedAtMs <= prefs.progressHideAfterHours * HOUR_MS;
}

/**
 * The menu's − / + step: an hour at a time below a day, a day at a time from there, so the whole
 * range is a few dozen presses. A value off the day grid snaps to the next day in either direction.
 */
export function stepProgressHideAfterHours(hours: number, delta: 1 | -1): number {
  const from = normalizeProgressHideAfterHours(hours);
  let next: number;
  if (delta > 0) next = from < DAY_HOURS ? from + 1 : (Math.floor(from / DAY_HOURS) + 1) * DAY_HOURS;
  else next = from <= DAY_HOURS ? from - 1 : (Math.ceil(from / DAY_HOURS) - 1) * DAY_HOURS;
  return normalizeProgressHideAfterHours(next);
}
