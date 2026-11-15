import { type WorkspaceRef, useHosts, useWorkspaces } from "@getpaseo/plugin/client";
import { useMemo } from "react";
import { inRecents, toMs } from "../../shared/activity";
import {
  matchesLabelFilter,
  resolveActiveHostFilters,
  resolveActiveLabelFilter,
  resolveActiveProjectFilters,
} from "../../shared/sidebar/filters";
import { deriveIdentityColorName } from "../../shared/sidebar/identity-colors";
import { type WorkspaceLabelDefinition, workspaceLabelKey } from "../../shared/sidebar/labels";
import { byPinnedAtDesc } from "../../shared/sidebar/pinned";
import type { SidebarSettings } from "../../shared/sidebar/preferences";
import { type StatusBucket, type StatusRowLike, compareStatusRows, orderStatusGroups } from "../../shared/sidebar/status-groups";
import { type SortableWorkspace, applyStoredOrdering, compareProjectNames, workspaceComparator } from "../../shared/sidebar/workspace-sort";
import type { WorkspaceKeyFields } from "../../shared/project-keys";
import type { MenuProject } from "./display-menu/pages";
import { useMergedLabelCatalog } from "./labels";

/*
 * What the Clusters view lists, under the selected cluster and the display preferences. It plays
 * the part of Paseo's sidebar model (components/sidebar/sidebar-model.tsx and
 * hooks/use-sidebar-workspaces-list.ts, v0.16): filters, grouping and order.
 */

/** The snapshot fields this module reads. */
interface Snapshot {
  ref: WorkspaceRef;
  hostId: string;
  project: { key: string };
  projectId: string;
  projectRootPath: string;
  projectDisplayName: string;
  name: string;
  labels: readonly string[];
  background: boolean;
  archivingAt: string | null;
  pinnedAt: string | null;
  createdAt: string | null;
  lastPromptAt: string | null;
  indicator: StatusBucket;
  statusEnteredAt: string | null;
}

/** The user's last prompt in a workspace, or when it was made. 0 if neither. */
function usedAt(w: { lastPromptAt: string | null; createdAt: string | null }): number {
  return toMs(w.lastPromptAt) || toMs(w.createdAt);
}

const byUseDesc = (a: Snapshot, b: Snapshot) => usedAt(b) - usedAt(a);

const sortable = (w: Snapshot): SortableWorkspace => ({ key: w.ref.key, name: w.name, createdAt: w.createdAt, lastPromptAt: w.lastPromptAt });

const statusRow = (w: Snapshot): StatusRowLike => ({
  key: w.ref.key,
  bucket: w.indicator,
  statusEnteredAt: w.statusEnteredAt,
  projectName: w.projectDisplayName,
  name: w.name,
});

export interface ListGroup {
  key: string;
  title: string;
  items: readonly WorkspaceRef[];
}

export interface StatusListGroup {
  bucket: StatusBucket;
  items: readonly WorkspaceRef[];
}

export interface SidebarListInput {
  settings: SidebarSettings;
  /** The selected cluster's project keys, in its order; null outside a cluster. */
  clusterProjects: readonly string[] | null;
  /** Recents' rules while it is selected; null otherwise. */
  recents: { cutoff: number; unlimited: boolean; hiddenAt: (w: WorkspaceKeyFields) => number | undefined } | null;
  /** Whether a cluster key names a workspace's project. */
  keyMatches: (key: string, w: WorkspaceKeyFields) => boolean;
}

export function useSidebarList({ settings, clusterProjects, recents, keyMatches }: SidebarListInput) {
  const hosts = useHosts();
  const serverIds = useMemo(() => hosts.map((host) => host.serverId), [hosts]);
  const activeHosts = resolveActiveHostFilters(settings.hostFilters, serverIds);
  const placeIn = (w: Snapshot) => clusterProjects?.findIndex((key) => keyMatches(key, w)) ?? -1;

  // What the cluster, the hosts and the background switch let through.
  const base = (w: Snapshot) =>
    !w.archivingAt &&
    (settings.showBackground || !w.background) &&
    (activeHosts.length === 0 || activeHosts.includes(w.hostId)) &&
    (clusterProjects === null || placeIn(w) >= 0);

  // Recents shows a project while its latest use is recent enough. That holds exactly when one of
  // its workspaces is, so the projects to show are the groups of the workspaces that qualify; most
  // recently used first, which is also Recents' project order.
  const recentGroups = useWorkspaces({
    where: (w) =>
      recents !== null && base(w) && inRecents(usedAt(w) >= recents.cutoff ? usedAt(w) : 0, recents.hiddenAt(w), recents.unlimited),
    orderBy: byUseDesc,
    groupBy: (w) => w.project.key,
  });
  const recentOrder = useMemo(() => new Map(recentGroups.map((group, index) => [group.key, index])), [recentGroups]);
  const shown = (w: Snapshot) => recents === null || recentOrder.has(w.project.key);

  // Every project the list could show before the project and label filters: the filter picker's rows.
  const availableGroups = useWorkspaces({
    where: (w) => base(w) && shown(w),
    orderBy: (a, b) => compareProjectNames({ name: a.projectDisplayName, key: a.project.key }, { name: b.projectDisplayName, key: b.project.key }),
    groupBy: (w) => ({ key: w.project.key, title: w.projectDisplayName }),
  });
  const projects: MenuProject[] = useMemo(
    () => availableGroups.flatMap((group) => (group.items[0] ? [{ key: group.key, title: group.title ?? "", workspace: group.items[0] }] : [])),
    [availableGroups],
  );
  const resolvedProjectFilters = resolveActiveProjectFilters(settings.projectFilters, new Set(projects.map((project) => project.key)));

  // Labels to filter by: every host's catalog; hosts that cannot share theirs leave the names in use.
  const catalog = useMergedLabelCatalog(serverIds);
  const labelGroups = useWorkspaces({
    where: (w) => catalog === null && base(w) && shown(w),
    groupBy: (w) => w.labels.map((name) => ({ key: workspaceLabelKey(name), title: name })),
  });
  const labels: WorkspaceLabelDefinition[] = useMemo(
    () =>
      catalog ??
      labelGroups
        .map((group) => ({ name: group.title ?? group.key, color: deriveIdentityColorName(group.key) }))
        .filter((label) => label.name.trim().length > 0)
        .sort((left, right) => left.name.localeCompare(right.name, undefined, { sensitivity: "base" })),
    [catalog, labelGroups],
  );
  const resolvedLabelFilter = resolveActiveLabelFilter(settings.labelFilter.labels, catalog ? catalog.map((label) => label.name) : null);

  const visible = (w: Snapshot) =>
    base(w) &&
    shown(w) &&
    (resolvedProjectFilters.length === 0 || resolvedProjectFilters.includes(w.project.key)) &&
    matchesLabelFilter(w.labels, resolvedLabelFilter);

  // Hosts too old to report creation times sort by name, as Paseo does for them.
  const undated = useWorkspaces({ where: (w) => base(w) && w.createdAt === null });
  const sortSupported = undated.length === 0;
  const compareWorkspaces = workspaceComparator(settings.sort, sortSupported);

  // One group per project, pinned workspaces included: they still keep their project in the list.
  const projectGroups = useWorkspaces({
    where: visible,
    orderBy: (a, b) =>
      (clusterProjects !== null
        ? placeIn(a) - placeIn(b)
        : recents === null
          ? compareProjectNames({ name: a.projectDisplayName, key: a.project.key }, { name: b.projectDisplayName, key: b.project.key })
          : 0) || compareWorkspaces(sortable(a), sortable(b)),
    groupBy: (w) => ({ key: w.project.key, title: w.projectDisplayName }),
  });
  // The cluster's key for each project listed, so a drop can be written back as the cluster's order.
  // The group title carries the key: groups are the only way to read a value off every snapshot.
  const clusterKeyGroups = useWorkspaces({
    where: (w) => clusterProjects !== null && visible(w),
    groupBy: (w) => ({ key: w.project.key, title: clusterProjects?.[placeIn(w)] ?? "" }),
  });
  const clusterKeyOf = useMemo(
    () => new Map(clusterKeyGroups.map((group) => [group.key, group.title ?? ""])),
    [clusterKeyGroups],
  );
  // A cluster keeps its own order and Recents its recency; All lays the user's order over names.
  const groups: ListGroup[] = useMemo(() => {
    let ordered: ListGroup[] = projectGroups.map((group) => ({ key: group.key, title: group.title ?? "", items: group.items }));
    if (recents !== null) {
      ordered.sort((a, b) => (recentOrder.get(a.key) ?? 0) - (recentOrder.get(b.key) ?? 0));
    } else if (clusterProjects === null) {
      ordered = applyStoredOrdering({ items: ordered, storedOrder: settings.projectOrder, getKey: (group) => group.key });
    }
    if (settings.sort === "manual") {
      ordered = ordered.map((group) => {
        const storedOrder = settings.workspaceOrderByProject[group.key];
        return storedOrder ? { ...group, items: applyStoredOrdering({ items: group.items, storedOrder, getKey: (ref) => ref.key }) } : group;
      });
    }
    return ordered;
  }, [projectGroups, recents, recentOrder, clusterProjects, settings.projectOrder, settings.sort, settings.workspaceOrderByProject]);

  // Pinned workspaces leave their project for the section on top, which follows the same filters.
  // Most recently pinned first, with the order the user dragged them into laid over it.
  const pinnedByTime = useWorkspaces({ where: (w) => visible(w) && w.pinnedAt !== null, orderBy: byPinnedAtDesc });
  const pinned = useMemo(
    () => applyStoredOrdering({ items: pinnedByTime, storedOrder: settings.pinnedWorkspaceOrder, getKey: (ref) => ref.key }),
    [pinnedByTime, settings.pinnedWorkspaceOrder],
  );
  const pinnedKeys = useMemo(() => new Set(pinned.map((ref) => ref.key)), [pinned]);

  // Rows that are not done never hide behind "Show more".
  const busy = useWorkspaces({ where: (w) => visible(w) && w.indicator !== "done" });
  const busyKeys = useMemo(() => new Set(busy.map((ref) => ref.key)), [busy]);

  const statusGrouped = useWorkspaces({
    where: (w) => settings.grouping === "status" && visible(w) && w.pinnedAt === null,
    orderBy: (a, b) => compareStatusRows(statusRow(a), statusRow(b)),
    groupBy: (w) => w.indicator,
  });
  const statusGroups: StatusListGroup[] = useMemo(
    () => orderStatusGroups(statusGrouped).map((group) => ({ bucket: group.key as StatusBucket, items: group.items })),
    [statusGrouped],
  );

  return {
    hosts,
    projects,
    resolvedProjectFilters,
    labels,
    resolvedLabelFilter,
    sortSupported,
    groups,
    clusterKeyOf,
    pinned,
    pinnedKeys,
    busyKeys,
    statusGroups,
    /** The filters emptied a list that had projects: say so, and offer to clear them. */
    filterEmpty: projects.length > 0 && groups.length === 0,
  };
}
