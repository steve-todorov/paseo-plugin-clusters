/*
 * Ported from Paseo's hosts/appearance.ts and hooks/sidebar-workspaces-view-model.ts (v0.16):
 * which hosts get a badge on the meta row, and how.
 *
 * The app also reads each host's per-device appearance (colour, name/icon/hidden) and which host
 * is the desktop's own daemon. Plugins see neither, so callers pass the default appearance and no
 * local host: every host shows its name in the muted colour, as on a client with no local daemon.
 */
import type { IdentityColorName } from "./identity-colors.ts";

export type HostColor = "none" | IdentityColorName;

export type HostBadgeDisplay = "name" | "icon" | "hidden";

export interface HostAppearance {
  color: HostColor;
  /** Null while the user has not chosen: local hosts then hide, remote ones show their name. */
  badgeDisplay: HostBadgeDisplay | null;
}

export function defaultHostAppearance(): HostAppearance {
  return { color: "none", badgeDisplay: null };
}

export function resolveHostBadgeDisplay(input: {
  appearance: HostAppearance;
  isLocalHost: boolean;
  localHostResolutionPending?: boolean;
}): HostBadgeDisplay | null {
  if (input.appearance.badgeDisplay) {
    return input.appearance.badgeDisplay;
  }
  if (input.localHostResolutionPending) {
    return null;
  }
  return input.isLocalHost ? "hidden" : "name";
}

export interface HostBadgeModel {
  serverId: string;
  label: string;
  color: HostColor;
  showLabel: boolean;
}

export interface HostAppearanceSource {
  serverId: string;
  label: string;
  appearance: HostAppearance;
}

/** Every host's badge, by server ID; a host that should show none is absent from the map. */
export function selectHostBadges(input: {
  hosts: readonly HostAppearanceSource[];
  localServerId: string | null;
  localHostResolutionPending?: boolean;
  enabled: boolean;
}): ReadonlyMap<string, HostBadgeModel> {
  const badges = new Map<string, HostBadgeModel>();
  if (!input.enabled) {
    return badges;
  }
  for (const host of input.hosts) {
    const display = resolveHostBadgeDisplay({
      appearance: host.appearance,
      isLocalHost: host.serverId === input.localServerId,
      localHostResolutionPending: input.localHostResolutionPending,
    });
    if (display === null || display === "hidden") {
      continue;
    }
    badges.set(host.serverId, {
      serverId: host.serverId,
      label: host.label.trim() || host.serverId,
      color: host.appearance.color,
      showLabel: display === "name",
    });
  }
  return badges;
}

/** A badge says nothing while every listed workspace lives on one host. */
export function shouldShowSidebarHostLabels(serverIds: Iterable<string>): boolean {
  return new Set(serverIds).size >= 2;
}
