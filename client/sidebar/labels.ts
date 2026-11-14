import { useQueries, useQuery } from "@tanstack/react-query";
import { useMemo } from "react";
import { type HostLabelCatalog, mergeWorkspaceLabelCatalogs } from "../../shared/sidebar/filters";
import { type WorkspaceLabelDefinition, selectWorkspaceLabelDefinitions } from "../../shared/sidebar/labels";
import { getHostEndpoint, useHostEndpoint, useOfferedHostIds } from "../host-rpc";

/*
 * Each host's label catalog, read through that host's copy of this plugin. The app follows the
 * catalog live; the plugin cannot observe it, so it is read again while the view is open. Every
 * row of a host shares one query.
 */

/** How often an open view rereads a host's catalog. */
const CATALOG_REFRESH_MS = 30_000;

/** The host's catalog, or null while it has none to offer (an older copy, offline, not read yet). */
export function useWorkspaceLabelCatalog(hostId: string): readonly WorkspaceLabelDefinition[] | null {
  const endpoint = useHostEndpoint(hostId);
  const query = useQuery({
    queryKey: ["paseo-clusters", "workspaceLabels", hostId],
    queryFn: () => (endpoint ? endpoint.readWorkspaceLabels() : null),
    enabled: endpoint !== null,
    staleTime: CATALOG_REFRESH_MS,
    refetchInterval: CATALOG_REFRESH_MS,
    retry: false,
  });
  return query.data ?? null;
}

/** A workspace's labels with their host's colours; hashed colours while the catalog is missing. */
export function useWorkspaceLabels(hostId: string, names: readonly string[] | undefined): readonly WorkspaceLabelDefinition[] {
  const catalog = useWorkspaceLabelCatalog(hostId);
  return useMemo(() => selectWorkspaceLabelDefinitions(names, catalog), [names, catalog]);
}

/**
 * Every listed host's labels as one catalog, for the label filter; null while no host has one to
 * offer. Shares each host's query with the rows.
 */
export function useMergedLabelCatalog(hostIds: readonly string[]): WorkspaceLabelDefinition[] | null {
  const offered = useOfferedHostIds();
  const ids = hostIds.filter((id) => offered.includes(id));
  const results = useQueries({
    queries: ids.map((hostId) => ({
      queryKey: ["paseo-clusters", "workspaceLabels", hostId],
      queryFn: () => getHostEndpoint(hostId)?.readWorkspaceLabels() ?? null,
      staleTime: CATALOG_REFRESH_MS,
      refetchInterval: CATALOG_REFRESH_MS,
      retry: false,
    })),
  });
  const catalogs: HostLabelCatalog[] = results.flatMap((result, index) =>
    result.data ? [{ serverId: ids[index] ?? "", labels: result.data }] : [],
  );
  const key = JSON.stringify(catalogs);
  return useMemo(() => (catalogs.length > 0 ? mergeWorkspaceLabelCatalogs(catalogs) : null), [key]);
}
