import {
  type PluginSidebarViewProps,
  type ProjectRef,
  type WorkspaceRef,
  useWorkspace,
  useWorkspaces,
} from "@getpaseo/plugin/client";
import { Icon } from "@getpaseo/plugin/client/ui";
import { type ReactNode, useCallback, useEffect, useRef, useState, useSyncExternalStore } from "react";
import { Animated, Easing, Image, Platform, Pressable, ScrollView, Text, View } from "react-native";
import { compactAgo, inRecents, toMs } from "../shared/activity";
import {
  ALL_ID,
  type Daemon,
  type MergedCluster,
  NO_RECENT_LIMIT,
  clusterIcon,
  getActive,
  getState,
  keyMatches,
  mergedClusters,
  normalizeRecentHours,
  setActive,
  subscribe,
  t,
} from "./web";

/*
 * The rows copy Paseo's default sidebar (packages/app/src/components/sidebar-workspace-list.tsx and
 * sidebar/sidebar-workspace-row-content.tsx, v0.16): plugins cannot import the app's own rows, so
 * their sizes and colors are repeated here. Colors the plugin theme lacks (the status dots and the
 * extra-muted text) use the app's values for the theme's brightness.
 */

type Theme = PluginSidebarViewProps["theme"];
type ProjectOf = Parameters<typeof keyMatches>[1];

const ROW_HEIGHT = Platform.OS === "web" ? 36 : 44;
const LINE = 20;

/** Whether the theme is dark, judged by its base surface. */
function isDark(theme: Theme): boolean {
  const hex = theme.colors.surface0.replace("#", "");
  if (hex.length < 6) return true;
  const [r, g, b] = [0, 2, 4].map((i) => parseInt(hex.slice(i, i + 2), 16));
  return 0.299 * r + 0.587 * g + 0.114 * b < 128;
}

function palette(theme: Theme) {
  const dark = isDark(theme);
  return {
    running: dark ? "#5caaf6" : "#268ae0",
    warning: dark ? "#db932e" : "#b37824",
    success: dark ? "#35c264" : "#299f51",
    danger: dark ? "#f7796d" : "#f12e2f",
    extraMuted: dark ? "#717574" : "#a1a1aa",
    hover: theme.colors.surface1,
    selected: theme.colors.surface2,
  };
}

/** Paseo's project identity colors, picked by a hash of the project. */
const IDENTITY = ["#7a6aa8", "#3d7ea6", "#388068", "#a4673a", "#b05c80", "#6a70b8", "#368080", "#b06260", "#8f7838", "#5179b0"];
function identityColor(key: string): string {
  let hash = 0;
  for (const ch of key) hash = (hash * 31 + ch.charCodeAt(0)) >>> 0;
  return IDENTITY[hash % IDENTITY.length];
}

/** The user's last prompt in a workspace, or when it was made. 0 if neither. */
function usedAt(w: { lastPromptAt: string | null; createdAt: string | null }): number {
  return toMs(w.lastPromptAt) || toMs(w.createdAt);
}

const byUseDesc = (a: Parameters<typeof usedAt>[0], b: Parameters<typeof usedAt>[0]) => usedAt(b) - usedAt(a);

/** Hover state for web; touch clients never hover. */
function useHover() {
  const [hovered, setHovered] = useState(false);
  return { hovered, onHoverIn: () => setHovered(true), onHoverOut: () => setHovered(false) };
}

export interface ClustersSidebarViewProps extends PluginSidebarViewProps {
  daemon: Daemon;
  onManage: () => void;
}

/**
 * The sidebar list filtered by the selected cluster, with the cluster circles above it. Paseo's own
 * list can only be filtered in the web page, so this view does the same job on every client.
 */
export function ClustersSidebarView({ theme, navigation, active, daemon, onManage }: ClustersSidebarViewProps) {
  const c = theme.colors;
  const strings = t();
  const selected = useSyncExternalStore(subscribe, getActive);
  const clusters = useSyncExternalStore(subscribe, mergedClusters);
  const snapshot = useCallback(() => getState(daemon), [daemon]);
  const state = useSyncExternalStore(subscribe, snapshot);
  // Recents and the timestamps age by the clock, not only by data changes.
  const [now, setNow] = useState(Date.now);
  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), 60_000);
    return () => clearInterval(timer);
  }, []);
  const [collapsed, setCollapsed] = useState<ReadonlySet<string>>(new Set());
  const toggle = (key: string) =>
    setCollapsed((prev) => {
      const next = new Set(prev);
      if (!next.delete(key)) next.add(key);
      return next;
    });

  const cluster = clusters.find((cl) => cl.id === selected) ?? null;
  const recent = selected === null;
  const hours = normalizeRecentHours(state.recentHours);
  const unlimited = hours === NO_RECENT_LIMIT;
  const cutoff = unlimited ? 0 : now - hours * 60 * 60 * 1000;
  const hiddenAt = (w: ProjectOf) => Object.entries(state.recentHidden ?? {}).find(([key]) => keyMatches(key, w))?.[1];
  const placeIn = (w: ProjectOf) => cluster?.projects.findIndex((key) => keyMatches(key, w)) ?? -1;

  // One group per project. In Recents the groups come out most recently used first; the first
  // workspace of each group is its latest, which decides whether the project is shown.
  const groups = useWorkspaces({
    where: (w) => !w.archivingAt && !w.background && (!cluster || placeIn(w) >= 0),
    orderBy: cluster
      ? (a, b) => placeIn(a) - placeIn(b) || byUseDesc(a, b)
      : recent
        ? byUseDesc
        : (a, b) => a.projectDisplayName.localeCompare(b.projectDisplayName) || byUseDesc(a, b),
    groupBy: (w) => ({ key: w.project.key, title: w.projectDisplayName }),
  });

  const label = recent ? strings.recentsTooltip(hours) : (cluster?.name ?? strings.allLabel);

  return (
    <View style={{ flex: 1 }}>
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        style={{ flexGrow: 0 }}
        contentContainerStyle={{ gap: 8, paddingHorizontal: 10, paddingTop: 8, paddingBottom: 4, alignItems: "center" }}
      >
        <Circle theme={theme} label={strings.recentsLabel} active={recent} onPress={() => setActive(null)} background="#dbeafe">
          <Icon name="Zap" size={15} color="#3b82f6" />
        </Circle>
        {clusters.map((cl) => (
          <Circle
            key={cl.id}
            theme={theme}
            label={cl.name}
            active={cl.id === selected}
            onPress={() => setActive(cl.id)}
            background={cl.color}
          >
            <ClusterFace cluster={cl} />
          </Circle>
        ))}
        <Circle theme={theme} label={strings.allLabel} active={selected === ALL_ID} onPress={() => setActive(ALL_ID)} background="#e4e4e7">
          <Icon name="Layers" size={15} color="#52525b" />
        </Circle>
        <Circle theme={theme} label={strings.manageLabel} active={false} onPress={onManage} background="transparent" outlined>
          <Icon name="Plus" size={15} color={c.foregroundMuted} />
        </Circle>
      </ScrollView>
      <Text numberOfLines={1} style={{ color: palette(theme).extraMuted, fontSize: 12, paddingHorizontal: 16, paddingBottom: 4 }}>
        {label}
      </Text>
      <ScrollView style={{ flex: 1 }} contentContainerStyle={{ paddingHorizontal: 8, paddingTop: 2, paddingBottom: 16 }}>
        {groups.map((group) => (
          <ProjectBlock
            key={group.key}
            title={group.title ?? ""}
            items={group.items}
            theme={theme}
            now={now}
            collapsed={collapsed.has(group.key)}
            onToggle={() => toggle(group.key)}
            activeKey={active.workspace?.key ?? null}
            navigation={navigation}
            // Only Recents drops projects; a cluster or All lists every one it holds.
            keep={recent ? (latest, w) => inRecents(latest >= cutoff ? latest : 0, hiddenAt(w), unlimited) : null}
          />
        ))}
        {groups.length === 0 ? (
          <Text style={{ color: c.foregroundMuted, fontSize: 14, padding: 8 }}>{strings.noWorkspaces}</Text>
        ) : null}
      </ScrollView>
    </View>
  );
}

/** A cluster selector, drawn like the circles of the desktop bar. */
function Circle({
  theme,
  label,
  active,
  onPress,
  background,
  outlined = false,
  children,
}: {
  theme: Theme;
  label: string;
  active: boolean;
  onPress: () => void;
  background: string;
  outlined?: boolean;
  children: ReactNode;
}) {
  return (
    <Pressable
      accessibilityRole="radio"
      accessibilityState={{ selected: active }}
      accessibilityLabel={label}
      onPress={onPress}
      style={{
        width: 36,
        height: 36,
        borderRadius: 18,
        alignItems: "center",
        justifyContent: "center",
        borderWidth: 2,
        borderColor: active ? theme.colors.foreground : "transparent",
      }}
    >
      <View
        style={{
          width: 28,
          height: 28,
          borderRadius: 14,
          alignItems: "center",
          justifyContent: "center",
          overflow: "hidden",
          backgroundColor: background,
          borderWidth: outlined ? 1 : 0,
          borderColor: theme.colors.border,
        }}
      >
        {children}
      </View>
    </Pressable>
  );
}

function ClusterFace({ cluster }: { cluster: MergedCluster }) {
  if (cluster.image) {
    return <Image source={{ uri: cluster.image }} style={{ width: 28, height: 28 }} accessibilityIgnoresInvertColors />;
  }
  return <Text style={{ color: "#ffffff", fontSize: 13, fontWeight: "700" }}>{clusterIcon(cluster)}</Text>;
}

interface ProjectBlockProps {
  title: string;
  items: readonly WorkspaceRef[];
  theme: Theme;
  now: number;
  collapsed: boolean;
  onToggle: () => void;
  activeKey: string | null;
  navigation: PluginSidebarViewProps["navigation"];
  /** Whether to show the project, given its latest use; null shows it always. */
  keep: ((latest: number, w: ProjectOf) => boolean) | null;
}

function ProjectBlock({ title, items, theme, now, collapsed, onToggle, activeKey, navigation, keep }: ProjectBlockProps) {
  const head = useWorkspace(items[0], (w) => ({
    at: usedAt(w),
    hostId: w.hostId,
    projectRootPath: w.projectRootPath,
    projectId: w.projectId,
    project: w.project,
    git: w.projectKind === "git",
  }));
  if (!head || (keep && !keep(head.at, head))) return null;
  return (
    <View style={{ paddingBottom: collapsed ? 0 : 12 }}>
      <ProjectRow
        title={title}
        theme={theme}
        colorKey={JSON.stringify([head.hostId, head.projectId])}
        collapsed={collapsed}
        onToggle={onToggle}
        project={head.git ? head.project : null}
        navigation={navigation}
      />
      {collapsed
        ? null
        : items.map((ref) => (
            <WorkspaceRow key={ref.key} reference={ref} theme={theme} now={now} selected={ref.key === activeKey} navigation={navigation} />
          ))}
    </View>
  );
}

function ProjectRow({
  title,
  theme,
  colorKey,
  collapsed,
  onToggle,
  project,
  navigation,
}: {
  title: string;
  theme: Theme;
  colorKey: string;
  collapsed: boolean;
  onToggle: () => void;
  /** Set when the project can take a new workspace. */
  project: ProjectRef | null;
  navigation: PluginSidebarViewProps["navigation"];
}) {
  const c = theme.colors;
  const colors = palette(theme);
  const hover = useHover();
  const plusHover = useHover();
  const initial = (title.split("/").pop() ?? title).charAt(0).toUpperCase();
  // Touch clients have no hover, so their actions always show, as in Paseo.
  const actionsVisible = hover.hovered || Platform.OS !== "web";
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={{ expanded: !collapsed }}
      accessibilityLabel={title}
      onPress={onToggle}
      onHoverIn={hover.onHoverIn}
      onHoverOut={hover.onHoverOut}
      style={({ pressed }) => ({
        minHeight: ROW_HEIGHT,
        paddingVertical: 8,
        paddingHorizontal: 8,
        borderRadius: 8,
        marginBottom: 4,
        flexDirection: "row",
        alignItems: "center",
        justifyContent: "space-between",
        gap: 8,
        backgroundColor: pressed ? c.surface2 : hover.hovered ? colors.hover : "transparent",
      })}
    >
      <View style={{ flexDirection: "row", alignItems: "center", gap: 8, flex: 1, minWidth: 0 }}>
        <View style={{ width: 16, height: LINE, alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
          {hover.hovered || collapsed ? (
            <Icon name={collapsed ? "ChevronRight" : "ChevronDown"} size={14} color="#9ca3af" />
          ) : (
            <View
              style={{
                width: 16,
                height: 16,
                borderRadius: 4,
                alignItems: "center",
                justifyContent: "center",
                backgroundColor: identityColor(colorKey),
              }}
            >
              <Text style={{ fontSize: 9, color: "#ffffff" }}>{initial}</Text>
            </View>
          )}
        </View>
        <Text numberOfLines={1} style={{ color: c.foregroundMuted, fontSize: 14, fontWeight: "400", flexShrink: 1, minWidth: 0 }}>
          {title}
        </Text>
      </View>
      {project ? (
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={t().newWorkspace}
          disabled={!actionsVisible}
          onPress={() => navigation.openProject(project)}
          onHoverIn={plusHover.onHoverIn}
          onHoverOut={plusHover.onHoverOut}
          style={{
            width: 24,
            height: 24,
            borderRadius: 6,
            alignItems: "center",
            justifyContent: "center",
            marginRight: -6,
            opacity: actionsVisible ? 1 : 0,
            backgroundColor: plusHover.hovered ? colors.hover : "transparent",
          }}
        >
          <Icon name="Plus" size={15} color={plusHover.hovered ? c.foreground : c.foregroundMuted} />
        </Pressable>
      ) : null}
    </Pressable>
  );
}

function WorkspaceRow({
  reference,
  theme,
  now,
  selected,
  navigation,
}: {
  reference: WorkspaceRef;
  theme: Theme;
  now: number;
  selected: boolean;
  navigation: PluginSidebarViewProps["navigation"];
}) {
  const w = useWorkspace(reference, (item) => ({
    name: item.name,
    indicator: item.indicator,
    kind: item.kind,
    enteredAt: toMs(item.statusEnteredAt),
  }));
  const hover = useHover();
  if (!w) return null;
  const c = theme.colors;
  const colors = palette(theme);
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={{ selected }}
      accessibilityLabel={w.name}
      onPress={() => navigation.openWorkspace(reference)}
      onHoverIn={hover.onHoverIn}
      onHoverOut={hover.onHoverOut}
      style={({ pressed }) => ({
        minHeight: ROW_HEIGHT,
        marginBottom: 2,
        paddingVertical: 8,
        paddingLeft: 8,
        paddingRight: 12,
        borderRadius: 8,
        justifyContent: "center",
        backgroundColor: pressed ? c.surface2 : selected ? colors.selected : hover.hovered ? colors.hover : "transparent",
      })}
    >
      <View style={{ flexDirection: "row", alignItems: "flex-start", gap: 8 }}>
        <StatusIndicator indicator={w.indicator} kind={w.kind} theme={theme} />
        <Text
          numberOfLines={1}
          style={{ flex: 1, minWidth: 0, color: c.foreground, fontSize: 14, fontWeight: "400", lineHeight: LINE, opacity: hover.hovered ? 1 : 0.76 }}
        >
          {w.name}
        </Text>
        <Text style={{ height: LINE, lineHeight: LINE, fontSize: 12, color: colors.extraMuted, flexShrink: 0 }}>
          {compactAgo(w.enteredAt, now)}
        </Text>
      </View>
    </Pressable>
  );
}

/** The 16×20 status slot of a workspace row, per status, as Paseo draws it. */
function StatusIndicator({
  indicator,
  kind,
  theme,
}: {
  indicator: string;
  kind: string;
  theme: Theme;
}) {
  const colors = palette(theme);
  const dot = (color: string, opacity = 1) => (
    <View style={{ width: 6, height: 6, borderRadius: 3, backgroundColor: color, opacity }} />
  );
  let content: ReactNode;
  if (indicator === "running") content = <StatusRing color={colors.running} />;
  else if (indicator === "needs_input") {
    content = (
      <View style={{ width: 12, height: 12, borderRadius: 6, backgroundColor: colors.warning, alignItems: "center", justifyContent: "center" }}>
        <Text style={{ color: theme.colors.surface0, fontSize: 9, fontWeight: "700", lineHeight: 12 }}>!</Text>
      </View>
    );
  } else if (indicator === "attention") content = dot(colors.success);
  else if (indicator === "failed") {
    content = (
      <View style={{ width: 14, height: 14 }}>
        <Icon
          name={kind === "local_checkout" ? "Monitor" : kind === "worktree" ? "FolderGit2" : "Folder"}
          size={14}
          color={theme.colors.foregroundMuted}
        />
        <View
          style={{
            position: "absolute",
            right: 0,
            bottom: 0,
            width: 8,
            height: 8,
            borderRadius: 4,
            borderWidth: 1,
            borderColor: theme.colors.surface0,
            backgroundColor: colors.danger,
          }}
        />
      </View>
    );
  } else content = dot(colors.extraMuted, 0.3);
  return <View style={{ width: 16, height: LINE, alignItems: "center", justifyContent: "center", flexShrink: 0 }}>{content}</View>;
}

/** The spinning ring Paseo shows on a running workspace. */
function StatusRing({ color }: { color: string }) {
  const spin = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    const loop = Animated.loop(
      Animated.timing(spin, { toValue: 1, duration: 900, easing: Easing.linear, useNativeDriver: Platform.OS !== "web" }),
    );
    loop.start();
    return () => loop.stop();
  }, [spin]);
  const rotate = spin.interpolate({ inputRange: [0, 1], outputRange: ["0deg", "360deg"] });
  const ring = { position: "absolute" as const, width: 12, height: 12, borderRadius: 6, borderWidth: 1.5 };
  return (
    <View style={{ width: 14, height: 14, alignItems: "center", justifyContent: "center" }}>
      <View style={[ring, { borderColor: color, opacity: 0.3 }]} />
      <Animated.View style={[ring, { borderColor: "transparent", borderTopColor: color, opacity: 0.9, transform: [{ rotate }] }]} />
      <View style={{ width: 6, height: 6, borderRadius: 3, backgroundColor: color }} />
    </View>
  );
}
