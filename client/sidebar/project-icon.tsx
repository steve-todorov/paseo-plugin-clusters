import { type ProjectRef, useHosts, useProject } from "@getpaseo/plugin/client";
import { Icon } from "@getpaseo/plugin/client/ui";
import { useQuery } from "@tanstack/react-query";
import { useMemo } from "react";
import { Image, Text, View } from "react-native";
import type { ProjectIconData } from "../../shared/daemon-data";
import { deriveIdentityColorName, identityColor } from "../../shared/sidebar/identity-colors";
import {
  getProjectStatusBadgeContent,
  projectIconInitial,
  projectIconRadius,
  projectIconRevision,
  selectProjectIconPicture,
} from "../../shared/sidebar/project-icon";
import { useHostEndpoint } from "../host-rpc";
import { StatusRing } from "./status-ring";
import { LINE, type Theme, palette } from "./theme";

/*
 * A project's icon as the default sidebar draws it (components/project-icon-view.tsx,
 * project-icon-image.tsx and sidebar/project-leading-visual.tsx, v0.16). The image comes from the
 * owning host's copy of this plugin, which reads it as the daemon would; without one, or until it
 * answers, the lettered square shows.
 */

/** The app's pointer icon box (`densityIconBox("md")`); like the rest of this view, touch sizes are not applied. */
export const PROJECT_ICON_SIZE = 16;

/** The corner badge's shell, and how far it hangs past the icon's corner. */
const BADGE_SIZE = 12;
const BADGE_OFFSET = -4;
/** The running ring's knockout frame is 14, re-centred on the same corner. */
const RING_OFFSET = BADGE_OFFSET - (14 - BADGE_SIZE) / 2;

/**
 * What a project's lettered square hashes for its colour. The app hashes its `projectViewKey`, which
 * plugins do not see; the host and project ids stand in, so the colour can differ from the app's.
 */
export function projectColorKey(hostId: string, projectId: string): string {
  return JSON.stringify([hostId, projectId]);
}

function useHostOnline(hostId: string): boolean {
  const hosts = useHosts();
  return hosts.some((host) => host.serverId === hostId && host.status === "online");
}

/**
 * The project's icon from its host, cached by the project's icon revision as the app caches it:
 * fetched once per revision, never refetched on focus or reconnect.
 */
export function useProjectIconData(project: ProjectRef): ProjectIconData | null {
  const revision = useProject(project, (p) => p.iconRevision);
  const endpoint = useHostEndpoint(project.hostId);
  const online = useHostOnline(project.hostId);
  const query = useQuery({
    queryKey: ["paseo-clusters", "projectIcon", project.hostId, project.id, projectIconRevision(revision ?? null)],
    queryFn: () => (endpoint ? endpoint.readProjectIcon(project.id) : null),
    enabled: endpoint !== null && online,
    staleTime: Infinity,
    gcTime: 1000 * 60 * 60,
    refetchOnMount: false,
    refetchOnWindowFocus: false,
    refetchOnReconnect: false,
    // A host without the handler or a failed read keeps the lettered square.
    retry: false,
  });
  return query.data ?? null;
}

/** The image, or the identity-coloured square with the project's initial. */
export function ProjectIcon({
  icon,
  displayName,
  colorKey,
  size = PROJECT_ICON_SIZE,
}: {
  icon: ProjectIconData | null;
  displayName: string;
  /** Hashed to the square's colour; the app's `projectViewKey`. */
  colorKey: string;
  size?: number;
}) {
  const picture = useMemo(() => selectProjectIconPicture(icon), [icon]);
  // An uploaded or discovered image is someone's mark: sized, never rounded.
  if (picture.kind === "svg") {
    return (
      <View style={{ width: size, height: size, overflow: "hidden" }}>
        <Icon icon={{ svg: picture.xml }} size={size} />
      </View>
    );
  }
  if (picture.kind === "image") {
    return <Image source={{ uri: picture.uri }} style={{ width: size, height: size }} accessibilityIgnoresInvertColors />;
  }
  return (
    <View
      style={{
        width: size,
        height: size,
        borderRadius: projectIconRadius(size),
        alignItems: "center",
        justifyContent: "center",
        backgroundColor: identityColor(deriveIdentityColorName(colorKey)),
      }}
    >
      <Text style={{ fontSize: 9, color: "#ffffff" }}>{projectIconInitial(displayName)}</Text>
    </View>
  );
}

/**
 * The project icon as a row's leading visual, with the row's status in a corner badge: an alert for
 * needs_input, a dot for failed, attention and running, nothing when done. `backdrop` is the row's
 * current fill, which the badge is cut out of.
 */
export function ProjectStatusIndicator({
  project,
  displayName,
  colorKey,
  indicator,
  backdrop,
  theme,
}: {
  project: ProjectRef;
  displayName: string;
  colorKey: string;
  indicator: string | null;
  backdrop: string;
  theme: Theme;
}) {
  const icon = useProjectIconData(project);
  const colors = palette(theme);
  const badge = getProjectStatusBadgeContent(indicator);
  let badgeView = null;
  if (badge?.kind === "dot" && badge.bucket === "running") {
    badgeView = (
      <View style={{ position: "absolute", right: RING_OFFSET, bottom: RING_OFFSET }}>
        <StatusRing color={colors.running} backdrop={backdrop} />
      </View>
    );
  } else if (badge) {
    const dotColor = badge.kind === "alert" ? colors.warning : badge.bucket === "failed" ? colors.danger : colors.success;
    badgeView = (
      <View
        style={{
          position: "absolute",
          right: BADGE_OFFSET,
          bottom: BADGE_OFFSET,
          width: BADGE_SIZE,
          height: BADGE_SIZE,
          borderRadius: BADGE_SIZE / 2,
          alignItems: "center",
          justifyContent: "center",
          overflow: "hidden",
          backgroundColor: backdrop,
        }}
      >
        {badge.kind === "alert" ? (
          // The app's filled CircleAlert, which the plugin `Icon` cannot fill.
          <View style={{ width: 12, height: 12, borderRadius: 6, backgroundColor: dotColor, alignItems: "center", justifyContent: "center" }}>
            <Text style={{ color: theme.colors.surface0, fontSize: 9, fontWeight: "700", lineHeight: 12 }}>!</Text>
          </View>
        ) : (
          <View style={{ width: 6, height: 6, borderRadius: 3, backgroundColor: dotColor }} />
        )}
      </View>
    );
  }
  return (
    <View style={{ width: PROJECT_ICON_SIZE, height: LINE, flexShrink: 0, alignItems: "center", justifyContent: "center" }}>
      <View style={{ width: PROJECT_ICON_SIZE, height: PROJECT_ICON_SIZE }}>
        <ProjectIcon icon={icon} displayName={displayName} colorKey={colorKey} />
        {badgeView}
      </View>
    </View>
  );
}
