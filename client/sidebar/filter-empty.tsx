import { Pressable, Text, View } from "react-native";
import { t } from "../web";
import { type Theme, palette } from "./theme";
import { useHover } from "./workspace-row";

/*
 * What the list says when its filters leave nothing (components/sidebar/empty-states.tsx
 * `SidebarFilterEmptyState`, v0.16). It replaces the rows, never the header holding the menu, and
 * its one action clears every filter that can empty the list.
 */
export function FilterEmptyState({ theme, onClear }: { theme: Theme; onClear: () => void }) {
  const c = theme.colors;
  const s = t();
  const hover = useHover();
  return (
    <View style={{ marginTop: 12, padding: 16, borderWidth: 1, borderColor: c.border, borderRadius: 8 }}>
      <View style={{ gap: 4 }}>
        <Text style={{ color: c.foreground, fontSize: 12, fontWeight: "400" }}>{s.filterEmptyTitle}</Text>
        <Text style={{ color: c.foregroundMuted, fontSize: 12 }}>{s.filterEmptyDescription}</Text>
      </View>
      <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 8, marginTop: 16 }}>
        <Pressable
          accessibilityRole="button"
          onPress={onClear}
          onHoverIn={hover.onHoverIn}
          onHoverOut={hover.onHoverOut}
          style={({ pressed }) => ({
            maxWidth: "100%",
            minHeight: 28,
            paddingHorizontal: 10,
            justifyContent: "center",
            borderRadius: 6,
            borderWidth: 1,
            borderColor: c.border,
            backgroundColor: pressed || hover.hovered ? c.surface2 : palette(theme).hover,
          })}
        >
          <Text numberOfLines={1} style={{ color: c.foreground, fontSize: 12, flexShrink: 1 }}>
            {s.filterEmptyClear}
          </Text>
        </Pressable>
      </View>
    </View>
  );
}
