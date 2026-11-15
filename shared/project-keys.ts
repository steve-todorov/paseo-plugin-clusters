/*
 * Cluster project keys and the workspaces they name.
 *
 * A cluster stores the desktop sidebar's project keys: `remote:<host>/<path>` for a project with a
 * git remote, `host:<serverId>:<path>` for a local one (Paseo's `projectKey`, which the sidebar uses
 * as the row's view key). Since Paseo 0.16 a workspace snapshot carries only the project's opaque
 * id (`prj_…`, or a path or remote id for projects made before), so a key is matched to a
 * workspace through each host's project list, which carries both.
 */

/** The project fields read from a host's project list. */
export interface ProjectListing {
  projectId: string;
  projectKey?: string | null;
  projectRootPath?: string | null;
}

/** The workspace fields a key is matched against. */
export interface WorkspaceKeyFields {
  hostId?: string;
  projectId: string;
  projectRootPath: string;
}

/** Per host: sidebar key (lowercased) to the ids of the projects behind it. */
export type ProjectIndex = ReadonlyMap<string, ReadonlyMap<string, ReadonlySet<string>>>;

function isLocalPath(id: string): boolean {
  return /^[a-z]:[\\/]/i.test(id) || id.startsWith("/");
}

/** Whether a key is already one the sidebar uses as is. */
function isSidebarKey(key: string): boolean {
  return key.startsWith("host:") || key.startsWith("remote:");
}

/**
 * Keys stored by 0.5.x on 0.16 hosts: a local `host:…` key mistaken for a remote id and saved as
 * `remote:host:…`. Read back as the key it was meant to be.
 */
export function normalizeStoredKey(key: string): string {
  return key.startsWith("remote:host:") ? key.slice("remote:".length) : key;
}

/**
 * The sidebar key of a listed project. The project's own `projectKey` is used unchanged; a project
 * without one (older hosts) gets the key derived from its id: `host:<serverId>:<path>` for a local
 * path, `remote:<id>` otherwise.
 */
export function sidebarKeyOf(serverId: string, project: { projectKey?: string | null; projectId: string }): string {
  const own = project.projectKey?.trim();
  if (own) return isSidebarKey(own) ? own : isLocalPath(own) ? `host:${serverId}:${own.toLowerCase()}` : `remote:${own}`;
  const id = project.projectId;
  if (isLocalPath(id)) return `host:${serverId}:${id.toLowerCase()}`;
  return `remote:${id.replace(/^remote:/, "")}`;
}

/** One host's sidebar keys and the project ids behind each. */
export function indexHostProjects(serverId: string, projects: readonly ProjectListing[]): Map<string, Set<string>> {
  const byKey = new Map<string, Set<string>>();
  for (const project of projects) {
    const key = sidebarKeyOf(serverId, project).toLowerCase();
    const ids = byKey.get(key) ?? new Set<string>();
    ids.add(project.projectId);
    byKey.set(key, ids);
  }
  return byKey;
}

/**
 * Whether a key names a workspace's project by its own text, without a project list: a local key
 * by the root path, a remote key by a legacy remote id.
 */
export function keyMatchesByText(key: string, w: WorkspaceKeyFields): boolean {
  const normalized = normalizeStoredKey(key);
  if (normalized.startsWith("remote:")) {
    return normalized.toLowerCase() === `remote:${w.projectId.replace(/^remote:/, "")}`.toLowerCase();
  }
  const path = normalized.replace(/^host:[^:]+:/, "").toLowerCase();
  return path === w.projectRootPath.toLowerCase() || path === w.projectId.toLowerCase();
}

/** A sidebar placement key (`["<serverId>","<projectId>"]`), used for projects without a shared key. */
function placementOf(key: string): { serverId: string; projectId: string } | null {
  if (!key.startsWith("[")) return null;
  try {
    const parsed: unknown = JSON.parse(key);
    if (Array.isArray(parsed) && parsed.length === 2 && parsed.every((part) => typeof part === "string")) {
      return { serverId: parsed[0], projectId: parsed[1] };
    }
  } catch {
    // Not a placement key.
  }
  return null;
}

/**
 * The matcher for a set of host project lists: a key names a workspace when the workspace's host
 * lists its project under that key, or, failing that, when the key's own text names it.
 */
export function createKeyMatcher(index: ProjectIndex): (key: string, w: WorkspaceKeyFields) => boolean {
  return (key, w) => {
    const normalized = normalizeStoredKey(key);
    const placement = placementOf(normalized);
    if (placement) return placement.projectId === w.projectId && (!w.hostId || placement.serverId === w.hostId);
    const lowered = normalized.toLowerCase();
    const hosts = w.hostId ? [index.get(w.hostId)] : [...index.values()];
    for (const host of hosts) if (host?.get(lowered)?.has(w.projectId)) return true;
    return keyMatchesByText(normalized, w);
  };
}
