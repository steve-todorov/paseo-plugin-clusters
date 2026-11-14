import assert from "node:assert/strict";
import { test } from "node:test";
import { DEFAULT_SIDEBAR_ROW_ITEMS } from "./row-items.ts";
import {
  DEFAULT_SIDEBAR_PREFERENCES,
  parseSidebarSettings,
  toggleFilterEntry,
  toggleLabelFilter,
  toggleRowItem,
  toggleTrailing,
} from "./preferences.ts";

// Defaults and validation follow Paseo's stores/sidebar-view-store.ts and hooks/use-settings/storage.ts (v0.16).

test("an empty document reads as Paseo's defaults", () => {
  const settings = parseSidebarSettings({});
  const { projectOrder, workspaceOrderByProject, ...preferences } = settings;
  assert.deepEqual(preferences, DEFAULT_SIDEBAR_PREFERENCES);
  assert.deepEqual(projectOrder, []);
  assert.deepEqual(workspaceOrderByProject, {});
});

test("anything that is not an object reads as the defaults", () => {
  assert.equal(parseSidebarSettings(null).grouping, "project");
  assert.equal(parseSidebarSettings("status").grouping, "project");
});

test("each bad field falls back alone, keeping the good ones", () => {
  const settings = parseSidebarSettings({
    grouping: "status",
    sort: "alphabetical",
    titleSource: "branch",
    trailing: 3,
    checksDisplay: "icon",
    hostFilters: "a",
    showBackground: "yes",
  });
  assert.equal(settings.grouping, "status");
  assert.equal(settings.sort, "created");
  assert.equal(settings.titleSource, "branch");
  assert.equal(settings.trailing, "timestamp");
  assert.equal(settings.checksDisplay, "icon");
  assert.deepEqual(settings.hostFilters, []);
  assert.equal(settings.showBackground, false);
});

test("the old label grouping reads as project", () => {
  assert.equal(parseSidebarSettings({ grouping: "label" }).grouping, "project");
});

test("row items merge over the defaults", () => {
  const settings = parseSidebarSettings({ rowItems: { branch: true, host: "no" } });
  assert.deepEqual(settings.rowItems, { ...DEFAULT_SIDEBAR_ROW_ITEMS, branch: true });
});

test("a stored label filter is re-keyed and deduplicated", () => {
  const settings = parseSidebarSettings({ labelFilter: { labels: ["  Bug ", "bug", ""] } });
  assert.deepEqual(settings.labelFilter, { labels: ["bug", ""] });
});

test("filters toggle in and out", () => {
  assert.deepEqual(toggleFilterEntry(["a"], "b"), ["a", "b"]);
  assert.deepEqual(toggleFilterEntry(["a", "b"], "a"), ["b"]);
  assert.deepEqual(toggleLabelFilter({ labels: [] }, " Needs  Review "), { labels: ["needs review"] });
  assert.deepEqual(toggleLabelFilter({ labels: ["needs review"] }, "Needs Review"), { labels: [] });
});

test("a row item flips without touching the others", () => {
  assert.deepEqual(toggleRowItem(DEFAULT_SIDEBAR_ROW_ITEMS, "branch"), { ...DEFAULT_SIDEBAR_ROW_ITEMS, branch: true });
});

test("picking the trailing choice already showing empties the slot", () => {
  assert.equal(toggleTrailing("timestamp", "timestamp"), "none");
  assert.equal(toggleTrailing("timestamp", "diff"), "diff");
  assert.equal(toggleTrailing("none", "diff"), "diff");
});
