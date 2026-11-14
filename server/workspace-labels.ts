import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { z } from "zod";
import { WORKSPACE_LABEL_COLORS, type WorkspaceLabelDefinition } from "../shared/sidebar/labels.ts";
import { PASEO_HOME } from "./paseo-home.ts";

/*
 * The daemon's workspace label catalog (server/workspace-labels/index.ts and
 * internal/catalog-store.ts, v0.16): `<paseoHome>/projects/workspace-labels.json`, an array of
 * `{ name, color }`. While a label change is being written, a transaction file sits beside it;
 * until it reads "committed" the daemon still serves the labels from before the change.
 */

const definitionSchema = z.object({ name: z.string(), color: z.enum(WORKSPACE_LABEL_COLORS) });
const catalogSchema = z.array(definitionSchema);
const transactionSchema = z.object({ phase: z.enum(["prepared", "committed"]), beforeLabels: catalogSchema });

async function readJson(path: string): Promise<unknown | undefined> {
  try {
    return JSON.parse(await readFile(path, "utf8"));
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return undefined;
    throw error;
  }
}

/** The catalog as the daemon serves it. No file means no labels; a broken one throws, as there. */
export async function readWorkspaceLabelCatalog(paseoHome: string): Promise<WorkspaceLabelDefinition[]> {
  const directory = join(paseoHome, "projects");
  const transaction = await readJson(join(directory, "workspace-labels.transaction.json"));
  if (transaction !== undefined) {
    const parsed = transactionSchema.parse(transaction);
    if (parsed.phase === "prepared") return parsed.beforeLabels;
  }
  const catalog = await readJson(join(directory, "workspace-labels.json"));
  return catalog === undefined ? [] : catalogSchema.parse(catalog);
}

export async function handleReadWorkspaceLabels() {
  return { labels: await readWorkspaceLabelCatalog(PASEO_HOME) };
}
