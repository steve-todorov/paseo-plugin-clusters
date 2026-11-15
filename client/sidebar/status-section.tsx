import type { PluginSidebarViewProps, WorkspaceRef } from "@getpaseo/plugin/client";
import { Icon } from "@getpaseo/plugin/client/ui";
import { useState } from "react";
import { Platform, Pressable, Text, View } from "react-native";
import type { Strings } from "../../shared/i18n";
import { selectSidebarGroupVisibility } from "../../shared/sidebar/group-visibility";
import type { HostBadgeModel } from "../../shared/sidebar/host-badges";
import type { StatusBucket } from "../../shared/sidebar/status-groups";
import { t } from "../web";
import { GhostRow } from "./ghost-row";
import { ROW_HEIGHT, type Theme, palette } from "./theme";
import { WorkspaceRow, useHover } from "./workspace-row";

/*
 * One section of Paseo's "Status" grouping (components/sidebar/sidebar-status-list.tsx
 * `StatusGroupRows` and `StatusGroupHeader`, v0.16). Its rows step in from the header, lead with
 * their project's icon, and stop at 7 plus whatever is not done.
 */

const BUCKET_ICONS: Record<StatusBucket, string> = {
  needs_input: "CircleAlert",
  failed: "CircleX",
  attention: "CircleCheck",
  running: "CircleDot",
  done: "CircleCheck",
};

export function statusBucketLabel(s: Strings, bucket: StatusBucket): string {
  const labels: Record<StatusBucket, string> = {
    needs_input: s.statusNeedsInput,
    failed: s.statusFailed,
    attention: s.statusReadyToReview,
    running: s.statusWorking,
    done: s.statusDone,
  };
  return labels[bucket];
}

/** The section's glyph in its status colour, as the status dots under it use. */
function bucketColor(theme: Theme, bucket: StatusBucket): string {
  const colors = palette(theme);
  if (bucket === "needs_input") return colors.warning;
  if (bucket === "failed") return colors.danger;
  if (bucket === "attention") return colors.success;
  if (bucket === "running") return colors.running;
  return theme.colors.foregroundMuted;
}

export function StatusSection({
  bucket,
  rows,
  collapsed,
  onToggle,
  theme,
  now,
  activeKey,
  navigation,
  hostBadges,
}: {
  bucket: StatusBucket;
  /** Latest status change first. */
  rows: readonly WorkspaceRef[];
  collapsed: boolean;
  onToggle: () => void;
  theme: Theme;
  now: number;
  activeKey: string | null;
  navigation: PluginSidebarViewProps["navigation"];
  hostBadges: ReadonlyMap<string, HostBadgeModel>;
}) {
  // The app forgets "Show more" with the list too; collapse lives with the view.
  const [expanded, setExpanded] = useState(false);
  const { leadingItem, visibleItems, canToggle } = selectSidebarGroupVisibility({
    items: rows,
    expanded,
    policy: { kind: "workspaces", isDone: () => bucket === "done" },
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
      leadingName="project"
      indented
    />
  );
  return (
    // The gap below a section belongs to its rows, so a collapsed one gives it back.
    <View style={{ paddingBottom: collapsed ? 0 : 12 }}>
      <StatusHeader bucket={bucket} collapsed={collapsed} onToggle={onToggle} theme={theme} />
      {collapsed ? null : (
        <>
          {leadingItem ? renderRow(leadingItem) : null}
          {visibleItems.map(renderRow)}
          {canToggle ? (
            <GhostRow
              icon={expanded ? "ChevronUp" : "ChevronDown"}
              label={expanded ? t().showLess : t().showMore}
              onPress={() => setExpanded((value) => !value)}
              indented
              theme={theme}
            />
          ) : null}
        </>
      )}
    </View>
  );
}

/** The section's row: its status glyph, swapped for the chevron on hover, and its name. */
function StatusHeader({ bucket, collapsed, onToggle, theme }: { bucket: StatusBucket; collapsed: boolean; onToggle: () => void; theme: Theme }) {
  const c = theme.colors;
  const hover = useHover();
  const label = statusBucketLabel(t(), bucket);
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={t().statusGroupAccessibility(label)}
      accessibilityState={{ expanded: !collapsed }}
      onPress={onToggle}
      onHoverIn={hover.onHoverIn}
      onHoverOut={hover.onHoverOut}
      style={({ pressed }) => ({
        minHeight: ROW_HEIGHT,
        paddingVertical: 8,
        paddingHorizontal: 8,
        borderRadius: 8,
        marginBottom: 8,
        flexDirection: "row",
        alignItems: "center",
        gap: 8,
        backgroundColor: pressed ? c.surface2 : hover.hovered ? palette(theme).hover : "transparent",
      })}
    >
      <View style={{ width: 16, height: 16, alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
        {hover.hovered && Platform.OS === "web" ? (
          <Icon name={collapsed ? "ChevronRight" : "ChevronDown"} size={14} color={c.foregroundMuted} />
        ) : (
          <Icon name={BUCKET_ICONS[bucket]} size={14} color={bucketColor(theme, bucket)} />
        )}
      </View>
      <Text numberOfLines={1} style={{ color: c.foregroundMuted, fontSize: 14, fontWeight: "400", flexShrink: 1, minWidth: 0 }}>
        {label}
      </Text>
    </Pressable>
  );
}
