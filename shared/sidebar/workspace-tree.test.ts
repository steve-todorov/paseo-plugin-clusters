import assert from "node:assert/strict";
import { test } from "node:test";
import {
  MAX_TREE_DEPTH,
  buildTree,
  collapseRows,
  eligibleParents,
  linksOfHosts,
  moveOutParent,
  pruneTree,
  resolveDrop,
  rollUpBuckets,
  rollUpStatus,
  sanitizeTree,
  treeNodeKey,
  treeToStore,
} from "./workspace-tree.ts";

// The mock's project: billing-v2 > invoice-pdf, stripe-webhooks > webhook-retries; then loose rows.
const ORDER = ["billing", "invoice", "stripe", "retries", "dialer", "main"];
const LINKS = new Map([
  ["invoice", "billing"],
  ["stripe", "billing"],
  ["retries", "stripe"],
]);

const shape = (rows: ReturnType<typeof buildTree>) => rows.map((row) => `${"-".repeat(row.depth)}${row.key}`);

test("rows nest under their parent in the given order, two levels at most", () => {
  const rows = buildTree(ORDER, LINKS);
  assert.deepEqual(shape(rows), ["billing", "-invoice", "-stripe", "--retries", "dialer", "main"]);
  const billing = rows[0];
  assert.equal(billing.parent, null);
  assert.equal(billing.childCount, 2);
  assert.equal(billing.descendants, 3);
  assert.equal(rows[3].parent, "stripe");
  assert.equal(MAX_TREE_DEPTH, 2);
});

test("siblings keep the list's order, wherever their parent sits", () => {
  // Another sort put the children before their parent and swapped them.
  const rows = buildTree(["stripe", "main", "invoice", "billing", "retries"], LINKS);
  assert.deepEqual(shape(rows), ["main", "billing", "-stripe", "--retries", "-invoice"]);
});

test("a parent that is not listed (archived, gone) gives its place to its children, one level up", () => {
  const rows = buildTree(["invoice", "stripe", "retries", "dialer"], LINKS);
  assert.deepEqual(shape(rows), ["invoice", "stripe", "-retries", "dialer"]);
});

test("a missing middle parent hands its child to the grandparent", () => {
  const rows = buildTree(["billing", "invoice", "retries"], LINKS);
  assert.deepEqual(shape(rows), ["billing", "-invoice", "-retries"]);
});

test("a pinned parent is shown in Pinned only; its subtree moves up one level in the project", () => {
  const rows = buildTree(ORDER, LINKS, new Set(["billing"]));
  assert.deepEqual(shape(rows), ["invoice", "stripe", "-retries", "dialer", "main"]);
});

test("links deeper than two levels or in a loop are read safely", () => {
  const deep = new Map([
    ["b", "a"],
    ["c", "b"],
    ["d", "c"],
  ]);
  assert.deepEqual(shape(buildTree(["a", "b", "c", "d"], deep)), ["a", "-b", "--c", "--d"]);
  const loop = new Map([
    ["a", "b"],
    ["b", "a"],
    ["c", "c"],
  ]);
  assert.deepEqual(shape(buildTree(["a", "b", "c"], loop)), ["a", "-b", "c"]);
});

test("collapsing a parent hides its whole subtree, nothing else", () => {
  const rows = buildTree(ORDER, LINKS);
  assert.deepEqual(shape(collapseRows(rows, new Set(["stripe"]))), ["billing", "-invoice", "-stripe", "dialer", "main"]);
  assert.deepEqual(shape(collapseRows(rows, new Set(["billing"]))), ["billing", "dialer", "main"]);
});

test("the roll-up takes Paseo's collapsed-project priority: needs input, failed, running, unread, idle", () => {
  assert.equal(rollUpStatus(["done", "running", "needs_input"]), "needs_input");
  assert.equal(rollUpStatus(["attention", "running"]), "running");
  assert.equal(rollUpStatus(["done", "failed", "running"]), "failed");
  assert.equal(rollUpStatus(["attention", "done"]), "attention");
  assert.equal(rollUpStatus([]), "done");
});

test("the count pill lists each busy bucket once, in Paseo's side-by-side order", () => {
  assert.deepEqual(rollUpBuckets(["running", "done", "needs_input", "running"]), ["needs_input", "running"]);
  assert.deepEqual(rollUpBuckets(["done", "done"]), []);
});

test("dropping on the middle of a row nests the dragged row as its last child", () => {
  const rows = buildTree([...ORDER, "sms"], LINKS);
  const plan = resolveDrop({ rows, visible: rows.map((r) => r.key), dragged: "sms", target: "stripe", zone: "middle" });
  assert.ok(plan.kind === "nest");
  assert.equal(plan.parent, "stripe");
  assert.equal(plan.refused, false);
  assert.deepEqual(plan.order, ["billing", "invoice", "stripe", "retries", "sms", "dialer", "main"]);
});

test("dropping on a row's top edge places it before that row, as its sibling", () => {
  const rows = buildTree([...ORDER, "sms"], LINKS);
  const plan = resolveDrop({ rows, visible: rows.map((r) => r.key), dragged: "sms", target: "stripe", zone: "top" });
  assert.ok(plan.kind === "between");
  assert.equal(plan.parent, "billing");
  assert.deepEqual(plan.order, ["billing", "invoice", "sms", "stripe", "retries", "dialer", "main"]);
});

test("a bottom edge goes after the row's subtree, or first under it while its children show", () => {
  const rows = buildTree([...ORDER, "sms"], LINKS);
  const all = rows.map((r) => r.key);
  const open = resolveDrop({ rows, visible: all, dragged: "sms", target: "stripe", zone: "bottom" });
  assert.ok(open.kind !== "none");
  assert.equal(open.parent, "stripe");
  assert.deepEqual(open.order.slice(0, 5), ["billing", "invoice", "stripe", "sms", "retries"]);
  const closed = resolveDrop({ rows, visible: all.filter((k) => k !== "retries"), dragged: "sms", target: "stripe", zone: "bottom" });
  assert.ok(closed.kind === "between");
  assert.equal(closed.parent, "billing");
  assert.deepEqual(closed.order.slice(0, 5), ["billing", "invoice", "stripe", "retries", "sms"]);
});

test("nesting deeper than two levels is refused and falls back to a sibling of the target", () => {
  const rows = buildTree([...ORDER, "sms"], LINKS);
  const plan = resolveDrop({ rows, visible: rows.map((r) => r.key), dragged: "sms", target: "retries", zone: "middle" });
  assert.ok(plan.kind === "between");
  assert.equal(plan.refused, true);
  assert.equal(plan.parent, "stripe");
});

test("a parent dragged with its children must still fit: its deepest descendant counts", () => {
  const rows = buildTree([...ORDER, "sms"], LINKS);
  const visible = rows.map((r) => r.key);
  // stripe has a child, so under invoice (level 1) the child would land on level 3.
  const plan = resolveDrop({ rows, visible, dragged: "stripe", target: "invoice", zone: "middle" });
  assert.ok(plan.kind === "between");
  assert.equal(plan.refused, true);
  assert.equal(plan.parent, "billing");
  assert.deepEqual(plan.order, ["billing", "invoice", "stripe", "retries", "dialer", "main", "sms"]);
  // Under a top-level row it fits.
  const fits = resolveDrop({ rows, visible, dragged: "stripe", target: "dialer", zone: "middle" });
  assert.ok(fits.kind === "nest");
  assert.deepEqual(fits.order, ["billing", "invoice", "dialer", "stripe", "retries", "main", "sms"]);
});

test("a row never lands inside its own subtree", () => {
  const rows = buildTree(ORDER, LINKS);
  const visible = rows.map((r) => r.key);
  assert.equal(resolveDrop({ rows, visible, dragged: "billing", target: "retries", zone: "middle" }).kind, "none");
  assert.equal(resolveDrop({ rows, visible, dragged: "billing", target: "invoice", zone: "top" }).kind, "none");
  assert.equal(resolveDrop({ rows, visible, dragged: "billing", target: "billing", zone: "middle" }).kind, "none");
});

test("a link the caller rules out (another host) is refused like a depth limit", () => {
  const rows = buildTree([...ORDER, "sms"], LINKS);
  const plan = resolveDrop({
    rows,
    visible: rows.map((r) => r.key),
    dragged: "sms",
    target: "dialer",
    zone: "middle",
    canLink: (_child, parent) => parent !== "dialer",
  });
  assert.ok(plan.kind === "between");
  assert.equal(plan.refused, true);
  assert.equal(plan.parent, null);
});

test("Nest under… offers every row that keeps the tree within two levels and makes no loop", () => {
  const rows = buildTree([...ORDER, "sms"], LINKS);
  assert.deepEqual(eligibleParents(rows, "sms"), ["billing", "invoice", "stripe", "dialer", "main"]);
  // stripe carries a child: only top-level rows other than its own parent can take it.
  assert.deepEqual(eligibleParents(rows, "stripe"), ["dialer", "main", "sms"]);
  assert.deepEqual(eligibleParents(rows, "billing"), [], "its grandchild would land past the limit anywhere");
});

test("Move out of takes a row one level up; top-level rows have nowhere to go", () => {
  const rows = buildTree(ORDER, LINKS);
  assert.equal(moveOutParent(rows, "retries"), "billing");
  assert.equal(moveOutParent(rows, "invoice"), null);
  assert.equal(moveOutParent(rows, "dialer"), undefined);
});

test("pruning promotes the subtree of a gone parent and drops links of gone workspaces", () => {
  const tree = { invoice: "billing", stripe: "billing", retries: "stripe", old: "main" };
  assert.deepEqual(pruneTree(tree, new Set(["invoice", "stripe", "retries", "main"])), { retries: "stripe" });
  assert.deepEqual(pruneTree(tree, new Set(["billing", "invoice", "retries", "main"])), { invoice: "billing", retries: "billing" });
  const kept = pruneTree(tree, new Set(["billing", "invoice", "stripe", "retries", "main", "old"]));
  assert.equal(kept, tree, "an unchanged tree is handed back as is");
});

test("a stored tree is cleaned of loops, self links and links past the depth limit", () => {
  assert.deepEqual(sanitizeTree({ a: "a", b: "c", c: "b", d: "e" }), { c: "b", d: "e" });
  assert.deepEqual(sanitizeTree({ b: "a", c: "b", d: "c" }), { b: "a", c: "b", d: "b" });
  const clean = { b: "a", c: "b" };
  assert.equal(sanitizeTree(clean), clean);
});

test("per-host trees are read as links between the sidebar's workspace keys", () => {
  const links = linksOfHosts(
    new Map([
      ["h1", { b: "a" }],
      ["h2", undefined],
    ]),
  );
  assert.equal(treeNodeKey("h1", "b"), JSON.stringify(["h1", "b"]));
  assert.deepEqual([...links], [[treeNodeKey("h1", "b"), treeNodeKey("h1", "a")]]);
});

test("a write without a tree (an older copy) keeps the stored one; a newer write is cleaned and pruned", () => {
  const stored = { b: "a" };
  assert.equal(treeToStore(undefined, stored, null), stored);
  assert.equal(treeToStore(undefined, undefined, null), undefined);
  assert.deepEqual(treeToStore({}, stored, null), {});
  assert.deepEqual(treeToStore({ c: "b", b: "a", x: "x" }, stored, null), { c: "b", b: "a" });
  // Once the daemon's live workspaces are known, gone ones leave and their children move up.
  assert.deepEqual(treeToStore({ c: "b", b: "a" }, stored, new Set(["a", "c"])), { c: "a" });
});
