import { Icon } from "@getpaseo/plugin/client/ui";
import type { ReactNode } from "react";
import { Platform, Pressable, Text, View } from "react-native";
import { t } from "../../web";
import type { Theme } from "../theme";
import { useHover } from "../workspace-row";

/*
 * The rows of Paseo's adaptive menu (components/ui/menu/menu-item.tsx, menu-sub.tsx and
 * menu-surface.tsx `MenuSheetHeader`, v0.16), drawn with React Native: the SDK offers no menu.
 */

/** The menu's tight row: 28 under a pointer, the 44 touch target elsewhere. */
export const MENU_ROW_HEIGHT = Platform.OS === "web" ? 28 : 44;
/** Fits the row's 16pt leading slot with a hair of room, matching the trailing check. */
export const OPTION_ICON_SIZE = 14;

export function MenuItem({
  theme,
  label,
  leading = null,
  trailing = null,
  selected,
  disabled = false,
  active = false,
  onPress,
}: {
  theme: Theme;
  label: string;
  leading?: ReactNode;
  /** Replaces the check a selected row would draw. */
  trailing?: ReactNode;
  /** Chosen rows draw a check on the right; `undefined` rows answer no such question. */
  selected?: boolean;
  disabled?: boolean;
  /** The row whose page is open: about where you are, not what you picked. */
  active?: boolean;
  onPress?: () => void;
}) {
  const c = theme.colors;
  const hover = useHover();
  const end = trailing ?? (selected ? <Icon name="Check" size={16} color={c.foregroundMuted} /> : null);
  return (
    <Pressable
      accessibilityRole="menuitem"
      accessibilityState={selected === undefined ? { disabled } : { checked: selected, disabled }}
      disabled={disabled}
      onPress={onPress}
      onHoverIn={hover.onHoverIn}
      onHoverOut={hover.onHoverOut}
      style={({ pressed }) => ({
        flexDirection: "row",
        alignItems: "center",
        minHeight: MENU_ROW_HEIGHT,
        gap: 8,
        marginHorizontal: 4,
        paddingHorizontal: 8,
        paddingVertical: 4,
        borderWidth: 1,
        borderColor: "transparent",
        borderRadius: 6,
        opacity: disabled ? 0.5 : 1,
        backgroundColor: !disabled && (pressed || hover.hovered || active) ? c.surface2 : "transparent",
      })}
    >
      {leading ? <View style={{ width: 16, alignItems: "center", justifyContent: "center" }}>{leading}</View> : null}
      <View style={{ flexShrink: 1, minWidth: 0 }}>
        <Text numberOfLines={1} style={{ fontSize: 14, lineHeight: 18, color: c.foreground, fontWeight: "400" }}>
          {label}
        </Text>
      </View>
      {end ? <View style={{ marginLeft: "auto", alignItems: "center", justifyContent: "center" }}>{end}</View> : null}
    </Pressable>
  );
}

/** A row that opens a page: its current value, a dot when it is narrowing the list, a chevron. */
export function MenuSubTrigger({
  theme,
  label,
  value,
  indicator = false,
  leading = null,
  onPress,
}: {
  theme: Theme;
  label: string;
  value?: string;
  indicator?: boolean;
  leading?: ReactNode;
  onPress: () => void;
}) {
  const c = theme.colors;
  const trailing = (
    <View style={{ flexDirection: "row", alignItems: "center", gap: 6 }}>
      {value ? (
        <Text numberOfLines={1} style={{ fontSize: 14, color: c.foregroundMuted, flexShrink: 1 }}>
          {value}
        </Text>
      ) : null}
      {indicator ? <View style={{ width: 6, height: 6, borderRadius: 3, backgroundColor: c.accent }} /> : null}
      <Icon name="ChevronRight" size={14} color={c.foregroundMuted} />
    </View>
  );
  return <MenuItem theme={theme} label={label} leading={leading} trailing={trailing} onPress={onPress} />;
}

/** Runs the full width of the surface, with room above and below. */
export function MenuSeparator({ theme }: { theme: Theme }) {
  return <View style={{ height: 1, marginVertical: 4, backgroundColor: theme.colors.border }} />;
}

/** A page's title with the way back to the page that opened it. */
export function MenuPageHeader({ theme, title, onBack }: { theme: Theme; title: string; onBack: () => void }) {
  const c = theme.colors;
  return (
    <View style={{ flexDirection: "row", alignItems: "center", gap: 8, paddingHorizontal: 12, paddingTop: 4, paddingBottom: 8 }}>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={t().back}
        hitSlop={8}
        onPress={onBack}
        style={{ width: 24, height: 24, alignItems: "center", justifyContent: "center" }}
      >
        <Icon name="ChevronLeft" size={18} color={c.foregroundMuted} />
      </Pressable>
      <Text numberOfLines={1} style={{ fontSize: 14, fontWeight: "500", color: c.foreground, flexShrink: 1 }}>
        {title}
      </Text>
    </View>
  );
}

/** An option's mark in the leading slot. */
export function OptionIcon({ name, theme }: { name: string; theme: Theme }) {
  return <Icon name={name} size={OPTION_ICON_SIZE} color={theme.colors.foregroundMuted} />;
}
