import assert from "node:assert/strict";
import { test } from "node:test";
import {
  ARCHIVE_BUTTON_FOOTPRINT,
  type ArchiveWarningLabels,
  MENU_EDGE,
  MENU_GAP,
  SCRIM_FADE_WIDTH,
  SCRIM_WIDTH,
  archiveNeedsConfirmation,
  inlineRenameAfterTitle,
  placeMenu,
  renameInitialValue,
  renameSubmission,
  resolveTrailingActionVisibility,
  scrimSlices,
  worktreeArchiveRiskReasons,
} from "./workspace-actions.ts";

const labels: ArchiveWarningLabels = {
  uncommittedChanges: "Uncommitted changes",
  uncommittedChangesWithDiff: (diff) => `Uncommitted changes (${diff})`,
  addedLines: (n) => `${n} added`,
  deletedLines: (n) => `${n} deleted`,
  unpushedCommits: (n) => `${n} unpushed`,
};

test("a hovered pointer row fades the kebab and archive button in over its content", () => {
  const v = resolveTrailingActionVisibility({ hasTrailing: true, hasArchiveAction: true, isHovered: true, isTouch: false });
  assert.deepEqual(v, {
    trailingPresentation: "visible",
    showKebab: true,
    showArchiveButton: true,
    showScrim: true,
    renderSlot: true,
    reserveSlotWidth: true,
  });
});

test("an idle pointer row shows only its content, and holds no width without it", () => {
  const idle = resolveTrailingActionVisibility({ hasTrailing: true, hasArchiveAction: true, isHovered: false, isTouch: false });
  assert.equal(idle.showKebab, false);
  assert.equal(idle.trailingPresentation, "visible");
  const empty = resolveTrailingActionVisibility({ hasTrailing: false, hasArchiveAction: true, isHovered: false, isTouch: false });
  assert.equal(empty.renderSlot, true);
  assert.equal(empty.reserveSlotWidth, false);
});

test("touch always shows the kebab in place of the content, with no archive button or scrim", () => {
  const v = resolveTrailingActionVisibility({ hasTrailing: true, hasArchiveAction: true, isHovered: false, isTouch: true });
  assert.equal(v.showKebab, true);
  assert.equal(v.trailingPresentation, "absent");
  assert.equal(v.showArchiveButton, false);
  assert.equal(v.showScrim, false);
  assert.equal(v.reserveSlotWidth, true);
  // A mouse on a compact layout still gets no one-click archive.
  assert.equal(resolveTrailingActionVisibility({ hasTrailing: false, hasArchiveAction: true, isHovered: true, isTouch: true }).showArchiveButton, false);
});

test("the scrim fades over a fixed length, then stays solid", () => {
  const slices = scrimSlices(SCRIM_WIDTH);
  assert.equal(slices[0]?.left, 0);
  assert.ok((slices[0]?.opacity ?? 1) < 0.1);
  const last = slices[slices.length - 1];
  assert.deepEqual(last, { left: SCRIM_FADE_WIDTH, width: SCRIM_WIDTH - SCRIM_FADE_WIDTH, opacity: 1 });
  const covered = slices.reduce((sum, slice) => sum + slice.width, 0);
  assert.ok(Math.abs(covered - SCRIM_WIDTH) < 1e-9);
  for (let i = 1; i < slices.length; i++) assert.ok((slices[i]?.opacity ?? 0) >= (slices[i - 1]?.opacity ?? 0));
  // The archive button widens the solid part only.
  const wide = scrimSlices(SCRIM_WIDTH + ARCHIVE_BUTTON_FOOTPRINT);
  assert.equal(wide[wide.length - 1]?.width, SCRIM_WIDTH + ARCHIVE_BUTTON_FOOTPRINT - SCRIM_FADE_WIDTH);
});

test("a worktree's archive warning names uncommitted and unpushed work", () => {
  assert.deepEqual(worktreeArchiveRiskReasons({ isDirty: true, aheadOfOrigin: 2, diffStat: { additions: 3, deletions: 0 } }, labels), [
    "Uncommitted changes (3 added)",
    "2 unpushed",
  ]);
  assert.deepEqual(worktreeArchiveRiskReasons({ isDirty: true, aheadOfOrigin: 0, diffStat: null }, labels), ["Uncommitted changes"]);
  // Unknown dirtiness falls back to the diff stat.
  assert.deepEqual(worktreeArchiveRiskReasons({ isDirty: null, aheadOfOrigin: null, diffStat: { additions: 1, deletions: 4 } }, labels), [
    "Uncommitted changes (1 added, 4 deleted)",
  ]);
  assert.deepEqual(worktreeArchiveRiskReasons({ isDirty: false, aheadOfOrigin: null, diffStat: { additions: 1, deletions: 0 } }, labels), []);
});

test("only a risky worktree asks before archiving", () => {
  const risky = { isDirty: true, aheadOfOrigin: null, diffStat: null };
  assert.equal(archiveNeedsConfirmation("local_checkout", risky, labels), null);
  assert.deepEqual(archiveNeedsConfirmation("worktree", risky, labels), ["Uncommitted changes"]);
  assert.equal(archiveNeedsConfirmation("worktree", { isDirty: false, aheadOfOrigin: 0, diffStat: null }, labels), null);
});

test("a rename starts from the title and sends only a changed, non-empty one", () => {
  assert.equal(renameInitialValue({ title: null, name: "feat-x" }), "feat-x");
  assert.equal(renameInitialValue({ title: "Mine", name: "feat-x" }), "Mine");
  assert.equal(renameSubmission("  ", "feat-x"), null);
  assert.equal(renameSubmission(" feat-x ", "feat-x"), null);
  assert.equal(renameSubmission(" New ", "feat-x"), "New");
});

test("an in-place rename holds until the row shows a title after the answer", () => {
  const saving = { phase: "saving" as const, key: "h:w", initialValue: "a", titleSeen: null };
  // A title delivered before the answer is only noted.
  const noted = inlineRenameAfterTitle(saving, "other");
  assert.deepEqual(noted, { ...saving, titleSeen: "other" });
  const saved = { phase: "saved" as const, key: "h:w", initialValue: "a", titleSeen: null, acceptedTitle: "b" };
  assert.equal(inlineRenameAfterTitle(saved, null), saved);
  assert.equal(inlineRenameAfterTitle(saved, "b"), null);
  assert.equal(inlineRenameAfterTitle(saved, "c"), null);
});

test("a menu opens under its trigger, end-aligned, inside the view", () => {
  const bounds = { width: 300, height: 800 };
  const placed = placeMenu({ anchor: { x: 260, y: 100, width: 18, height: 18 }, bounds, width: 260 });
  assert.equal(placed.top, 118 + MENU_GAP);
  assert.equal(placed.bottom, undefined);
  assert.equal(placed.width, 260);
  // Its right edge meets the trigger's, unless that would push it off the left edge.
  assert.equal(placed.right, Math.min(300 - 278, 300 - MENU_EDGE - 260));
  assert.equal(placed.maxHeight, 800 - 118 - MENU_GAP - MENU_EDGE);
});

test("a menu near the bottom opens upward, and a narrow view shrinks it", () => {
  const placed = placeMenu({ anchor: { x: 100, y: 700, width: 18, height: 18 }, bounds: { width: 200, height: 760 }, width: 260 });
  assert.equal(placed.top, undefined);
  assert.equal(placed.bottom, 760 - 700 + MENU_GAP);
  assert.equal(placed.width, 200 - 2 * MENU_EDGE);
  assert.equal(placed.right, MENU_EDGE);
});
