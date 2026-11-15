/*
 * How Paseo turns a workspace descriptor into what its sidebar row shows
 * (hooks/sidebar-workspaces-view-model.ts `createSidebarWorkspaceEntry`,
 * components/sidebar/sidebar-workspace-title.ts, components/sidebar/workspace-trailing/index.tsx
 * and git/file-header-presentation.ts, v0.16).
 */
import { type PrHint, type PrHintCheck, selectPrHintFromStatus } from "./pr-hint.ts";
import type { SidebarWorkspaceTrailing, WorkspaceTitleSource } from "./preferences.ts";
import type { WorkspaceScriptLike } from "./service-summary.ts";

/** The descriptor fields the row reads that the plugin's workspace snapshot lacks. */
export interface WorkspaceDescriptorLike {
  forge?: string;
  gitRuntime?: { currentBranch?: string | null; isDirty?: boolean | null; aheadOfOrigin?: number | null } | null;
  githubRuntime?: {
    pullRequest?: {
      url: string;
      state: string;
      isMerged: boolean;
      checks?: PrHintCheck[];
      checksStatus?: string;
      reviewDecision?: string | null;
    } | null;
  } | null;
  scripts?: readonly WorkspaceScriptLike[];
}

export interface WorkspaceRowDetail {
  /** Null when not a git checkout or on a detached HEAD. */
  currentBranch: string | null;
  prHint: PrHint | null;
  scripts: readonly WorkspaceScriptLike[];
  /** Uncommitted changes, for the archive warning; null when the host has not said. */
  isDirty: boolean | null;
  /** Commits not pushed, for the archive warning; null when the host has not said. */
  aheadOfOrigin: number | null;
}

const NO_SCRIPTS: readonly WorkspaceScriptLike[] = [];

export function normalizeCurrentBranch(currentBranch: string | null | undefined): string | null {
  if (!currentBranch) {
    return null;
  }
  const trimmed = currentBranch.trim();
  return trimmed.length === 0 || trimmed === "HEAD" ? null : trimmed;
}

export function selectWorkspaceRowDetail(workspace: WorkspaceDescriptorLike): WorkspaceRowDetail {
  return {
    currentBranch: normalizeCurrentBranch(workspace.gitRuntime?.currentBranch),
    prHint: selectPrHintFromStatus(workspace.githubRuntime?.pullRequest, workspace.forge),
    scripts: workspace.scripts ?? NO_SCRIPTS,
    isDirty: workspace.gitRuntime?.isDirty ?? null,
    aheadOfOrigin: workspace.gitRuntime?.aheadOfOrigin ?? null,
  };
}

export function resolveWorkspaceTitle(input: {
  workspace: { name: string; currentBranch: string | null };
  titleSource: WorkspaceTitleSource;
}): string {
  if (input.titleSource === "branch") {
    return input.workspace.currentBranch ?? input.workspace.name;
  }
  return input.workspace.name;
}

/** Whether the trailing slot has anything to draw for this workspace under the preference. */
export function hasWorkspaceTrailing(input: {
  workspace: { diffStat: { additions: number; deletions: number } | null; statusEnteredAt: string | null };
  trailing: SidebarWorkspaceTrailing;
}): boolean {
  if (input.trailing === "diff") return input.workspace.diffStat !== null;
  if (input.trailing === "timestamp") return input.workspace.statusEnteredAt !== null;
  return false;
}

const compactFormatter = new Intl.NumberFormat("en-US", { notation: "compact", maximumFractionDigits: 1 });

/** 1234 -> "1.2k", as the diff stat prints it. */
export function formatDiffCount(value: number): string {
  return compactFormatter.format(value).toLowerCase();
}
