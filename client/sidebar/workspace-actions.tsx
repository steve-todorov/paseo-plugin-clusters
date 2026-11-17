import { type WorkspaceRef, getPaseoClient, useWorkspace } from "@getpaseo/plugin/client";
import { Icon, Modal, ScrollView, TextInput, copyText, useToast } from "@getpaseo/plugin/client/ui";
import { useQueryClient } from "@tanstack/react-query";
import { type ReactNode, type RefObject, createContext, useCallback, useContext, useMemo, useRef, useState } from "react";
import { Platform, Pressable, Text, View } from "react-native";
import type { Strings } from "../../shared/i18n";
import { normalizeWorkspaceLabelName, workspaceLabelKey } from "../../shared/sidebar/labels";
import {
  type ArchiveWarningLabels,
  type InlineRename,
  MENU_EDGE,
  type Rect,
  archiveNeedsConfirmation,
  placeMenu,
  renameInitialValue,
  renameSubmission,
} from "../../shared/sidebar/workspace-actions";
import { identityColor } from "../../shared/sidebar/identity-colors";
import { eligibleParents, moveOutParent } from "../../shared/sidebar/workspace-tree";
import { useWorkspaceDetail } from "../workspace-details";
import { t } from "../web";
import { MenuItem, MenuPageHeader, MenuSeparator, OPTION_ICON_SIZE } from "./display-menu/rows";
import { useWorkspaceLabelCatalog } from "./labels";
import type { Theme } from "./theme";
import { sameHostOf, useWorkspaceTitle, useWorkspaceTree } from "./workspace-tree";

/*
 * A workspace row's actions, as Paseo's default sidebar offers them (components/sidebar/
 * sidebar-workspace-menu.tsx, workspace-rename/, workspace/use-workspace-archive.ts and
 * workspace-labels/picker.tsx, v0.16). Only the actions whose daemon request the plugin's PaseoApi
 * sends too are here, so this view and the default one never disagree:
 * - Rename: `setWorkspaceTitle`; Pin/Unpin: `setWorkspacePinned`; Labels: `setWorkspaceLabel`;
 *   Archive: `archiveWorkspace`. Copy path and branch name touch no state.
 * - Left out: Mark as read/unread (`clearWorkspaceAttention` / `markWorkspaceUnread` are not in
 *   PaseoApi), Open in file manager (the desktop shell's), and the archive's Undo
 *   (`undoWorkspaceArchive` is not in PaseoApi).
 * The menu opens as a popover by its kebab on wide layouts and as a bottom sheet on compact ones,
 * like the display menu. In the project grouping it also files the row in the Clusters view's
 * workspace tree ("Nest under…", "Move out of"), the touch way to do what a drag does.
 */

/** Paseo's workspace menu width. */
const MENU_WIDTH = 260;

/** What archiving needs to know to warn before it, read off the row that asks. */
export interface ArchiveTarget {
  ref: WorkspaceRef;
  kind: string;
  name: string;
  diffStat: { additions: number; deletions: number } | null;
  isDirty: boolean | null;
  aheadOfOrigin: number | null;
}

type MenuPage = "root" | "labels" | "createLabel" | "nest";

interface OpenMenu {
  ref: WorkspaceRef;
  /** The kebab, in the view's coordinates; null when it could not be measured. */
  anchor: Rect | null;
  stack: MenuPage[];
}

export interface WorkspaceActions {
  /** Paseo's touch rule: a native client or a compact layout. Its kebab always shows. */
  touch: boolean;
  /** Renames happen in place on wide web layouts and in a dialog elsewhere, as in Paseo. */
  inlineRename: boolean;
  /** The row whose menu is open, which keeps its kebab while the pointer is on the menu. */
  menuKey: string | null;
  rename: InlineRename | null;
  archiving: ReadonlySet<string>;
  openMenu(ref: WorkspaceRef, trigger: View | null): void;
  archive(target: ArchiveTarget): void;
  /** Sends the typed title of an in-place rename, or closes it when nothing changed. */
  commitInlineRename(ref: WorkspaceRef, text: string, currentTitle: string | null): void;
  cancelInlineRename(): void;
  /** Hands the row's latest title to the in-place rename, which ends once it shows. */
  setInlineRename(next: InlineRename | null): void;
}

const ActionsContext = createContext<WorkspaceActions | null>(null);

export function useWorkspaceActions(): WorkspaceActions | null {
  return useContext(ActionsContext);
}

function archiveLabels(s: Strings): ArchiveWarningLabels {
  return {
    uncommittedChanges: s.uncommittedChanges,
    uncommittedChangesWithDiff: s.uncommittedChangesWithDiff,
    addedLines: s.addedLines,
    deletedLines: s.deletedLines,
    unpushedCommits: s.unpushedCommits,
  };
}

function handleOf(ref: WorkspaceRef) {
  return getPaseoClient(ref.hostId).workspaces.ref(ref.id);
}

function messageOf(error: unknown, fallback: string): string {
  return error instanceof Error && error.message ? error.message : fallback;
}

/** One request per workspace at a time, as Paseo guards its pin toggle across every menu. */
const pendingPins = new Set<string>();

/**
 * The view's side: provide `value` and render `surface` last in the view, over the list. `rootRef`
 * is the view's outer View, which the popover is placed in.
 */
export function useWorkspaceActionsHost({
  compact,
  rootRef,
  bounds,
  theme,
}: {
  compact: boolean;
  rootRef: RefObject<View | null>;
  bounds: { width: number; height: number };
  theme: Theme;
}): { value: WorkspaceActions; surface: ReactNode } {
  const toast = useToast();
  const [menu, setMenu] = useState<OpenMenu | null>(null);
  const [rename, setRename] = useState<InlineRename | null>(null);
  const [dialogRename, setDialogRename] = useState<WorkspaceRef | null>(null);
  const [confirm, setConfirm] = useState<{ target: ArchiveTarget; reasons: string[] } | null>(null);
  const [archiving, setArchiving] = useState<ReadonlySet<string>>(new Set());
  const touch = Platform.OS !== "web" || compact;
  const inlineRename = Platform.OS === "web" && !compact;

  const runArchive = useCallback(
    (ref: WorkspaceRef) => {
      setArchiving((current) => new Set(current).add(ref.key));
      const done = () =>
        setArchiving((current) => {
          const next = new Set(current);
          next.delete(ref.key);
          return next;
        });
      Promise.resolve()
        .then(() => handleOf(ref).archive())
        .then(done, (error: unknown) => {
          done();
          toast.error(messageOf(error, t().archiveFailed));
        });
    },
    [toast],
  );

  const archive = useCallback(
    (target: ArchiveTarget) => {
      if (archiving.has(target.ref.key)) return;
      const reasons = archiveNeedsConfirmation(target.kind, target, archiveLabels(t()));
      if (reasons) setConfirm({ target, reasons });
      else runArchive(target.ref);
    },
    [archiving, runArchive],
  );

  const openMenu = useCallback((ref: WorkspaceRef, trigger: View | null) => {
    const root = rootRef.current;
    if (!trigger || !root) {
      setMenu({ ref, anchor: null, stack: ["root"] });
      return;
    }
    // Both in window coordinates, so their difference is the kebab's place in the view.
    root.measureInWindow((rootX, rootY) => {
      trigger.measureInWindow((x, y, width, height) => {
        setMenu({ ref, anchor: { x: x - rootX, y: y - rootY, width, height }, stack: ["root"] });
      });
    });
  }, [rootRef]);

  // The session as of the last render, so a commit reads it without a side effect in an updater.
  const renameRef = useRef(rename);
  renameRef.current = rename;
  const commitInlineRename = useCallback(
    (ref: WorkspaceRef, text: string, currentTitle: string | null) => {
      const session = renameRef.current;
      if (!session || session.key !== ref.key || session.phase !== "editing") return;
      const title = renameSubmission(text, session.initialValue);
      if (title === null) {
        setRename(null);
        return;
      }
      setRename({ phase: "saving", key: ref.key, initialValue: session.initialValue, titleSeen: currentTitle });
      Promise.resolve()
        .then(() => handleOf(ref).setTitle(title))
        .then(
          (accepted) =>
            setRename((previous) =>
              previous?.key === ref.key && previous.phase === "saving" ? { ...previous, phase: "saved", acceptedTitle: accepted.title } : previous,
            ),
          (error: unknown) => {
            setRename((previous) => (previous?.key === ref.key ? null : previous));
            toast.error(messageOf(error, String(error)));
          },
        );
    },
    [toast],
  );

  const value = useMemo<WorkspaceActions>(
    () => ({
      touch,
      inlineRename,
      menuKey: menu?.ref.key ?? null,
      rename,
      archiving,
      openMenu,
      archive,
      commitInlineRename,
      cancelInlineRename: () => setRename(null),
      setInlineRename: setRename,
    }),
    [touch, inlineRename, menu, rename, archiving, openMenu, archive, commitInlineRename],
  );

  const close = () => setMenu(null);
  const surface = (
    <>
      {menu ? (
        <MenuSurface
          menu={menu}
          setMenu={setMenu}
          compact={compact}
          bounds={bounds}
          theme={theme}
          archiving={archiving}
          onClose={close}
          onRename={(ref, initialValue) => {
            close();
            if (inlineRename) setRename({ phase: "editing", key: ref.key, initialValue });
            else setDialogRename(ref);
          }}
          onArchive={(target) => {
            close();
            archive(target);
          }}
        />
      ) : null}
      {dialogRename ? <RenameDialog reference={dialogRename} theme={theme} onClose={() => setDialogRename(null)} /> : null}
      {confirm ? (
        <ArchiveConfirmDialog
          name={confirm.target.name}
          reasons={confirm.reasons}
          theme={theme}
          onCancel={() => setConfirm(null)}
          onConfirm={() => {
            setConfirm(null);
            runArchive(confirm.target.ref);
          }}
        />
      ) : null}
    </>
  );

  return { value, surface };
}

export const WorkspaceActionsProvider = ActionsContext.Provider;

function MenuSurface({
  menu,
  setMenu,
  compact,
  bounds,
  theme,
  archiving,
  onClose,
  onRename,
  onArchive,
}: {
  menu: OpenMenu;
  setMenu: (update: (current: OpenMenu | null) => OpenMenu | null) => void;
  compact: boolean;
  bounds: { width: number; height: number };
  theme: Theme;
  archiving: ReadonlySet<string>;
  onClose: () => void;
  onRename: (ref: WorkspaceRef, initialValue: string) => void;
  onArchive: (target: ArchiveTarget) => void;
}) {
  const s = t();
  const page = menu.stack[menu.stack.length - 1] ?? "root";
  const nav = {
    open: (next: MenuPage) => setMenu((current) => (current ? { ...current, stack: [...current.stack, next] } : current)),
    back: () => setMenu((current) => (current ? { ...current, stack: current.stack.slice(0, -1) } : current)),
  };
  const body = (
    <>
      {page === "root" ? null : (
        <MenuPageHeader
          theme={theme}
          title={page === "labels" ? s.labelsTitle : page === "nest" ? s.nestUnderTitle : s.createLabel}
          onBack={nav.back}
        />
      )}
      <View style={{ paddingVertical: 4 }}>
        {page === "root" ? (
          <RootPage reference={menu.ref} theme={theme} archiving={archiving} onClose={onClose} onOpen={nav.open} onRename={onRename} onArchive={onArchive} />
        ) : page === "labels" ? (
          <LabelsPage reference={menu.ref} theme={theme} onCreate={() => nav.open("createLabel")} />
        ) : page === "nest" ? (
          <NestPage reference={menu.ref} theme={theme} onClose={onClose} />
        ) : (
          <CreateLabelPage reference={menu.ref} theme={theme} onDone={nav.back} />
        )}
      </View>
    </>
  );

  if (compact) {
    return (
      <Modal title={s.workspaceMenu} open onOpenChange={(open) => (open ? undefined : onClose())}>
        <Modal.Content contentContainerStyle={{ padding: 0, gap: 0 }}>{body}</Modal.Content>
      </Modal>
    );
  }

  const c = theme.colors;
  const placed = menu.anchor
    ? placeMenu({ anchor: menu.anchor, bounds, width: MENU_WIDTH })
    : { top: MENU_EDGE, right: MENU_EDGE, width: Math.min(MENU_WIDTH, bounds.width - 2 * MENU_EDGE), maxHeight: bounds.height - 2 * MENU_EDGE };
  return (
    <View style={{ position: "absolute", top: 0, left: 0, right: 0, bottom: 0 }} pointerEvents="box-none">
      {/* A press anywhere outside the menu closes it, as the app's overlay does. */}
      <Pressable accessible={false} onPress={onClose} style={{ position: "absolute", top: 0, left: 0, right: 0, bottom: 0 }} />
      <View
        accessibilityRole="menu"
        accessibilityLabel={s.workspaceMenu}
        style={{
          position: "absolute",
          ...placed,
          backgroundColor: c.surface1,
          borderWidth: 1,
          borderColor: c.border,
          borderRadius: 8,
          overflow: "hidden",
          shadowColor: "#000000",
          shadowOpacity: 0.12,
          shadowRadius: 12,
          shadowOffset: { width: 0, height: 4 },
          elevation: 6,
        }}
      >
        <ScrollView style={{ flexGrow: 0 }} contentContainerStyle={{ paddingTop: page === "root" ? 0 : 4 }} keyboardShouldPersistTaps="handled">
          {body}
        </ScrollView>
      </View>
    </View>
  );
}

function MenuIcon({ name, theme }: { name: string; theme: Theme }) {
  return <Icon name={name} size={OPTION_ICON_SIZE} color={theme.colors.foregroundMuted} />;
}

function RootPage({
  reference,
  theme,
  archiving,
  onClose,
  onOpen,
  onRename,
  onArchive,
}: {
  reference: WorkspaceRef;
  theme: Theme;
  archiving: ReadonlySet<string>;
  onClose: () => void;
  onOpen: (page: MenuPage) => void;
  onRename: (ref: WorkspaceRef, initialValue: string) => void;
  onArchive: (target: ArchiveTarget) => void;
}) {
  const s = t();
  const toast = useToast();
  const w = useWorkspace(reference, (item) => ({
    name: item.name,
    title: item.title,
    directory: item.directory,
    git: item.projectKind === "git",
    branch: item.branch,
    pinned: item.pinnedAt !== null,
    kind: item.kind,
    diffStat: item.diffStat,
    archivingAt: item.archivingAt,
  }));
  const detail = useWorkspaceDetail(reference);
  const tree = useWorkspaceTree();
  const project = tree?.treeOf(reference.key) ?? null;
  const parentKey = project?.rows.find((row) => row.key === reference.key)?.parent ?? null;
  const parentTitle = useWorkspaceTitle(parentKey ? project?.refs.get(parentKey) : null);
  if (!w) return null;
  const branch = detail ? detail.currentBranch : w.branch;
  const canNest = project !== null && eligibleParents(project.rows, reference.key, sameHostOf(project.refs)).length > 0;
  const outTo = project ? moveOutParent(project.rows, reference.key) : undefined;
  const moveOut = () => {
    onClose();
    if (!tree || !project || outTo === undefined) return;
    const target = outTo === null ? null : (project.refs.get(outTo) ?? null);
    if (!tree.setParent(reference, target)) toast.error(s.treeUnavailable);
  };
  const isArchiving = w.archivingAt !== null || archiving.has(reference.key);

  const copy = (text: string, done: string) => {
    onClose();
    copyText(text).then(
      () => toast.show(done, { variant: "success" }),
      (error: unknown) => toast.error(messageOf(error, String(error))),
    );
  };
  const togglePin = () => {
    onClose();
    if (pendingPins.has(reference.key)) return;
    pendingPins.add(reference.key);
    Promise.resolve()
      .then(() => handleOf(reference).setPinned(!w.pinned))
      .catch((error: unknown) => toast.error(messageOf(error, String(error))))
      .finally(() => pendingPins.delete(reference.key));
  };

  return (
    <>
      <MenuItem
        theme={theme}
        label={s.copyPath}
        leading={<MenuIcon name="Copy" theme={theme} />}
        onPress={() => {
          if (!w.directory) {
            onClose();
            toast.error(s.workspacePathUnavailable);
          } else copy(w.directory, s.pathCopied);
        }}
      />
      {w.git ? (
        <MenuItem
          theme={theme}
          label={s.copyBranchName}
          leading={<MenuIcon name="Copy" theme={theme} />}
          onPress={() => (branch ? copy(branch, s.branchNameCopied) : onClose())}
        />
      ) : null}
      <MenuItem
        theme={theme}
        label={s.renameWorkspace}
        leading={<MenuIcon name="Pencil" theme={theme} />}
        onPress={() => onRename(reference, renameInitialValue(w))}
      />
      <MenuItem
        theme={theme}
        label={w.pinned ? s.unpin : s.pinToTop}
        leading={<MenuIcon name={w.pinned ? "PinOff" : "Pin"} theme={theme} />}
        onPress={togglePin}
      />
      <MenuItem
        theme={theme}
        label={s.labelsTitle}
        leading={<MenuIcon name="Tag" theme={theme} />}
        trailing={<Icon name="ChevronRight" size={14} color={theme.colors.foregroundMuted} />}
        onPress={() => onOpen("labels")}
      />
      {project && (canNest || outTo !== undefined) ? (
        <>
          <MenuSeparator theme={theme} />
          {canNest ? (
            <MenuItem
              theme={theme}
              label={s.nestUnder}
              leading={<MenuIcon name="ListTree" theme={theme} />}
              trailing={<Icon name="ChevronRight" size={14} color={theme.colors.foregroundMuted} />}
              onPress={() => onOpen("nest")}
            />
          ) : null}
          {outTo !== undefined ? (
            <MenuItem theme={theme} label={s.moveOutOf(parentTitle)} leading={<MenuIcon name="CornerLeftUp" theme={theme} />} onPress={moveOut} />
          ) : null}
          <MenuSeparator theme={theme} />
        </>
      ) : null}
      <MenuItem
        theme={theme}
        label={isArchiving ? s.archiving : s.archive}
        leading={<MenuIcon name="Archive" theme={theme} />}
        disabled={isArchiving}
        onPress={() =>
          onArchive({
            ref: reference,
            kind: w.kind,
            name: w.name,
            diffStat: w.diffStat,
            isDirty: detail?.isDirty ?? null,
            aheadOfOrigin: detail?.aheadOfOrigin ?? null,
          })
        }
      />
    </>
  );
}

/** The rows of the project this workspace may go under, depth-checked; a press files it and closes. */
function NestPage({ reference, theme, onClose }: { reference: WorkspaceRef; theme: Theme; onClose: () => void }) {
  const s = t();
  const toast = useToast();
  const tree = useWorkspaceTree();
  const project = tree?.treeOf(reference.key) ?? null;
  const candidates = project ? eligibleParents(project.rows, reference.key, sameHostOf(project.refs)) : [];
  const pick = (parent: WorkspaceRef) => {
    onClose();
    if (tree && !tree.setParent(reference, parent)) toast.error(s.treeUnavailable);
  };
  if (!project || candidates.length === 0) return <MenuHint theme={theme}>{s.noNestTargets}</MenuHint>;
  return (
    <>
      {candidates.map((key) => {
        const ref = project.refs.get(key);
        const depth = project.rows.find((row) => row.key === key)?.depth ?? 0;
        return ref ? <NestTarget key={key} reference={ref} depth={depth} theme={theme} onPress={() => pick(ref)} /> : null;
      })}
    </>
  );
}

/** One parent to pick, stepped in by its level so the list reads like the tree. */
function NestTarget({ reference, depth, theme, onPress }: { reference: WorkspaceRef; depth: number; theme: Theme; onPress: () => void }) {
  const title = useWorkspaceTitle(reference);
  return (
    <View style={{ paddingLeft: depth * 12 }}>
      <MenuItem theme={theme} label={title} leading={depth > 0 ? <MenuIcon name="CornerDownRight" theme={theme} /> : null} onPress={onPress} />
    </View>
  );
}

/** The catalog query the rows share, refetched after a change that may have added a label. */
function useRefreshCatalog(hostId: string) {
  const client = useQueryClient();
  return () => void client.invalidateQueries({ queryKey: ["paseo-clusters", "workspaceLabels", hostId] });
}

function MenuHint({ theme, children }: { theme: Theme; children: string }) {
  return <Text style={{ paddingHorizontal: 12, paddingVertical: 6, fontSize: 12, color: theme.colors.foregroundMuted }}>{children}</Text>;
}

/**
 * Every label on the host, the workspace's own ticked. A press toggles and the menu stays, as
 * Paseo's picker does; the tick follows the workspace as the daemon reports it.
 */
function LabelsPage({ reference, theme, onCreate }: { reference: WorkspaceRef; theme: Theme; onCreate: () => void }) {
  const s = t();
  const assigned = useWorkspace(reference, (item) => item.labels);
  const catalog = useWorkspaceLabelCatalog(reference.hostId);
  const refresh = useRefreshCatalog(reference.hostId);
  const [pending, setPending] = useState<ReadonlySet<string>>(new Set());
  const [error, setError] = useState<string | null>(null);
  const keys = new Set((assigned ?? []).map(workspaceLabelKey));

  const toggle = (name: string, assign: boolean) => {
    const key = workspaceLabelKey(name);
    if (pending.has(key)) return;
    setPending((current) => new Set(current).add(key));
    setError(null);
    Promise.resolve()
      .then(() => handleOf(reference).setLabel(name, { assigned: assign }))
      .then(refresh, (cause: unknown) => setError(messageOf(cause, s.labelUpdateFailed)))
      .finally(() =>
        setPending((current) => {
          const next = new Set(current);
          next.delete(key);
          return next;
        }),
      );
  };

  return (
    <>
      {(catalog ?? []).map((label) => {
        const key = workspaceLabelKey(label.name);
        const on = keys.has(key);
        return (
          <MenuItem
            key={key}
            theme={theme}
            label={label.name}
            leading={<View style={{ width: 10, height: 10, borderRadius: 5, backgroundColor: identityColor(label.color) }} />}
            selected={on}
            disabled={pending.has(key)}
            onPress={() => toggle(label.name, !on)}
          />
        );
      })}
      {catalog && catalog.length > 0 ? <MenuSeparator theme={theme} /> : null}
      <MenuItem
        theme={theme}
        label={s.createLabel}
        leading={<MenuIcon name="Plus" theme={theme} />}
        trailing={<Icon name="ChevronRight" size={14} color={theme.colors.foregroundMuted} />}
        onPress={onCreate}
      />
      {error ? <MenuHint theme={theme}>{error}</MenuHint> : catalog ? null : <MenuHint theme={theme}>{s.labelsLoadFailed}</MenuHint>}
    </>
  );
}

/**
 * Naming a new label and assigning it. The SDK gives a new label Paseo's default colour (violet),
 * so the colour row of Paseo's page is left out.
 */
function CreateLabelPage({ reference, theme, onDone }: { reference: WorkspaceRef; theme: Theme; onDone: () => void }) {
  const s = t();
  const c = theme.colors;
  const refresh = useRefreshCatalog(reference.hostId);
  const [name, setName] = useState("");
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const trimmed = normalizeWorkspaceLabelName(name);

  const submit = () => {
    if (!trimmed || pending) return;
    setPending(true);
    setError(null);
    Promise.resolve()
      .then(() => handleOf(reference).setLabel(trimmed, { assigned: true }))
      .then(
        () => {
          refresh();
          onDone();
        },
        (cause: unknown) => setError(messageOf(cause, s.labelUpdateFailed)),
      )
      .finally(() => setPending(false));
  };

  return (
    <>
      <View style={{ paddingHorizontal: 8, paddingBottom: 4 }}>
        <TextInput
          value={name}
          onChangeText={setName}
          placeholder={s.labelName}
          placeholderTextColor={c.foregroundMuted}
          autoFocus
          editable={!pending}
          onSubmitEditing={submit}
          style={{
            color: c.foreground,
            fontSize: 14,
            borderWidth: 1,
            borderColor: c.border,
            borderRadius: 6,
            paddingHorizontal: 8,
            paddingVertical: 6,
            backgroundColor: c.surface0,
          }}
        />
      </View>
      <MenuItem
        theme={theme}
        label={s.createLabelConfirm}
        leading={<MenuIcon name="Plus" theme={theme} />}
        disabled={!trimmed || pending}
        onPress={submit}
      />
      {error ? <MenuHint theme={theme}>{error}</MenuHint> : null}
    </>
  );
}

function DialogButton({
  theme,
  label,
  onPress,
  variant,
  disabled = false,
}: {
  theme: Theme;
  label: string;
  onPress: () => void;
  variant: "secondary" | "primary" | "destructive";
  disabled?: boolean;
}) {
  const c = theme.colors;
  const fill = variant === "primary" ? c.accent : variant === "destructive" ? c.statusDanger : "transparent";
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={{ disabled }}
      disabled={disabled}
      onPress={onPress}
      style={({ pressed }) => ({
        flex: 1,
        alignItems: "center",
        paddingVertical: 10,
        paddingHorizontal: 14,
        borderRadius: 6,
        borderWidth: variant === "secondary" ? 1 : 0,
        borderColor: c.border,
        backgroundColor: fill,
        opacity: disabled ? 0.5 : pressed ? 0.85 : 1,
      })}
    >
      <Text style={{ fontSize: 14, color: variant === "secondary" ? c.foreground : variant === "primary" ? c.accentForeground : "#ffffff" }}>{label}</Text>
    </Pressable>
  );
}

/** Paseo's rename dialog (components/rename-modal.tsx): the error shows in it, and it stays open. */
function RenameDialog({ reference, theme, onClose }: { reference: WorkspaceRef; theme: Theme; onClose: () => void }) {
  const s = t();
  const c = theme.colors;
  const w = useWorkspace(reference, (item) => ({ name: item.name, title: item.title }));
  // The starting text is fixed when the dialog opens, so a rename from elsewhere does not move it.
  const initial = useRef(w ? renameInitialValue(w) : "").current;
  const [draft, setDraft] = useState(initial);
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);
  const blank = draft.trim().length === 0;

  const cancel = () => {
    if (!pending) onClose();
  };
  const submit = () => {
    if (pending || draft === initial) return;
    if (blank) {
      setError(s.nameRequired);
      return;
    }
    setPending(true);
    Promise.resolve()
      .then(() => handleOf(reference).setTitle(draft.trim()))
      .then(onClose, (cause: unknown) => {
        setPending(false);
        setError(messageOf(cause, String(cause)));
      });
  };

  return (
    <Modal title={s.renameWorkspace} open onOpenChange={(open) => (open ? undefined : cancel())}>
      <Modal.Content>
        <TextInput
          value={draft}
          onChangeText={(text) => {
            setDraft(text);
            setError(null);
          }}
          placeholder={w?.name}
          placeholderTextColor={c.foregroundMuted}
          autoFocus
          selectTextOnFocus
          autoCapitalize="none"
          autoCorrect={false}
          editable={!pending}
          onSubmitEditing={submit}
          style={{
            color: c.foreground,
            fontSize: 14,
            backgroundColor: c.surface0,
            borderWidth: 1,
            borderColor: c.border,
            borderRadius: 8,
            paddingHorizontal: 12,
            paddingVertical: 12,
          }}
        />
        {error ? <Text style={{ color: c.statusDanger, fontSize: 12 }}>{error}</Text> : null}
        <View style={{ flexDirection: "row", gap: 8 }}>
          <DialogButton theme={theme} label={s.cancel} variant="secondary" disabled={pending} onPress={cancel} />
          <DialogButton
            theme={theme}
            label={pending ? s.renameSaving : s.renameSubmit}
            variant="primary"
            disabled={pending || draft === initial || blank}
            onPress={submit}
          />
        </View>
      </Modal.Content>
    </Modal>
  );
}

/** Paseo's worktree archive warning (git/worktree-archive-warning.ts, a destructive confirm). */
function ArchiveConfirmDialog({
  name,
  reasons,
  theme,
  onCancel,
  onConfirm,
}: {
  name: string;
  reasons: string[];
  theme: Theme;
  onCancel: () => void;
  onConfirm: () => void;
}) {
  const s = t();
  return (
    <Modal title={s.archiveWarningTitle(name)} open onOpenChange={(open) => (open ? undefined : onCancel())}>
      <Modal.Content>
        <Text style={{ color: theme.colors.foregroundMuted, fontSize: 14, lineHeight: 20 }}>{reasons.join("\n")}</Text>
        <View style={{ flexDirection: "row", gap: 8 }}>
          <DialogButton theme={theme} label={s.cancel} variant="secondary" onPress={onCancel} />
          <DialogButton theme={theme} label={s.archive} variant="destructive" onPress={onConfirm} />
        </View>
      </Modal.Content>
    </Modal>
  );
}
