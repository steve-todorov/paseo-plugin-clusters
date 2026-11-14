/* Ported from Paseo's components/sidebar/workspace-meta-row/service-summary.ts (v0.16). */

/** The fields of a workspace script descriptor the summary reads. */
export interface WorkspaceScriptLike {
  scriptName: string;
  type?: "script" | "service";
  lifecycle: string;
  health: "healthy" | "unhealthy" | null;
}

/**
 * The one running service a row reports, by name. Plain commands (test watchers, build steps)
 * say nothing about whether the workspace is up, so they never count.
 */
export interface WorkspaceServiceSummary {
  name: string;
  health: WorkspaceScriptLike["health"];
}

/** The row has space for one service, so a failing one wins over any healthy one. */
export function selectWorkspaceServiceSummary(scripts: readonly WorkspaceScriptLike[]): WorkspaceServiceSummary | null {
  let firstHealthy: WorkspaceServiceSummary | null = null;
  for (const script of scripts) {
    if (script.lifecycle !== "running") continue;
    if ((script.type ?? "service") !== "service") continue;

    const summary: WorkspaceServiceSummary = { name: script.scriptName, health: script.health };
    if (script.health === "unhealthy") {
      return summary;
    }
    firstHealthy ??= summary;
  }
  return firstHealthy;
}

/** Whether the service's accessible name says it is failing, decided once for every reader. */
export function workspaceServiceLabelKey(summary: WorkspaceServiceSummary): "serviceUnhealthy" | "serviceRunning" {
  return summary.health === "unhealthy" ? "serviceUnhealthy" : "serviceRunning";
}
