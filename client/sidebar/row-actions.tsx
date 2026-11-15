import type { WorkspaceRef } from "@getpaseo/plugin/client";
import { Icon, TextInput } from "@getpaseo/plugin/client/ui";
import { type ComponentRef, type Ref, useCallback, useEffect, useRef } from "react";
import { type NativeSyntheticEvent, Pressable, type TextInputKeyPressEventData, View } from "react-native";
import type { SidebarWorkspaceTrailing } from "../../shared/sidebar/preferences";
import {
  ARCHIVE_BUTTON_FOOTPRINT,
  ARCHIVE_BUTTON_KEBAB_GAP,
  ARCHIVE_BUTTON_SIZE,
  SCRIM_WIDTH,
  resolveTrailingActionVisibility,
  scrimSlices,
} from "../../shared/sidebar/workspace-actions";
import { hasWorkspaceTrailing } from "../../shared/sidebar/workspace-row";
import type { WorkspaceRowDetail } from "../../shared/sidebar/workspace-row";
import { t } from "../web";
import { useGuardedPress } from "./drag-list";
import { LINE, type Theme } from "./theme";
import { WorkspaceTrailing } from "./trailing";
import type { WorkspaceActions } from "./workspace-actions";
import { useHover } from "./workspace-row";

/*
 * The trailing slot's actions on a workspace row (components/sidebar/sidebar-workspace-row-content.tsx
 * `SidebarWorkspaceTrailingAction*`, sidebar-workspace-menu.tsx and components/ui/
 * trailing-action-scrim.tsx, v0.16): on a hovered pointer row the archive button and kebab fade in
 * over the trailing content behind a 48px scrim; on touch the kebab always shows in its place. A
 * long press on touch still lifts the row for a drag, as in Paseo, and the press it leaves behind
 * does not open the menu.
 */

interface SlotWorkspace {
  name: string;
  kind: string;
  diffStat: { additions: number; deletions: number } | null;
  statusEnteredAt: string | null;
}

export function WorkspaceTrailingSlot({
  reference,
  workspace,
  detail,
  trailing,
  theme,
  now,
  hovered,
  backdrop,
  actions,
}: {
  reference: WorkspaceRef;
  workspace: SlotWorkspace;
  detail: WorkspaceRowDetail | null;
  trailing: SidebarWorkspaceTrailing;
  theme: Theme;
  now: number;
  hovered: boolean;
  /** The row's own fill, which the scrim paints; null on an idle row. */
  backdrop: string | null;
  /** Null while the row is renamed in place, or outside a view that offers actions. */
  actions: WorkspaceActions | null;
}) {
  const guarded = useGuardedPress();
  const kebabRef = useRef<View>(null);
  const touch = actions?.touch ?? false;
  const v = resolveTrailingActionVisibility({
    hasTrailing: hasWorkspaceTrailing({ workspace, trailing }),
    hasArchiveAction: actions !== null,
    isHovered: hovered,
    isTouch: touch,
  });
  // The kebab stays while its menu is open: the menu takes the pointer off the row.
  const showKebab = v.showKebab || (actions !== null && actions.menuKey === reference.key);
  if (!v.renderSlot) return null;
  const archive = () =>
    actions?.archive({
      ref: reference,
      kind: workspace.kind,
      name: workspace.name,
      diffStat: workspace.diffStat,
      isDirty: detail?.isDirty ?? null,
      aheadOfOrigin: detail?.aheadOfOrigin ?? null,
    });
  return (
    // Stays relative at zero width, so the overlay anchors to the same right edge either way.
    <View style={{ position: "relative", minHeight: LINE, minWidth: v.reserveSlotWidth ? 18 : 0, flexShrink: 0, alignItems: "flex-end", justifyContent: "flex-start" }}>
      {v.trailingPresentation === "visible" ? <WorkspaceTrailing workspace={workspace} trailing={trailing} theme={theme} now={now} /> : null}
      {showKebab && actions ? (
        <>
          {v.showScrim && backdrop ? <Scrim color={backdrop} width={v.showArchiveButton ? SCRIM_WIDTH + ARCHIVE_BUTTON_FOOTPRINT : SCRIM_WIDTH} /> : null}
          <View style={{ position: "absolute", top: 0, right: 0, flexDirection: "row", alignItems: "flex-start" }}>
            {v.showArchiveButton ? <ArchiveButton theme={theme} onPress={guarded(archive)} /> : null}
            <Kebab ref={kebabRef} theme={theme} touch={touch} onPress={guarded(() => actions.openMenu(reference, kebabRef.current))} />
          </View>
        </>
      ) : null}
    </View>
  );
}

/** Fades the trailing content into the row's colour under the actions. */
function Scrim({ color, width }: { color: string; width: number }) {
  return (
    <View pointerEvents="none" style={{ position: "absolute", top: 0, bottom: 0, right: 0, width }}>
      {scrimSlices(width).map((slice) => (
        <View
          key={slice.left}
          style={{ position: "absolute", top: 0, bottom: 0, left: slice.left, width: slice.width, backgroundColor: color, opacity: slice.opacity }}
        />
      ))}
    </View>
  );
}

function ArchiveButton({ theme, onPress }: { theme: Theme; onPress: () => void }) {
  const hover = useHover();
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={t().archiveWorkspace}
      hitSlop={4}
      onPress={onPress}
      onHoverIn={hover.onHoverIn}
      onHoverOut={hover.onHoverOut}
      style={{
        width: ARCHIVE_BUTTON_SIZE,
        height: ARCHIVE_BUTTON_SIZE,
        marginRight: ARCHIVE_BUTTON_KEBAB_GAP,
        alignItems: "center",
        justifyContent: "center",
        borderRadius: 4,
        backgroundColor: hover.hovered ? theme.colors.surface2 : "transparent",
      }}
    >
      <Icon name="Archive" size={14} color={hover.hovered ? theme.colors.foreground : theme.colors.foregroundMuted} />
    </Pressable>
  );
}

function Kebab({ ref, theme, touch, onPress }: { ref: Ref<View>; theme: Theme; touch: boolean; onPress: () => void }) {
  const hover = useHover();
  const box = touch ? 32 : 18;
  return (
    <Pressable
      ref={ref}
      accessibilityRole="button"
      accessibilityLabel={t().workspaceMenu}
      hitSlop={8}
      onPress={onPress}
      onHoverIn={hover.onHoverIn}
      onHoverOut={hover.onHoverOut}
      style={{
        width: box,
        height: box,
        alignItems: "center",
        justifyContent: "center",
        borderRadius: 4,
        // Centres the touch box on the 20px title line.
        marginTop: touch ? -6 : 0,
        // The dots paint only at the glyph's centre; this pulls them onto the trailing rail.
        marginRight: touch ? -14 : -7,
        backgroundColor: hover.hovered ? theme.colors.surface2 : "transparent",
      }}
    >
      <Icon name="MoreVertical" size={touch ? 18 : 14} color={hover.hovered ? theme.colors.foreground : theme.colors.foregroundMuted} />
    </Pressable>
  );
}

/**
 * The title's stand-in while a row is renamed in place (workspace-rename/internal/
 * inline-title-field.tsx): Enter and blur commit, Escape cancels, and only one of them counts.
 */
export function InlineTitleField({
  initialValue,
  placeholder,
  readOnly,
  theme,
  onCommit,
  onCancel,
}: {
  initialValue: string;
  placeholder: string;
  /** Holds the sent text on screen while the daemon takes it. */
  readOnly: boolean;
  theme: Theme;
  onCommit: (text: string) => void;
  onCancel: () => void;
}) {
  const inputRef = useRef<ComponentRef<typeof TextInput>>(null);
  const textRef = useRef(initialValue);
  const settled = useRef(false);
  const focused = useRef(false);

  // The menu that started the rename is still closing; focusing a frame later keeps its press
  // from taking the focus straight back.
  useEffect(() => {
    const frame = requestAnimationFrame(() => inputRef.current?.focus());
    return () => cancelAnimationFrame(frame);
  }, []);

  const settle = useCallback((outcome: () => void) => {
    if (settled.current) return;
    settled.current = true;
    outcome();
  }, []);
  const commit = () => settle(() => onCommit(textRef.current));

  return (
    <View style={{ flex: 1, minWidth: 0, height: LINE }}>
      <TextInput
        ref={inputRef}
        defaultValue={initialValue}
        placeholder={placeholder}
        placeholderTextColor={theme.colors.foregroundMuted}
        editable={!readOnly}
        selectTextOnFocus
        autoCapitalize="none"
        autoCorrect={false}
        spellCheck={false}
        onChangeText={(text) => {
          textRef.current = text;
        }}
        onFocus={() => {
          focused.current = true;
        }}
        // A blur before the first focus is focus moving off the closing menu, not the user leaving.
        onBlur={() => (focused.current ? commit() : undefined)}
        onSubmitEditing={commit}
        onKeyPress={(event: NativeSyntheticEvent<TextInputKeyPressEventData>) => {
          if (event.nativeEvent.key === "Escape") settle(onCancel);
        }}
        style={{
          width: "100%",
          height: "100%",
          margin: 0,
          padding: 0,
          borderWidth: 0,
          backgroundColor: "transparent",
          color: theme.colors.foreground,
          fontSize: 14,
          fontWeight: "400",
          borderRadius: 4,
          // The editable mark paints outside the box, so the row does not move.
          outlineStyle: "solid",
          outlineWidth: 1,
          outlineOffset: 2,
          outlineColor: theme.colors.accent,
        }}
      />
    </View>
  );
}
