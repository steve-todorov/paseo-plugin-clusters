import assert from "node:assert/strict";
import { test } from "node:test";
import { deriveIdentityColorName } from "./identity-colors.ts";
import { selectWorkspaceLabelDefinitions, workspaceLabelKey } from "./labels.ts";
import {
  formatDiffCount,
  hasWorkspaceTrailing,
  normalizeCurrentBranch,
  resolveWorkspaceTitle,
  selectWorkspaceRowDetail,
} from "./workspace-row.ts";

test("a detached or blank branch is no branch", () => {
  assert.equal(normalizeCurrentBranch(null), null);
  assert.equal(normalizeCurrentBranch("  "), null);
  assert.equal(normalizeCurrentBranch("HEAD"), null);
  assert.equal(normalizeCurrentBranch(" main "), "main");
});

test("reads the branch, change request and scripts off a descriptor", () => {
  const scripts = [{ scriptName: "web", type: "service" as const, lifecycle: "running", health: null }];
  const detail = selectWorkspaceRowDetail({
    forge: "gitlab",
    gitRuntime: { currentBranch: "feature/x" },
    githubRuntime: { pullRequest: { url: "https://gitlab.com/g/p/-/merge_requests/3", state: "open", isMerged: false } },
    scripts,
  });
  assert.equal(detail.currentBranch, "feature/x");
  assert.equal(detail.prHint?.number, 3);
  assert.equal(detail.prHint?.forge, "gitlab");
  assert.equal(detail.scripts, scripts);
});

test("a descriptor without git or scripts has none of them", () => {
  assert.deepEqual(selectWorkspaceRowDetail({}), { currentBranch: null, prHint: null, scripts: [] });
});

test("the title is the name, or the branch when asked and known", () => {
  const workspace = { name: "Fix login", currentBranch: "fix/login" };
  assert.equal(resolveWorkspaceTitle({ workspace, titleSource: "title" }), "Fix login");
  assert.equal(resolveWorkspaceTitle({ workspace, titleSource: "branch" }), "fix/login");
  assert.equal(resolveWorkspaceTitle({ workspace: { ...workspace, currentBranch: null }, titleSource: "branch" }), "Fix login");
});

test("the trailing slot draws only what the workspace has", () => {
  const workspace = { diffStat: null, statusEnteredAt: "2026-11-15T10:00:00.000Z" };
  assert.equal(hasWorkspaceTrailing({ workspace, trailing: "timestamp" }), true);
  assert.equal(hasWorkspaceTrailing({ workspace, trailing: "diff" }), false);
  assert.equal(hasWorkspaceTrailing({ workspace: { ...workspace, diffStat: { additions: 1, deletions: 0 } }, trailing: "diff" }), true);
  assert.equal(hasWorkspaceTrailing({ workspace, trailing: "none" }), false);
});

test("diff counts are compact and lower case", () => {
  assert.equal(formatDiffCount(12), "12");
  assert.equal(formatDiffCount(1234), "1.2k");
  assert.equal(formatDiffCount(2_500_000), "2.5m");
});

test("labels follow the host catalog when there is one, dropping unknown names", () => {
  const catalog = [{ name: "Urgent", color: "red" as const }];
  assert.deepEqual(selectWorkspaceLabelDefinitions([" urgent ", "Later"], catalog), catalog);
});

test("without a catalog every label is kept, coloured by its key", () => {
  assert.deepEqual(selectWorkspaceLabelDefinitions(["Later"], null), [
    { name: "Later", color: deriveIdentityColorName(workspaceLabelKey("Later")) },
  ]);
  assert.deepEqual(selectWorkspaceLabelDefinitions(undefined, null), []);
});
