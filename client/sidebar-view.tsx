import {
  type PluginSidebarViewProps,
  type ProjectRef,
  type WorkspaceRef,
  useHosts,
  useWorkspace,
  useWorkspaces,
} from "@getpaseo/plugin/client";
import { Icon } from "@getpaseo/plugin/client/ui";
import { type ReactNode, useCallback, useEffect, useMemo, useRef, useState, useSyncExternalStore } from "react";
import { Animated, Easing, Image, Platform, Pressable, ScrollView, Text, View } from "react-native";
import { inRecents, toMs } from "../shared/activity";
import {
  type HostBadgeModel,
  defaultHostAppearance,
  selectHostBadges,
  shouldShowSidebarHostLabels,
} from "../shared/sidebar/host-badges";
import { deriveIdentityColorName, identityColor } from "../shared/sidebar/identity-colors";
import { selectWorkspaceLabelDefinitions } from "../shared/sidebar/labels";
import { selectWorkspaceServiceSummary } from "../shared/sidebar/service-summary";
import { normalizeCurrentBranch, resolveWorkspaceTitle } from "../shared/sidebar/workspace-row";
import { WorkspaceMetaRow } from "./sidebar/meta-row";
import { SidebarPreferencesProvider, useSidebarPreferences } from "./sidebar/preferences";
import { LINE, ROW_HEIGHT, type Theme, palette } from "./sidebar/theme";
import { WorkspaceTrailing } from "./sidebar/trailing";
import { WorkspaceDetailsProvider, useWorkspaceDetail, useWorkspaceDetailsSource } from "./workspace-details";
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
 * their sizes and colors are repeated here and in ./sidebar/.
 */

type ProjectOf = Parameters<typeof keyMatches>[1];
type HostBadges = ReadonlyMap<string, HostBadgeModel>;

/** Touch clients get no service on the meta row, as in Paseo. */
const IS_DESKTOP = Platform.OS === "web";

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

  const details = useWorkspaceDetailsSource();
  const preferences = useSidebarPreferences();
  // Host badges only say something once the list spans two hosts. Plugins cannot read the app's
  // per-device host appearance nor tell which host is the desktop's own daemon, so every host
  // takes the default: its name, in the muted colour.
  const hosts = useHosts();
  const listedHosts = groups.flatMap((group) => group.items.map((ref) => ref.hostId)).join("\n");
  const hostBadges = useMemo(
    () =>
      selectHostBadges({
        hosts: hosts.map((host) => ({ serverId: host.serverId, label: host.label, appearance: defaultHostAppearance() })),
        localServerId: null,
        enabled: preferences.rowItems.host && shouldShowSidebarHostLabels(listedHosts.split("\n")),
      }),
    [hosts, listedHosts, preferences.rowItems.host],
  );

  return (
    <SidebarPreferencesProvider value={preferences}>
      <WorkspaceDetailsProvider value={details}>
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
                hostBadges={hostBadges}
                // Only Recents drops projects; a cluster or All lists every one it holds.
                keep={recent ? (latest, w) => inRecents(latest >= cutoff ? latest : 0, hiddenAt(w), unlimited) : null}
              />
            ))}
            {groups.length === 0 ? (
              <Text style={{ color: c.foregroundMuted, fontSize: 14, padding: 8 }}>{strings.noWorkspaces}</Text>
            ) : null}
          </ScrollView>
        </View>
      </WorkspaceDetailsProvider>
    </SidebarPreferencesProvider>
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
  hostBadges: HostBadges;
  /** Whether to show the project, given its latest use; null shows it always. */
  keep: ((latest: number, w: ProjectOf) => boolean) | null;
}

function ProjectBlock({ title, items, theme, now, collapsed, onToggle, activeKey, navigation, hostBadges, keep }: ProjectBlockProps) {
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
            <WorkspaceRow
              key={ref.key}
              reference={ref}
              theme={theme}
              now={now}
              selected={ref.key === activeKey}
              navigation={navigation}
              hostBadge={hostBadges.get(ref.hostId) ?? null}
            />
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
                backgroundColor: identityColor(deriveIdentityColorName(colorKey)),
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
  hostBadge,
}: {
  reference: WorkspaceRef;
  theme: Theme;
  now: number;
  selected: boolean;
  navigation: PluginSidebarViewProps["navigation"];
  hostBadge: HostBadgeModel | null;
}) {
  const w = useWorkspace(reference, (item) => ({
    name: item.name,
    indicator: item.indicator,
    kind: item.kind,
    branch: item.branch,
    labels: item.labels,
    diffStat: item.diffStat,
    statusEnteredAt: item.statusEnteredAt,
  }));
  // Change request, checks and services are not in the plugin snapshot; they come from the host's
  // own workspace directory and fill in once it has listed this workspace.
  const detail = useWorkspaceDetail(reference);
  const { titleSource, trailing } = useSidebarPreferences();
  const hover = useHover();
  const labels = useMemo(() => selectWorkspaceLabelDefinitions(w?.labels, null), [w?.labels]);
  if (!w) return null;
  const c = theme.colors;
  const colors = palette(theme);
  const currentBranch = detail ? detail.currentBranch : normalizeCurrentBranch(w.branch);
  const title = resolveWorkspaceTitle({ workspace: { name: w.name, currentBranch }, titleSource });
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={{ selected }}
      accessibilityLabel={title}
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
      <View style={{ flexDirection: "row", alignItems: "flex-start", gap: 8, width: "100%" }}>
        <StatusIndicator indicator={w.indicator} kind={w.kind} theme={theme} />
        <View style={{ flex: 1, minWidth: 0 }}>
          <View style={{ flexDirection: "row", alignItems: "flex-start", justifyContent: "space-between", gap: 8 }}>
            <Text
              numberOfLines={1}
              style={{ flex: 1, minWidth: 0, color: c.foreground, fontSize: 14, fontWeight: "400", lineHeight: LINE, opacity: hover.hovered ? 1 : 0.76 }}
            >
              {title}
            </Text>
            <View style={{ flexDirection: "row", alignItems: "flex-start", gap: 8, flexShrink: 0 }}>
              <WorkspaceTrailing workspace={w} trailing={trailing} theme={theme} now={now} />
            </View>
          </View>
          <WorkspaceMetaRow
            theme={theme}
            currentBranch={currentBranch}
            // Only hoisted rows name their project; this view always groups by project.
            projectName={null}
            hostBadge={hostBadge}
            prHint={detail?.prHint ?? null}
            serviceSummary={IS_DESKTOP && detail ? selectWorkspaceServiceSummary(detail.scripts) : null}
            labels={labels}
          />
        </View>
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
