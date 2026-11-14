import type { PluginSidebarViewProps, WorkspaceRef } from "@getpaseo/plugin/client";
import { Icon } from "@getpaseo/plugin/client/ui";
import { useState } from "react";
import { Platform, Pressable, Text, View } from "react-native";
import type { HostBadgeModel } from "../../shared/sidebar/host-badges";
import { selectPinnedVisibility } from "../../shared/sidebar/pinned";
import { t } from "../web";
import { GhostRow } from "./ghost-row";
import { ROW_HEIGHT, type Theme } from "./theme";
import { WorkspaceRow, useHover } from "./workspace-row";

/*
 * The Pinned section on top of Paseo's default sidebar (components/sidebar-workspace-list.tsx
 * `pinnedSection`, sidebar/sidebar-section-header.tsx and sidebar/sidebar-group-toggle-row.tsx,
 * v0.16). Its rows sit outside their projects, so each leads with its project's icon.
 */

export function PinnedSection({
  rows,
  theme,
  now,
  activeKey,
  navigation,
  hostBadges,
}: {
  /** Most recently pinned first. */
  rows: readonly WorkspaceRef[];
  theme: Theme;
  now: number;
  activeKey: string | null;
  navigation: PluginSidebarViewProps["navigation"];
  hostBadges: ReadonlyMap<string, HostBadgeModel>;
}) {
  // The app keeps both per device; here they last as long as the view.
  const [collapsed, setCollapsed] = useState(false);
  const [expanded, setExpanded] = useState(false);
  if (rows.length === 0) return null;
  const { leadingItem, visibleItems, canToggle } = selectPinnedVisibility({
    items: rows,
    expanded,
    isOpen: (row) => row.key === activeKey,
  });
  const renderRow = (row: WorkspaceRef) => (
    <WorkspaceRow
      key={row.key}
      reference={row}
      theme={theme}
      now={now}
      selected={row.key === activeKey}
      navigation={navigation}
      hostBadge={hostBadges.get(row.hostId) ?? null}
      hoisted
    />
  );
  return (
    <View style={{ marginBottom: 4 }}>
      <SectionHeader title={t().pinnedTitle} collapsed={collapsed} onToggle={() => setCollapsed((value) => !value)} theme={theme} />
      {collapsed ? null : (
        <>
          {leadingItem ? renderRow(leadingItem) : null}
          {visibleItems.map(renderRow)}
          {canToggle ? (
            <GhostRow
              icon={expanded ? "ChevronUp" : "ChevronDown"}
              label={expanded ? t().showLess : t().showMore}
              onPress={() => setExpanded((value) => !value)}
              theme={theme}
            />
          ) : null}
        </>
      )}
    </View>
  );
}

/** A section label that collapses from its title; the chevron shows on hover, always on touch. */
function SectionHeader({ title, collapsed, onToggle, theme }: { title: string; collapsed: boolean; onToggle: () => void; theme: Theme }) {
  const hover = useHover();
  const muted = theme.colors.foregroundMuted;
  return (
    <View style={{ minHeight: ROW_HEIGHT, flexDirection: "row", alignItems: "center", gap: 8, paddingLeft: 8, paddingRight: 4 }}>
      <Pressable
        accessibilityRole="button"
        accessibilityState={{ expanded: !collapsed }}
        onPress={onToggle}
        onHoverIn={hover.onHoverIn}
        onHoverOut={hover.onHoverOut}
        style={{ alignSelf: "stretch", flexDirection: "row", alignItems: "center", gap: 4, marginLeft: -8, paddingHorizontal: 8 }}
      >
        <Text style={{ color: muted, fontSize: 12, fontWeight: "400" }}>{title}</Text>
        {hover.hovered || Platform.OS !== "web" ? <Icon name={collapsed ? "ChevronRight" : "ChevronDown"} size={12} color={muted} /> : null}
      </Pressable>
    </View>
  );
}
