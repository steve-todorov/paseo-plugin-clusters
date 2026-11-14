/*
 * The sidebar's host, project and label filters (hooks/use-sidebar-workspaces-list.ts,
 * components/sidebar/sidebar-project-filter.ts, sidebar-labels.ts and stores/sidebar-view-store.ts
 * `reconcileLabelFilter`, v0.16).
 *
 * Paseo deletes stale host and label keys from its store once the catalogs settle. This view
 * resolves them away when it reads instead, which shows the same list without writing.
 */
import { type WorkspaceLabelDefinition, workspaceLabelKey } from "./labels.ts";
import { SIDEBAR_UNLABELLED_LABEL_KEY } from "./preferences.ts";

const NONE: readonly string[] = [];

/** The hosts a host filter narrows to; empty means every host, also when none of them is left. */
export function resolveActiveHostFilters(hostFilters: readonly string[], serverIds: readonly string[]): readonly string[] {
  if (hostFilters.length === 0) return NONE;
  const known = new Set(serverIds);
  const matching = hostFilters.filter((id) => known.has(id));
  return matching.length > 0 ? matching : NONE;
}

/**
 * The stored project keys that still name a project the list can show. Empty means every project,
 * also when everything picked has gone away: a filter goes inert while its project is out of view
 * and comes back with it.
 */
export function resolveActiveProjectFilters(projectFilters: readonly string[], availableKeys: ReadonlySet<string>): readonly string[] {
  if (projectFilters.length === 0) return NONE;
  const matching = projectFilters.filter((key) => availableKeys.has(key));
  return matching.length > 0 ? matching : NONE;
}

/**
 * The label keys still worth filtering by. Without a catalog to judge by (`null`), all of them.
 * Unlabelled always survives: it names no label that could go away.
 */
export function resolveActiveLabelFilter(labels: readonly string[], availableNames: readonly string[] | null): readonly string[] {
  if (labels.length === 0 || availableNames === null) return labels;
  const available = new Set(availableNames.map(workspaceLabelKey));
  return labels.filter((label) => label === SIDEBAR_UNLABELLED_LABEL_KEY || available.has(label));
}

/** Whether a workspace passes the label filter; several labels include a workspace carrying any. */
export function matchesLabelFilter(workspaceLabels: readonly string[], labels: readonly string[]): boolean {
  if (labels.length === 0) return true;
  // Whitespace-only names normalize away, so an empty set is exactly "carries no real label".
  const keys = new Set(workspaceLabels.map(workspaceLabelKey).filter(Boolean));
  return labels.some((key) => (key === SIDEBAR_UNLABELLED_LABEL_KEY ? keys.size === 0 : keys.has(key)));
}

export interface HostLabelCatalog {
  serverId: string;
  labels: readonly WorkspaceLabelDefinition[];
}

/** One list of every host's labels: the first host (by id) to define a name sets its colour. */
export function mergeWorkspaceLabelCatalogs(catalogs: readonly HostLabelCatalog[]): WorkspaceLabelDefinition[] {
  const ordered = [...catalogs].sort((left, right) => left.serverId.localeCompare(right.serverId));
  const merged = new Map<string, WorkspaceLabelDefinition>();
  for (const catalog of ordered) {
    for (const label of catalog.labels) {
      const key = workspaceLabelKey(label.name);
      if (!merged.has(key)) merged.set(key, label);
    }
  }
  return [...merged.values()].sort((left, right) => left.name.localeCompare(right.name, undefined, { sensitivity: "base" }));
}
