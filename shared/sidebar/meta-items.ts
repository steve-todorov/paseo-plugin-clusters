/* Ported from Paseo's components/sidebar/workspace-meta-row/meta-items.ts (v0.16). */
import { type CheckSummary, selectCheckSummary } from "./check-summary.ts";
import type { SidebarChecksDisplay } from "./checks-display.ts";
import type { WorkspaceLabelDefinition } from "./labels.ts";
import type { PrHint } from "./pr-hint.ts";
import type { SidebarRowItems } from "./row-items.ts";
import type { WorkspaceServiceSummary } from "./service-summary.ts";

/**
 * What ends up on the line under a workspace title, in reading order: where the workspace lives,
 * what change it belongs to, whether that change passes, what it runs, and its labels. Labels are
 * one item, drawn as a run of chips behind a single separator.
 */
export type MetaRowItem =
  | { kind: "branch"; name: string }
  | { kind: "project"; name: string }
  | { kind: "host" }
  | { kind: "changeRequest"; hint: PrHint }
  | { kind: "checks"; summary: CheckSummary; label: boolean }
  | { kind: "services"; summary: WorkspaceServiceSummary }
  | { kind: "labels"; labels: readonly WorkspaceLabelDefinition[] };

/**
 * Which items a row draws, given what it knows and what the user left switched on. Every toggle
 * answers for itself, so checks can show without the change request beside them. The host is
 * filtered upstream: a row only gets a badge when it is meant to be drawn.
 */
export function selectMetaRowItems(input: {
  currentBranch: string | null;
  projectName: string | null;
  hasHostBadge: boolean;
  prHint: PrHint | null;
  serviceSummary: WorkspaceServiceSummary | null;
  labels: readonly WorkspaceLabelDefinition[];
  visible: SidebarRowItems;
  checksDisplay: SidebarChecksDisplay;
}): MetaRowItem[] {
  const { currentBranch, projectName, hasHostBadge, prHint, serviceSummary, labels, visible, checksDisplay } = input;
  const items: MetaRowItem[] = [];

  if (currentBranch && visible.branch) {
    items.push({ kind: "branch", name: currentBranch });
  }
  if (projectName && visible.project) {
    items.push({ kind: "project", name: projectName });
  }
  if (hasHostBadge) {
    items.push({ kind: "host" });
  }
  if (prHint && visible.changeRequest) {
    items.push({ kind: "changeRequest", hint: prHint });
  }

  if (checksDisplay !== "none") {
    const summary = selectCheckSummary(prHint);
    if (summary) {
      items.push({ kind: "checks", summary, label: checksDisplay === "iconAndText" });
    }
  }

  if (serviceSummary && visible.services) {
    items.push({ kind: "services", summary: serviceSummary });
  }

  if (labels.length > 0 && visible.labels) {
    items.push({ kind: "labels", labels });
  }

  return items;
}
