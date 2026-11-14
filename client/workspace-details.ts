import { getPaseoClient, useHosts, type WorkspaceRef } from "@getpaseo/plugin/client";
import { createContext, useCallback, useContext, useEffect, useRef, useState, useSyncExternalStore } from "react";
import { type WorkspaceRowDetail, selectWorkspaceRowDetail } from "../shared/sidebar/workspace-row";

/*
 * The plugin's workspace snapshot has no change request, checks, services or normalized branch,
 * which the default sidebar rows show. The full descriptors come from each host's own workspace
 * directory: `usePaseo()` only reaches the selected host, so every online host is followed through
 * `getPaseoClient`, with an owned `workspaces.list({ subscribe: {} })` per host.
 */

type Api = ReturnType<typeof getPaseoClient>;
type ListResult = Awaited<ReturnType<Api["workspaces"]["list"]>>;
type Descriptor = ListResult["entries"][number];

/** The daemon pages its directory at 200, its maximum. */
const PAGE_LIMIT = 200;

/** `${hostId}:${workspaceId}`, the same pair a `WorkspaceRef` carries. */
export function detailKey(hostId: string, workspaceId: string): string {
  return `${hostId}:${workspaceId}`;
}

/** Row details of every followed workspace, by `detailKey`. Each entry keeps its identity until it changes. */
export class WorkspaceDetailsStore {
  private readonly byKey = new Map<string, WorkspaceRowDetail>();
  private readonly idsByHost = new Map<string, Set<string>>();
  private readonly listeners = new Set<() => void>();
  /** Bumped on every change, so a reader of the whole lookup knows when to look again. */
  private version = 0;

  getVersion = (): number => this.version;

  get = (key: string): WorkspaceRowDetail | null => this.byKey.get(key) ?? null;

  subscribe = (listener: () => void): (() => void) => {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  };

  /** A fresh directory for a host: what it no longer lists is gone. */
  replaceHost(hostId: string, entries: readonly Descriptor[]): void {
    const ids = this.idsByHost.get(hostId) ?? new Set<string>();
    const listed = new Set(entries.map((w) => w.id));
    for (const id of ids) if (!listed.has(id)) this.byKey.delete(detailKey(hostId, id));
    this.idsByHost.set(hostId, listed);
    for (const w of entries) this.byKey.set(detailKey(hostId, w.id), selectWorkspaceRowDetail(w));
    this.emit();
  }

  /** Later directory pages add to the first one rather than replacing it. */
  addPage(hostId: string, entries: readonly Descriptor[]): void {
    const ids = this.idsByHost.get(hostId) ?? new Set<string>();
    this.idsByHost.set(hostId, ids);
    for (const w of entries) {
      ids.add(w.id);
      this.byKey.set(detailKey(hostId, w.id), selectWorkspaceRowDetail(w));
    }
    this.emit();
  }

  upsert(hostId: string, workspace: Descriptor): void {
    this.addPage(hostId, [workspace]);
  }

  remove(hostId: string, workspaceId: string): void {
    this.idsByHost.get(hostId)?.delete(workspaceId);
    if (this.byKey.delete(detailKey(hostId, workspaceId))) this.emit();
  }

  dropHost(hostId: string): void {
    const ids = this.idsByHost.get(hostId);
    if (!ids) return;
    for (const id of ids) this.byKey.delete(detailKey(hostId, id));
    this.idsByHost.delete(hostId);
    this.emit();
  }

  private emit(): void {
    this.version += 1;
    for (const listener of this.listeners) listener();
  }
}

/** Follows one host's workspace directory into the store until the returned stop is called. */
function followHost(store: WorkspaceDetailsStore, hostId: string): () => void {
  let stopped = false;
  let stop: (() => void) | null = null;
  // A reconnect delivers a new first page; pages still loading for the old one are dropped.
  let generation = 0;

  const loadRest = async (api: Api, first: ListResult) => {
    const mine = ++generation;
    store.replaceHost(hostId, first.entries);
    let pageInfo = first.pageInfo;
    while (pageInfo.hasMore && pageInfo.nextCursor && !stopped && mine === generation) {
      const page = await api.workspaces.list({ page: { limit: PAGE_LIMIT, cursor: pageInfo.nextCursor } });
      if (stopped || mine !== generation) return;
      store.addPage(hostId, page.entries);
      pageInfo = page.pageInfo;
    }
  };

  const start = async () => {
    const api = getPaseoClient(hostId);
    const { subscription } = await api.workspaces.list({ subscribe: {}, page: { limit: PAGE_LIMIT } });
    if (stopped) {
      void subscription.release().catch(() => undefined);
      return;
    }
    // The observer gets the first page now and again after every reconnect, then live changes.
    const unsubscribe = subscription.subscribe({
      snapshot: (first) => {
        loadRest(api, first).catch((error: unknown) => console.warn("[paseo-clusters] Could not page workspaces", hostId, error));
      },
      update: (message) => {
        if (message.type !== "workspace_update") return;
        const update = message.payload;
        if (update.kind === "upsert") store.upsert(hostId, update.workspace);
        else store.remove(hostId, update.id);
      },
      error: (error) => console.warn("[paseo-clusters] Workspace subscription failed", hostId, error),
    });
    stop = () => {
      unsubscribe();
      void subscription.release().catch(() => undefined);
    };
  };

  start().catch((error: unknown) => console.warn("[paseo-clusters] Could not follow workspaces", hostId, error));
  return () => {
    stopped = true;
    stop?.();
  };
}

/**
 * Follows the workspace directory of every online host for as long as the caller is mounted. A
 * host that goes offline keeps its last details, as the app keeps its rows; a removed host's go.
 */
export function useWorkspaceDetailsSource(): WorkspaceDetailsStore {
  const [store] = useState(() => new WorkspaceDetailsStore());
  const hosts = useHosts();
  const online = hosts
    .filter((host) => host.status === "online")
    .map((host) => host.serverId)
    .sort()
    .join("\n");
  const known = hosts
    .map((host) => host.serverId)
    .sort()
    .join("\n");
  const follows = useRef(new Map<string, () => void>());
  const seen = useRef(new Set<string>());

  useEffect(() => {
    const wanted = new Set(online ? online.split("\n") : []);
    for (const [hostId, stop] of follows.current) {
      if (wanted.has(hostId)) continue;
      stop();
      follows.current.delete(hostId);
    }
    // A host back online may sit on a new connection, so it is followed afresh.
    for (const hostId of wanted) if (!follows.current.has(hostId)) follows.current.set(hostId, followHost(store, hostId));
  }, [store, online]);

  useEffect(() => {
    const configured = new Set(known ? known.split("\n") : []);
    for (const hostId of seen.current) if (!configured.has(hostId)) store.dropHost(hostId);
    seen.current = configured;
  }, [store, known]);

  useEffect(() => {
    const current = follows.current;
    return () => {
      for (const stop of current.values()) stop();
      current.clear();
    };
  }, []);

  return store;
}

const DetailsContext = createContext<WorkspaceDetailsStore | null>(null);

export const WorkspaceDetailsProvider = DetailsContext.Provider;

const nothing = () => () => undefined;

/** The row details of one workspace, or null until its host has listed it. */
export function useWorkspaceDetail(ref: Pick<WorkspaceRef, "hostId" | "id">): WorkspaceRowDetail | null {
  const store = useContext(DetailsContext);
  const key = detailKey(ref.hostId, ref.id);
  return useSyncExternalStore(store?.subscribe ?? nothing, () => store?.get(key) ?? null);
}

/** The whole lookup by `detailKey`, for callers that need more than one row's details. */
export function useWorkspaceDetails(): (key: string) => WorkspaceRowDetail | null {
  const store = useContext(DetailsContext);
  const version = useSyncExternalStore(store?.subscribe ?? nothing, () => store?.getVersion() ?? 0);
  // A new function per change, so memoized readers recompute.
  return useCallback((key: string) => store?.get(key) ?? null, [store, version]);
}
