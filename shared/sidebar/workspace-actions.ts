/*
 * The rules behind a workspace row's actions in Paseo's default sidebar (v0.16):
 * components/sidebar/sidebar-workspace-row-content.tsx `resolveTrailingActionVisibility`,
 * components/ui/trailing-action-scrim.tsx, git/worktree-archive-warning.ts and
 * workspace-rename/internal/use-sidebar-workspace-rename.tsx.
 */

/** The 48px fade under the kebab (`SCRIM_WIDTH`). */
export const SCRIM_WIDTH = 48;
/** The fade keeps this length, so a wider scrim only adds solid surface under its actions. */
export const SCRIM_FADE_WIDTH = SCRIM_WIDTH * 0.55;
/** The archive button's box and the gap that keeps a press meant for the kebab off it. */
export const ARCHIVE_BUTTON_SIZE = 18;
export const ARCHIVE_BUTTON_KEBAB_GAP = 8;
export const ARCHIVE_BUTTON_FOOTPRINT = ARCHIVE_BUTTON_SIZE + ARCHIVE_BUTTON_KEBAB_GAP;

export type TrailingPresentation = "visible" | "absent";

/**
 * What the trailing slot shows. On a hovered pointer row the kebab and archive button fade in over
 * the trailing content behind a scrim; touch has no hover, so its kebab is always there and
 * replaces the content outright. (Paseo's shortcut-badge case is left out: plugins get no badge.)
 */
export function resolveTrailingActionVisibility(input: {
  hasTrailing: boolean;
  hasArchiveAction: boolean;
  isHovered: boolean;
  isTouch: boolean;
}): {
  trailingPresentation: TrailingPresentation;
  showKebab: boolean;
  showArchiveButton: boolean;
  showScrim: boolean;
  renderSlot: boolean;
  reserveSlotWidth: boolean;
} {
  const { hasTrailing, hasArchiveAction, isHovered, isTouch } = input;
  const showKebab = hasArchiveAction && (isHovered || isTouch);
  const hasContent = hasTrailing && !(hasArchiveAction && isTouch);
  return {
    trailingPresentation: hasContent ? "visible" : "absent",
    showKebab,
    // One-click archive is a pointer affordance: on touch a miss on the kebab would archive.
    showArchiveButton: showKebab && isHovered && !isTouch,
    // The scrim paints the hovered row's own colour, so only a hovered row can have one.
    showScrim: showKebab && isHovered,
    renderSlot: hasArchiveAction || hasTrailing,
    reserveSlotWidth: hasContent || (hasArchiveAction && isTouch),
  };
}

/**
 * The scrim as solid slices of rising opacity, since plugins get no SVG gradient: the first
 * `SCRIM_FADE_WIDTH` fades in, the rest is solid. Slices run left to right.
 */
export function scrimSlices(width: number, step = 2): { left: number; width: number; opacity: number }[] {
  const fade = Math.min(SCRIM_FADE_WIDTH, width);
  const slices: { left: number; width: number; opacity: number }[] = [];
  for (let left = 0; left < fade; left += step) {
    const w = Math.min(step, fade - left);
    // The opacity at the slice's middle, as the linear gradient would paint it there.
    slices.push({ left, width: w, opacity: Math.min(1, (left + w / 2) / fade) });
  }
  if (width > fade) slices.push({ left: fade, width: width - fade, opacity: 1 });
  return slices;
}

/** The workspace-archive warning's words (workspace.git.actions.archiveWarning.*). */
export interface ArchiveWarningLabels {
  uncommittedChanges: string;
  uncommittedChangesWithDiff: (diffStat: string) => string;
  addedLines: (count: number) => string;
  deletedLines: (count: number) => string;
  unpushedCommits: (count: number) => string;
}

export interface WorktreeArchiveRisk {
  isDirty: boolean | null;
  aheadOfOrigin: number | null;
  diffStat: { additions: number; deletions: number } | null;
}

/**
 * Why archiving a worktree could lose work, one reason per line; empty when it is safe. A host that
 * has not said whether the tree is dirty is taken at its diff stat's word.
 */
export function worktreeArchiveRiskReasons(input: WorktreeArchiveRisk, labels: ArchiveWarningLabels): string[] {
  const reasons: string[] = [];
  const diff = input.diffStat;
  const hasDiff = diff ? diff.additions > 0 || diff.deletions > 0 : false;
  if (input.isDirty === true || (input.isDirty === null && hasDiff)) {
    const parts: string[] = [];
    if (diff && diff.additions > 0) parts.push(labels.addedLines(diff.additions));
    if (diff && diff.deletions > 0) parts.push(labels.deletedLines(diff.deletions));
    reasons.push(parts.length > 0 ? labels.uncommittedChangesWithDiff(parts.join(", ")) : labels.uncommittedChanges);
  }
  if ((input.aheadOfOrigin ?? 0) > 0) reasons.push(labels.unpushedCommits(input.aheadOfOrigin ?? 0));
  return reasons;
}

/** Only a worktree is confirmed, and only when it carries work; everything else archives at once. */
export function archiveNeedsConfirmation(kind: string, risk: WorktreeArchiveRisk, labels: ArchiveWarningLabels): string[] | null {
  if (kind !== "worktree") return null;
  const reasons = worktreeArchiveRiskReasons(risk, labels);
  return reasons.length > 0 ? reasons : null;
}

/** What a rename field starts with: the custom title, else the name it overrides. */
export function renameInitialValue(workspace: { title: string | null; name: string }): string {
  return workspace.title ?? workspace.name;
}

/** The title to send for the typed text, or null when there is nothing to save. */
export function renameSubmission(text: string, initialValue: string): string | null {
  const title = text.trim();
  return title.length === 0 || title === initialValue ? null : title;
}

/**
 * An in-place rename. `saving` and `saved` keep the field up holding the sent text: the daemon
 * answers before it pushes the renamed workspace, so closing on the answer would flash the old
 * title. `saved` ends on the first title the row shows after the answer, ours or a later one.
 */
export type InlineRename =
  | { phase: "editing"; key: string; initialValue: string }
  | { phase: "saving"; key: string; initialValue: string; titleSeen: string | null }
  | { phase: "saved"; key: string; initialValue: string; titleSeen: string | null; acceptedTitle: string | null };

/** The session once the row shows `currentTitle`; null when it is over. */
export function inlineRenameAfterTitle(session: InlineRename, currentTitle: string | null): InlineRename | null {
  if (session.phase === "saving" && currentTitle !== session.titleSeen) return { ...session, titleSeen: currentTitle };
  if (session.phase === "saved" && (currentTitle === session.acceptedTitle || currentTitle !== session.titleSeen)) return null;
  return session;
}

/** Space kept between a menu and the view's edges, and between the menu and its trigger. */
export const MENU_EDGE = 8;
export const MENU_GAP = 4;
/** Below this much room under the trigger, a menu with more room above opens upward. */
export const MENU_MIN_BELOW = 220;

export interface Rect {
  x: number;
  y: number;
  width: number;
  height: number;
}

/**
 * Where a popover anchored at the trigger's end (Paseo's `align="end"`) sits in the view: under the
 * trigger, or above it when the room is below is short and above is larger. Top or bottom is set,
 * never both; `maxHeight` keeps it inside the view.
 */
export function placeMenu(input: { anchor: Rect; bounds: { width: number; height: number }; width: number }): {
  top?: number;
  bottom?: number;
  right: number;
  width: number;
  maxHeight: number;
} {
  const { anchor, bounds } = input;
  const width = Math.max(0, Math.min(input.width, bounds.width - 2 * MENU_EDGE));
  const anchorRight = anchor.x + anchor.width;
  const right = Math.min(Math.max(MENU_EDGE, bounds.width - anchorRight), Math.max(MENU_EDGE, bounds.width - MENU_EDGE - width));
  const below = bounds.height - (anchor.y + anchor.height) - MENU_GAP - MENU_EDGE;
  const above = anchor.y - MENU_GAP - MENU_EDGE;
  if (below < MENU_MIN_BELOW && above > below) {
    return { bottom: bounds.height - anchor.y + MENU_GAP, right, width, maxHeight: Math.max(0, above) };
  }
  return { top: anchor.y + anchor.height + MENU_GAP, right, width, maxHeight: Math.max(0, below) };
}
