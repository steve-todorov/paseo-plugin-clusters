import { openExternalUrl } from "@getpaseo/plugin/client";
import { Icon } from "@getpaseo/plugin/client/ui";
import { Fragment, type ReactNode, useState } from "react";
import { type GestureResponderEvent, Pressable, Text, View } from "react-native";
import { type CheckSummary, type CheckSummaryState, toFilledQuarters } from "../../shared/sidebar/check-summary";
import { getForgePresentation, normalizeForge } from "../../shared/sidebar/forge";
import type { HostBadgeModel } from "../../shared/sidebar/host-badges";
import { identityForeground, identityTint } from "../../shared/sidebar/identity-colors";
import { type WorkspaceLabelDefinition, workspaceLabelKey } from "../../shared/sidebar/labels";
import { type MetaRowItem, selectMetaRowItems } from "../../shared/sidebar/meta-items";
import type { PrHint } from "../../shared/sidebar/pr-hint";
import { type WorkspaceServiceSummary, workspaceServiceLabelKey } from "../../shared/sidebar/service-summary";
import { t } from "../web";
import { useSidebarPreferences } from "./preferences";
import { META_FONT_SIZE, META_ICON_SIZE, META_LINE, type Theme, isDark, palette } from "./theme";

/*
 * The subtitle under a workspace title, as Paseo draws it
 * (components/sidebar/workspace-meta-row/index.tsx and check-indicator.tsx, v0.16): host, change
 * request, its CI, a running service and the labels, as peers separated by a dot.
 */

/** How far a label chip's ground extends past its name on each side. */
const LABEL_CHIP_INSET = 6;

const EMPTY_LABELS: readonly WorkspaceLabelDefinition[] = [];

export function WorkspaceMetaRow({
  theme,
  currentBranch,
  projectName,
  hostBadge,
  prHint,
  serviceSummary,
  labels = EMPTY_LABELS,
}: {
  theme: Theme;
  currentBranch: string | null;
  projectName: string | null;
  hostBadge: HostBadgeModel | null;
  prHint: PrHint | null;
  serviceSummary: WorkspaceServiceSummary | null;
  labels?: readonly WorkspaceLabelDefinition[];
}) {
  const { rowItems, checksDisplay } = useSidebarPreferences();
  const items = selectMetaRowItems({
    currentBranch,
    projectName,
    hasHostBadge: hostBadge !== null,
    prHint,
    serviceSummary,
    labels,
    visible: rowItems,
    checksDisplay,
  });
  if (items.length === 0) return null;

  const separator = { color: palette(theme).extraMuted, fontSize: META_FONT_SIZE, lineHeight: META_LINE, flexShrink: 0 };
  return (
    <View style={{ flexDirection: "row", alignItems: "center", gap: 6, minWidth: 0 }}>
      {items.map((item, index) => (
        <Fragment key={item.kind}>
          {index > 0 ? <Text style={separator}>·</Text> : null}
          <MetaItem item={item} theme={theme} hostBadge={hostBadge} leading={index === 0} />
        </Fragment>
      ))}
    </View>
  );
}

function MetaItem({
  item,
  theme,
  hostBadge,
  leading,
}: {
  item: MetaRowItem;
  theme: Theme;
  hostBadge: HostBadgeModel | null;
  /** First on the line, so a label chip hangs left to put its text on the title's rail. */
  leading: boolean;
}): ReactNode {
  switch (item.kind) {
    case "branch":
    case "project":
      return <IdentityItem theme={theme} kind={item.kind} name={item.name} />;
    case "host":
      return hostBadge ? <HostBadge theme={theme} badge={hostBadge} /> : null;
    case "changeRequest":
      return <PullRequestItem theme={theme} hint={item.hint} />;
    case "checks":
      return <ChecksItem theme={theme} summary={item.summary} label={item.label} />;
    case "services":
      return <ServiceItem theme={theme} summary={item.summary} />;
    case "labels":
      return <LabelsItem theme={theme} labels={item.labels} leading={leading} />;
  }
}

function metaText(color: string, shrink: 0 | 1) {
  return { color, fontSize: META_FONT_SIZE, lineHeight: META_LINE, flexShrink: shrink };
}

function IdentityItem({ theme, kind, name }: { theme: Theme; kind: "branch" | "project"; name: string }) {
  const color = theme.colors.foregroundMuted;
  return (
    <View style={{ flexDirection: "row", alignItems: "center", gap: 3, minWidth: 0, flexShrink: 1 }}>
      <View style={{ flexShrink: 0 }}>
        <Icon name={kind === "branch" ? "GitBranch" : "Folder"} size={META_ICON_SIZE} color={color} />
      </View>
      <Text numberOfLines={1} style={metaText(color, 1)}>
        {name}
      </Text>
    </View>
  );
}

/**
 * Which machine the workspace lives on: a server glyph and, when shown, the host's name, both in
 * the host's colour. It gives up its width before any neighbour does.
 */
function HostBadge({ theme, badge }: { theme: Theme; badge: HostBadgeModel }) {
  const color = badge.color === "none" ? theme.colors.foregroundMuted : identityForeground(badge.color, isDark(theme) ? "dark" : "light");
  return (
    <View accessibilityLabel={badge.label} style={{ flexDirection: "row", alignItems: "center", gap: 3, minWidth: META_ICON_SIZE, flexShrink: 100 }}>
      <View style={{ flexShrink: 0 }}>
        <Icon name="Server" size={META_ICON_SIZE} color={color} />
      </View>
      {badge.showLabel ? (
        <Text numberOfLines={1} style={{ ...metaText(color, 1), minWidth: 0 }}>
          {badge.label}
        </Text>
      ) : null}
    </View>
  );
}

/** The app's PullRequestStateIcon: the same Lucide glyphs and colours, one per state. */
function prStateIcon(theme: Theme, state: PrHint["state"]): { name: string; color: string } {
  if (state === "merged") return { name: "GitMerge", color: palette(theme).merged };
  if (state === "closed") return { name: "GitPullRequestClosed", color: theme.colors.statusDanger };
  return { name: "GitPullRequest", color: theme.colors.statusSuccess };
}

/**
 * The only item that navigates, so the only one that answers the pointer: it brightens and its
 * glyph turns into an external-link arrow before you click.
 */
function PullRequestItem({ theme, hint }: { theme: Theme; hint: PrHint }) {
  const strings = t();
  const [hovered, setHovered] = useState(false);
  const mergeRequest = getForgePresentation(normalizeForge(hint.forge)).changeRequestContext === "mr";
  const icon = prStateIcon(theme, hint.state);
  // The row underneath opens the workspace; this press is only the link's.
  const stop = (event: GestureResponderEvent) => event.stopPropagation();
  const open = (event: GestureResponderEvent) => {
    event.stopPropagation();
    openExternalUrl(hint.url).catch((error: unknown) => console.warn("[paseo-clusters] Could not open", hint.url, error));
  };
  return (
    <Pressable
      accessibilityRole="link"
      accessibilityLabel={strings.pullRequestAccessible(hint.number, mergeRequest)}
      hitSlop={4}
      onPressIn={stop}
      onPress={open}
      onHoverIn={() => setHovered(true)}
      onHoverOut={() => setHovered(false)}
      style={({ pressed }) => ({ flexDirection: "row", alignItems: "center", gap: 3, minWidth: 0, flexShrink: 0, opacity: pressed ? 0.82 : 1 })}
    >
      {hovered ? (
        <Icon name="ExternalLink" size={META_ICON_SIZE} color={theme.colors.foreground} />
      ) : (
        <Icon name={icon.name} size={META_ICON_SIZE} color={icon.color} />
      )}
      <Text numberOfLines={1} style={metaText(hovered ? theme.colors.foreground : theme.colors.foregroundMuted, 0)}>
        {hint.number}
        {/* An open change request says nothing extra; a merged or closed one says why it still shows. */}
        {hint.state === "open" ? "" : ` ${hint.state === "merged" ? strings.prMerged : strings.prClosed}`}
      </Text>
    </Pressable>
  );
}

function checksColor(theme: Theme, state: CheckSummaryState): string {
  if (state === "failed") return theme.colors.statusDanger;
  if (state === "running") return theme.colors.statusWarning;
  return theme.colors.statusSuccess;
}

/** Every state says its own word by default; the accessible name stays when the word is off. */
function ChecksItem({ theme, summary, label }: { theme: Theme; summary: CheckSummary; label: boolean }) {
  const strings = t();
  const color = checksColor(theme, summary.state);
  const words = {
    passed: [strings.checksPassed, strings.checksPassedAccessible],
    failed: [strings.checksFailed, strings.checksFailedAccessible],
    running: [strings.checksRunning, strings.checksRunningAccessible],
  }[summary.state];
  return (
    <View accessibilityLabel={words[1]} style={{ flexDirection: "row", alignItems: "center", gap: 3, minWidth: 0, flexShrink: 0 }}>
      <CheckIndicator summary={summary} color={color} />
      {label ? (
        <Text numberOfLines={1} style={metaText(color, 0)}>
          {words[0]}
        </Text>
      ) : null}
    </View>
  );
}

/*
 * The app draws CI as one SVG glyph: a check or a cross in a circle, or a pie filling clockwise
 * from twelve while checks run. Plugins have no SVG, so the finished states use Lucide's
 * CircleCheck and CircleX, and the running state is built from Views on Lucide's circle geometry
 * (radius 10 of 24, stroke 2). The pie only ever fills in quarters, so four squares clipped to a
 * circle draw it exactly.
 */
const OUTLINE = (META_ICON_SIZE * 22) / 24;
const PIE = (META_ICON_SIZE * 14) / 24;
/** Quarters in the order they fill: top right, bottom right, bottom left, top left. */
const QUARTERS = [
  { left: PIE / 2, top: 0 },
  { left: PIE / 2, top: PIE / 2 },
  { left: 0, top: PIE / 2 },
  { left: 0, top: 0 },
];

function CheckIndicator({ summary, color }: { summary: CheckSummary; color: string }) {
  if (summary.state !== "running") {
    return <Icon name={summary.state === "passed" ? "CircleCheck" : "CircleX"} size={META_ICON_SIZE} color={color} />;
  }
  const filled = Math.round(toFilledQuarters(summary) * QUARTERS.length);
  return (
    <View style={{ width: META_ICON_SIZE, height: META_ICON_SIZE, alignItems: "center", justifyContent: "center" }}>
      <View
        style={{
          position: "absolute",
          width: OUTLINE,
          height: OUTLINE,
          borderRadius: OUTLINE / 2,
          borderWidth: (META_ICON_SIZE * 2) / 24,
          borderColor: color,
        }}
      />
      {filled > 0 ? (
        <View style={{ width: PIE, height: PIE, borderRadius: PIE / 2, overflow: "hidden" }}>
          {QUARTERS.slice(0, filled).map((quarter, index) => (
            <View key={index} style={{ position: "absolute", width: PIE / 2, height: PIE / 2, backgroundColor: color, ...quarter }} />
          ))}
        </View>
      ) : null}
    </View>
  );
}

/** A running service, named; a failing health check turns glyph and name danger together. */
function ServiceItem({ theme, summary }: { theme: Theme; summary: WorkspaceServiceSummary }) {
  const strings = t();
  const unhealthy = summary.health === "unhealthy";
  const color = unhealthy ? theme.colors.statusDanger : theme.colors.statusSuccess;
  const accessible = workspaceServiceLabelKey(summary) === "serviceUnhealthy" ? strings.serviceUnhealthy : strings.serviceRunning;
  return (
    <View accessibilityLabel={accessible(summary.name)} style={{ flexDirection: "row", alignItems: "center", gap: 3, minWidth: 0, flexShrink: 1 }}>
      <View style={{ flexShrink: 0 }}>
        <Icon name="Globe" size={META_ICON_SIZE} color={color} />
      </View>
      <Text numberOfLines={1} style={metaText(color, 1)}>
        {summary.name}
      </Text>
    </View>
  );
}

/** Every label in one run of chips, closer together than the line's items, shrinking as one. */
function LabelsItem({ theme, labels, leading }: { theme: Theme; labels: readonly WorkspaceLabelDefinition[]; leading: boolean }) {
  const scheme = isDark(theme) ? "dark" : "light";
  return (
    <View style={{ flexDirection: "row", alignItems: "center", gap: 4, minWidth: 0, flexShrink: 1, marginLeft: leading ? -LABEL_CHIP_INSET : 0 }}>
      {labels.map((label) => (
        <View
          key={workspaceLabelKey(label.name)}
          style={{
            flexShrink: 1,
            minWidth: 0,
            paddingHorizontal: LABEL_CHIP_INSET,
            borderRadius: 9999,
            backgroundColor: identityTint(label.color),
          }}
        >
          <Text numberOfLines={1} style={{ ...metaText(identityForeground(label.color, scheme), 1), minWidth: 0 }}>
            {label.name}
          </Text>
        </View>
      ))}
    </View>
  );
}
