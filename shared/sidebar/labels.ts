/*
 * Workspace labels as the row draws them (packages/protocol/src/workspace-labels.ts and
 * packages/app/src/workspace-labels/index.ts, v0.16).
 *
 * A workspace stores label names; the colour lives in its host's label catalog. The app reads that
 * catalog through the daemon client's `observeWorkspaceLabels`, which the plugin's PaseoApi does
 * not expose; the plugin reads it through its own RPC on that host. A host that cannot answer (an
 * older copy of the plugin) has no catalog, and each name gets the identity colour its key hashes to.
 */
import { IDENTITY_COLOR_NAMES, type IdentityColorName, deriveIdentityColorName } from "./identity-colors.ts";

export const WORKSPACE_LABEL_COLORS = IDENTITY_COLOR_NAMES;

export type WorkspaceLabelColor = IdentityColorName;

export interface WorkspaceLabelDefinition {
  name: string;
  color: WorkspaceLabelColor;
}

export function normalizeWorkspaceLabelName(name: string): string {
  return name.replace(/\s+/g, " ").trim();
}

export function workspaceLabelKey(name: string): string {
  return normalizeWorkspaceLabelName(name).toLowerCase();
}

const EMPTY_LABEL_DEFINITIONS: readonly WorkspaceLabelDefinition[] = [];

/**
 * The definitions behind a workspace's label names, in assignment order. With its host's catalog
 * this is the app's own lookup, which drops a name the catalog does not know; without one, every
 * name is kept and coloured by its hash.
 */
export function selectWorkspaceLabelDefinitions(
  names: readonly string[] | undefined,
  catalog: readonly WorkspaceLabelDefinition[] | null,
): readonly WorkspaceLabelDefinition[] {
  if (!names || names.length === 0) return EMPTY_LABEL_DEFINITIONS;
  if (!catalog) {
    return names.map((name) => ({ name, color: deriveIdentityColorName(workspaceLabelKey(name)) }));
  }
  const byKey = new Map(catalog.map((label) => [workspaceLabelKey(label.name), label]));
  return names.flatMap((name) => {
    const definition = byKey.get(workspaceLabelKey(name));
    return definition ? [definition] : [];
  });
}
