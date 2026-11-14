import { defineRpc } from "@getpaseo/plugin";
import { z } from "zod";
import { WORKSPACE_LABEL_COLORS } from "./sidebar/labels.ts";

/*
 * Daemon data the default sidebar draws but the plugin's PaseoApi does not expose. Each daemon's
 * plugin copy reads its own files and answers as the daemon would. Sent from 0.5.9 on: a host whose
 * copy is older has no handler, and the view keeps its fallback for it.
 */

export const projectIconSchema = z.object({ mimeType: z.string(), data: z.string() });

export type ProjectIconData = z.infer<typeof projectIconSchema>;

/** A project's icon, as `project.icon.get.request` returns it; null when it has none. */
export const readProjectIcon = defineRpc({
  name: "clusters.project-icon.read",
  input: z.object({ projectId: z.string() }),
  output: projectIconSchema.nullable(),
});

/** The daemon's workspace label catalog: each label's colour. */
export const readWorkspaceLabels = defineRpc({
  name: "clusters.workspace-labels.read",
  input: z.object({}),
  output: z.object({ labels: z.array(z.object({ name: z.string(), color: z.enum(WORKSPACE_LABEL_COLORS) })) }),
});
