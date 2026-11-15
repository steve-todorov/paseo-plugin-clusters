/*
 * Drag reorder of Paseo's default sidebar (utils/sidebar-reorder.ts,
 * utils/sidebar-gesture-arbitration.ts, components/drag-reorder/ and
 * hooks/sidebar-workspaces-view-model.ts `computeSidebarOrderUpdates`, v0.16).
 *
 * A drop reorders the rows on screen; the stored order takes them first and keeps the keys it held
 * for rows not on screen after them. Paseo's lists measure where the dragged row is with dnd-kit
 * (web) and react-native-draggable-flatlist (native); the view has neither, so the drop target
 * follows dnd-kit's rule: the row whose centre is nearest the dragged row's centre.
 */
import { appendMissingOrderKeys, prependMissingOrderKeys } from "./workspace-sort.ts";

/** Mouse drags start after this much movement (dnd-kit MouseSensor `distance`). */
export const MOUSE_DRAG_DISTANCE = 6;
/** Touch drags arm after a still hold (use-long-press-drag-interaction.ts). */
export const TOUCH_HOLD_DELAY_MS = 180;
/** How far a finger may wander during the hold and still arm (native; dnd-kit's web touch allows 8). */
export const TOUCH_HOLD_SLOP_NATIVE = 4;
export const TOUCH_HOLD_SLOP_WEB = 8;

export function mergeWithRemainder(input: { currentOrder: readonly string[]; reorderedVisibleKeys: readonly string[] }): string[] {
  const reorderedSet = new Set(input.reorderedVisibleKeys);
  const remainder = input.currentOrder.filter((key) => !reorderedSet.has(key));
  return [...input.reorderedVisibleKeys, ...remainder];
}

export function hasVisibleOrderChanged(input: { currentOrder: readonly string[]; reorderedVisibleKeys: readonly string[] }): boolean {
  const visibleSet = new Set(input.reorderedVisibleKeys);
  const currentVisible = input.currentOrder.filter((key) => visibleSet.has(key));
  if (currentVisible.length !== input.reorderedVisibleKeys.length) return true;
  return input.reorderedVisibleKeys.some((key, index) => currentVisible[index] !== key);
}

/** The stored order after a drop, or null when the drop changed nothing. */
export function orderAfterDrop(currentOrder: readonly string[], reorderedVisibleKeys: readonly string[]): string[] | null {
  if (!hasVisibleOrderChanged({ currentOrder, reorderedVisibleKeys })) return null;
  return mergeWithRemainder({ currentOrder, reorderedVisibleKeys });
}

/** dnd-kit's `arrayMove`. */
export function moveItem<T>(items: readonly T[], from: number, to: number): T[] {
  const next = items.slice();
  const [moved] = next.splice(from, 1);
  if (moved === undefined) return next;
  next.splice(to, 0, moved);
  return next;
}

/** A row's resting box along the list. */
export interface Slot {
  top: number;
  height: number;
}

/** dnd-kit's `closestCenter`: the slot whose centre is nearest the dragged row's, moved by `dy`. */
export function dropIndex(slots: readonly Slot[], from: number, dy: number): number {
  const active = slots[from];
  if (!active) return from;
  const center = active.top + dy + active.height / 2;
  let best = from;
  let bestDistance = Number.POSITIVE_INFINITY;
  slots.forEach((slot, index) => {
    const distance = Math.abs(slot.top + slot.height / 2 - center);
    if (distance < bestDistance) {
      best = index;
      bestDistance = distance;
    }
  });
  return best;
}

/**
 * How far a resting row moves aside while the dragged one hovers at `to`, as dnd-kit's
 * `verticalListSortingStrategy` makes room: the rows it passed step one dragged row's height back.
 */
export function shiftFor(index: number, from: number, to: number, activeHeight: number): number {
  if (index === from) return 0;
  if (from < to && index > from && index <= to) return -activeHeight;
  if (to < from && index >= to && index < from) return activeHeight;
  return 0;
}

export type LongPressMoveDecision = "none" | "cancel_long_press" | "vertical_scroll" | "horizontal_swipe" | "start_drag";

/** Paseo's `decideLongPressMove`: what a finger's move means before and after the hold armed. */
export function decideLongPressMove(input: {
  dragArmed: boolean;
  startPoint: { x: number; y: number } | null;
  currentPoint: { x: number; y: number };
}): LongPressMoveDecision {
  const cancelSlopPx = 10;
  const scrollSlopPx = 6;
  const swipeSlopPx = 8;
  const directionalDominanceRatio = 1.5;
  const dragSlopPx = 8;
  if (!input.startPoint) return "none";
  const dx = input.currentPoint.x - input.startPoint.x;
  const dy = input.currentPoint.y - input.startPoint.y;
  const absDx = Math.abs(dx);
  const absDy = Math.abs(dy);
  const distance = Math.sqrt(dx * dx + dy * dy);
  if (!input.dragArmed) {
    if (absDy >= absDx * directionalDominanceRatio && absDy > scrollSlopPx) return "vertical_scroll";
    if (absDx >= absDy * directionalDominanceRatio && absDx > swipeSlopPx) return "horizontal_swipe";
    return distance > cancelSlopPx ? "cancel_long_press" : "none";
  }
  return distance > dragSlopPx ? "start_drag" : "none";
}

export interface SidebarOrderUpdates {
  projectOrder: readonly string[] | null;
  workspaceOrders: { projectKey: string; order: readonly string[] }[];
}

/**
 * Paseo's `computeSidebarOrderUpdates`: projects on screen that the stored order lacks join it at
 * the end; under Manual, new workspaces join their project's order at the top. Pass
 * `projectOrder: null` where no project order applies, `workspaceOrderOf: null` outside Manual.
 */
export function computeSidebarOrderUpdates(input: {
  projects: readonly { key: string; workspaceKeys: readonly string[] }[];
  projectOrder: readonly string[] | null;
  workspaceOrderOf: ((projectKey: string) => readonly string[]) | null;
}): SidebarOrderUpdates {
  if (input.projects.length === 0) return { projectOrder: null, workspaceOrders: [] };
  let projectOrder: readonly string[] | null = null;
  if (input.projectOrder !== null) {
    const next = appendMissingOrderKeys(
      input.projectOrder,
      input.projects.map((project) => project.key),
    );
    projectOrder = next === input.projectOrder ? null : next;
  }
  const workspaceOrders: SidebarOrderUpdates["workspaceOrders"] = [];
  if (input.workspaceOrderOf) {
    for (const project of input.projects) {
      const current = input.workspaceOrderOf(project.key);
      const next = prependMissingOrderKeys(current, project.workspaceKeys);
      if (next !== current) workspaceOrders.push({ projectKey: project.key, order: next });
    }
  }
  return { projectOrder, workspaceOrders };
}
