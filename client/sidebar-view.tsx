import type { PluginSidebarViewProps } from "@getpaseo/plugin/client";
import { Icon } from "@getpaseo/plugin/client/ui";
import { type ReactNode, useCallback, useEffect, useMemo, useState, useSyncExternalStore } from "react";
import { Image, Pressable, ScrollView, Text, View } from "react-native";
import { defaultHostAppearance, selectHostBadges, shouldShowSidebarHostLabels } from "../shared/sidebar/host-badges";
import type { SidebarPreferences } from "../shared/sidebar/preferences";
import { DisplayMenuSurface, DisplayMenuTrigger, useDisplayMenuState } from "./sidebar/display-menu";
import { FilterEmptyState } from "./sidebar/filter-empty";
import { PinnedSection } from "./sidebar/pinned-section";
import { SidebarPreferencesProvider, useStoredSidebarSettings } from "./sidebar/preferences";
import { ProjectBlock } from "./sidebar/project-block";
import { StatusSection } from "./sidebar/status-section";
import { type Theme, palette } from "./sidebar/theme";
import { useSidebarList } from "./sidebar/use-sidebar-list";
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

export interface ClustersSidebarViewProps extends PluginSidebarViewProps {
  daemon: Daemon;
  onManage: () => void;
}

/**
 * The sidebar list filtered by the selected cluster, with the cluster circles above it. Paseo's own
 * list can only be filtered in the web page, so this view does the same job on every client.
 */
export function ClustersSidebarView({ theme, layout, navigation, active, daemon, onManage }: ClustersSidebarViewProps) {
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
  // Project and status sections collapse for as long as the view lives.
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
  const recentHidden = state.recentHidden;

  const { settings, update } = useStoredSidebarSettings();
  const list = useSidebarList({
    settings,
    clusterProjects: cluster?.projects ?? null,
    recents: recent
      ? {
          cutoff,
          unlimited,
          hiddenAt: (w) => Object.entries(recentHidden ?? {}).find(([key]) => keyMatches(key, w))?.[1],
        }
      : null,
    keyMatches,
  });

  const label = recent ? strings.recentsTooltip(hours) : (cluster?.name ?? strings.allLabel);

  const details = useWorkspaceDetailsSource();
  const preferences: SidebarPreferences = useMemo(
    () => ({
      grouping: settings.grouping,
      sort: settings.sort,
      titleSource: settings.titleSource,
      rowItems: settings.rowItems,
      checksDisplay: settings.checksDisplay,
      trailing: settings.trailing,
      hostFilters: settings.hostFilters,
      projectFilters: settings.projectFilters,
      labelFilter: settings.labelFilter,
      showBackground: settings.showBackground,
    }),
    [settings],
  );
  // Host badges only say something once the list spans two hosts. Plugins cannot read the app's
  // per-device host appearance nor tell which host is the desktop's own daemon, so every host
  // takes the default: its name, in the muted colour.
  const hosts = list.hosts;
  const listedHosts = list.groups.flatMap((group) => group.items.map((ref) => ref.hostId)).join("\n");
  const hostBadges = useMemo(
    () =>
      selectHostBadges({
        hosts: hosts.map((host) => ({ serverId: host.serverId, label: host.label, appearance: defaultHostAppearance() })),
        localServerId: null,
        enabled: preferences.rowItems.host && shouldShowSidebarHostLabels(listedHosts.split("\n")),
      }),
    [hosts, listedHosts, preferences.rowItems.host],
  );

  const menu = useDisplayMenuState();
  const [anchorTop, setAnchorTop] = useState(0);
  const [bounds, setBounds] = useState({ width: 0, height: 0 });
  const activeKey = active.workspace?.key ?? null;
  const clearFilters = () => update((current) => ({ ...current, labelFilter: { labels: [] }, projectFilters: [] }));

  let body: ReactNode;
  if (list.filterEmpty) {
    body = <FilterEmptyState theme={theme} onClear={clearFilters} />;
  } else if (preferences.grouping === "status") {
    body = list.statusGroups.map((group) => (
      <StatusSection
        key={group.bucket}
        bucket={group.bucket}
        rows={group.items}
        collapsed={collapsed.has(`status:${group.bucket}`)}
        onToggle={() => toggle(`status:${group.bucket}`)}
        theme={theme}
        now={now}
        activeKey={activeKey}
        navigation={navigation}
        hostBadges={hostBadges}
      />
    ));
  } else {
    // Only Recents drops projects; a cluster or All lists every one it holds.
    body = list.groups.map((group) => (
      <ProjectBlock
        key={group.key}
        title={group.title}
        items={group.items}
        pinnedKeys={list.pinnedKeys}
        busyKeys={list.busyKeys}
        theme={theme}
        now={now}
        collapsed={collapsed.has(group.key)}
        onToggle={() => toggle(group.key)}
        activeKey={activeKey}
        navigation={navigation}
        hostBadges={hostBadges}
      />
    ));
  }

  return (
    <SidebarPreferencesProvider value={preferences}>
      <WorkspaceDetailsProvider value={details}>
        <View
          style={{ flex: 1 }}
          onLayout={(event) => setBounds({ width: event.nativeEvent.layout.width, height: event.nativeEvent.layout.height })}
        >
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
          {/* The list's header line, holding the display menu as Paseo's "Workspaces" header does. */}
          <View
            onLayout={(event) => setAnchorTop(event.nativeEvent.layout.y + event.nativeEvent.layout.height)}
            style={{ flexDirection: "row", alignItems: "center", gap: 8, paddingLeft: 16, paddingRight: 8 }}
          >
            <Text numberOfLines={1} style={{ flex: 1, minWidth: 0, color: palette(theme).extraMuted, fontSize: 12 }}>
              {label}
            </Text>
            <DisplayMenuTrigger theme={theme} onPress={menu.open} />
          </View>
          <ScrollView style={{ flex: 1 }} contentContainerStyle={{ paddingHorizontal: 8, paddingTop: 2, paddingBottom: 16 }}>
            <PinnedSection rows={list.pinned} theme={theme} now={now} activeKey={activeKey} navigation={navigation} hostBadges={hostBadges} />
            {body}
            {!list.filterEmpty && list.groups.length === 0 ? (
              <Text style={{ color: c.foregroundMuted, fontSize: 14, padding: 8 }}>{strings.noWorkspaces}</Text>
            ) : null}
          </ScrollView>
          <DisplayMenuSurface
            menu={menu}
            model={{
              settings,
              update,
              sortSupported: list.sortSupported,
              hosts: list.hosts,
              projects: list.projects,
              resolvedProjectFilters: list.resolvedProjectFilters,
              labels: list.labels,
              resolvedLabelFilter: list.resolvedLabelFilter,
            }}
            theme={theme}
            compact={layout.compact}
            anchorTop={anchorTop}
            bounds={bounds}
          />
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

