import { type PluginSidebarViewProps, type WorkspaceRef, useWorkspace } from "@getpaseo/plugin/client";
import { Icon } from "@getpaseo/plugin/client/ui";
import { type ReactNode, useEffect, useState } from "react";
import { Platform, Pressable, Text, View } from "react-native";
import { nextRowHover } from "../../shared/sidebar/row-hover";
import { inlineRenameAfterTitle } from "../../shared/sidebar/workspace-actions";
import type { HostBadgeModel } from "../../shared/sidebar/host-badges";
import { selectWorkspaceServiceSummary } from "../../shared/sidebar/service-summary";
import { normalizeCurrentBranch, resolveWorkspaceTitle } from "../../shared/sidebar/workspace-row";
import { useWorkspaceDetail } from "../workspace-details";
import { useGuardedPress, useSuspendDrag } from "./drag-list";
import { useWorkspaceLabels } from "./labels";
import { WorkspaceMetaRow } from "./meta-row";
import { useSidebarPreferences } from "./preferences";
import { PROGRESS_BAR_SPACE, ProgressPills, ProgressUnderline } from "./progress-bar";
import { useRowProgress } from "./progress";
import { type RowProgress, showsProgressBar } from "../../shared/sidebar/progress-bar";
import { ProjectStatusIndicator } from "./project-icon";
import { leadingProjectOf, useProjectGrouping } from "./project-grouping";
import { StatusRing } from "./status-ring";
import { LINE, ROW_HEIGHT, type Theme, draggingRowStyle, palette } from "./theme";
import { InlineTitleField, WorkspaceTrailingSlot } from "./row-actions";
import { useWorkspaceActions } from "./workspace-actions";

/*
 * A workspace row of Paseo's default sidebar (components/sidebar-workspace-list.tsx and
 * sidebar/sidebar-workspace-row-content.tsx, v0.16).
 */

/** Touch clients get no service on the meta row, as in Paseo. */
const IS_DESKTOP = Platform.OS === "web";

/** Hover state for web; touch clients never hover. */
export function useHover() {
  const [hovered, setHovered] = useState(false);
  return { hovered, onHoverIn: () => setHovered(true), onHoverOut: () => setHovered(false) };
}

type PointerLike = { nativeEvent: { pointerType?: string | null } };

/**
 * Hover for a row that holds its own buttons. On web it comes from `pointerenter`/`pointerleave`
 * on the row, which the pointer moving onto a button does not end; Pressable's own hover would end
 * there (react-native-web's `contain`) and take the buttons away from under the pointer. Spread
 * `rowProps` on the row. Other platforms keep Pressable's hover, as before.
 */
export function useRowHover() {
  const [hovered, setHovered] = useState(false);
  const on = (kind: "enter" | "leave") => (event: PointerLike) =>
    setHovered((current) => nextRowHover(current, { kind, pointerType: event.nativeEvent?.pointerType }));
  const rowProps = IS_DESKTOP
    ? { onPointerEnter: on("enter"), onPointerLeave: on("leave") }
    : { onHoverIn: () => setHovered(true), onHoverOut: () => setHovered(false) };
  return { hovered, rowProps };
}

export function WorkspaceRow({
  reference,
  theme,
  now,
  selected,
  navigation,
  hostBadge,
  hoisted = false,
  leadingName = "group",
  indented = false,
  dragging = false,
  titleAccessory = null,
  summary = null,
  statusOverride = null,
  progressOverride,
  dimmed = false,
}: {
  reference: WorkspaceRef;
  theme: Theme;
  now: number;
  selected: boolean;
  navigation: PluginSidebarViewProps["navigation"];
  hostBadge: HostBadgeModel | null;
  /** A row no project row contains (a pinned one): its project's icon leads and the meta row names it. */
  hoisted?: boolean;
  /**
   * The name a hoisted row gives its project: its group's, as Paseo's pinned rows do, or the
   * project's own, as its status rows do.
   */
  leadingName?: "group" | "project";
  /** Under a status header, which the row steps in from (`rowIndented`); elsewhere it sits flush. */
  indented?: boolean;
  /** Lifted by a drag. */
  dragging?: boolean;
  /** Drawn right after the title (a tree parent's chevron); the title then only takes its own width. */
  titleAccessory?: ReactNode;
  /** Drawn before the trailing slot (a collapsed tree parent's count pill). */
  summary?: ReactNode;
  /** Shown in the status slot instead of the row's own (a collapsed tree parent's roll-up). */
  statusOverride?: string | null;
  /** Drawn instead of the row's own Progress run (a collapsed tree parent's roll-up). */
  progressOverride?: RowProgress | null;
  /** Lifted over a drop that is refused: the content fades, as the mock's denied row. */
  dimmed?: boolean;
}) {
  const w = useWorkspace(reference, (item) => ({
    name: item.name,
    indicator: item.indicator,
    branch: item.branch,
    labels: item.labels,
    diffStat: item.diffStat,
    statusEnteredAt: item.statusEnteredAt,
    project: item.project,
    projectName: item.projectDisplayName,
    projectId: item.projectId,
    title: item.title,
    kind: item.kind,
  }));
  // Change request, checks and services are not in the plugin snapshot; they come from the host's
  // own workspace directory and fill in once it has listed this workspace.
  const detail = useWorkspaceDetail(reference);
  const { titleSource, trailing } = useSidebarPreferences();
  const hover = useRowHover();
  const ownProgress = useRowProgress(reference.key);
  const progress = progressOverride !== undefined ? progressOverride : ownProgress;
  const labels = useWorkspaceLabels(reference.hostId, w?.labels);
  const guarded = useGuardedPress();
  const grouping = useProjectGrouping();
  const actions = useWorkspaceActions();
  const session = actions?.rename?.key === reference.key ? actions.rename : null;
  // While renamed in place the row stops pressing, hovering and dragging, as Paseo's does.
  const editing = session !== null;
  useSuspendDrag(editing);
  const currentTitle = w?.title ?? null;
  useEffect(() => {
    if (!session || !actions) return;
    const next = inlineRenameAfterTitle(session, currentTitle);
    if (next !== session) actions.setInlineRename(next);
  }, [session, currentTitle, actions]);
  if (!w) return null;
  const c = theme.colors;
  const colors = palette(theme);
  const currentBranch = detail ? detail.currentBranch : normalizeCurrentBranch(w.branch);
  const title = resolveWorkspaceTitle({ workspace: { name: w.name, currentBranch }, titleSource });
  const hovered = hover.hovered && !editing;
  const fill = selected ? colors.selected : hovered ? colors.hover : null;
  const leading = leadingProjectOf(grouping, { ...w, hostId: reference.hostId }, leadingName);
  const pills = <ProgressPills progress={progress} theme={theme} />;
  const hasPills = progress !== null && (progress.questions > 0 || progress.stuck);
  // No bar (and no extra height) under 2 tickets; a folded parent counts its whole subtree.
  const hasBar = showsProgressBar(progress);
  // The chevron and the pills sit right after the title; the title then only takes its own width.
  const afterTitle =
    titleAccessory || hasPills ? (
      <>
        {titleAccessory}
        {hasPills ? pills : null}
      </>
    ) : null;
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={{ selected }}
      accessibilityLabel={title}
      onPress={editing ? undefined : guarded(() => navigation.openWorkspace(reference))}
      {...hover.rowProps}
      style={({ pressed }) => ({
        minHeight: ROW_HEIGHT,
        marginBottom: 2,
        paddingVertical: 8,
        // The underline takes 3 more below the content, as the mock's 11.
        ...(hasBar ? { paddingBottom: 8 + PROGRESS_BAR_SPACE } : null),
        paddingLeft: indented ? 16 : 8,
        paddingRight: 12,
        borderRadius: 8,
        justifyContent: "center",
        backgroundColor: pressed ? c.surface2 : (fill ?? "transparent"),
        // Paseo lays the dragging style over hover and selection, under pressed.
        ...(dragging ? draggingRowStyle(theme) : null),
        ...(pressed ? { backgroundColor: c.surface2 } : null),
      })}
    >
      <View style={{ flexDirection: "row", alignItems: "flex-start", gap: 8, width: "100%", opacity: dimmed ? 0.45 : 1 }}>
        {hoisted ? (
          <ProjectStatusIndicator
            project={leading.project}
            displayName={leading.name}
            colorKey={leading.colorKey}
            indicator={w.indicator}
            // The sidebar's own ground is not in the plugin theme; the base surface stands in.
            backdrop={fill ?? c.surface0}
            theme={theme}
          />
        ) : (
          <StatusIndicator indicator={statusOverride ?? w.indicator} kind={w.kind} theme={theme} />
        )}
        <View style={{ flex: 1, minWidth: 0 }}>
          <View style={{ flexDirection: "row", alignItems: "flex-start", justifyContent: "space-between", gap: 8 }}>
            {session && actions ? (
              <InlineTitleField
                key={session.key}
                initialValue={session.initialValue}
                placeholder={w.name}
                readOnly={session.phase !== "editing"}
                theme={theme}
                onCommit={(text) => actions.commitInlineRename(reference, text, currentTitle)}
                onCancel={actions.cancelInlineRename}
              />
            ) : (
              <>
                <Text
                  numberOfLines={1}
                  style={{
                    ...(afterTitle ? { flexShrink: 1 } : { flex: 1 }),
                    minWidth: 0,
                    color: c.foreground,
                    fontSize: 14,
                    fontWeight: "400",
                    lineHeight: LINE,
                    opacity: hovered ? 1 : 0.76,
                  }}
                >
                  {title}
                </Text>
                {afterTitle ? (
                  <>
                    {afterTitle}
                    <View style={{ flex: 1 }} />
                  </>
                ) : null}
              </>
            )}
            <View style={{ flexDirection: "row", alignItems: "flex-start", gap: 8, flexShrink: 0 }}>
              {summary}
              <WorkspaceTrailingSlot
                reference={reference}
                workspace={w}
                detail={detail}
                trailing={trailing}
                theme={theme}
                now={now}
                hovered={hovered}
                backdrop={fill}
                actions={editing ? null : actions}
              />
            </View>
          </View>
          <WorkspaceMetaRow
            theme={theme}
            currentBranch={currentBranch}
            projectName={hoisted ? leading.name : null}
            hostBadge={hostBadge}
            prHint={detail?.prHint ?? null}
            serviceSummary={IS_DESKTOP && detail ? selectWorkspaceServiceSummary(detail.scripts) : null}
            labels={labels}
          />
          {hasBar && progress ? <ProgressUnderline progress={progress} theme={theme} selected={selected} /> : null}
        </View>
      </View>
    </Pressable>
  );
}

/** The 16×20 status slot of a workspace row, per status, as Paseo draws it. */
export function StatusIndicator({ indicator, kind, theme }: { indicator: string; kind: string; theme: Theme }) {
  const colors = palette(theme);
  const dot = (color: string, opacity = 1) => <View style={{ width: 6, height: 6, borderRadius: 3, backgroundColor: color, opacity }} />;
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
