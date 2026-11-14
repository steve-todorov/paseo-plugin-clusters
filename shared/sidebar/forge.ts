/*
 * The part of Paseo's forge presentation the sidebar row needs (packages/app/src/git/forge.ts and
 * packages/protocol/src/forge-manifest.ts, v0.16). The manifest is not a module plugin bundles can
 * load, so the change-request vocabulary of each known forge is repeated here.
 */

/** A forge id. Open by design: an id this table does not know renders neutrally. */
export type Forge = string;

interface ForgeDefinition {
  id: string;
  displayName: string;
  changeRequestAbbrev: string;
  changeRequestNumberPrefix: string;
}

const FORGE_DEFINITIONS: readonly ForgeDefinition[] = [
  { id: "github", displayName: "GitHub", changeRequestAbbrev: "PR", changeRequestNumberPrefix: "#" },
  { id: "gitlab", displayName: "GitLab", changeRequestAbbrev: "MR", changeRequestNumberPrefix: "!" },
  { id: "gitea", displayName: "Gitea", changeRequestAbbrev: "PR", changeRequestNumberPrefix: "#" },
  { id: "forgejo", displayName: "Forgejo", changeRequestAbbrev: "PR", changeRequestNumberPrefix: "#" },
  { id: "codeberg", displayName: "Codeberg", changeRequestAbbrev: "PR", changeRequestNumberPrefix: "#" },
];

function getForgeDefinitionOrNeutral(id: string): ForgeDefinition {
  return (
    FORGE_DEFINITIONS.find((definition) => definition.id === id) ?? {
      id,
      displayName: id,
      changeRequestAbbrev: "PR",
      changeRequestNumberPrefix: "#",
    }
  );
}

/** Old daemons never send a forge, so an absent one is GitHub; any other id passes through. */
export function normalizeForge(raw: string | null | undefined): string {
  return raw && raw.length > 0 ? raw : "github";
}

export interface ForgePresentation {
  forge: string;
  brandLabel: string;
  /** "PR" for GitHub, "MR" for GitLab. */
  changeRequestAbbrev: string;
  /** "#" vs "!". */
  numberPrefix: string;
  /** "mr" selects the merge-request wording, as the app's `_mr` translation keys do. */
  changeRequestContext: "mr" | undefined;
}

export function getForgePresentation(forge: string): ForgePresentation {
  const definition = getForgeDefinitionOrNeutral(forge);
  return {
    forge: definition.id,
    brandLabel: definition.displayName,
    changeRequestAbbrev: definition.changeRequestAbbrev,
    numberPrefix: definition.changeRequestNumberPrefix,
    changeRequestContext: definition.changeRequestAbbrev === "MR" ? "mr" : undefined,
  };
}
