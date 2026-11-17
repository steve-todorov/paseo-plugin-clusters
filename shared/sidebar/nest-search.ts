/*
 * The search field of the row menu's "Nest under…" picker: a case-insensitive substring match on
 * what a picker item shows or stands for (its title, the workspace name and its git branch).
 */

/** What one picker item is found by; null fields are left out. */
export interface NestSearchFields {
  title: string | null;
  name: string | null;
  branch: string | null;
}

/** Lowercased and trimmed, with every run of whitespace made one space. */
export function normalizeNestQuery(text: string): string {
  return text.trim().replace(/\s+/g, " ").toLowerCase();
}

/** Whether a workspace matches `query`, which `normalizeNestQuery` already made. Blank matches all. */
export function nestSearchMatches(query: string, fields: NestSearchFields): boolean {
  if (!query) return true;
  return [fields.title, fields.name, fields.branch].some((field) => field !== null && normalizeNestQuery(field).includes(query));
}

/**
 * The eligible parents that match the typed text, in their own order; a blank text keeps them all.
 * `isMatch` gets the normalized query (in the view, whether the workspace's snapshot matched it).
 */
export function filterNestCandidates(
  candidates: readonly string[],
  text: string,
  isMatch: (key: string, query: string) => boolean,
): string[] {
  const query = normalizeNestQuery(text);
  if (!query) return [...candidates];
  return candidates.filter((key) => isMatch(key, query));
}

/** The branch to show under an item, so a branch match is visible; null when the title says it. */
export function nestBranchHint(title: string, branch: string | null): string | null {
  return branch && branch !== title ? branch : null;
}
