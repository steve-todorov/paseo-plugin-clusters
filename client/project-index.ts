import { getPaseoClient, useHosts } from "@getpaseo/plugin/client";
import { useEffect, useMemo, useRef, useState, useSyncExternalStore } from "react";
import { type WorkspaceKeyFields, createKeyMatcher, indexHostProjects } from "../shared/project-keys";
import type { NamedProjectListing } from "../shared/project-list";

/*
 * Cluster keys are the sidebar's project keys; Paseo 0.16 workspace snapshots carry only the
 * project's id. Every online host's project list holds both, so it is followed here on every
 * client: read on start, again on each project update, and on a slow timer as a fallback.
 */

const RESYNC_MS = 60_000;

/** Per host, the project list as last read. */
export type HostProjectLists = ReadonlyMap<string, readonly NamedProjectListing[]>;

class ProjectListStore {
  private byHost: Map<string, readonly NamedProjectListing[]> = new Map();
  private readonly listeners = new Set<() => void>();

  /** A new map on each change, so it can be a snapshot. */
  getLists = (): HostProjectLists => this.byHost;

  subscribe = (listener: () => void): (() => void) => {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  };

  replaceHost(hostId: string, next: readonly NamedProjectListing[]): void {
    const current = this.byHost.get(hostId);
    if (current && sameLists(current, next)) return;
    this.byHost = new Map(this.byHost).set(hostId, next);
    this.emit();
  }

  dropHost(hostId: string): void {
    if (!this.byHost.has(hostId)) return;
    const next = new Map(this.byHost);
    next.delete(hostId);
    this.byHost = next;
    this.emit();
  }

  private emit(): void {
    for (const listener of this.listeners) listener();
  }
}

function listingOf(project: NamedProjectListing): NamedProjectListing {
  return {
    projectId: project.projectId,
    projectKey: project.projectKey ?? null,
    projectRootPath: project.projectRootPath ?? null,
    projectDisplayName: project.projectDisplayName ?? null,
    projectCustomName: project.projectCustomName ?? null,
    projectKind: project.projectKind ?? null,
  };
}

function sameLists(a: readonly NamedProjectListing[], b: readonly NamedProjectListing[]): boolean {
  return a.length === b.length && JSON.stringify(a) === JSON.stringify(b);
}

/** Follows one host's project list into the store until the returned stop is called. */
function followHost(store: ProjectListStore, hostId: string): () => void {
  let stopped = false;
  const api = getPaseoClient(hostId);
  const resync = async () => {
    try {
      const { projects } = await api.projects.list();
      if (!stopped) store.replaceHost(hostId, projects.map(listingOf));
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

/** Hosts the app lists; Paseo before 0.9 has no host list, and then none are followed here. */
const useHostList: typeof useHosts = typeof useHosts === "function" ? useHosts : () => [];
const canFollow = typeof getPaseoClient === "function";

/**
 * The project list of every online host, kept current. An offline host keeps its last list, as its
 * rows stay; a removed host's goes. Empty where the app cannot reach other hosts' clients.
 */
export function useHostProjectLists(): HostProjectLists {
  const [store] = useState(() => new ProjectListStore());
  const hosts = useHostList();
  const online = canFollow
    ? hosts
        .filter((host) => host.status === "online")
        .map((host) => host.serverId)
        .sort()
        .join("\n")
    : "";
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

  useEffect(() => {
    const configured = new Set(known ? known.split("\n") : []);
    for (const hostId of [...store.getLists().keys()]) if (!configured.has(hostId)) store.dropHost(hostId);
  }, [store, known]);

  useEffect(() => {
    const current = follows.current;
    return () => {
      for (const stop of current.values()) stop();
      current.clear();
    };
  }, []);

  return useSyncExternalStore(store.subscribe, store.getLists);
}

/**
 * The matcher from cluster keys to workspaces, over the project lists of every online host. A new
 * function each time a list changes, so the lists filtered with it are worked out again.
 */
export function useClusterKeyMatcher(): (key: string, w: WorkspaceKeyFields) => boolean {
  const lists = useHostProjectLists();
  return useMemo(() => keyMatcherOf(lists), [lists]);
}

/** The matcher from cluster keys to workspaces over the given host project lists. */
export function keyMatcherOf(lists: HostProjectLists): (key: string, w: WorkspaceKeyFields) => boolean {
  return createKeyMatcher(new Map([...lists].map(([hostId, projects]) => [hostId, indexHostProjects(hostId, projects)])));
}
