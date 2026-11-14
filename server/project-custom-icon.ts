import type { RpcInput } from "@getpaseo/plugin";
import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import type { readProjectIcon } from "../shared/daemon-data.ts";
import { PASEO_HOME } from "./paseo-home.ts";
import { type ProjectIcon, getImageDimensions, getProjectIcon } from "./project-icon.ts";

/*
 * What the daemon answers to `project.icon.get.request` (server/session.ts
 * `handleProjectIconGetRequest` and utils/project-custom-icon.ts `readProjectIconSnapshot`, v0.16):
 * the uploaded icon while the project has one, otherwise the automatic icon of its root folder.
 */

/** Uploaded icons are checked against these on every read, as the daemon does. */
const MAX_CUSTOM_ICON_BYTES = 512 * 1024;
const MAX_CUSTOM_ICON_SIDE = 1024;

interface ProjectRecord {
  projectId: string;
  rootPath: string;
  customIconRevision: string | null;
}

/** Where the daemon stores a project's uploaded icon. */
export function customIconPath(paseoHome: string, projectId: string): string {
  const key = createHash("sha256").update(projectId).digest("hex");
  return join(paseoHome, "projects", "icons", `${key}.bin`);
}

function detectMimeType(buffer: Buffer): string | null {
  if (buffer.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))) return "image/png";
  if (buffer[0] === 0xff && buffer[1] === 0xd8 && buffer[2] === 0xff) return "image/jpeg";
  const header = buffer.toString("ascii", 0, 6);
  if (header === "GIF87a" || header === "GIF89a") return "image/gif";
  if (buffer.toString("ascii", 0, 4) === "RIFF" && buffer.toString("ascii", 8, 12) === "WEBP") return "image/webp";
  if (buffer.length >= 22 && buffer.readUInt16LE(0) === 0 && buffer.readUInt16LE(2) === 1 && buffer.readUInt16LE(4) > 0) {
    return "image/x-icon";
  }
  return null;
}

/** An uploaded icon as the daemon accepts it, or null where the daemon would refuse it. */
export function validateCustomIcon(buffer: Buffer): ProjectIcon | null {
  if (buffer.length === 0 || buffer.length > MAX_CUSTOM_ICON_BYTES) return null;
  const mimeType = detectMimeType(buffer);
  if (!mimeType) return null;
  const size = getImageDimensions(buffer, mimeType);
  if (!size || size.width <= 0 || size.width !== size.height || size.width > MAX_CUSTOM_ICON_SIDE) return null;
  return { data: buffer.toString("base64"), mimeType };
}

/** The daemon's project registry entry, or null when it has none. */
async function readProjectRecord(paseoHome: string, projectId: string): Promise<ProjectRecord | null> {
  let records: unknown;
  try {
    records = JSON.parse(await readFile(join(paseoHome, "projects", "projects.json"), "utf8"));
  } catch {
    return null;
  }
  if (!Array.isArray(records)) return null;
  for (const record of records as Record<string, unknown>[]) {
    if (record?.projectId !== projectId || typeof record.rootPath !== "string") continue;
    const revision = record.customIconRevision;
    return { projectId, rootPath: record.rootPath, customIconRevision: typeof revision === "string" ? revision : null };
  }
  return null;
}

/** The icon a project renders with; null for none, an unknown project or an unreadable upload. */
export async function readProjectIconFor(paseoHome: string, projectId: string): Promise<ProjectIcon | null> {
  const project = await readProjectRecord(paseoHome, projectId);
  if (!project) return null;
  if (project.customIconRevision) {
    try {
      return validateCustomIcon(await readFile(customIconPath(paseoHome, project.projectId)));
    } catch {
      // A missing upload shows no icon, as in the daemon; it does not fall back to the automatic one.
      return null;
    }
  }
  return await getProjectIcon(project.rootPath);
}

export async function handleReadProjectIcon({ projectId }: RpcInput<typeof readProjectIcon>) {
  return await readProjectIconFor(PASEO_HOME, projectId);
}
