/*
 * Hover and drag-start rules for a sidebar row that holds its own buttons (the project row's "+",
 * a workspace row's archive button and kebab).
 *
 * react-native-web's Pressable tracks hover with `contain: true`: when the pointer enters a nested
 * Pressable, that one tells every Pressable around it to end its hover. A row that read its hover
 * from its own Pressable so lost it the moment the pointer reached one of its buttons, and the
 * buttons it showed on hover went away under the pointer. Paseo's rows read hover from plain
 * `pointerenter`/`pointerleave` on the View around the row (sidebar-workspace-list.tsx,
 * sidebar-workspace-row-content.tsx, v0.16), which a child does not end; these rules are that.
 */

export type RowPointerEvent = { kind: "enter" | "leave"; pointerType?: string | null };

/** The row's hover after a pointer event on it. A touch never hovers, nor ends a hover. */
export function nextRowHover(hovered: boolean, event: RowPointerEvent): boolean {
  if (event.pointerType === "touch") return hovered;
  return event.kind === "enter";
}

/**
 * Whether a press may turn into a drag of the row. A mouse press that began on one of the row's
 * buttons is the button's: a few pixels of movement must not lift the row from under the click.
 * A touch keeps Paseo's behaviour, where a long press anywhere on the row lifts it.
 */
export function pressMayDrag(input: { touch: boolean; startedOnAction: boolean }): boolean {
  return input.touch || !input.startedOnAction;
}
