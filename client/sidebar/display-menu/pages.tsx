import { type ProjectRef, type WorkspaceRef, useWorkspace } from "@getpaseo/plugin/client";
import { View } from "react-native";
import type { Strings } from "../../../shared/i18n";
import { SIDEBAR_CHECKS_DISPLAYS, type SidebarChecksDisplay } from "../../../shared/sidebar/checks-display";
import { identityForeground } from "../../../shared/sidebar/identity-colors";
import { type WorkspaceLabelDefinition, workspaceLabelKey } from "../../../shared/sidebar/labels";
import {
  SIDEBAR_GROUP_MODES,
  SIDEBAR_TRAILING_CHOICES,
  SIDEBAR_UNLABELLED_LABEL_KEY,
  type SidebarGroupMode,
  type SidebarSettings,
  type SidebarTrailingChoice,
  WORKSPACE_TITLE_SOURCES,
  type WorkspaceSort,
  type WorkspaceTitleSource,
  toggleFilterEntry,
  toggleLabelFilter,
  toggleRowItem,
  toggleTrailing,
} from "../../../shared/sidebar/preferences";
import { SIDEBAR_ROW_ITEMS, type SidebarRowItem } from "../../../shared/sidebar/row-items";
import { t } from "../../web";
import type { StoredSidebarSettings } from "../preferences";
import { ProjectIcon, projectColorKey, useProjectIconData } from "../project-icon";
import { type Theme, isDark } from "../theme";
import { MenuItem, MenuSeparator, MenuSubTrigger, OPTION_ICON_SIZE, OptionIcon } from "./rows";

/*
 * The pages of Paseo's display-preferences menu (components/sidebar/display-preferences/menu.tsx,
 * v0.16), with its option order, icons and labels.
 */

export type MenuPageId = "root" | "grouping" | "sort" | "titleSource" | "show" | "checks" | "hostFilter" | "projectFilter" | "labelFilter";

export interface MenuHost {
  serverId: string;
  label: string;
  status: string;
}

export interface MenuProject {
  key: string;
  title: string;
  /** Any of its workspaces, to reach the project by. */
  workspace: WorkspaceRef;
}

/** Everything the menu reads, worked out by the view that owns the list. */
export interface DisplayMenuModel {
  settings: SidebarSettings;
  update: StoredSidebarSettings["update"];
  /** False while a host cannot say when its workspaces were made. */
  sortSupported: boolean;
  hosts: readonly MenuHost[];
  /** Every project the list could show before the project and label filters. */
  projects: readonly MenuProject[];
  /** The project filter as the list applies it. */
  resolvedProjectFilters: readonly string[];
  labels: readonly WorkspaceLabelDefinition[];
  /** The label filter as the list applies it. */
  resolvedLabelFilter: readonly string[];
}

export interface MenuNavigation {
  open: (page: MenuPageId) => void;
  close: () => void;
}

// Options carry icons; the root rows do not. They are the marks these things carry on the row.
const GROUPING_ICONS: Record<SidebarGroupMode, string> = { project: "Folder", status: "CircleDashed" };
const TITLE_SOURCE_ICONS: Record<WorkspaceTitleSource, string> = { title: "Type", branch: "GitBranch" };
const ROW_ITEM_ICONS: Record<SidebarRowItem, string> = {
  branch: "GitBranch",
  project: "Folder",
  host: "Server",
  changeRequest: "GitPullRequest",
  services: "Globe",
  labels: "Tag",
};
// How much of the row an option spends: a glyph with words, the glyph alone, nothing.
const CHECKS_DISPLAY_ICONS: Record<SidebarChecksDisplay, string> = { iconAndText: "Captions", icon: "CircleCheck", none: "EyeOff" };
const TRAILING_ICONS: Record<SidebarTrailingChoice, string> = { diff: "Diff", timestamp: "Clock" };

export function groupingLabel(s: Strings, mode: SidebarGroupMode): string {
  return mode === "project" ? s.groupingProject : s.groupingStatus;
}

export function sortLabel(s: Strings, sort: WorkspaceSort): string {
  return sort === "manual" ? s.sortManual : sort === "created" ? s.sortCreated : s.sortLastPrompt;
}

function titleSourceLabel(s: Strings, source: WorkspaceTitleSource): string {
  return source === "title" ? s.titleSourceTitle : s.titleSourceBranch;
}

function rowItemLabel(s: Strings, item: SidebarRowItem): string {
  const labels: Record<SidebarRowItem, string> = {
    branch: s.showBranch,
    project: s.showProject,
    host: s.showHost,
    changeRequest: s.showChangeRequest,
    services: s.showServices,
    labels: s.showLabels,
  };
  return labels[item];
}

function checksLabel(s: Strings, display: SidebarChecksDisplay): string {
  return display === "iconAndText" ? s.checksIconAndText : display === "icon" ? s.checksIcon : s.checksNone;
}

/** Which root rows show: a filter with nothing to choose between has no row. */
export function menuRows(model: DisplayMenuModel) {
  const labelFilterActive = model.resolvedLabelFilter.length > 0;
  return {
    sort: model.settings.grouping === "project",
    hostFilter: model.hosts.length > 1,
    // One project is the whole list, so filtering to it is a no-op with a row attached.
    projectFilter: model.projects.length > 1,
    // An active filter keeps its row even with no labels left, so it can still be undone.
    labelFilter: model.labels.length > 0 || labelFilterActive,
  };
}

export function MenuPage({ page, model, nav, theme }: { page: MenuPageId; model: DisplayMenuModel; nav: MenuNavigation; theme: Theme }) {
  const s = t();
  const { settings, update } = model;
  // A pick from a list of exclusive options closes the menu; toggles keep it open.
  const pick = (change: (current: SidebarSettings) => SidebarSettings) => {
    update(change);
    nav.close();
  };
  switch (page) {
    case "root":
      return <RootPage model={model} nav={nav} theme={theme} />;
    case "grouping":
      return (
        <>
          {SIDEBAR_GROUP_MODES.map((mode) => (
            <MenuItem
              key={mode}
              theme={theme}
              label={groupingLabel(s, mode)}
              leading={<OptionIcon name={GROUPING_ICONS[mode]} theme={theme} />}
              selected={settings.grouping === mode}
              onPress={() => pick((current) => ({ ...current, grouping: mode }))}
            />
          ))}
        </>
      );
    case "titleSource":
      return (
        <>
          {WORKSPACE_TITLE_SOURCES.map((source) => (
            <MenuItem
              key={source}
              theme={theme}
              label={titleSourceLabel(s, source)}
              leading={<OptionIcon name={TITLE_SOURCE_ICONS[source]} theme={theme} />}
              selected={settings.titleSource === source}
              onPress={() => pick((current) => ({ ...current, titleSource: source }))}
            />
          ))}
        </>
      );
    case "checks":
      return (
        <>
          {SIDEBAR_CHECKS_DISPLAYS.map((display) => (
            <MenuItem
              key={display}
              theme={theme}
              label={checksLabel(s, display)}
              leading={<OptionIcon name={CHECKS_DISPLAY_ICONS[display]} theme={theme} />}
              selected={settings.checksDisplay === display}
              onPress={() => pick((current) => ({ ...current, checksDisplay: display }))}
            />
          ))}
        </>
      );
    case "sort":
      return (
        <>
          <MenuItem
            theme={theme}
            label={s.sortManual}
            selected={settings.sort === "manual"}
            onPress={() => pick((current) => ({ ...current, sort: "manual" }))}
          />
          {model.sortSupported ? (
            (["created", "lastPrompt"] as const).map((sort) => (
              <MenuItem
                key={sort}
                theme={theme}
                label={sortLabel(s, sort)}
                selected={settings.sort === sort}
                onPress={() => pick((current) => ({ ...current, sort }))}
              />
            ))
          ) : (
            <MenuItem theme={theme} label={s.sortUpdateHost} disabled />
          )}
        </>
      );
    case "show":
      // What a row may say, each on its own; then the one thing the slot right of the title holds.
      return (
        <>
          {SIDEBAR_ROW_ITEMS.map((item) => (
            <MenuItem
              key={item}
              theme={theme}
              label={rowItemLabel(s, item)}
              leading={<OptionIcon name={ROW_ITEM_ICONS[item]} theme={theme} />}
              selected={settings.rowItems[item]}
              onPress={() => update((current) => ({ ...current, rowItems: toggleRowItem(current.rowItems, item) }))}
            />
          ))}
          {/* CI has three answers, so it opens a page; no value on the row, only the chevron. */}
          <MenuSubTrigger
            theme={theme}
            label={s.showChecks}
            leading={<OptionIcon name="CircleCheck" theme={theme} />}
            onPress={() => nav.open("checks")}
          />
          <MenuSeparator theme={theme} />
          {SIDEBAR_TRAILING_CHOICES.map((choice) => (
            <MenuItem
              key={choice}
              theme={theme}
              label={choice === "diff" ? s.showDiff : s.showTimestamp}
              leading={<OptionIcon name={TRAILING_ICONS[choice]} theme={theme} />}
              selected={settings.trailing === choice}
              onPress={() => update((current) => ({ ...current, trailing: toggleTrailing(current.trailing, choice) }))}
            />
          ))}
        </>
      );
    case "hostFilter":
      return (
        <>
          <MenuItem
            theme={theme}
            label={s.hostFilterAll}
            selected={settings.hostFilters.length === 0}
            onPress={() => update((current) => ({ ...current, hostFilters: [] }))}
          />
          {model.hosts.map((host) => (
            <MenuItem
              key={host.serverId}
              theme={theme}
              label={host.label.trim() || host.serverId}
              leading={<HostStatusDot status={host.status} theme={theme} />}
              selected={settings.hostFilters.includes(host.serverId)}
              onPress={() => update((current) => ({ ...current, hostFilters: toggleFilterEntry(current.hostFilters, host.serverId) }))}
            />
          ))}
        </>
      );
    case "projectFilter":
      // Checks follow the filter as applied: a stored key out of view filters nothing.
      return (
        <>
          <MenuItem
            theme={theme}
            label={s.projectFilterAll}
            selected={model.resolvedProjectFilters.length === 0}
            onPress={() => update((current) => ({ ...current, projectFilters: [] }))}
          />
          {model.projects.map((project) => (
            <MenuItem
              key={project.key}
              theme={theme}
              label={project.title}
              leading={<MenuProjectIcon project={project} />}
              selected={model.resolvedProjectFilters.includes(project.key)}
              onPress={() =>
                update((current) => ({ ...current, projectFilters: toggleFilterEntry(current.projectFilters, project.key) }))
              }
            />
          ))}
        </>
      );
    case "labelFilter":
      return <LabelFilterPage model={model} theme={theme} />;
  }
}

function RootPage({ model, nav, theme }: { model: DisplayMenuModel; nav: MenuNavigation; theme: Theme }) {
  const s = t();
  const { settings, update } = model;
  const rows = menuRows(model);
  return (
    <>
      <MenuSubTrigger theme={theme} label={s.groupingLabel} value={groupingLabel(s, settings.grouping)} onPress={() => nav.open("grouping")} />
      {rows.sort ? (
        <MenuSubTrigger
          theme={theme}
          label={s.sortLabel}
          value={model.sortSupported || settings.sort === "manual" ? sortLabel(s, settings.sort) : undefined}
          onPress={() => nav.open("sort")}
        />
      ) : null}
      <MenuSubTrigger
        theme={theme}
        label={s.titleSourceLabel}
        value={titleSourceLabel(s, settings.titleSource)}
        onPress={() => nav.open("titleSource")}
      />
      <MenuSubTrigger theme={theme} label={s.showLabel} onPress={() => nav.open("show")} />
      {rows.hostFilter ? (
        <>
          <MenuSeparator theme={theme} />
          {/* A filtered list looks like workspaces went missing, so the row says so. */}
          <MenuSubTrigger
            theme={theme}
            label={s.hostFilterLabel}
            indicator={settings.hostFilters.length > 0}
            onPress={() => nav.open("hostFilter")}
          />
        </>
      ) : null}
      {rows.projectFilter ? (
        <>
          {/* Host and Project narrow the same list, so they share one separator. */}
          {rows.hostFilter ? null : <MenuSeparator theme={theme} />}
          <MenuSubTrigger
            theme={theme}
            label={s.projectFilterLabel}
            indicator={model.resolvedProjectFilters.length > 0}
            onPress={() => nav.open("projectFilter")}
          />
        </>
      ) : null}
      {rows.labelFilter ? (
        <>
          <MenuSeparator theme={theme} />
          <MenuSubTrigger
            theme={theme}
            label={s.labelsTitle}
            indicator={model.resolvedLabelFilter.length > 0}
            onPress={() => nav.open("labelFilter")}
          />
        </>
      ) : null}
      <MenuSeparator theme={theme} />
      <MenuItem
        theme={theme}
        label={s.showBackground}
        selected={settings.showBackground}
        onPress={() => update((current) => ({ ...current, showBackground: !current.showBackground }))}
      />
    </>
  );
}

/**
 * Every label to filter by, one row each, then Unlabelled. Clear is absent rather than disabled
 * when there is nothing to clear. Paseo's "Manage labels…" row is left out: plugins cannot edit
 * the label catalog.
 */
function LabelFilterPage({ model, theme }: { model: DisplayMenuModel; theme: Theme }) {
  const s = t();
  const { settings, update } = model;
  const selected = settings.labelFilter.labels;
  const scheme = isDark(theme) ? "dark" : "light";
  const toggle = (name: string) => update((current) => ({ ...current, labelFilter: toggleLabelFilter(current.labelFilter, name) }));
  return (
    <>
      {model.labels.map((label) => (
        <MenuItem
          key={workspaceLabelKey(label.name)}
          theme={theme}
          label={label.name}
          leading={<View style={{ width: 10, height: 10, borderRadius: 5, backgroundColor: identityForeground(label.color, scheme) }} />}
          selected={selected.includes(workspaceLabelKey(label.name))}
          onPress={() => toggle(label.name)}
        />
      ))}
      <MenuItem
        theme={theme}
        label={s.unlabelled}
        // Unlabelled's stand-in for a colour dot: the same circle, hollow.
        leading={<OptionIcon name="Circle" theme={theme} />}
        selected={selected.includes(SIDEBAR_UNLABELLED_LABEL_KEY)}
        onPress={() => toggle(SIDEBAR_UNLABELLED_LABEL_KEY)}
      />
      {model.resolvedLabelFilter.length > 0 ? (
        <>
          <MenuSeparator theme={theme} />
          <MenuItem theme={theme} label={s.clearLabelFilter} onPress={() => update((current) => ({ ...current, labelFilter: { labels: [] } }))} />
        </>
      ) : null}
    </>
  );
}

/** A host's connection as a dot: green online, amber connecting, red otherwise. */
function HostStatusDot({ status, theme }: { status: string; theme: Theme }) {
  const c = theme.colors;
  const color = status === "online" ? c.statusSuccess : status === "connecting" ? c.statusWarning : c.statusDanger;
  return <View style={{ width: 8, height: 8, borderRadius: 4, backgroundColor: color }} />;
}

function MenuProjectIcon({ project }: { project: MenuProject }) {
  const head = useWorkspace(project.workspace, (w) => ({ project: w.project, hostId: w.hostId, projectId: w.projectId }));
  return head ? <MenuProjectImage project={head.project} title={project.title} colorKey={projectColorKey(head.hostId, head.projectId)} /> : null;
}

function MenuProjectImage({ project, title, colorKey }: { project: ProjectRef; title: string; colorKey: string }) {
  const icon = useProjectIconData(project);
  return <ProjectIcon icon={icon} displayName={title} colorKey={colorKey} size={OPTION_ICON_SIZE} />;
}
