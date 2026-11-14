import assert from "node:assert/strict";
import { test } from "node:test";
import {
  type HostAppearanceSource,
  defaultHostAppearance,
  resolveHostBadgeDisplay,
  selectHostBadges,
  shouldShowSidebarHostLabels,
} from "./host-badges.ts";

// Ported from Paseo's hosts/appearance.test.ts (v0.16), the badge selection only.

function host(serverId: string, label: string, appearance = defaultHostAppearance()): HostAppearanceSource {
  return { serverId, label, appearance };
}

test("hides the badge for the local host until the user chooses", () => {
  assert.equal(resolveHostBadgeDisplay({ appearance: defaultHostAppearance(), isLocalHost: true }), "hidden");
});

test("shows a remote host's name until the user chooses", () => {
  assert.equal(resolveHostBadgeDisplay({ appearance: defaultHostAppearance(), isLocalHost: false }), "name");
});

test("a chosen display wins, local or not", () => {
  assert.equal(resolveHostBadgeDisplay({ appearance: { color: "none", badgeDisplay: "icon" }, isLocalHost: true }), "icon");
  assert.equal(resolveHostBadgeDisplay({ appearance: { color: "none", badgeDisplay: "hidden" }, isLocalHost: false }), "hidden");
});

test("decides nothing for an untouched host while local-host detection is pending", () => {
  assert.equal(
    resolveHostBadgeDisplay({ appearance: defaultHostAppearance(), isLocalHost: false, localHostResolutionPending: true }),
    null,
  );
  assert.equal(
    resolveHostBadgeDisplay({ appearance: { color: "none", badgeDisplay: "icon" }, isLocalHost: false, localHostResolutionPending: true }),
    "icon",
  );
});

test("shows no badges while the sidebar spans a single host", () => {
  const badges = selectHostBadges({ hosts: [host("alpha", "Alpha"), host("beta", "Beta")], localServerId: null, enabled: false });
  assert.equal(badges.size, 0);
});

test("omits a host the user hid and keeps its sibling", () => {
  const badges = selectHostBadges({
    hosts: [host("alpha", "Alpha", { color: "none", badgeDisplay: "hidden" }), host("beta", "Beta")],
    localServerId: null,
    enabled: true,
  });
  assert.equal(badges.has("alpha"), false);
  assert.deepEqual(badges.get("beta"), { serverId: "beta", label: "Beta", color: "none", showLabel: true });
});

test("keeps an icon-only host in the map without its label", () => {
  const badges = selectHostBadges({
    hosts: [host("alpha", "Alpha", { color: "teal", badgeDisplay: "icon" })],
    localServerId: null,
    enabled: true,
  });
  assert.deepEqual(badges.get("alpha"), { serverId: "alpha", label: "Alpha", color: "teal", showLabel: false });
});

test("falls back to the server id when the label is blank", () => {
  const badges = selectHostBadges({ hosts: [host("alpha", "   ")], localServerId: null, enabled: true });
  assert.equal(badges.get("alpha")?.label, "alpha");
});

test("hides an untouched local host while its remote sibling shows", () => {
  const badges = selectHostBadges({ hosts: [host("alpha", "Alpha"), host("beta", "Beta")], localServerId: "alpha", enabled: true });
  assert.equal(badges.has("alpha"), false);
  assert.equal(badges.get("beta")?.label, "Beta");
});

test("omits untouched badges while local-host detection is unresolved", () => {
  const badges = selectHostBadges({
    hosts: [host("alpha", "Alpha"), host("beta", "Beta")],
    localServerId: null,
    localHostResolutionPending: true,
    enabled: true,
  });
  assert.equal(badges.size, 0);
});

test("host labels only say something once two hosts are listed", () => {
  assert.equal(shouldShowSidebarHostLabels([]), false);
  assert.equal(shouldShowSidebarHostLabels(["alpha", "alpha"]), false);
  assert.equal(shouldShowSidebarHostLabels(["alpha", "beta"]), true);
});
