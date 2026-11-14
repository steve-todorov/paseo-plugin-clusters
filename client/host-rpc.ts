import { useSyncExternalStore } from "react";
import type { ProjectIconData } from "../shared/daemon-data";
import type { WorkspaceLabelDefinition } from "../shared/sidebar/labels";

/*
 * Plugin RPC only reaches the daemon of the copy that calls it, and the sidebar view lists every
 * host. So each copy offers its daemon's reads here, under the host id its daemon reported, and the
 * view picks the copy of the host that owns a row. A host whose copy is older never offers them,
 * and its rows keep the fallback.
 */

export interface HostEndpoint {
  readProjectIcon(projectId: string): Promise<ProjectIconData | null>;
  readWorkspaceLabels(): Promise<readonly WorkspaceLabelDefinition[]>;
}

interface Registry {
  endpoints: Map<string, HostEndpoint>;
  listeners: Set<() => void>;
}

/** Shared by every copy in the page. Bump the suffix if `HostEndpoint` changes incompatibly. */
const REGISTRY_KEY = "__paseoClustersHostEndpoints:1";

function registry(): Registry {
  const slot = globalThis as unknown as { [REGISTRY_KEY]?: Registry };
  slot[REGISTRY_KEY] ??= { endpoints: new Map(), listeners: new Set() };
  return slot[REGISTRY_KEY];
}

function emit(reg: Registry): void {
  for (const listener of reg.listeners) listener();
}

/** Offers a daemon's reads for its host until the returned release is called. */
export function offerHostEndpoint(hostId: string, endpoint: HostEndpoint): () => void {
  const reg = registry();
  if (reg.endpoints.get(hostId) !== endpoint) {
    reg.endpoints.set(hostId, endpoint);
    emit(reg);
  }
  return () => {
    if (reg.endpoints.get(hostId) !== endpoint) return;
    reg.endpoints.delete(hostId);
    emit(reg);
  };
}

function subscribe(listener: () => void): () => void {
  const reg = registry();
  reg.listeners.add(listener);
  return () => reg.listeners.delete(listener);
}

/** The reads of a host's daemon, or null while no copy on that host offers them. */
export function useHostEndpoint(hostId: string): HostEndpoint | null {
  return useSyncExternalStore(subscribe, () => registry().endpoints.get(hostId) ?? null);
}
