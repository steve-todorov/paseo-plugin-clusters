import type { ProjectRef } from "@getpaseo/plugin/client";
import { createContext, useContext } from "react";
import { type GroupPlacement, type ProjectGrouping, iconPlacementOf, placementKey } from "../../shared/sidebar/project-groups";

/*
 * The view's project groups (shared/sidebar/project-groups.ts), for the rows that lead with their
 * project's icon and name: pinned and status rows, which no project row contains.
 */

const GroupingContext = createContext<ProjectGrouping | null>(null);

export const ProjectGroupingProvider = GroupingContext.Provider;

export function useProjectGrouping(): ProjectGrouping | null {
  return useContext(GroupingContext);
}

/** The ref of a group's project on one host, as the app interns it. */
export function projectRefOf(placement: Pick<GroupPlacement, "hostId" | "projectId">): ProjectRef {
  return { kind: "project", key: placementKey(placement.hostId, placement.projectId), hostId: placement.hostId, id: placement.projectId };
}

/** What a hoisted row leads with, as Paseo draws it: the group's icon and colour key, and a name. */
export function leadingProjectOf(
  grouping: ProjectGrouping | null,
  w: { hostId: string; projectId: string; project: ProjectRef; projectName: string },
  name: "group" | "project",
): { project: ProjectRef; colorKey: string; name: string } {
  const group = grouping?.groupOf(w.hostId, w.projectId) ?? null;
  const icon = group ? iconPlacementOf(group) : null;
  return {
    project: icon ? projectRefOf(icon) : w.project,
    colorKey: grouping?.keyOf(w.hostId, w.projectId) ?? placementKey(w.hostId, w.projectId),
    name: (name === "group" ? group?.title : grouping?.nameOf(w.hostId, w.projectId)) ?? w.projectName,
  };
}
