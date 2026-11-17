import { useWorkspaces } from "@getpaseo/plugin/client";
import { useQueries } from "@tanstack/react-query";
import { createContext, useContext, useEffect, useMemo, useState, useSyncExternalStore } from "react";
import { workspaceUsedAt } from "../../shared/activity";
import type { ProgressReadResultData } from "../../shared/daemon-data";
import { type RowProgress, aggregateRowProgress, rowProgressOf } from "../../shared/sidebar/progress-bar";
import { type ProgressVisibilityPrefs, progressIsFresh } from "../../shared/sidebar/progress-visibility";
import { getHostEndpoint, useOfferedHostIds } from "../host-rpc";

/*
 * Each workspace's Paseo Progress run, read by its own host's copy of this plugin (each daemon
 * reads its own files) and polled while the sidebar view is mounted. A host whose copy has no
 * `readProgress`, or that does not run Progress, draws nothing; the latter is asked again only at
 * the server's availability interval. Under "Hide when idle" a stale workspace's run is left out
 * here, before any folded parent rolls it up.
 */

/** How often an open view rereads a host's progress files. */
const PROGRESS_REFRESH_MS = 12_000;
/** How often a host without Progress is asked again (the server keeps its answer this long). */
const UNAVAILABLE_REFRESH_MS = 60_000;

/** Row progress by workspace key; each entry keeps its identity until it changes. */
export class ProgressStore {
  private byKey = new Map<string, { json: string; value: RowProgress }>();
  private available = false;
  private readonly listeners = new Set<() => void>();

  get = (key: string): RowProgress | null => this.byKey.get(key)?.value ?? null;

  /** Some host runs Progress, stale workspaces or not: the display menu offers its rows then. */
  isAvailable = (): boolean => this.available;

  subscribe = (listener: () => void): (() => void) => {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  };

  replace(next: ReadonlyMap<string, RowProgress>, available: boolean): void {
    let changed = next.size !== this.byKey.size || available !== this.available;
    this.available = available;
    const fresh = new Map<string, { json: string; value: RowProgress }>();
    for (const [key, value] of next) {
      const json = JSON.stringify(value);
      const old = this.byKey.get(key);
      if (old && old.json === json) fresh.set(key, old);
      else {
        fresh.set(key, { json, value });
        changed = true;
      }
    }
    this.byKey = fresh;
    if (changed) for (const listener of this.listeners) listener();
  }
}

const SEPARATOR = "\u0000";

/**
 * Follows every listed workspace's progress for as long as the caller is mounted. `now` is the
 * view's clock; its ticks hide runs that go stale without anything else changing.
 */
export function useProgressSource(visibility: ProgressVisibilityPrefs, now: number): ProgressStore {
  const [store] = useState(() => new ProgressStore());
  // One group per host and directory; its items are the workspaces there.
  const groups = useWorkspaces({ where: (w) => !w.archivingAt && Boolean(w.directory), groupBy: (w) => `${w.hostId}${SEPARATOR}${w.directory}` });
  const offered = useOfferedHostIds();
  const layout = useMemo(() => {
    const directories = new Map<string, Set<string>>();
    const keysOf = new Map<string, string[]>();
    for (const group of groups) {
      const [hostId, directory] = group.key.split(SEPARATOR);
      if (!hostId || !directory) continue;
      if (!directories.has(hostId)) directories.set(hostId, new Set());
      directories.get(hostId)?.add(directory);
      keysOf.set(group.key, group.items.map((ref) => ref.key));
    }
    return { directories, keysOf };
  }, [groups]);
  // Stale workspaces are still read, so their runs come back as soon as they are used again.
  const stale = useWorkspaces({ where: (w) => !w.archivingAt && !progressIsFresh(workspaceUsedAt(w), now, visibility) });
  const staleKeys = useMemo(() => stale.map((ref) => ref.key).join("\n"), [stale]);
  const hostIds = [...layout.directories.keys()].filter((id) => offered.includes(id) && getHostEndpoint(id)?.readProgress).sort();
  const results = useQueries({
    queries: hostIds.map((hostId) => {
      const directories = [...(layout.directories.get(hostId) ?? [])].sort();
      return {
        // A changed workspace list is a new key, so it is read at once; the last answer shows meanwhile.
        queryKey: ["paseo-clusters", "progress", hostId, directories.join("\n")],
        queryFn: async (): Promise<ProgressReadResultData | null> => (await getHostEndpoint(hostId)?.readProgress?.(directories)) ?? null,
        refetchInterval: (query: { state: { data?: ProgressReadResultData | null } }) =>
          query.state.data?.available === false ? UNAVAILABLE_REFRESH_MS : PROGRESS_REFRESH_MS,
        placeholderData: (previous: ProgressReadResultData | null | undefined) => previous,
        staleTime: PROGRESS_REFRESH_MS,
        retry: false,
      };
    }),
  });
  const stamp = results.map((result, index) => `${hostIds[index]}:${result.dataUpdatedAt}`).join(",");
  useEffect(() => {
    const hidden = new Set(staleKeys ? staleKeys.split("\n") : []);
    const next = new Map<string, RowProgress>();
    let available = false;
    results.forEach((result, index) => {
      const hostId = hostIds[index];
      const data = result.data;
      if (!hostId || !data?.available) return;
      available = true;
      for (const [directory, summary] of Object.entries(data.summaries)) {
        const progress = rowProgressOf(summary);
        if (!progress) continue;
        for (const key of layout.keysOf.get(`${hostId}${SEPARATOR}${directory}`) ?? []) if (!hidden.has(key)) next.set(key, progress);
      }
    });
    store.replace(next, available);
    // `stamp` changes with every answer; `layout` with the workspace list; `staleKeys` with the clock.
  }, [store, stamp, layout, staleKeys]);
  return store;
}

const ProgressContext = createContext<ProgressStore | null>(null);

export const ProgressProvider = ProgressContext.Provider;

const nothing = () => () => undefined;

/** A workspace row's progress, or null for no bar and no pills. */
export function useRowProgress(key: string): RowProgress | null {
  const store = useContext(ProgressContext);
  return useSyncExternalStore(store?.subscribe ?? nothing, () => store?.get(key) ?? null);
}

/** A folded parent's roll-up over itself and the rows below it; null while none has progress. */
export function useSubtreeProgress(keys: readonly string[]): RowProgress | null {
  const store = useContext(ProgressContext);
  const joined = keys.join("\n");
  const snapshot = useSyncExternalStore(store?.subscribe ?? nothing, () =>
    keys.length === 0 || !store ? "" : JSON.stringify(aggregateRowProgress(keys.map((key) => store.get(key)))),
  );
  return useMemo(() => (snapshot ? (JSON.parse(snapshot) as RowProgress | null) : null), [snapshot, joined]);
}
