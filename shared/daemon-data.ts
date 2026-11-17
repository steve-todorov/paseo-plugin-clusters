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

export const progressSummarySchema = z.object({
  title: z.string().nullable(),
  tickets: z.array(z.object({ state: z.enum(["not_started", "working", "blocked", "waiting", "done"]), stuck: z.boolean() })),
  questions: z.number(),
  stuck: z.number(),
  stale: z.boolean(),
  finished: z.boolean(),
  updatedAt: z.string().nullable(),
});

export const progressReadResultSchema = z.object({
  /** False when the host does not run the Progress plugin: then `summaries` is empty. */
  available: z.boolean(),
  summaries: z.record(z.string(), progressSummarySchema.nullable()),
});

export type ProgressReadResultData = z.infer<typeof progressReadResultSchema>;

/**
 * The Paseo Progress plugin's latest run in each workspace directory, read from its files on the
 * daemon's host (server/progress.ts). Sent from 0.5.9 on, like the reads above.
 */
export const readProgress = defineRpc({
  name: "clusters.progress.read",
  input: z.object({ directories: z.array(z.string().max(4096)).max(2000) }),
  output: progressReadResultSchema,
});
