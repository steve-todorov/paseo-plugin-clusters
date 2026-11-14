import {
  type PluginSidebarViewProps,
  type ProjectRef,
  type WorkspaceRef,
  useHosts,
  useWorkspace,
  useWorkspaces,
} from "@getpaseo/plugin/client";
import { Icon } from "@getpaseo/plugin/client/ui";
import { type ReactNode, useCallback, useEffect, useMemo, useState, useSyncExternalStore } from "react";
import { Image, Platform, Pressable, ScrollView, Text, View } from "react-native";
import { inRecents, toMs } from "../shared/activity";
import {
  type HostBadgeModel,
  defaultHostAppearance,
  selectHostBadges,
  shouldShowSidebarHostLabels,
} from "../shared/sidebar/host-badges";
import { byPinnedAtDesc } from "../shared/sidebar/pinned";
import { GhostRow } from "./sidebar/ghost-row";
import { PinnedSection } from "./sidebar/pinned-section";
import { SidebarPreferencesProvider, useSidebarPreferences } from "./sidebar/preferences";
import { ProjectIcon, projectColorKey, useProjectIconData } from "./sidebar/project-icon";
import { LINE, ROW_HEIGHT, type Theme, palette } from "./sidebar/theme";
import { WorkspaceRow, useHover } from "./sidebar/workspace-row";
import { WorkspaceDetailsProvider, useWorkspaceDetailsSource } from "./workspace-details";
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

/** The user's last prompt in a workspace, or when it was made. 0 if neither. */
function usedAt(w: { lastPromptAt: string | null; createdAt: string | null }): number {
  return toMs(w.lastPromptAt) || toMs(w.createdAt);
}

const byUseDesc = (a: Parameters<typeof usedAt>[0], b: Parameters<typeof usedAt>[0]) => usedAt(b) - usedAt(a);

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

  const inView = (w: Parameters<typeof placeIn>[0] & { archivingAt: string | null; background: boolean }) =>
    !w.archivingAt && !w.background && (!cluster || placeIn(w) >= 0);
  // Recents shows a project while its latest use is recent enough. That holds exactly when one of
  // its workspaces is, so the projects to show are the groups of the workspaces that qualify.
  const keptGroups = useWorkspaces({
    where: (w) => recent && inView(w) && inRecents(usedAt(w) >= cutoff ? usedAt(w) : 0, hiddenAt(w), unlimited),
    groupBy: (w) => w.project.key,
  });
  const kept = useMemo(() => new Set(keptGroups.map((group) => group.key)), [keptGroups]);
  const shown = (projectKey: string) => !recent || kept.has(projectKey);

  // One group per project, pinned workspaces included: they still count as the project's use. In
  // Recents the groups come out most recently used first.
  const groups = useWorkspaces({
    where: inView,
    orderBy: cluster
      ? (a, b) => placeIn(a) - placeIn(b) || byUseDesc(a, b)
      : recent
        ? byUseDesc
        : (a, b) => a.projectDisplayName.localeCompare(b.projectDisplayName) || byUseDesc(a, b),
    groupBy: (w) => ({ key: w.project.key, title: w.projectDisplayName }),
  });

  // Pinned workspaces leave their project for the section on top, which follows the same filter.
  const pinned = useWorkspaces({
    where: (w) => inView(w) && w.pinnedAt !== null && shown(w.project.key),
    orderBy: byPinnedAtDesc,
  });
  const pinnedKeys = useMemo(() => new Set(pinned.map((ref) => ref.key)), [pinned]);
  const shownGroups = groups.filter((group) => shown(group.key));

  const label = recent ? strings.recentsTooltip(hours) : (cluster?.name ?? strings.allLabel);

  const details = useWorkspaceDetailsSource();
  const preferences = useSidebarPreferences();
  // Host badges only say something once the list spans two hosts. Plugins cannot read the app's
  // per-device host appearance nor tell which host is the desktop's own daemon, so every host
  // takes the default: its name, in the muted colour.
  const hosts = useHosts();
  const listedHosts = shownGroups.flatMap((group) => group.items.map((ref) => ref.hostId)).join("\n");
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
            <PinnedSection
              rows={pinned}
              theme={theme}
              now={now}
              activeKey={active.workspace?.key ?? null}
              navigation={navigation}
              hostBadges={hostBadges}
            />
            {/* Only Recents drops projects; a cluster or All lists every one it holds. */}
            {shownGroups.map((group) => (
              <ProjectBlock
                key={group.key}
                title={group.title ?? ""}
                items={group.items}
                pinnedKeys={pinnedKeys}
                theme={theme}
                now={now}
                collapsed={collapsed.has(group.key)}
                onToggle={() => toggle(group.key)}
                activeKey={active.workspace?.key ?? null}
                navigation={navigation}
                hostBadges={hostBadges}
              />
            ))}
            {shownGroups.length === 0 ? (
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
  /** Workspaces shown in Pinned instead. */
  pinnedKeys: ReadonlySet<string>;
  theme: Theme;
  now: number;
  collapsed: boolean;
  onToggle: () => void;
  activeKey: string | null;
  navigation: PluginSidebarViewProps["navigation"];
  hostBadges: HostBadges;
}

function ProjectBlock({ title, items, pinnedKeys, theme, now, collapsed, onToggle, activeKey, navigation, hostBadges }: ProjectBlockProps) {
  const head = useWorkspace(items[0], (w) => ({
    hostId: w.hostId,
    projectId: w.projectId,
    project: w.project,
    git: w.projectKind === "git",
  }));
  if (!head) return null;
  const rows = items.filter((ref) => !pinnedKeys.has(ref.key));
  const project = head.git ? head.project : null;
  let children: ReactNode = null;
  if (!collapsed) {
    if (rows.length > 0) {
      children = rows.map((ref) => (
        <WorkspaceRow
          key={ref.key}
          reference={ref}
          theme={theme}
          now={now}
          selected={ref.key === activeKey}
          navigation={navigation}
          hostBadge={hostBadges.get(ref.hostId) ?? null}
        />
      ));
    } else if (project) {
      // Every workspace went to Pinned; the project stays, offering a new one.
      children = (
        <GhostRow
          icon="Plus"
          label={t().newWorkspace}
          accessibilityLabel={t().createWorkspaceFor(title)}
          onPress={() => navigation.openProject(project)}
          indented
          theme={theme}
        />
      );
    }
  }
  return (
    // The gap below a project belongs to its rows, so a project showing none gives it back.
    <View style={{ paddingBottom: children ? 12 : 0 }}>
      <ProjectRow
        title={title}
        theme={theme}
        colorKey={projectColorKey(head.hostId, head.projectId)}
        collapsed={collapsed}
        onToggle={onToggle}
        projectRef={head.project}
        project={project}
        navigation={navigation}
      />
      {children}
    </View>
  );
}

function ProjectRow({
  title,
  theme,
  colorKey,
  collapsed,
  onToggle,
  projectRef,
  project,
  navigation,
}: {
  title: string;
  theme: Theme;
  colorKey: string;
  collapsed: boolean;
  onToggle: () => void;
  projectRef: ProjectRef;
  /** Set when the project can take a new workspace. */
  project: ProjectRef | null;
  navigation: PluginSidebarViewProps["navigation"];
}) {
  const c = theme.colors;
  const colors = palette(theme);
  const hover = useHover();
  const plusHover = useHover();
  const icon = useProjectIconData(projectRef);
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
            <ProjectIcon icon={icon} displayName={title} colorKey={colorKey} />
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
