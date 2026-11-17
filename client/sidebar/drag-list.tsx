import { type ReactNode, createContext, useCallback, useContext, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import {
  Animated,
  type GestureResponderEvent,
  type GestureResponderHandlers,
  type LayoutChangeEvent,
  type NativeScrollEvent,
  type NativeSyntheticEvent,
  PanResponder,
  type PanResponderInstance,
  Platform,
  type ScrollView,
  type View,
  type ViewStyle,
} from "react-native";
import type { DropZone } from "../../shared/sidebar/workspace-tree";
import {
  MOUSE_DRAG_DISTANCE,
  type Slot,
  TOUCH_HOLD_DELAY_MS,
  TOUCH_HOLD_SLOP_NATIVE,
  TOUCH_HOLD_SLOP_WEB,
  decideLongPressMove,
  dropIndex,
  moveItem,
  shiftFor,
} from "../../shared/sidebar/reorder";

/*
 * Drag to reorder, as Paseo's sidebar does it (components/draggable-list.web.tsx with dnd-kit,
 * draggable-list.native.tsx with react-native-draggable-flatlist, and
 * sidebar/use-long-press-drag-interaction.ts, v0.16). Plugins get neither library nor
 * react-native-gesture-handler, so this is built on React Native's own responder system:
 * - Mouse: press and move 6 px (dnd-kit's MouseSensor).
 * - Touch: hold still 180 ms, the row lifts, then drag; moving first scrolls instead.
 * The rows step aside as dnd-kit's vertical strategy makes them, the drop goes to the row whose
 * centre is nearest, and the list scrolls itself while the row is held near its edges.
 */

const IS_WEB = Platform.OS === "web";
/** dnd-kit sortable's default transition for the rows making room. */
const SHIFT_MS = 250;
/** How long after a drag the press it leaves behind is swallowed. */
const PRESS_BLOCK_MS = 400;
/** Auto-scroll: the edge band, at most this tall or a fifth of the list, and the top speed per frame. */
const EDGE_BAND = 60;
const EDGE_SPEED = 12;

/** What the scrolling list lends the draggable lists inside it. */
interface DragHost {
  lockScroll(locked: boolean): void;
  offset(): number;
  /** Scrolls by `delta`, clamped to the content; returns how far it went. */
  scrollBy(delta: number): number;
  measureViewport(): void;
  viewport(): { top: number; height: number } | null;
  /** While held, and briefly after, presses do nothing: the hold or drag already used the touch. */
  holdPresses(held: boolean): void;
  pressBlocked(): boolean;
  /** While a row is renamed in place no drag starts, so selecting its text with the mouse stays a selection. */
  suspend(suspended: boolean): void;
  suspended(): boolean;
}

const DragHostContext = createContext<DragHost | null>(null);

export const DragHostProvider = DragHostContext.Provider;

/**
 * The host side: spread `frameProps` on a View holding just the list's ScrollView, `scrollProps`
 * on the ScrollView, and provide `host`.
 */
export function useDragHost() {
  const scrollRef = useRef<ScrollView>(null);
  // The ScrollView type carries no measuring methods; a View around it does.
  const frameRef = useRef<View>(null);
  const [scrollEnabled, setScrollEnabled] = useState(true);
  const offsetRef = useRef(0);
  const contentRef = useRef(0);
  const heightRef = useRef(0);
  const viewportRef = useRef<{ top: number; height: number } | null>(null);
  const heldRef = useRef(false);
  const blockedUntil = useRef(0);
  const suspendedRef = useRef(false);

  const host = useMemo<DragHost>(
    () => ({
      lockScroll: (locked) => setScrollEnabled(!locked),
      offset: () => offsetRef.current,
      scrollBy: (delta) => {
        const max = Math.max(0, contentRef.current - heightRef.current);
        const next = Math.min(max, Math.max(0, offsetRef.current + delta));
        const moved = next - offsetRef.current;
        if (moved !== 0) {
          offsetRef.current = next;
          scrollRef.current?.scrollTo({ y: next, animated: false });
        }
        return moved;
      },
      measureViewport: () => {
        frameRef.current?.measureInWindow((_x, y, _width, height) => {
          viewportRef.current = { top: y, height };
        });
      },
      viewport: () => viewportRef.current,
      holdPresses: (held) => {
        heldRef.current = held;
        if (!held) blockedUntil.current = Date.now() + PRESS_BLOCK_MS;
      },
      pressBlocked: () => heldRef.current || Date.now() < blockedUntil.current,
      suspend: (suspended) => {
        suspendedRef.current = suspended;
      },
      suspended: () => suspendedRef.current,
    }),
    [],
  );

  const scrollProps = {
    ref: scrollRef,
    scrollEnabled,
    scrollEventThrottle: 16,
    onScroll: (event: NativeSyntheticEvent<NativeScrollEvent>) => {
      offsetRef.current = event.nativeEvent.contentOffset.y;
    },
    onContentSizeChange: (_width: number, height: number) => {
      contentRef.current = height;
    },
    onLayout: (event: LayoutChangeEvent) => {
      heightRef.current = event.nativeEvent.layout.height;
    },
  };
  const frameProps = { ref: frameRef, collapsable: false, style: { flex: 1 } };
  return { host, frameProps, scrollProps };
}

/** Stops drags from starting while `suspended`, for a row being renamed in place. */
export function useSuspendDrag(suspended: boolean) {
  const host = useContext(DragHostContext);
  useEffect(() => {
    if (!host || !suspended) return;
    host.suspend(true);
    return () => host.suspend(false);
  }, [host, suspended]);
}

/** Wraps a row's press so the press a hold or drag leaves behind does not open or toggle anything. */
export function useGuardedPress(): (action: () => void) => () => void {
  const host = useContext(DragHostContext);
  return useCallback((action) => () => {
    if (!host?.pressBlocked()) action();
  }, [host]);
}

/** Spread on the View around the row that starts a drag. */
export type DragHandleProps = GestureResponderHandlers & {
  onTouchMove: (event: GestureResponderEvent) => void;
  onTouchEnd: () => void;
  onTouchCancel: () => void;
  style: ViewStyle;
};

export interface DragItemState<C = never> {
  dragging: boolean;
  /** Absent while dragging is off. */
  handle: DragHandleProps | undefined;
  /** Tree mode: what releasing now would do, for the rows to draw their cue; null otherwise. */
  cue: C | null;
}

/** The band at a row's top and bottom that means "between rows" rather than "onto this row". */
const EDGE_ZONE = IS_WEB ? 8 : 12;

/**
 * Tree mode: rows stay put while one is dragged (no stepping aside); the row under the dragged
 * one's centre and the band of it (top edge, middle, bottom edge) are handed to `resolve`, whose
 * cue the rows and `renderOverlay` draw, and a release hands that cue to `onDrop`.
 */
export interface TreeDrag<C> {
  resolve(dragged: string, target: string, zone: DropZone): C | null;
  onDrop(dragged: string, cue: C): void;
  /** Drawn over the rows, in the rows' own coordinates (`slotOf` gives each row's box). */
  renderOverlay(cue: C, slotOf: (key: string) => Slot | undefined): ReactNode;
}

interface Gesture {
  key: string | null;
  touch: boolean;
  start: { x: number; y: number };
  current: { x: number; y: number };
  armed: boolean;
  dragging: boolean;
  /** The row's responder took the gesture; its release ends the drag. */
  granted: boolean;
  from: number;
  to: number;
  keys: string[];
  slots: Slot[];
  startOffset: number;
  cue: unknown;
  cueId: string;
}

const idle = (): Gesture => ({
  key: null,
  touch: false,
  start: { x: 0, y: 0 },
  current: { x: 0, y: 0 },
  armed: false,
  dragging: false,
  granted: false,
  from: 0,
  to: 0,
  keys: [],
  slots: [],
  startOffset: 0,
  cue: null,
  cueId: "",
});

// Text selection on web would end the responder; the app's rows set the same.
const NO_SELECT = { userSelect: "none" } as ViewStyle;

function pointOf(event: GestureResponderEvent): { x: number; y: number } {
  const touch = event.nativeEvent.touches?.[0] ?? event.nativeEvent;
  return { x: touch.pageX, y: touch.pageY };
}

/**
 * A list whose rows can be dragged into a new order. `onReorder` gets the rows in their new order
 * once a drop moved one; the caller stores it.
 */
export function DragList<T, C = never>({
  items,
  keyOf,
  enabled,
  onReorder,
  renderItem,
  tree,
}: {
  items: readonly T[];
  keyOf: (item: T) => string;
  enabled: boolean;
  onReorder: (items: T[]) => void;
  renderItem: (item: T, state: DragItemState<C>) => ReactNode;
  /** Set for a tree: drops nest or land between rows instead of reordering a flat list. */
  tree?: TreeDrag<C>;
}) {
  const host = useContext(DragHostContext);
  const [activeKey, setActiveKey] = useState<string | null>(null);
  const [cue, setCue] = useState<C | null>(null);
  const latest = useRef({ items, keyOf, enabled, onReorder, host, tree });
  latest.current = { items, keyOf, enabled, onReorder, host, tree };
  const slots = useRef(new Map<string, Slot>());
  const values = useRef(new Map<string, Animated.Value>());
  const gesture = useRef<Gesture>(idle());
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const frame = useRef<number | null>(null);
  const pointerY = useRef(0);

  const valueOf = (key: string) => {
    let value = values.current.get(key);
    if (!value) {
      value = new Animated.Value(0);
      values.current.set(key, value);
    }
    return value;
  };

  const clearTimer = () => {
    if (timer.current) clearTimeout(timer.current);
    timer.current = null;
  };

  const reposition = () => {
    const g = gesture.current;
    if (!g.dragging || !g.key) return;
    const scrolled = (latest.current.host?.offset() ?? 0) - g.startOffset;
    const dy = pointerY.current - g.start.y + scrolled;
    valueOf(g.key).setValue(dy);
    const treeDrag = latest.current.tree;
    if (treeDrag) {
      // The dragged row's centre picks the row under it, and the band of that row.
      const own = g.slots[g.from];
      const y = (own?.top ?? 0) + (own?.height ?? 0) / 2 + dy;
      const index = g.slots.findIndex((slot, i) => i !== g.from && y >= slot.top && y < slot.top + slot.height);
      let next: C | null = null;
      if (index >= 0) {
        const slot = g.slots[index];
        const offset = y - slot.top;
        const edge = Math.min(EDGE_ZONE, slot.height / 4);
        const zone: DropZone = offset < edge ? "top" : offset > slot.height - edge ? "bottom" : "middle";
        next = treeDrag.resolve(g.keys[g.from], g.keys[index], zone);
      }
      const id = next === null ? "" : JSON.stringify(next);
      if (id !== g.cueId) {
        g.cue = next;
        g.cueId = id;
        setCue(next);
      }
      return;
    }
    const to = dropIndex(g.slots, g.from, dy);
    if (to === g.to) return;
    g.to = to;
    const height = g.slots[g.from]?.height ?? 0;
    g.keys.forEach((key, index) => {
      if (key === g.key) return;
      Animated.timing(valueOf(key), { toValue: shiftFor(index, g.from, to, height), duration: SHIFT_MS, useNativeDriver: false }).start();
    });
  };

  const autoScroll = () => {
    frame.current = null;
    const g = gesture.current;
    const h = latest.current.host;
    if (!g.dragging || !h) return;
    const viewport = h.viewport();
    if (viewport && viewport.height > 0) {
      const band = Math.min(EDGE_BAND, viewport.height / 5);
      const y = pointerY.current - viewport.top;
      let delta = 0;
      if (y < band) delta = -EDGE_SPEED * Math.min(1, (band - y) / band);
      else if (y > viewport.height - band) delta = EDGE_SPEED * Math.min(1, (y - (viewport.height - band)) / band);
      if (delta !== 0 && h.scrollBy(delta) !== 0) reposition();
    }
    frame.current = requestAnimationFrame(autoScroll);
  };

  /** Lifts the row: from the hold on touch, from the first moves with a mouse. */
  const lift = (key: string): boolean => {
    const g = gesture.current;
    const keys = latest.current.items.map(latest.current.keyOf);
    const from = keys.indexOf(key);
    if (from < 0) return false;
    const h = latest.current.host;
    g.dragging = true;
    g.keys = keys;
    g.slots = keys.map((k) => slots.current.get(k) ?? { top: 0, height: 0 });
    g.from = from;
    g.to = from;
    g.startOffset = h?.offset() ?? 0;
    pointerY.current = g.current.y;
    // A finger would scroll the list instead; a mouse wheel may keep scrolling it.
    if (g.touch) h?.lockScroll(true);
    h?.holdPresses(true);
    h?.measureViewport();
    setActiveKey(key);
    if (frame.current === null) frame.current = requestAnimationFrame(autoScroll);
    return true;
  };

  const finish = (commit: boolean) => {
    clearTimer();
    if (frame.current !== null) cancelAnimationFrame(frame.current);
    frame.current = null;
    const g = gesture.current;
    gesture.current = idle();
    if (!g.dragging) return;
    const h = latest.current.host;
    if (g.touch) h?.lockScroll(false);
    h?.holdPresses(false);
    setActiveKey(null);
    setCue(null);
    const treeDrag = latest.current.tree;
    if (treeDrag) {
      if (commit && g.cue !== null && g.key !== null) treeDrag.onDrop(g.key, g.cue as C);
      return;
    }
    if (!commit || g.to === g.from) return;
    // By key: the list may have changed under the drag. Rows that arrived meanwhile keep the end.
    const { items: now, keyOf: keyOfNow } = latest.current;
    const byKey = new Map(now.map((item) => [keyOfNow(item), item]));
    const moved = moveItem(g.keys, g.from, g.to).flatMap((key) => {
      const item = byKey.get(key);
      byKey.delete(key);
      return item === undefined ? [] : [item];
    });
    latest.current.onReorder([...moved, ...byKey.values()]);
  };

  // The drop re-rendered the rows in their new places; the offsets that showed them there go.
  useLayoutEffect(() => {
    if (activeKey !== null) return;
    for (const value of values.current.values()) {
      value.stopAnimation();
      value.setValue(0);
    }
  }, [activeKey]);

  useEffect(
    () => () => {
      clearTimer();
      if (frame.current !== null) cancelAnimationFrame(frame.current);
      if (gesture.current.dragging) {
        if (gesture.current.touch) latest.current.host?.lockScroll(false);
        latest.current.host?.holdPresses(false);
      }
    },
    [],
  );

  /** Tracks a press that has not become a drag; a touch that moves first is a scroll or swipe. */
  const track = (key: string, event: GestureResponderEvent) => {
    const g = gesture.current;
    if (g.key !== key || g.dragging) return;
    g.current = pointOf(event);
    if (g.touch && !g.armed && decideLongPressMove({ dragArmed: false, startPoint: g.start, currentPoint: g.current }) !== "none") {
      clearTimer();
      gesture.current = idle();
    }
  };

  const handles = useRef(new Map<string, { responder: PanResponderInstance; props: DragHandleProps }>());
  const handleOf = (key: string): DragHandleProps => {
    const cached = handles.current.get(key);
    if (cached) return cached.props;
    const responder = PanResponder.create({
      // Watches every press on the row without taking it, so a plain tap still reaches the row.
      onStartShouldSetPanResponderCapture: (event) => {
        if (!latest.current.enabled || gesture.current.dragging || latest.current.host?.suspended()) return false;
        clearTimer();
        const point = pointOf(event);
        const type = (event.nativeEvent as { type?: string }).type ?? "";
        const touch = !IS_WEB || type.startsWith("touch");
        gesture.current = { ...idle(), key, touch, start: point, current: point };
        if (touch) {
          timer.current = setTimeout(() => {
            const g = gesture.current;
            if (g.key !== key || g.dragging) return;
            const slop = IS_WEB ? TOUCH_HOLD_SLOP_WEB : TOUCH_HOLD_SLOP_NATIVE;
            if (Math.hypot(g.current.x - g.start.x, g.current.y - g.start.y) > slop) return;
            g.armed = true;
            lift(key);
          }, TOUCH_HOLD_DELAY_MS);
        }
        return false;
      },
      onMoveShouldSetPanResponderCapture: (event) => {
        const g = gesture.current;
        if (!latest.current.enabled || g.key !== key) return false;
        if (g.dragging) return true;
        track(key, event);
        if (gesture.current.key !== key || g.touch) return false;
        return Math.hypot(g.current.x - g.start.x, g.current.y - g.start.y) > MOUSE_DRAG_DISTANCE;
      },
      onPanResponderGrant: () => {
        gesture.current.granted = true;
        if (!gesture.current.dragging && gesture.current.key === key) lift(key);
      },
      onPanResponderMove: (event) => {
        if (!gesture.current.dragging) return;
        pointerY.current = pointOf(event).y;
        reposition();
      },
      onPanResponderRelease: () => finish(true),
      onPanResponderTerminate: () => finish(false),
      onPanResponderTerminationRequest: () => false,
      onShouldBlockNativeResponder: () => true,
    });
    const props: DragHandleProps = {
      ...responder.panHandlers,
      onTouchMove: (event) => track(key, event),
      // A hold that lifted the row but never moved ends here: the responder never changed hands.
      onTouchEnd: () => {
        const g = gesture.current;
        if (g.key !== key || g.granted) return;
        if (g.dragging) finish(false);
        else {
          clearTimer();
          gesture.current = idle();
        }
      },
      onTouchCancel: () => {
        if (gesture.current.key === key && !gesture.current.granted) finish(false);
      },
      style: NO_SELECT,
    };
    handles.current.set(key, { responder, props });
    return props;
  };

  return (
    <>
      {items.map((item) => {
        const key = keyOf(item);
        const dragging = key === activeKey;
        return (
          <Animated.View
            key={key}
            onLayout={(event) => {
              const { y, height } = event.nativeEvent.layout;
              slots.current.set(key, { top: y, height });
            }}
            style={{
              // On web the lifted item also fades and grows a little, as dnd-kit's sortable item does.
              zIndex: dragging ? 1000 : 1,
              opacity: dragging && IS_WEB ? 0.9 : 1,
              transform: [{ translateY: valueOf(key) }, { scale: dragging && IS_WEB ? 1.02 : 1 }],
            }}
          >
            {renderItem(item, { dragging, handle: enabled ? handleOf(key) : undefined, cue })}
          </Animated.View>
        );
      })}
      {tree && cue !== null ? tree.renderOverlay(cue, (key) => slots.current.get(key)) : null}
    </>
  );
}
