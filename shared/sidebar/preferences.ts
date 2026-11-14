/*
 * The display preferences of Paseo's sidebar (components/sidebar/display-preferences/model.ts,
 * stores/sidebar-view-store.ts and hooks/use-settings/storage.ts, v0.16), with the app's defaults.
 * The view only reads the defaults for now; a settings menu will write them later.
 */
import { DEFAULT_SIDEBAR_CHECKS_DISPLAY, type SidebarChecksDisplay } from "./checks-display.ts";
import { DEFAULT_SIDEBAR_ROW_ITEMS, type SidebarRowItems } from "./row-items.ts";

export type SidebarGroupMode = "project" | "status";

export type WorkspaceSort = "manual" | "created" | "lastPrompt";

/** "title" shows the workspace name; "branch" its checkout branch, falling back to the name. */
export type WorkspaceTitleSource = "title" | "branch";

/** The slot right of the title holds one thing, or nothing. */
export type SidebarWorkspaceTrailing = "diff" | "timestamp" | "none";

export interface SidebarLabelFilter {
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
};
