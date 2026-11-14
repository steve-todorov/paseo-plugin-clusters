import { Icon } from "@getpaseo/plugin/client/ui";
import { Pressable, Text, View } from "react-native";
import { ROW_HEIGHT, type Theme, palette } from "./theme";
import { useHover } from "./workspace-row";

/*
 * A row that stands where a workspace row would and takes its geometry: "Show more" at the end of a
 * truncated group (sidebar/sidebar-group-toggle-row.tsx) and "New workspace" under a project left
 * with no rows (`NewWorkspaceGhostRow` in sidebar-workspace-list.tsx, v0.16). The glyph sits in the
 * status slot, so the label lands on the titles' rail; the new-workspace row steps in by 8 more.
 */
export function GhostRow({
  icon,
  label,
  accessibilityLabel = label,
  onPress,
  indented = false,
  theme,
}: {
  icon: string;
  label: string;
  accessibilityLabel?: string;
  onPress: () => void;
  indented?: boolean;
  theme: Theme;
}) {
  const hover = useHover();
  const c = theme.colors;
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel}
      onPress={onPress}
      onHoverIn={hover.onHoverIn}
      onHoverOut={hover.onHoverOut}
      style={({ pressed }) => ({
        minHeight: ROW_HEIGHT,
        marginBottom: 2,
        paddingVertical: 8,
        paddingLeft: indented ? 16 : 8,
        paddingRight: 12,
        borderRadius: 8,
        flexDirection: "row",
        alignItems: "center",
        gap: 8,
        backgroundColor: pressed ? c.surface2 : hover.hovered ? palette(theme).hover : "transparent",
      })}
    >
      {({ pressed }) => {
        const color = hover.hovered || pressed ? c.foreground : c.foregroundMuted;
        return (
          <>
            <View style={{ width: 16, height: 16, alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
              <Icon name={icon} size={14} color={color} />
            </View>
            <Text numberOfLines={1} style={{ color, fontSize: 14, minWidth: 0, flexShrink: 1 }}>
              {label}
            </Text>
          </>
        );
      }}
    </Pressable>
  );
}
