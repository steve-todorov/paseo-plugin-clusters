import { Text, View } from "react-native";
import { compactAgo, toMs } from "../../shared/activity";
import type { SidebarWorkspaceTrailing } from "../../shared/sidebar/preferences";
import { formatDiffCount, hasWorkspaceTrailing } from "../../shared/sidebar/workspace-row";
import { LINE, type Theme, palette } from "./theme";

/*
 * The slot right of a workspace title, as Paseo draws it (components/sidebar/workspace-trailing
 * and components/diff-stat.tsx, v0.16): the diff stat, the time in the current status, or nothing.
 */

interface TrailingWorkspace {
  diffStat: { additions: number; deletions: number } | null;
  statusEnteredAt: string | null;
}

export function WorkspaceTrailing({
  workspace,
  trailing,
  theme,
  now,
}: {
  workspace: TrailingWorkspace;
  trailing: SidebarWorkspaceTrailing;
  theme: Theme;
  now: number;
}) {
  if (!hasWorkspaceTrailing({ workspace, trailing })) return null;
  if (trailing === "diff" && workspace.diffStat) {
    const count = { fontSize: 12, fontWeight: "normal" as const };
    return (
      <View style={{ flexDirection: "row", alignItems: "center", height: LINE, gap: 4, flexShrink: 0 }}>
        <Text style={{ ...count, color: theme.colors.statusSuccess }}>+{formatDiffCount(workspace.diffStat.additions)}</Text>
        <Text style={{ ...count, color: theme.colors.statusDanger }}>-{formatDiffCount(workspace.diffStat.deletions)}</Text>
      </View>
    );
  }
  return (
    <Text numberOfLines={1} style={{ height: LINE, lineHeight: LINE, fontSize: 12, fontWeight: "normal", color: palette(theme).extraMuted, flexShrink: 0 }}>
      {compactAgo(toMs(workspace.statusEnteredAt), now)}
    </Text>
  );
}
