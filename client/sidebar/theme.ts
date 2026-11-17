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
    // The workspace tree's guides and drag cues (the approved mock's values; the app has none).
    guide: dark ? "rgba(161, 165, 164, 0.16)" : "rgba(113, 117, 116, 0.22)",
    nestFill: dark ? "rgba(32, 116, 74, 0.20)" : "rgba(32, 116, 74, 0.10)",
    nestOutline: dark ? "#2f9e64" : "#20744a",
    nestLine: dark ? "#3fb57a" : "#20744a",
    nestGhostFill: dark ? "rgba(32, 116, 74, 0.06)" : "rgba(32, 116, 74, 0.05)",
    nestGhostBorder: dark ? "rgba(63, 181, 122, 0.55)" : "rgba(32, 116, 74, 0.5)",
    nestGhostText: dark ? "#6cae96" : "#20744a",
    denyFill: dark ? "rgba(247, 121, 109, 0.08)" : "rgba(241, 46, 47, 0.06)",
    denyOutline: dark ? "rgba(247, 121, 109, 0.6)" : "rgba(241, 46, 47, 0.5)",
  };
}

/** Each level of the workspace tree steps in this far (Option A). */
export const TREE_INDENT = 20;
/** The status slot's centre from a row's left edge (8 padding + half the 16 slot): where guides run. */
export const TREE_GUIDE_X = 16;

/**
 * A row being dragged (`projectRowDragging` / `workspaceRowDragging`): lifted on surface2 with a
 * border and the app's `shadow.md`, which the plugin theme does not carry.
 */
export function draggingRowStyle(theme: Theme) {
  const dark = isDark(theme);
  return {
    backgroundColor: theme.colors.surface2,
    borderWidth: 1,
    borderColor: theme.colors.border,
    transform: [{ scale: 1.02 }],
    zIndex: 3,
    shadowColor: dark ? "rgba(0, 0, 0, 0.20)" : "rgba(0, 0, 0, 0.04)",
    shadowOffset: { width: 0, height: 4 },
    shadowRadius: dark ? 8 : 16,
    elevation: dark ? 8 : 4,
  } as const;
}
