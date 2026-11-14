/*
 * Ported from Paseo's components/sidebar/display-preferences/checks-display.ts (v0.16): how much
 * of a workspace's CI a row spends space on. The icon alone is a real third answer, not half of
 * "off", which is why this is not one of the boolean row items.
 */

export const SIDEBAR_CHECKS_DISPLAYS = ["iconAndText", "icon", "none"] as const;

export type SidebarChecksDisplay = (typeof SIDEBAR_CHECKS_DISPLAYS)[number];

export const DEFAULT_SIDEBAR_CHECKS_DISPLAY: SidebarChecksDisplay = "iconAndText";

/** Null for anything that isn't one of the three, so callers can tell "absent" from "chosen". */
export function parseSidebarChecksDisplay(value: unknown): SidebarChecksDisplay | null {
  if (typeof value !== "string") {
    return null;
  }
  return (SIDEBAR_CHECKS_DISPLAYS as readonly string[]).includes(value) ? (value as SidebarChecksDisplay) : null;
}
