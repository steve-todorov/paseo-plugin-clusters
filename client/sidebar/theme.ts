import type { PluginSidebarViewProps } from "@getpaseo/plugin/client";
import { Platform } from "react-native";

/*
 * Sizes and colours of Paseo's default sidebar rows (v0.16) that the plugin theme does not carry.
 * Colours the plugin theme lacks use the app's values for the theme's brightness.
 */

export type Theme = PluginSidebarViewProps["theme"];

export const ROW_HEIGHT = Platform.OS === "web" ? 36 : 44;
/** The title's line height, which the leading slots match. */
export const LINE = 20;
/** One size for every glyph on the meta row (the app's HOST_BADGE_ICON_SIZE). */
export const META_ICON_SIZE = 12;
export const META_FONT_SIZE = 12;
export const META_LINE = 16;

/** Whether the theme is dark, judged by its base surface. */
export function isDark(theme: Theme): boolean {
  const hex = theme.colors.surface0.replace("#", "");
  if (hex.length < 6) return true;
  const [r, g, b] = [0, 2, 4].map((i) => parseInt(hex.slice(i, i + 2), 16));
  return 0.299 * r + 0.587 * g + 0.114 * b < 128;
}

export function palette(theme: Theme) {
  const dark = isDark(theme);
  return {
    running: dark ? "#5caaf6" : "#268ae0",
    warning: dark ? "#db932e" : "#b37824",
    success: dark ? "#35c264" : "#299f51",
    danger: dark ? "#f7796d" : "#f12e2f",
    extraMuted: dark ? "#717574" : "#a1a1aa",
    // statusMerged, for a merged change request's glyph.
    merged: dark ? "#a890d5" : "#7347af",
    hover: theme.colors.surface1,
    selected: theme.colors.surface2,
  };
}
