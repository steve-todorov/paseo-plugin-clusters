import { Icon, Modal, ScrollView } from "@getpaseo/plugin/client/ui";
import { useCallback, useState } from "react";
import { Pressable, View } from "react-native";
import type { Strings } from "../../../shared/i18n";
import { t } from "../../web";
import { type Theme, palette } from "../theme";
import { useHover } from "../workspace-row";
import { type DisplayMenuModel, MenuPage, type MenuPageId } from "./pages";
import { MenuPageHeader } from "./rows";

export type { DisplayMenuModel } from "./pages";

/*
 * Paseo's sidebar display-preferences menu (components/sidebar/display-preferences/menu.tsx and
 * components/ui/menu, v0.16): a sliders button that opens the menu anchored under it on wide
 * layouts and as a bottom sheet on compact ones.
 *
 * Paseo's popover opens each page as a flyout beside the menu. A plugin view cannot draw past its
 * own bounds, so on wide layouts the pages open in place, with the sheet's back header.
 */

const MENU_WIDTH = 232;
/** Space kept between the menu and the view's edges. */
const EDGE = 8;

function pageTitle(s: Strings, page: MenuPageId): string {
  switch (page) {
    case "root":
      return s.displayHeading;
    case "grouping":
      return s.groupingLabel;
    case "sort":
      return s.sortLabel;
    case "titleSource":
      return s.titleSourceLabel;
    case "show":
      return s.showLabel;
    case "checks":
      return s.showChecks;
    case "hostFilter":
      return s.hostFilterLabel;
    case "projectFilter":
      return s.projectFilterLabel;
    case "labelFilter":
      return s.labelsTitle;
  }
}

/** The open menu as a stack of pages, root first; null while closed. */
export function useDisplayMenuState() {
  const [stack, setStack] = useState<MenuPageId[] | null>(null);
  const open = useCallback(() => setStack(["root"]), []);
  const close = useCallback(() => setStack(null), []);
  return { stack, setStack, open, close };
}

export type DisplayMenuState = ReturnType<typeof useDisplayMenuState>;

/** The list header's sliders button (`sidebar-display-preferences-menu`). */
export function DisplayMenuTrigger({ theme, onPress }: { theme: Theme; onPress: () => void }) {
  const hover = useHover();
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={t().displayTrigger}
      testID="sidebar-display-preferences-menu"
      onPress={onPress}
      onHoverIn={hover.onHoverIn}
      onHoverOut={hover.onHoverOut}
      style={{
        width: 28,
        height: 28,
        alignItems: "center",
        justifyContent: "center",
        borderRadius: 6,
        backgroundColor: hover.hovered ? palette(theme).hover : "transparent",
      }}
    >
      <Icon name="Settings2" size={14} color={theme.colors.foregroundMuted} />
    </Pressable>
  );
}

/**
 * The open menu. Render it last in the view, so the popover sits over the list. `anchorTop` is the
 * bottom of the trigger's header line; `bounds` the view's size.
 */
export function DisplayMenuSurface({
  menu,
  model,
  theme,
  compact,
  anchorTop,
  bounds,
}: {
  menu: DisplayMenuState;
  model: DisplayMenuModel;
  theme: Theme;
  compact: boolean;
  anchorTop: number;
  bounds: { width: number; height: number };
}) {
  const { stack, setStack, close } = menu;
  if (!stack) return null;
  const s = t();
  const page = stack[stack.length - 1] ?? "root";
  const nav = {
    open: (next: MenuPageId) => setStack((current) => [...(current ?? ["root"]), next]),
    close,
  };
  const body = (
    <>
      {page === "root" ? null : (
        <MenuPageHeader theme={theme} title={pageTitle(s, page)} onBack={() => setStack((current) => (current ?? ["root"]).slice(0, -1))} />
      )}
      <View style={{ paddingVertical: 4 }}>
        <MenuPage page={page} model={model} nav={nav} theme={theme} />
      </View>
    </>
  );

  if (compact) {
    return (
      <Modal title={s.displayHeading} open onOpenChange={(open) => (open ? undefined : close())}>
        <Modal.Content contentContainerStyle={{ padding: 0, gap: 0 }}>{body}</Modal.Content>
      </Modal>
    );
  }

  const c = theme.colors;
  return (
    <View style={{ position: "absolute", top: 0, left: 0, right: 0, bottom: 0 }} pointerEvents="box-none">
      {/* A press anywhere outside the menu closes it, as the app's overlay does. */}
      <Pressable accessible={false} onPress={close} style={{ position: "absolute", top: 0, left: 0, right: 0, bottom: 0 }} />
      <View
        accessibilityRole="menu"
        style={{
          position: "absolute",
          top: anchorTop,
          right: EDGE,
          width: Math.max(0, Math.min(MENU_WIDTH, bounds.width - 2 * EDGE)),
          maxHeight: Math.max(0, bounds.height - anchorTop - EDGE),
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
        <ScrollView style={{ flexGrow: 0 }} contentContainerStyle={{ paddingTop: page === "root" ? 0 : 4 }}>
          {body}
        </ScrollView>
      </View>
    </View>
  );
}
