import { getPaseoClient, useHosts } from "@getpaseo/plugin/client";
import { useEffect, useMemo, useRef, useState, useSyncExternalStore } from "react";
import { type ProjectIndex, type WorkspaceKeyFields, createKeyMatcher, indexHostProjects } from "../shared/project-keys";

/*
 * Cluster keys are the sidebar's project keys; Paseo 0.16 workspace snapshots carry only the
 * project's id. Every online host's project list holds both, so it is followed here on every
 * client: read on start, again on each project update, and on a slow timer as a fallback.
 */

const RESYNC_MS = 60_000;

class ProjectIndexStore {
  private readonly byHost = new Map<string, Map<string, Set<string>>>();
  private readonly listeners = new Set<() => void>();
  private version = 0;

  getVersion = (): number => this.version;

  get index(): ProjectIndex {
    return this.byHost;
  }

  subscribe = (listener: () => void): (() => void) => {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  };

  replaceHost(hostId: string, next: Map<string, Set<string>>): void {
    const current = this.byHost.get(hostId);
    if (current && sameIndex(current, next)) return;
    this.byHost.set(hostId, next);
    this.emit();
  }

  dropHost(hostId: string): void {
    if (this.byHost.delete(hostId)) this.emit();
  }

  private emit(): void {
    this.version += 1;
    for (const listener of this.listeners) listener();
  }
}

function sameIndex(a: Map<string, Set<string>>, b: Map<string, Set<string>>): boolean {
  if (a.size !== b.size) return false;
  for (const [key, ids] of a) {
    const other = b.get(key);
    if (!other || other.size !== ids.size) return false;
    for (const id of ids) if (!other.has(id)) return false;
  }
  return true;
}

/** Follows one host's project list into the store until the returned stop is called. */
function followHost(store: ProjectIndexStore, hostId: string): () => void {
  let stopped = false;
  const api = getPaseoClient(hostId);
  const resync = async () => {
    try {
      const { projects } = await api.projects.list();
      if (!stopped) store.replaceHost(hostId, indexHostProjects(hostId, projects));
    } catch (error) {
      console.warn("[paseo-clusters] Could not read the project list", hostId, error);
    }
  };
  void resync();
  let unsubscribe: (() => void) | null = null;
  try {
    unsubscribe = api.projects.subscribe(() => void resync());
  } catch (error) {
    console.warn("[paseo-clusters] No project updates", hostId, error);
  }
  const timer = setInterval(() => void resync(), RESYNC_MS);
  return () => {
    stopped = true;
    clearInterval(timer);
    unsubscribe?.();
  };
}

/**
 * The matcher from cluster keys to workspaces, over the project lists of every online host. A new
 * function each time a list changes, so the lists filtered with it are worked out again.
 */
export function useClusterKeyMatcher(): (key: string, w: WorkspaceKeyFields) => boolean {
  const [store] = useState(() => new ProjectIndexStore());
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

  useEffect(() => {
    const wanted = new Set(online ? online.split("\n") : []);
    for (const [hostId, stop] of follows.current) {
      if (wanted.has(hostId)) continue;
      stop();
      follows.current.delete(hostId);
    }
    for (const hostId of wanted) if (!follows.current.has(hostId)) follows.current.set(hostId, followHost(store, hostId));
  }, [store, online]);

  // An offline host keeps its last list, as its rows stay; a removed host's goes.
  useEffect(() => {
    const configured = new Set(known ? known.split("\n") : []);
    for (const hostId of [...(store.index as Map<string, unknown>).keys()]) if (!configured.has(hostId)) store.dropHost(hostId);
  }, [store, known]);

  useEffect(() => {
    const current = follows.current;
    return () => {
      for (const stop of current.values()) stop();
      current.clear();
    };
  }, []);

  const version = useSyncExternalStore(store.subscribe, store.getVersion);
  // The version is what changes the index.
  return useMemo(() => createKeyMatcher(store.index), [store, version]);
}
