import { Icon } from "@getpaseo/plugin/client/ui";
import { Text, View } from "react-native";
import { type RowProgress, type SegmentTone, showsProgressBar } from "../../shared/sidebar/progress-bar";
import { t } from "../web";
import { type Theme, palette } from "./theme";

/*
 * The row's Progress underline and "stuck" pill (approved mock "Option 3: segmented underline").
 * Segment colours are the Progress panel's (PP 1.14.7 client/panel.tsx `Segment`): done in the
 * accent, working in the accent at 45%, blocked or stuck in danger, the rest grey.
 */

/** The gap the underline adds below a row's content: the mock's 11 bottom padding instead of 8. */
export const PROGRESS_BAR_SPACE = 3;
/** The row's own vertical padding. */
const ROW_PADDING = 8;
const BAR_HEIGHT = 2;
/** The bar's bottom edge above the row's (the mock's `bottom: 3px`). */
const BAR_INSET = 3;

function toneStyle(tone: SegmentTone, theme: Theme, track: string) {
  const c = theme.colors;
  if (tone === "done") return { backgroundColor: c.accent, opacity: 1 };
  if (tone === "working") return { backgroundColor: c.accent, opacity: 0.45 };
  if (tone === "stuck") return { backgroundColor: c.statusDanger, opacity: 1 };
  return { backgroundColor: track, opacity: 1 };
}

/**
 * The 2px bar along a row's bottom, under the title column (place it last in that column): from the
 * title's left edge to the row's right padding, 3 above the row's edge. It takes no touches, so the
 * row's press, hover and buttons stay as they are.
 */
export function ProgressUnderline({
  progress,
  theme,
  selected,
}: {
  progress: RowProgress;
  theme: Theme;
  /** A selected row is filled with surface2, the panel's grey: the grey steps up to the border. */
  selected: boolean;
}) {
  if (!showsProgressBar(progress)) return null;
  const track = selected ? theme.colors.border : theme.colors.surface2;
  const done = progress.segments.filter((s) => s.tone === "done").reduce((sum, s) => sum + s.weight, 0);
  const total = progress.segments.reduce((sum, s) => sum + s.weight, 0);
  return (
    <View
      pointerEvents="none"
      accessibilityLabel={t().progressTickets(done, total)}
      style={{ position: "absolute", left: 0, right: 0, bottom: -(ROW_PADDING + PROGRESS_BAR_SPACE - BAR_INSET), height: BAR_HEIGHT, flexDirection: "row", gap: 2 }}
    >
      {progress.segments.map((segment, index) => (
        <View key={index} style={{ flex: segment.weight, height: BAR_HEIGHT, borderRadius: 1, ...toneStyle(segment.tone, theme, track) }} />
      ))}
    </View>
  );
}

/**
 * The red "stuck" pill after the title; null when the run is not stuck. An open question shows in
 * the status slot instead (`statusSlotOf`).
 */
export function ProgressPills({ progress, theme }: { progress: RowProgress | null; theme: Theme }) {
  if (!progress?.stuck) return null;
  const colors = palette(theme);
  return (
    <View
      pointerEvents="none"
      style={{ height: 16, marginTop: 2, borderRadius: 8, flexDirection: "row", alignItems: "center", flexShrink: 0, gap: 3, paddingHorizontal: 5, backgroundColor: `${colors.danger}24` }}
    >
      <Icon name="OctagonAlert" size={11} color={colors.danger} />
      <Text style={{ color: colors.danger, fontSize: 11, fontWeight: "600", lineHeight: 16 }}>{t().progressStuck}</Text>
    </View>
  );
}
