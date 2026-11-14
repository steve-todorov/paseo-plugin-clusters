/*
 * Ported from Paseo's components/sidebar/display-preferences/row-items.ts (v0.16): which facts a
 * workspace row may show. Each item is independent; CI has three answers, so it lives in
 * `checks-display.ts`.
 */

export const SIDEBAR_ROW_ITEMS = ["branch", "project", "host", "changeRequest", "services", "labels"] as const;

export type SidebarRowItem = (typeof SIDEBAR_ROW_ITEMS)[number];

export type SidebarRowItems = Record<SidebarRowItem, boolean>;

/** The stored record is merged over these product defaults. */
export const DEFAULT_SIDEBAR_ROW_ITEMS: SidebarRowItems = {
  branch: false,
  project: false,
  host: true,
  changeRequest: true,
  services: true,
  labels: true,
};

/** A stored `checks: false` (before checks had their own setting) means the user hid them. */
export function isChecksHiddenByLegacyRowItem(value: unknown): boolean {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    return false;
  }
  return (value as Record<string, unknown>).checks === false;
}

function isSidebarRowItem(value: string): value is SidebarRowItem {
  return (SIDEBAR_ROW_ITEMS as readonly string[]).includes(value);
}

export function parseSidebarRowItems(value: unknown): SidebarRowItems {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    return DEFAULT_SIDEBAR_ROW_ITEMS;
  }

  const stored = value as Record<string, unknown>;
  const result = { ...DEFAULT_SIDEBAR_ROW_ITEMS };
  // The item was called "scripts" until Paseo v0.3.0; a stored `false` is someone who hid it.
  if (stored.scripts === false) {
    result.services = false;
  }
  for (const [key, entry] of Object.entries(stored)) {
    if (isSidebarRowItem(key) && typeof entry === "boolean") {
      result[key] = entry;
    }
  }
  return result;
}
