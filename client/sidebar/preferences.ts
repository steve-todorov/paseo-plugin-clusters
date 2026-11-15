import { useSettings } from "@getpaseo/plugin/client";
import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from "react";
import {
  DEFAULT_SIDEBAR_PREFERENCES,
  type SidebarPreferences,
  type SidebarSettings,
  parseSidebarSettings,
} from "../../shared/sidebar/preferences";
import { sidebarSettings } from "../../shared/sidebar/settings";

/** The display preferences every row reads, as the view's settings set them. */
const PreferencesContext = createContext<SidebarPreferences>(DEFAULT_SIDEBAR_PREFERENCES);

export const SidebarPreferencesProvider = PreferencesContext.Provider;

export function useSidebarPreferences(): SidebarPreferences {
  return useContext(PreferencesContext);
}

const DEFAULT_SETTINGS = parseSidebarSettings({});

export interface StoredSidebarSettings {
  /** What the view shows: the last change made here, else the stored document, else the defaults. */
  settings: SidebarSettings;
  /** The stored document has been read; changes made before it would overwrite it with defaults. */
  ready: boolean;
  update(change: (current: SidebarSettings) => SidebarSettings): void;
}

function sameDocument(a: SidebarSettings, b: SidebarSettings): boolean {
  return JSON.stringify(parseSidebarSettings(a)) === JSON.stringify(b);
}

/**
 * The per-device settings document, changed optimistically. A change shows at once; saves run one
 * at a time against the latest revision, so quick toggles never race each other into a conflict.
 * A save that fails drops the change and rereads what is stored.
 */
export function useStoredSidebarSettings(): StoredSidebarSettings {
  const state = useSettings(sidebarSettings);
  // A device read is local and quick; until it lands, the list shows Paseo's defaults.
  const parsed = state.status === "ready" ? state.values : DEFAULT_SETTINGS;
  // `useSettings` parses a fresh object each render; keep one per stored text so lists don't redo.
  const storedJson = JSON.stringify(parsed);
  const stored = useMemo(() => parsed, [storedJson]);
  const revision = state.status === "ready" || state.status === "invalid" ? state.revision : null;
  const [pending, setPending] = useState<SidebarSettings | null>(null);
  const storedRef = useRef(stored);
  storedRef.current = stored;
  const stateRef = useRef(state);
  stateRef.current = state;

  const update = useCallback((change: (current: SidebarSettings) => SidebarSettings) => {
    setPending((previous) => change(previous ?? storedRef.current));
  }, []);

  // A ref, not the `saving` flag, marks a save in flight: the flag lands a render late.
  const inFlight = useRef(false);
  const [settled, setSettled] = useState(0);
  useEffect(() => {
    if (pending === null || revision === null || inFlight.current) return;
    if (sameDocument(pending, storedRef.current)) {
      setPending(null);
      return;
    }
    inFlight.current = true;
    void stateRef.current.save(pending, revision).then((saved) => {
      inFlight.current = false;
      if (!saved) {
        setPending(null);
        void stateRef.current.reload();
      }
      // Run again: a change made while this one saved still waits.
      setSettled((count) => count + 1);
    });
  }, [pending, revision, stored, settled]);

  return { settings: pending ?? stored, ready: state.status === "ready", update };
}
