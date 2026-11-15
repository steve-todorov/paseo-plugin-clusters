/*
 * The project groups of Paseo's default sidebar (projects/workspace-structure.ts
 * `buildWorkspaceStructureProjects` and utils/sidebar-project-row-model.ts, v0.16.0-beta.2).
 *
 * A project joins the group of its shared `projectKey` only while no other project on its host has
 * that key; projects on different hosts with the same key then share one group. Otherwise (a
 * worktree added as a project of its own, say) the project is a group of its own, keyed by its
 * placement `["<serverId>","<projectId>"]`, which is also the plugin's project ref key.
 */

/** The project fields read from a host's project list. */
export interface GroupableProject {
  projectId: string;
  projectKey?: string | null;
  projectDisplayName?: string | null;
  projectCustomName?: string | null;
  projectRootPath?: string | null;
  projectKind?: string | null;
}

/** One host's project in a group. */
export interface GroupPlacement {
  hostId: string;
  projectId: string;
  rootPath: string;
  /** Whether a worktree can be made on it: a git project, or one of unknown kind. */
  canCreateWorkspace: boolean;
}

export interface ProjectGroup {
  key: string;
  projectKey: string | null;
  title: string;
  /** One per host, in host order; a later project on the same host replaces the earlier one. */
  placements: readonly GroupPlacement[];
}

export interface ProjectGrouping {
  /** Every group, by key. */
  groups: ReadonlyMap<string, ProjectGroup>;
  /** The group key of a host's project; its placement key when the project is not listed. */
  keyOf: (hostId: string, projectId: string) => string;
  groupOf: (hostId: string, projectId: string) => ProjectGroup | null;
  /** A listed project's own name (the app's `projectNameForWorkspace`), whatever group it is in. */
  nameOf: (hostId: string, projectId: string) => string | null;
}

/** The plugin's project ref key, and Paseo's view key for a project grouped on its own. */
export function placementKey(hostId: string, projectId: string): string {
  return JSON.stringify([hostId, projectId]);
}

/** Paseo's utils/project-display-name.ts. */
export function projectDisplayNameFromProjectId(projectId: string): string {
  const githubRemotePrefix = "remote:github.com/";
  if (projectId.startsWith(githubRemotePrefix)) return projectId.slice(githubRemotePrefix.length) || projectId;
  const segments = projectId.split(/[\\/]/).filter(Boolean);
  return segments[segments.length - 1] || projectId;
}

interface Draft {
  key: string;
  projectKey: string | null;
  title: string;
  hasCustomName: boolean;
  placements: Map<string, GroupPlacement>;
}

/**
 * Groups every host's projects as Paseo does. `hostOrder` is the app's host order (Paseo walks its
 * sessions in it); hosts not in it follow in the lists' order.
 */
export function buildProjectGrouping(
  lists: ReadonlyMap<string, readonly GroupableProject[]>,
  hostOrder: readonly string[] = [],
): ProjectGrouping {
  const hosts = [...new Set([...hostOrder.filter((id) => lists.has(id)), ...lists.keys()])];
  const entries = hosts.flatMap((hostId) => (lists.get(hostId) ?? []).map((project) => ({ hostId, project })));

  const keyCounts = new Map<string, Map<string, number>>();
  for (const { hostId, project } of entries) {
    if (!project.projectKey) continue;
    const counts = keyCounts.get(hostId) ?? new Map<string, number>();
    counts.set(project.projectKey, (counts.get(project.projectKey) ?? 0) + 1);
    keyCounts.set(hostId, counts);
  }
  const allocated = new Set(entries.flatMap(({ project }) => (project.projectKey ? [project.projectKey] : [])));
  const allocatePlacement = (hostId: string, projectId: string): string => {
    const legacy = placementKey(hostId, projectId);
    if (!allocated.has(legacy)) {
      allocated.add(legacy);
      return legacy;
    }
    for (let suffix = 0; ; suffix += 1) {
      const key = JSON.stringify(["placement", hostId, projectId, suffix]);
      if (allocated.has(key)) continue;
      allocated.add(key);
      return key;
    }
  };

  const drafts = new Map<string, Draft>();
  const keyByPlacement = new Map<string, string>();
  const nameByPlacement = new Map<string, string>();
  for (const { hostId, project } of entries) {
    const ownName = project.projectCustomName ?? project.projectDisplayName ?? projectDisplayNameFromProjectId(project.projectId);
    nameByPlacement.set(placementKey(hostId, project.projectId), ownName);
    const shared = project.projectKey ?? null;
    const key = shared !== null && keyCounts.get(hostId)?.get(shared) === 1 ? shared : allocatePlacement(hostId, project.projectId);
    keyByPlacement.set(placementKey(hostId, project.projectId), key);
    const placement: GroupPlacement = {
      hostId,
      projectId: project.projectId,
      rootPath: project.projectRootPath ?? "",
      canCreateWorkspace: project.projectKind == null || project.projectKind === "git",
    };
    const draft = drafts.get(key);
    if (!draft) {
      drafts.set(key, {
        key,
        projectKey: shared,
        title: ownName,
        hasCustomName: Boolean(project.projectCustomName),
        placements: new Map([[hostId, placement]]),
      });
      continue;
    }
    if (project.projectCustomName && !draft.hasCustomName) {
      draft.title = project.projectCustomName;
      draft.hasCustomName = true;
    }
    draft.placements.set(hostId, placement);
  }

  const groups = new Map<string, ProjectGroup>();
  for (const draft of drafts.values()) {
    groups.set(draft.key, { key: draft.key, projectKey: draft.projectKey, title: draft.title, placements: [...draft.placements.values()] });
  }
  const keyOf = (hostId: string, projectId: string) => {
    const placement = placementKey(hostId, projectId);
    return keyByPlacement.get(placement) ?? placement;
  };
  return {
    groups,
    keyOf,
    groupOf: (hostId, projectId) => {
      const key = keyByPlacement.get(placementKey(hostId, projectId));
      return key === undefined ? null : (groups.get(key) ?? null);
    },
    nameOf: (hostId, projectId) => nameByPlacement.get(placementKey(hostId, projectId)) ?? null,
  };
}

/** The placement whose project draws the group's icon (`resolveSidebarProjectIconTarget`). */
export function iconPlacementOf(group: ProjectGroup): GroupPlacement | null {
  return group.placements.find((placement) => placement.rootPath.trim().length > 0) ?? null;
}

/**
 * Where the group's "+" makes a new workspace (`resolveNewWorkspaceTarget`): the preferred host
 * when it can take one, else the first host that can. Null hides the "+".
 */
export function newWorkspacePlacementOf(group: ProjectGroup, preferredHostId: string | null): GroupPlacement | null {
  let fallback: GroupPlacement | null = null;
  for (const placement of group.placements) {
    if (!placement.canCreateWorkspace || placement.rootPath.trim().length === 0) continue;
    if (placement.hostId === preferredHostId) return placement;
    fallback ??= placement;
  }
  return fallback;
}

export interface StoredGroupOrders {
  projectOrder: readonly string[];
  projectFilters: readonly string[];
  workspaceOrderByProject: Readonly<Record<string, readonly string[]>>;
}

/** The group key a stored placement key now stands for, or the key itself. */
function rekey(key: string, keyOf: ProjectGrouping["keyOf"]): string {
  if (!key.startsWith("[")) return key;
  try {
    const parsed: unknown = JSON.parse(key);
    if (Array.isArray(parsed) && parsed.length === 2 && typeof parsed[0] === "string" && typeof parsed[1] === "string") {
      return keyOf(parsed[0], parsed[1]);
    }
  } catch {
    // Not a placement key.
  }
  return key;
}

/**
 * Orders and filters stored before groups took Paseo's keys were keyed by placement. Moves each to
 * its project's group key; where the group key already holds an order, the moved one leads, as it
 * is the one the user made. Null when nothing moves.
 */
export function rekeyStoredOrders<T extends StoredGroupOrders>(stored: T, keyOf: ProjectGrouping["keyOf"]): T | null {
  let changed = false;
  const move = (key: string) => {
    const next = rekey(key, keyOf);
    if (next !== key) changed = true;
    return next;
  };
  const projectOrder = [...new Set(stored.projectOrder.map(move))];
  const projectFilters = [...new Set(stored.projectFilters.map(move))];
  const moved = new Map<string, string[]>();
  const kept = new Map<string, readonly string[]>();
  for (const [key, order] of Object.entries(stored.workspaceOrderByProject)) {
    const next = move(key);
    if (next === key) kept.set(key, order);
    else moved.set(next, [...new Set([...(moved.get(next) ?? []), ...order])]);
  }
  if (!changed) return null;
  const workspaceOrderByProject: Record<string, string[]> = {};
  for (const [key, order] of kept) workspaceOrderByProject[key] = [...order];
  for (const [key, order] of moved) workspaceOrderByProject[key] = [...new Set([...order, ...(kept.get(key) ?? [])])];
  return { ...stored, projectOrder, projectFilters, workspaceOrderByProject };
}
