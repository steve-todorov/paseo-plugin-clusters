/*
 * The hand-built workspace tree of the Clusters view: inside a project the user drags a workspace
 * onto another to file it under it (epic > child > grandchild). It is visual only; Paseo knows
 * nothing of it. Each daemon stores `child id -> parent id` for its own workspaces, so every device
 * shows the same tree; sibling order is the list's (the per-device Manual order, or the sort).
 *
 * The rules, settled with the user:
 * - At most two levels below the project.
 * - A parent that is gone (archived, deleted) or shown elsewhere (pinned, filtered out) leaves the
 *   tree, and its children take its place one level up, keeping their own children.
 */
import { STATUS_BUCKET_ORDER, type StatusBucket } from "./status-groups.ts";

/** Levels below the project a workspace may sit at: 0 is top level, so epic > child > grandchild. */
export const MAX_TREE_DEPTH = 2;

/** One daemon's tree as stored: workspace id to its parent's id. */
export type StoredTree = Readonly<Record<string, string>>;

/** child key -> parent key, over the sidebar's workspace keys. */
export type TreeLinks = ReadonlyMap<string, string>;

/** The SDK's workspace ref key (`JSON.stringify([hostId, id])`), so a tree reads straight onto rows. */
export function treeNodeKey(hostId: string, id: string): string {
  return JSON.stringify([hostId, id]);
}

/** Every host's stored tree as links between workspace keys. A tree never links across hosts. */
export function linksOfHosts(trees: ReadonlyMap<string, StoredTree | undefined>): Map<string, string> {
  const links = new Map<string, string>();
  for (const [hostId, tree] of trees) {
    for (const [child, parent] of Object.entries(tree ?? {})) links.set(treeNodeKey(hostId, child), treeNodeKey(hostId, parent));
  }
  return links;
}

export interface TreeRow {
  key: string;
  /** 0 for a top-level row, up to MAX_TREE_DEPTH. */
  depth: number;
  parent: string | null;
  childCount: number;
  /** Every row below this one, at any depth. */
  descendants: number;
}

/**
 * The parent each key is shown under: walks up past parents that are not present, breaks loops
 * (the first key in `keys` order becomes a root), and lifts anything past the depth limit to the
 * deepest level allowed.
 */
function effectiveParents(keys: readonly string[], links: TreeLinks, present: ReadonlySet<string>): Map<string, string | null> {
  const parents = new Map<string, string | null>();
  for (const key of keys) {
    let parent = links.get(key) ?? null;
    const seen = new Set([key]);
    while (parent !== null && !present.has(parent) && !seen.has(parent)) {
      seen.add(parent);
      parent = links.get(parent) ?? null;
    }
    parents.set(key, parent !== null && present.has(parent) && parent !== key ? parent : null);
  }
  for (const key of keys) {
    const seen = new Set([key]);
    let at = parents.get(key) ?? null;
    while (at !== null && !seen.has(at)) {
      seen.add(at);
      at = parents.get(at) ?? null;
    }
    if (at === key) parents.set(key, null);
  }
  const depths = new Map<string, number>();
  const depthOf = (key: string): number => {
    const known = depths.get(key);
    if (known !== undefined) return known;
    const parent = parents.get(key) ?? null;
    let depth = parent === null ? 0 : depthOf(parent) + 1;
    if (depth > MAX_TREE_DEPTH) {
      // Re-hang under the ancestor on the last level that still takes children.
      let ancestor = parent as string;
      while (depthOf(ancestor) > MAX_TREE_DEPTH - 1) ancestor = parents.get(ancestor) as string;
      parents.set(key, ancestor);
      depth = MAX_TREE_DEPTH;
    }
    depths.set(key, depth);
    return depth;
  };
  for (const key of keys) depthOf(key);
  return parents;
}

/**
 * The rows of one project as a tree, depth first. Roots and siblings keep `keys`' order. Keys in
 * `hidden` (pinned rows, shown in Pinned) are left out like missing ones: their subtree moves up.
 */
export function buildTree(keys: readonly string[], links: TreeLinks, hidden: ReadonlySet<string> = new Set()): TreeRow[] {
  const shown = keys.filter((key) => !hidden.has(key));
  const parents = effectiveParents(shown, links, new Set(shown));
  const children = new Map<string | null, string[]>();
  for (const key of shown) {
    const parent = parents.get(key) ?? null;
    children.set(parent, [...(children.get(parent) ?? []), key]);
  }
  const rows: TreeRow[] = [];
  const visit = (key: string, depth: number, parent: string | null): number => {
    const row: TreeRow = { key, depth, parent, childCount: children.get(key)?.length ?? 0, descendants: 0 };
    rows.push(row);
    for (const child of children.get(key) ?? []) row.descendants += 1 + visit(child, depth + 1, key);
    return row.descendants;
  };
  for (const root of children.get(null) ?? []) visit(root, 0, null);
  return rows;
}

/** The rows left once the subtrees of collapsed rows are folded away. */
export function collapseRows(rows: readonly TreeRow[], collapsed: ReadonlySet<string>): TreeRow[] {
  const out: TreeRow[] = [];
  let foldedBelow = Number.POSITIVE_INFINITY;
  for (const row of rows) {
    if (row.depth > foldedBelow) continue;
    foldedBelow = collapsed.has(row.key) && row.childCount > 0 ? row.depth : Number.POSITIVE_INFINITY;
    out.push(row);
  }
  return out;
}

/** The keys below `key`, in row order. */
export function subtreeOf(rows: readonly TreeRow[], key: string): string[] {
  const at = rows.findIndex((row) => row.key === key);
  if (at < 0) return [];
  return rows.slice(at + 1, at + 1 + rows[at].descendants).map((row) => row.key);
}

/**
 * Paseo's collapsed-project priority (utils/sidebar-agent-state.ts `STATUS_BUCKET_PRIORITY`, v0.16):
 * running outranks unread so a working subtree keeps its loader.
 */
const ROLL_UP_PRIORITY: readonly StatusBucket[] = ["needs_input", "failed", "running", "attention", "done"];

/** The one status a collapsed parent shows for itself and everything below it. */
export function rollUpStatus(buckets: Iterable<StatusBucket>): StatusBucket {
  let best = ROLL_UP_PRIORITY.length - 1;
  for (const bucket of buckets) best = Math.min(best, Math.max(0, ROLL_UP_PRIORITY.indexOf(bucket)));
  return ROLL_UP_PRIORITY[best];
}

/** The busy statuses of a collapsed subtree for its count pill, each once, as Paseo lists them side by side. */
export function rollUpBuckets(buckets: Iterable<StatusBucket>): StatusBucket[] {
  const present = new Set(buckets);
  return STATUS_BUCKET_ORDER.filter((bucket) => bucket !== "done" && present.has(bucket));
}

/** How many levels a row carries below itself: 0 for a leaf. */
function heightOf(rows: readonly TreeRow[], key: string): number {
  const at = rows.findIndex((row) => row.key === key);
  if (at < 0) return 0;
  const base = rows[at].depth;
  let height = 0;
  for (const row of rows.slice(at + 1, at + 1 + rows[at].descendants)) height = Math.max(height, row.depth - base);
  return height;
}

/** Whether `key`, with its subtree, may hang under `parent` (null: top level). */
function fits(rows: readonly TreeRow[], key: string, parent: string | null, canLink?: (child: string, parent: string) => boolean): boolean {
  if (parent === null) return true;
  if (parent === key || subtreeOf(rows, key).includes(parent)) return false;
  if (canLink && !canLink(key, parent)) return false;
  const parentRow = rows.find((row) => row.key === parent);
  if (!parentRow) return false;
  return parentRow.depth + 1 + heightOf(rows, key) <= MAX_TREE_DEPTH;
}

export type DropZone = "top" | "middle" | "bottom";

export type DropPlan =
  | { kind: "none"; refused: boolean }
  | {
      /** "nest": under the target; "between": next to the target, as its sibling (or first child). */
      kind: "nest" | "between";
      /** The dragged row's new parent; null for top level. */
      parent: string | null;
      /** The middle of the row was refused (too deep, another host) and this is the fallback. */
      refused: boolean;
      /** Every key of the project, depth first, after the drop: the new list order. */
      order: string[];
      /** The row the cue draws its line under or above, and on which side. */
      anchor: { key: string; side: "before" | "after" };
    };

/**
 * Where a drop lands, from the row under the pointer and the band of it the pointer is in:
 * the middle nests under the row (last child), the top edge goes before it, the bottom edge after
 * it, or first under it while its children show. A middle that would break the depth limit falls
 * back to the bottom edge's place and says so.
 *
 * `rows` is the whole project's tree (collapsed rows included); `visible` the keys on screen.
 */
export function resolveDrop(input: {
  rows: readonly TreeRow[];
  visible: readonly string[];
  dragged: string;
  target: string;
  zone: DropZone;
  /** Extra rule for a link, such as both rows living on one host. */
  canLink?: (child: string, parent: string) => boolean;
}): DropPlan {
  const { rows, visible, dragged, target, zone, canLink } = input;
  const targetRow = rows.find((row) => row.key === target);
  if (!targetRow || target === dragged || subtreeOf(rows, dragged).includes(target)) return { kind: "none", refused: false };
  const block = [dragged, ...subtreeOf(rows, dragged)];
  const rest = rows.map((row) => row.key).filter((key) => !block.includes(key));
  const insertAt = (index: number) => [...rest.slice(0, index), ...block, ...rest.slice(index)];
  const afterSubtree = () => {
    const last = [target, ...subtreeOf(rows, target)].filter((key) => !block.includes(key)).at(-1) ?? target;
    return rest.indexOf(last) + 1;
  };

  if (zone === "middle") {
    if (fits(rows, dragged, target, canLink)) {
      return { kind: "nest", parent: target, refused: false, order: insertAt(afterSubtree()), anchor: { key: target, side: "after" } };
    }
  }
  const refused = zone === "middle";
  if (zone === "top") {
    if (!fits(rows, dragged, targetRow.parent, canLink)) return { kind: "none", refused: true };
    return { kind: "between", parent: targetRow.parent, refused, order: insertAt(rest.indexOf(target)), anchor: { key: target, side: "before" } };
  }
  // The bottom edge, or a refused middle.
  const next = visible[visible.indexOf(target) + 1];
  const childrenShow = next !== undefined && rows.find((row) => row.key === next)?.parent === target;
  if (childrenShow && !refused && fits(rows, dragged, target, canLink)) {
    return { kind: "between", parent: target, refused, order: insertAt(rest.indexOf(target) + 1), anchor: { key: target, side: "after" } };
  }
  if (!fits(rows, dragged, targetRow.parent, canLink)) return { kind: "none", refused: true };
  return { kind: "between", parent: targetRow.parent, refused, order: insertAt(afterSubtree()), anchor: { key: target, side: "after" } };
}

/** The rows `key` may be filed under from its menu: within the depth limit, no loop, not its parent already. */
export function eligibleParents(rows: readonly TreeRow[], key: string, canLink?: (child: string, parent: string) => boolean): string[] {
  const own = rows.find((row) => row.key === key);
  return rows.filter((row) => row.key !== own?.parent && fits(rows, key, row.key, canLink)).map((row) => row.key);
}

/** "Move out of": the parent one level up (null: top level); undefined when the row is top level already. */
export function moveOutParent(rows: readonly TreeRow[], key: string): string | null | undefined {
  const row = rows.find((r) => r.key === key);
  if (!row || row.parent === null) return undefined;
  return rows.find((r) => r.key === row.parent)?.parent ?? null;
}

/** A stored tree without self links, loops or links past the depth limit. Unchanged trees come back as is. */
export function sanitizeTree(tree: StoredTree): StoredTree {
  const keys = Object.keys(tree);
  const all = new Set([...keys, ...Object.values(tree)]);
  const parents = effectiveParents(keys, new Map(Object.entries(tree)), all);
  const next: Record<string, string> = {};
  for (const key of keys) {
    const parent = parents.get(key);
    if (parent) next[key] = parent;
  }
  return sameTree(tree, next) ? tree : next;
}

/**
 * The tree once only `live` workspaces remain: links of gone workspaces go, and children of a gone
 * parent move up to its parent (or to top level), keeping their own children.
 */
export function pruneTree(tree: StoredTree, live: ReadonlySet<string>): StoredTree {
  const next: Record<string, string> = {};
  for (const [child, stored] of Object.entries(tree)) {
    if (!live.has(child)) continue;
    let parent: string | undefined = stored;
    const seen = new Set([child]);
    while (parent !== undefined && !live.has(parent) && !seen.has(parent)) {
      seen.add(parent);
      parent = tree[parent];
    }
    if (parent !== undefined && live.has(parent) && parent !== child) next[child] = parent;
  }
  return sameTree(tree, next) ? tree : next;
}

function sameTree(a: StoredTree, b: StoredTree): boolean {
  const keys = Object.keys(a);
  return keys.length === Object.keys(b).length && keys.every((key) => a[key] === b[key]);
}

/**
 * The tree a daemon keeps after a write. Copies older than the tree send none and must not wipe
 * it, so a missing tree keeps the stored one; a sent tree replaces it, cleaned, and pruned to the
 * daemon's live workspaces when those could be listed (`live` null when not).
 */
export function treeToStore(
  incoming: StoredTree | undefined,
  stored: StoredTree | undefined,
  live: ReadonlySet<string> | null,
): StoredTree | undefined {
  if (incoming === undefined) return stored;
  const clean = sanitizeTree(incoming);
  return live ? pruneTree(clean, live) : clean;
}
