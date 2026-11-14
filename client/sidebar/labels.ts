import { useQuery } from "@tanstack/react-query";
import { useMemo } from "react";
import { type WorkspaceLabelDefinition, selectWorkspaceLabelDefinitions } from "../../shared/sidebar/labels";
import { useHostEndpoint } from "../host-rpc";

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
