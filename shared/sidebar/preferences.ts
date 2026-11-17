/*
 * The display preferences of Paseo's sidebar (components/sidebar/display-preferences/model.ts,
 * stores/sidebar-view-store.ts and hooks/use-settings/storage.ts, v0.16), with the app's defaults
 * and its validation. Paseo splits them between synced app settings and a local store; this view
 * keeps its own copy of all of them in one per-device document (./settings.ts).
 */
import { z } from "zod";
import { DEFAULT_SIDEBAR_CHECKS_DISPLAY, SIDEBAR_CHECKS_DISPLAYS, type SidebarChecksDisplay } from "./checks-display.ts";
import { workspaceLabelKey } from "./labels.ts";
import {
  DEFAULT_PROGRESS_HIDE_AFTER_DAYS,
  PROGRESS_VISIBILITIES,
  type ProgressVisibility,
  normalizeProgressHideAfterDays,
} from "./progress-visibility.ts";
import { DEFAULT_SIDEBAR_ROW_ITEMS, type SidebarRowItem, type SidebarRowItems, parseSidebarRowItems } from "./row-items.ts";

/** In the menu's order. */
export const SIDEBAR_GROUP_MODES = ["project", "status"] as const;
export type SidebarGroupMode = (typeof SIDEBAR_GROUP_MODES)[number];

/** In the Sort page's order. */
export const WORKSPACE_SORTS = ["manual", "created", "lastPrompt"] as const;
export type WorkspaceSort = (typeof WORKSPACE_SORTS)[number];

/** "title" shows the workspace name; "branch" its checkout branch, falling back to the name. */
export const WORKSPACE_TITLE_SOURCES = ["title", "branch"] as const;
export type WorkspaceTitleSource = (typeof WORKSPACE_TITLE_SOURCES)[number];

/** The slot right of the title holds one thing, or nothing. */
export type SidebarWorkspaceTrailing = "diff" | "timestamp" | "none";

/** The trailing slot holds one thing, so these are a choice rather than toggles. */
export const SIDEBAR_TRAILING_CHOICES = ["diff", "timestamp"] as const;
export type SidebarTrailingChoice = (typeof SIDEBAR_TRAILING_CHOICES)[number];

/**
 * The key standing for "this workspace carries no labels at all". No real label normalizes to the
 * empty string, so nothing in `labels` can collide with it.
 */
export const SIDEBAR_UNLABELLED_LABEL_KEY = "";

export interface SidebarLabelFilter {
  /** Keyed by `workspaceLabelKey`; empty means every label. */
  labels: string[];
}

export interface SidebarPreferences {
  grouping: SidebarGroupMode;
  sort: WorkspaceSort;
  titleSource: WorkspaceTitleSource;
  rowItems: SidebarRowItems;
  checksDisplay: SidebarChecksDisplay;
  trailing: SidebarWorkspaceTrailing;
  /** Server IDs; empty shows every host. */
  hostFilters: readonly string[];
  /** Project keys; empty shows every project. */
  projectFilters: readonly string[];
  labelFilter: SidebarLabelFilter;
  showBackground: boolean;
  /** Whether rows of workspaces not used for a while drop their Progress run. */
  progressVisibility: ProgressVisibility;
  /** How long a workspace goes unused before "recent" drops its run. */
  progressHideAfterDays: number;
}

export const DEFAULT_SIDEBAR_PREFERENCES: SidebarPreferences = {
  grouping: "project",
  sort: "created",
  titleSource: "title",
  rowItems: DEFAULT_SIDEBAR_ROW_ITEMS,
  checksDisplay: DEFAULT_SIDEBAR_CHECKS_DISPLAY,
  trailing: "timestamp",
  hostFilters: [],
  projectFilters: [],
  labelFilter: { labels: [] },
  showBackground: false,
  progressVisibility: "always",
  progressHideAfterDays: DEFAULT_PROGRESS_HIDE_AFTER_DAYS,
};

/** Re-keys a stored filter through `workspaceLabelKey`, so its keys are always in key form. */
function normalizeLabelFilter(filter: SidebarLabelFilter): SidebarLabelFilter {
  return { labels: [...new Set(filter.labels.map(workspaceLabelKey))] };
}

const StringList = z.array(z.string()).catch([]);

/**
 * The stored settings. Every field falls back to its default on its own, as Paseo's settings do, so
 * one bad value never discards the rest and `{}` parses to the defaults.
 */
export const SidebarSettingsSchema = z.object({
  // Paseo once had a "label" grouping; anything but "status" reads as project.
  grouping: z
    .unknown()
    .optional()
    .transform((value): SidebarGroupMode => (value === "status" ? "status" : "project")),
  sort: z.enum(WORKSPACE_SORTS).catch("created"),
  titleSource: z.enum(WORKSPACE_TITLE_SOURCES).catch("title"),
  rowItems: z.unknown().optional().transform(parseSidebarRowItems),
  checksDisplay: z.enum(SIDEBAR_CHECKS_DISPLAYS).catch(DEFAULT_SIDEBAR_CHECKS_DISPLAY),
  trailing: z.enum(["diff", "timestamp", "none"]).catch("timestamp"),
  hostFilters: StringList,
  projectFilters: StringList,
  labelFilter: z.object({ labels: z.array(z.string()) }).transform(normalizeLabelFilter).catch({ labels: [] }),
  showBackground: z.boolean().catch(false),
  progressVisibility: z.enum(PROGRESS_VISIBILITIES).catch("always"),
  progressHideAfterDays: z.unknown().optional().transform(normalizeProgressHideAfterDays),
  /** Project keys in the user's order; the All view applies it over name order. */
  projectOrder: StringList,
  /** Workspace keys per project key, for the "Manual" sort. */
  workspaceOrderByProject: z.record(z.string(), z.array(z.string())).catch({}),
  /** Pinned workspace keys in the user's order, laid over "most recently pinned first". */
  pinnedWorkspaceOrder: StringList,
});

export type SidebarSettings = z.output<typeof SidebarSettingsSchema>;

export function parseSidebarSettings(value: unknown): SidebarSettings {
  return SidebarSettingsSchema.parse(typeof value === "object" && value !== null ? value : {});
}

/** Include/exclude toggle over an allowlist, shared by the host and project filters. */
export function toggleFilterEntry(list: readonly string[], key: string): string[] {
  return list.includes(key) ? list.filter((entry) => entry !== key) : [...list, key];
}

export function toggleLabelFilter(filter: SidebarLabelFilter, name: string): SidebarLabelFilter {
  const key = workspaceLabelKey(name);
  return { labels: toggleFilterEntry(filter.labels, key) };
}

export function hasActiveSidebarLabelFilter(filter: SidebarLabelFilter): boolean {
  return filter.labels.length > 0;
}

export function toggleRowItem(items: SidebarRowItems, item: SidebarRowItem): SidebarRowItems {
  return { ...items, [item]: !items[item] };
}

/** Picking the choice that is already showing clears the slot. */
export function toggleTrailing(current: SidebarWorkspaceTrailing, choice: SidebarTrailingChoice): SidebarWorkspaceTrailing {
  return current === choice ? "none" : choice;
}
