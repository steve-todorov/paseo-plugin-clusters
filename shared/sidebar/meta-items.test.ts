import assert from "node:assert/strict";
import { test } from "node:test";
import { DEFAULT_SIDEBAR_CHECKS_DISPLAY } from "./checks-display.ts";
import type { WorkspaceLabelDefinition } from "./labels.ts";
import { selectMetaRowItems } from "./meta-items.ts";
import type { PrHint } from "./pr-hint.ts";
import { DEFAULT_SIDEBAR_ROW_ITEMS } from "./row-items.ts";
import type { WorkspaceServiceSummary } from "./service-summary.ts";

// Ported from Paseo's components/sidebar/workspace-meta-row/meta-items.test.ts (v0.16).

const PR_HINT: PrHint = {
  url: "https://github.com/acme/app/pull/7",
  number: 7,
  state: "open",
  forge: "github",
  checksStatus: "success",
};
const SERVICE: WorkspaceServiceSummary = { name: "web", health: null };
const LABELS: WorkspaceLabelDefinition[] = [{ name: "Urgent", color: "red" }];

function select(overrides: Partial<Parameters<typeof selectMetaRowItems>[0]> = {}) {
  return selectMetaRowItems({
    currentBranch: "feature/sidebar-badges",
    projectName: "Paseo",
    hasHostBadge: true,
    prHint: PR_HINT,
    serviceSummary: SERVICE,
    labels: LABELS,
    visible: DEFAULT_SIDEBAR_ROW_ITEMS,
    checksDisplay: DEFAULT_SIDEBAR_CHECKS_DISPLAY,
    ...overrides,
  });
}

const kinds = (items: ReturnType<typeof selectMetaRowItems>) => items.map((item) => item.kind);

test("puts the enabled branch and project badges first", () => {
  const visible = { ...DEFAULT_SIDEBAR_ROW_ITEMS, branch: true, project: true };
  assert.deepEqual(kinds(select({ visible })), ["branch", "project", "host", "changeRequest", "checks", "services", "labels"]);
});

test("reads identity, then the change, then its state, then what is running, then labels", () => {
  assert.deepEqual(kinds(select()), ["host", "changeRequest", "checks", "services", "labels"]);
});

test("omits what the workspace does not have", () => {
  const items = select({ currentBranch: null, projectName: null, hasHostBadge: false, prHint: null, serviceSummary: null, labels: [] });
  assert.deepEqual(kinds(items), []);
});

test("only draws identity badges when enabled and available", () => {
  const visible = { ...DEFAULT_SIDEBAR_ROW_ITEMS, branch: true, project: true };
  assert.deepEqual(kinds(select({ currentBranch: null, projectName: null, visible })), ["host", "changeRequest", "checks", "services", "labels"]);
});

test("carries every label as one item, so the line keeps one separator however many there are", () => {
  const labels: WorkspaceLabelDefinition[] = [
    { name: "Urgent", color: "red" },
    { name: "Backend", color: "sky" },
  ];
  assert.deepEqual(select({ labels }).at(-1), { kind: "labels", labels });
});

for (const [item, expected] of [
  ["changeRequest", ["host", "checks", "services", "labels"]],
  ["services", ["host", "changeRequest", "checks", "labels"]],
  ["labels", ["host", "changeRequest", "checks", "services"]],
] as const) {
  test(`drops ${item} and only ${item} when it is switched off`, () => {
    assert.deepEqual(kinds(select({ visible: { ...DEFAULT_SIDEBAR_ROW_ITEMS, [item]: false } })), expected);
  });
}

test("drops checks and only checks when they are hidden", () => {
  assert.deepEqual(kinds(select({ checksDisplay: "none" })), ["host", "changeRequest", "services", "labels"]);
});

test("keeps checks when the change request is hidden", () => {
  // Each control answers for itself: a checks setting that drew nothing because a different
  // switch was off would be lying about its own state.
  const items = select({ visible: { ...DEFAULT_SIDEBAR_ROW_ITEMS, changeRequest: false } });
  assert.deepEqual(kinds(items), ["host", "checks", "services", "labels"]);
});

test("draws nothing for checks when both are off", () => {
  const items = select({ visible: { ...DEFAULT_SIDEBAR_ROW_ITEMS, changeRequest: false }, checksDisplay: "none" });
  assert.deepEqual(kinds(items), ["host", "services", "labels"]);
});

test("carries the resolved check summary rather than the raw hint", () => {
  assert.deepEqual(
    select().find((item) => item.kind === "checks"),
    { kind: "checks", summary: { state: "passed", completed: 1, total: 1 }, label: true },
  );
});

test("keeps the check summary but drops its word when only the icon is wanted", () => {
  assert.deepEqual(
    select({ checksDisplay: "icon" }).find((item) => item.kind === "checks"),
    { kind: "checks", summary: { state: "passed", completed: 1, total: 1 }, label: false },
  );
});

test("keeps a change request whose forge reports no checks", () => {
  const items = select({ prHint: { ...PR_HINT, checksStatus: undefined } });
  assert.deepEqual(kinds(items), ["host", "changeRequest", "services", "labels"]);
});
