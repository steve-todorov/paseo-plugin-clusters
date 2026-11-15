/*
 * The Clusters screen's project list, built from every host's project list (not from the desktop
 * sidebar, which holds only what Paseo's own list shows, and nothing while the Clusters view is
 * selected). One row per sidebar key, the key a cluster stores.
 */
import { type ProjectListing, sidebarKeyOf } from "./project-keys.ts";

/** The fields of a host's project list the screen reads. */
export interface NamedProjectListing extends ProjectListing {
  projectDisplayName?: string | null;
  projectCustomName?: string | null;
}

export interface ScreenProject {
  /** The sidebar key, as clusters store it. */
  key: string;
  /** The name the user sees: a custom name if any project behind the key has one. */
  label: string;
  /** The hosts that list the project, in host order. */
  hostIds: string[];
  /** Lowercased text the search looks in: names, root paths and the key. */
  terms: string[];
}

function addTerm(terms: string[], value: string | null | undefined): void {
  const term = value?.trim().toLowerCase();
  if (term && !terms.includes(term)) terms.push(term);
}

/**
 * Every project of every host, one row per sidebar key, ordered by name. Projects that share a key
 * (on one host or on several) are one row, as in the sidebar and in a cluster.
 */
export function listScreenProjects(byHost: ReadonlyMap<string, readonly NamedProjectListing[]>): ScreenProject[] {
  const rows = new Map<string, ScreenProject & { custom: boolean }>();
  for (const [hostId, projects] of byHost) {
    for (const project of projects) {
      const key = sidebarKeyOf(hostId, project);
      const id = key.toLowerCase();
      const custom = project.projectCustomName?.trim() || "";
      const name = custom || project.projectDisplayName?.trim() || key.split(/[\\/]/).pop() || key;
      let row = rows.get(id);
      if (!row) {
        row = { key, label: name, hostIds: [], terms: [], custom: !!custom };
        rows.set(id, row);
      } else if (custom && !row.custom) {
        row.label = custom;
        row.custom = true;
      }
      if (!row.hostIds.includes(hostId)) row.hostIds.push(hostId);
      addTerm(row.terms, project.projectCustomName);
      addTerm(row.terms, project.projectDisplayName);
      addTerm(row.terms, project.projectRootPath);
      addTerm(row.terms, key);
    }
  }
  return [...rows.values()]
    .map(({ custom: _custom, ...row }) => row)
    .sort((a, b) => a.label.localeCompare(b.label, undefined, { sensitivity: "base" }) || a.key.localeCompare(b.key));
}

/** Whether a row matches the search text; an empty search matches every row. */
export function matchesProjectQuery(project: ScreenProject, query: string): boolean {
  const needle = query.trim().toLowerCase();
  return !needle || project.label.toLowerCase().includes(needle) || project.terms.some((term) => term.includes(needle));
}

function normalisePath(path: string): string {
  return path.replace(/\\/g, "/").replace(/\/+$/, "").toLowerCase();
}

/**
 * Whether a project still has a workspace, for the rule that hides projects whose workspaces were
 * all archived. Null while the workspaces or the agent history are loading (nothing is hidden).
 * True when a workspace of it is live, either one known by id (`workspaceLive`) or one whose
 * project root is one of the key's roots (`liveRoots`). A key can stand for several projects,
 * so every root counts. False only when agents ran under a root and no workspace is left.
 */
export function projectLiveness(input: {
  loaded: boolean;
  workspaceLive?: boolean;
  liveRoots: Iterable<string>;
  roots: readonly string[];
  history: Iterable<string>;
}): boolean | null {
  if (!input.loaded) return null;
  if (input.workspaceLive) return true;
  const roots = input.roots.map(normalisePath).filter(Boolean);
  if (roots.length === 0) return true;
  for (const path of input.liveRoots) if (roots.includes(normalisePath(path))) return true;
  for (const path of input.history) {
    const at = normalisePath(path);
    if (roots.some((root) => at === root || at.startsWith(`${root}/`))) return false;
  }
  return true;
}
