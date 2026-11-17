import { type PluginSidebarViewProps, type WorkspaceRef, useWorkspace, useWorkspaces } from "@getpaseo/plugin/client";
import { Icon } from "@getpaseo/plugin/client/ui";
import { type ReactNode, createContext, useContext } from "react";
import { Pressable, Text, View } from "react-native";
import type { HostBadgeModel } from "../../shared/sidebar/host-badges";
import type { StatusBucket } from "../../shared/sidebar/status-groups";
import { normalizeCurrentBranch, resolveWorkspaceTitle } from "../../shared/sidebar/workspace-row";
import { type DropPlan, type TreeRow, rollUpBuckets, rollUpStatus } from "../../shared/sidebar/workspace-tree";
import { t } from "../web";
import { useGuardedPress } from "./drag-list";
import type { Slot } from "../../shared/sidebar/reorder";
import { useSidebarPreferences } from "./preferences";
import { StatusRing } from "./status-ring";
import { LINE, ROW_HEIGHT, TREE_GUIDE_X, TREE_INDENT, type Theme, palette } from "./theme";
import { WorkspaceRow } from "./workspace-row";

/*
 * The hand-built workspace tree of the project grouping (approved mock "Option A: indent guides"):
 * children step in 20 per level with a thin guide down from the parent's status slot, a chevron
 * after a parent's title folds its subtree, and a folded parent shows the most urgent status below
 * it and a count pill. The rules live in shared/sidebar/workspace-tree.ts.
 */

/** A project's tree for the row menu: every row (pinned ones too) and their refs. */
export interface ProjectTree {
  rows: readonly TreeRow[];
  refs: ReadonlyMap<string, WorkspaceRef>;
}

export interface WorkspaceTreeApi {
  /** The tree of the project a workspace is listed in; null outside the project grouping. */
  treeOf(key: string): ProjectTree | null;
  /** Files `ref` under `parent` (null: top level) on its host's daemon; false when that is not possible. */
  setParent(ref: WorkspaceRef, parent: WorkspaceRef | null): boolean;
}

const TreeContext = createContext<WorkspaceTreeApi | null>(null);

export const WorkspaceTreeProvider = TreeContext.Provider;

export function useWorkspaceTree(): WorkspaceTreeApi | null {
  return useContext(TreeContext);
}

/** Links never cross hosts: each daemon stores the tree of its own workspaces. */
export function sameHostOf(refs: ReadonlyMap<string, WorkspaceRef>) {
  return (child: string, parent: string) => refs.get(child)?.hostId === refs.get(parent)?.hostId;
}

/** A workspace's title as its row shows it, for menus and drag cues. */
export function useWorkspaceTitle(ref: WorkspaceRef | null | undefined): string {
  const { titleSource } = useSidebarPreferences();
  const w = useWorkspace(ref ?? "", (item) => ({ name: item.name, branch: item.branch }));
  if (!ref || !w) return "";
  return resolveWorkspaceTitle({ workspace: { name: w.name, currentBranch: normalizeCurrentBranch(w.branch) }, titleSource });
}

/** What releasing a dragged row now would do, as the rows and the overlay draw it. */
export interface TreeCue {
  /** The row under the dragged one. */
  target: string;
  /** Where the drop lands; null when it is refused outright (release snaps back). */
  plan: Exclude<DropPlan, { kind: "none" }> | null;
  /** Set when nesting onto the target is refused, with why. */
  refused: "depth" | "host" | null;
  /** The insertion line: above or below a shown row, at the level the row will land on. */
  line: { key: string; side: "before" | "after"; depth: number } | null;
  /** The "Nest under" preview: below this shown row, one level under the target. */
  ghost: { afterKey: string; depth: number } | null;
}

/** The last shown row of `key`'s subtree (itself when nothing below it shows). */
function lastShownOf(shown: readonly TreeRow[], key: string): string {
  const at = shown.findIndex((row) => row.key === key);
  if (at < 0) return key;
  let last = at;
  while (last + 1 < shown.length && shown[last + 1].depth > shown[at].depth) last += 1;
  return shown[last].key;
}

/** The cue for a plan worked out by `resolveDrop`, placed on the rows on screen. */
export function cueOf(input: {
  plan: DropPlan;
  target: string;
  shown: readonly TreeRow[];
  refused: TreeCue["refused"];
}): TreeCue {
  const { plan, target, shown, refused } = input;
  const targetRow = shown.find((row) => row.key === target);
  const depth = targetRow?.depth ?? 0;
  if (plan.kind === "none") return { target, plan: null, refused, line: null, ghost: null };
  if (plan.kind === "nest") {
    return { target, plan, refused, line: null, ghost: { afterKey: lastShownOf(shown, target), depth: depth + 1 } };
  }
  if (plan.anchor.side === "before") return { target, plan, refused, line: { key: target, side: "before", depth }, ghost: null };
  if (plan.parent === target) return { target, plan, refused, line: { key: target, side: "after", depth: depth + 1 }, ghost: null };
  return { target, plan, refused, line: { key: lastShownOf(shown, target), side: "after", depth }, ghost: null };
}

/**
 * One row of the tree: its indent, the guides of the levels it sits in, the drop cue on it, and
 * for a parent the chevron, plus the roll-up and count pill while folded.
 */
export function TreeRowView({
  row,
  reference,
  childrenShow,
  collapsed,
  onToggle,
  subtree,
  cue,
  dragging,
  theme,
  now,
  selected,
  navigation,
  hostBadge,
}: {
  row: TreeRow;
  reference: WorkspaceRef;
  /** The next row on screen is this one's child: its guide runs down from the status slot. */
  childrenShow: boolean;
  collapsed: boolean;
  onToggle: () => void;
  /** The keys below this row, for the roll-up while folded. */
  subtree: readonly string[];
  cue: TreeCue | null;
  dragging: boolean;
  theme: Theme;
  now: number;
  selected: boolean;
  navigation: PluginSidebarViewProps["navigation"];
  hostBadge: HostBadgeModel | null;
}) {
  const colors = palette(theme);
  const guarded = useGuardedPress();
  const folded = collapsed && row.childCount > 0;
  const rollUp = useSubtreeStatus(folded ? [reference.key, ...subtree] : []);
  const indent = row.depth * TREE_INDENT;
  const isTarget = cue !== null && cue.target === row.key && !dragging;
  const nestCue = isTarget && cue.plan?.kind === "nest";
  const denyCue = isTarget && cue.refused !== null;
  const guides: ReactNode[] = [];
  for (let level = 1; level <= row.depth; level += 1) {
    guides.push(
      <View
        key={level}
        pointerEvents="none"
        style={{ position: "absolute", left: (level - 1) * TREE_INDENT + TREE_GUIDE_X, top: 0, bottom: 0, width: 1, backgroundColor: colors.guide }}
      />,
    );
  }
  if (childrenShow) {
    guides.push(
      <View
        key="own"
        pointerEvents="none"
        // From under the status slot (the mock's 30 under a pointer, 34 in touch rows) to the row's end.
        style={{ position: "absolute", left: indent + TREE_GUIDE_X, top: ROW_HEIGHT === 36 ? 30 : 34, bottom: 0, width: 1, backgroundColor: colors.guide }}
      />,
    );
  }
  const chevron =
    row.childCount > 0 ? (
      <Pressable
        accessibilityRole="button"
        accessibilityState={{ expanded: !collapsed }}
        accessibilityLabel={collapsed ? t().expandSubtasks : t().collapseSubtasks}
        hitSlop={8}
        onPress={guarded(onToggle)}
        style={{ height: LINE, justifyContent: "center", marginLeft: -4, flexShrink: 0 }}
      >
        <Icon name={collapsed ? "ChevronRight" : "ChevronDown"} size={14} color="#9ca3af" />
      </Pressable>
    ) : null;
  return (
    <View style={{ position: "relative" }}>
      {guides}
      {nestCue || denyCue ? (
        <View
          pointerEvents="none"
          style={{
            position: "absolute",
            left: indent,
            right: 0,
            top: 0,
            bottom: 2,
            borderRadius: 8,
            borderWidth: 1,
            borderColor: denyCue ? colors.denyOutline : colors.nestOutline,
            backgroundColor: denyCue ? colors.denyFill : colors.nestFill,
          }}
        />
      ) : null}
      <View style={{ marginLeft: indent }}>
        <WorkspaceRow
          reference={reference}
          theme={theme}
          now={now}
          selected={selected}
          navigation={navigation}
          hostBadge={hostBadge}
          dragging={dragging}
          dimmed={dragging && cue !== null && cue.plan === null}
          titleAccessory={chevron}
          statusOverride={folded ? rollUp.status : null}
          summary={folded ? <CountPill buckets={rollUp.buckets} count={row.descendants} theme={theme} /> : null}
        />
      </View>
    </View>
  );
}

/** The statuses of a folded subtree: the one its parent shows, and the busy ones for the pill. */
function useSubtreeStatus(keys: readonly string[]): { status: StatusBucket; buckets: StatusBucket[] } {
  const wanted = new Set(keys);
  const groups = useWorkspaces({ where: (w) => wanted.size > 0 && wanted.has(w.ref.key), groupBy: (w) => w.indicator });
  const present = groups.filter((group) => group.items.length > 0).map((group) => group.key as StatusBucket);
  return { status: rollUpStatus(present), buckets: rollUpBuckets(present) };
}

/** The folded parent's pill (the mock's B-style count pill): each busy status once, then how many are below. */
function CountPill({ buckets, count, theme }: { buckets: readonly StatusBucket[]; count: number; theme: Theme }) {
  const c = theme.colors;
  return (
    <View
      accessibilityLabel={t().nestedCount(count)}
      style={{
        flexDirection: "row",
        alignItems: "center",
        gap: 4,
        height: 18,
        marginTop: 1,
        paddingHorizontal: 6,
        borderRadius: 9,
        backgroundColor: c.surface2,
      }}
    >
      {buckets.map((bucket) => (
        <PillGlyph key={bucket} bucket={bucket} theme={theme} />
      ))}
      <Text style={{ color: c.foregroundMuted, fontSize: 11, fontWeight: "500", lineHeight: 14 }}>{count}</Text>
    </View>
  );
}

function PillGlyph({ bucket, theme }: { bucket: StatusBucket; theme: Theme }) {
  const colors = palette(theme);
  if (bucket === "running") {
    return (
      <View style={{ transform: [{ scale: 0.86 }] }}>
        <StatusRing color={colors.running} />
      </View>
    );
  }
  if (bucket === "needs_input") {
    return (
      <View style={{ width: 11, height: 11, borderRadius: 6, backgroundColor: colors.warning, alignItems: "center", justifyContent: "center" }}>
        <Text style={{ color: theme.colors.surface0, fontSize: 8, fontWeight: "700", lineHeight: 11 }}>!</Text>
      </View>
    );
  }
  const color = bucket === "failed" ? colors.danger : colors.success;
  return <View style={{ width: 6, height: 6, borderRadius: 3, backgroundColor: color }} />;
}

/**
 * The drop cue drawn over the rows: the insertion line with its ring cap, the dashed "Nest under"
 * preview, and the tooltip naming a refused nest. Laid over, not between, the rows, so nothing
 * under the pointer moves while the drag measures against the rows' resting places.
 */
export function TreeDropOverlay({
  cue,
  slotOf,
  refs,
  theme,
}: {
  cue: TreeCue;
  slotOf: (key: string) => Slot | undefined;
  refs: ReadonlyMap<string, WorkspaceRef>;
  theme: Theme;
}) {
  const s = t();
  const c = theme.colors;
  const colors = palette(theme);
  const targetTitle = useWorkspaceTitle(refs.get(cue.target));
  const targetSlot = slotOf(cue.target);
  const lineSlot = cue.line ? slotOf(cue.line.key) : undefined;
  const ghostSlot = cue.ghost ? slotOf(cue.ghost.afterKey) : undefined;
  const lineY = cue.line && lineSlot ? (cue.line.side === "before" ? lineSlot.top : lineSlot.top + lineSlot.height) : null;
  const tipText = cue.refused === "depth" ? s.cantNestDeeper : cue.refused === "host" ? s.cantNestAcrossHosts : null;
  return (
    <>
      {cue.line && lineY !== null ? (
        <View
          pointerEvents="none"
          style={{
            position: "absolute",
            zIndex: 1001,
            left: cue.line.depth * TREE_INDENT + 4,
            right: 4,
            top: lineY - 2,
            height: 2,
            borderRadius: 1,
            backgroundColor: colors.nestLine,
          }}
        >
          <View
            style={{
              position: "absolute",
              left: -4,
              top: -3,
              width: 8,
              height: 8,
              borderRadius: 4,
              borderWidth: 2,
              borderColor: colors.nestLine,
              backgroundColor: c.surface0,
            }}
          />
        </View>
      ) : null}
      {cue.ghost && ghostSlot ? (
        <View
          pointerEvents="none"
          style={{
            position: "absolute",
            zIndex: 1001,
            left: cue.ghost.depth * TREE_INDENT,
            right: 0,
            top: ghostSlot.top + ghostSlot.height,
            minHeight: 36,
            borderRadius: 8,
            borderWidth: 1,
            borderStyle: "dashed",
            borderColor: colors.nestGhostBorder,
            backgroundColor: colors.nestGhostFill,
            flexDirection: "row",
            alignItems: "center",
            gap: 8,
            paddingHorizontal: 10,
          }}
        >
          <Icon name="CornerDownRight" size={13} color={colors.nestGhostText} />
          <Text numberOfLines={1} style={{ color: colors.nestGhostText, fontSize: 12, flexShrink: 1 }}>
            {s.nestUnderTarget(targetTitle)}
          </Text>
        </View>
      ) : null}
      {targetSlot && (tipText || (cue.refused && cue.plan)) ? (
        <View
          pointerEvents="none"
          style={{
            position: "absolute",
            zIndex: 1002,
            left: 20,
            top: targetSlot.top + targetSlot.height + 4,
            gap: 4,
            paddingVertical: 6,
            paddingHorizontal: 9,
            borderRadius: 8,
            borderWidth: 1,
            borderColor: c.border,
            backgroundColor: c.surface0,
            shadowColor: "#000000",
            shadowOpacity: 0.5,
            shadowRadius: 16,
            shadowOffset: { width: 0, height: 6 },
            elevation: 8,
          }}
        >
          {tipText ? (
            <View style={{ flexDirection: "row", alignItems: "center", gap: 6 }}>
              <Icon name="Ban" size={13} color={colors.danger} />
              <Text style={{ color: c.foreground, fontSize: 12, lineHeight: 16 }}>{tipText}</Text>
            </View>
          ) : null}
          {cue.plan ? (
            <View style={{ flexDirection: "row", alignItems: "center", gap: 6 }}>
              <Icon name="CornerDownRight" size={13} color={colors.nestGhostText} />
              <Text style={{ color: c.foreground, fontSize: 12, lineHeight: 16 }}>{s.dropAsSiblingOf(targetTitle)}</Text>
            </View>
          ) : null}
        </View>
      ) : null}
    </>
  );
}
