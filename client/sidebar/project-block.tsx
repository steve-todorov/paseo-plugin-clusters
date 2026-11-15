import { type PluginSidebarViewProps, type ProjectRef, type WorkspaceRef, useWorkspace } from "@getpaseo/plugin/client";
import { Icon } from "@getpaseo/plugin/client/ui";
import { type ReactNode, useState } from "react";
import { Platform, Pressable, Text, View } from "react-native";
import { selectSidebarGroupVisibility } from "../../shared/sidebar/group-visibility";
import type { HostBadgeModel } from "../../shared/sidebar/host-badges";
import { type ProjectGroup, iconPlacementOf, newWorkspacePlacementOf } from "../../shared/sidebar/project-groups";
import { t } from "../web";
import { type DragHandleProps, DragList, useGuardedPress } from "./drag-list";
import { GhostRow } from "./ghost-row";
import { ProjectIcon, useProjectIconData } from "./project-icon";
import { projectRefOf } from "./project-grouping";
import { LINE, ROW_HEIGHT, type Theme, draggingRowStyle, palette } from "./theme";
import { WorkspaceRow, useHover } from "./workspace-row";

/*
 * A project of Paseo's "Project" grouping (components/sidebar-workspace-list.tsx `ProjectBlock`,
 * v0.16): its row, then its unpinned workspaces, 7 plus whatever is not done until "Show more".
 */

type HostBadges = ReadonlyMap<string, HostBadgeModel>;

export interface ProjectBlockProps {
  /** The group's key (Paseo's project view key), which its lettered icon is coloured by. */
  groupKey: string;
  title: string;
  /** The group's projects per host; null while their host's project list is unread. */
  group: ProjectGroup | null;
  /** The host a new workspace goes to when the group is on it (Paseo's active host). */
  preferredHostId: string | null;
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
  /** Workspaces that are not done; they never hide behind "Show more". */
  busyKeys: ReadonlySet<string>;
  /** The project row is lifted by a drag. */
  dragging?: boolean;
  /** Set when the project can be dragged: goes on its row only, as Paseo's drag handle. */
  handle?: DragHandleProps;
  /** Set under the Manual sort: the workspaces can be dragged, and a drop hands their new order here. */
  onReorderWorkspaces?: (keys: string[]) => void;
}

export function ProjectBlock({
  groupKey,
  title,
  group,
  preferredHostId,
  items,
  pinnedKeys,
  theme,
  now,
  collapsed,
  onToggle,
  activeKey,
  navigation,
  hostBadges,
  busyKeys,
  dragging = false,
  handle,
  onReorderWorkspaces,
}: ProjectBlockProps) {
  const [expanded, setExpanded] = useState(false);
  const head = useWorkspace(items[0], (w) => ({
    hostId: w.hostId,
    projectId: w.projectId,
    project: w.project,
    git: w.projectKind === "git",
  }));
  if (!head) return null;
  const rows = items.filter((ref) => !pinnedKeys.has(ref.key));
  // As Paseo: the icon is the first host's with a root, "+" makes the workspace on the preferred host
  // if it can take one, else on the first that can. Before the project list is read, the head's.
  const iconPlacement = group ? iconPlacementOf(group) : null;
  const iconProject = iconPlacement ? projectRefOf(iconPlacement) : head.project;
  const target = group ? newWorkspacePlacementOf(group, preferredHostId) : null;
  const project = group ? (target ? projectRefOf(target) : null) : head.git ? head.project : null;
  let children: ReactNode = null;
  if (!collapsed) {
    if (rows.length > 0) {
      const { leadingItem, visibleItems, canToggle } = selectSidebarGroupVisibility({
        items: rows,
        expanded,
        policy: { kind: "workspaces", isDone: (ref) => !busyKeys.has(ref.key) },
        isOpen: (ref) => ref.key === activeKey,
      });
      const renderRow = (ref: WorkspaceRef, rowDragging = false) => (
        <WorkspaceRow
          key={ref.key}
          reference={ref}
          theme={theme}
          now={now}
          selected={ref.key === activeKey}
          navigation={navigation}
          hostBadge={hostBadges.get(ref.hostId) ?? null}
          dragging={rowDragging}
        />
      );
      children = (
        <>
          {/* The open workspace shown past the limit stays put, outside the draggable rows. */}
          {leadingItem ? renderRow(leadingItem) : null}
          {onReorderWorkspaces ? (
            <DragList
              items={visibleItems}
              keyOf={(ref) => ref.key}
              enabled
              onReorder={(reordered) => onReorderWorkspaces(reordered.map((ref) => ref.key))}
              renderItem={(ref, state) => <View {...state.handle}>{renderRow(ref, state.dragging)}</View>}
            />
          ) : (
            visibleItems.map((ref) => renderRow(ref))
          )}
          {canToggle ? (
            <GhostRow
              icon={expanded ? "ChevronUp" : "ChevronDown"}
              label={expanded ? t().showLess : t().showMore}
              onPress={() => setExpanded((value) => !value)}
              theme={theme}
            />
          ) : null}
        </>
      );
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
        colorKey={groupKey}
        collapsed={collapsed}
        onToggle={onToggle}
        projectRef={iconProject}
        project={project}
        navigation={navigation}
        dragging={dragging}
        handle={handle}
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
  dragging,
  handle,
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
  dragging: boolean;
  handle: DragHandleProps | undefined;
}) {
  const c = theme.colors;
  const colors = palette(theme);
  const hover = useHover();
  const plusHover = useHover();
  const icon = useProjectIconData(projectRef);
  const guarded = useGuardedPress();
  // Touch clients have no hover, so their actions always show, as in Paseo.
  const actionsVisible = hover.hovered || Platform.OS !== "web";
  return (
    <View {...handle}>
      <Pressable
        accessibilityRole="button"
        accessibilityState={{ expanded: !collapsed }}
        accessibilityLabel={title}
        onPress={guarded(onToggle)}
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
          backgroundColor: "transparent",
          ...(dragging ? draggingRowStyle(theme) : null),
          ...(hover.hovered ? { backgroundColor: colors.hover } : null),
          ...(pressed ? { backgroundColor: c.surface2 } : null),
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
            onPress={guarded(() => navigation.openProject(project))}
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
    </View>
  );
}
