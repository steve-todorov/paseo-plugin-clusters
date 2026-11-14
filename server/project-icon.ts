import { readdir, readFile, stat } from "node:fs/promises";
import { extname, join } from "node:path";

/*
 * How the daemon finds a project's automatic icon (packages/server/src/utils/project-icon.ts,
 * v0.16). Copied rule for rule: the app shows whatever the daemon picks, so a different pick, size
 * limit or format check here would show a different icon than the default sidebar.
 */

/** File names to look for, best first. A `*` matches anything, as in `icon-*.png`. */
export const ICON_PATTERNS = [
  "favicon.svg",
  "favicon.png",
  "favicon-*.svg",
  "favicon-*.png",
  "favico.svg",
  "favico.png",
  "icon.svg",
  "icon.png",
  "app-icon.svg",
  "app-icon.png",
  "apple-touch-icon.png",
  "apple-touch-icon-*.png",
  "icon-*.png",
  "android-chrome-*.png",
  "safari-pinned-tab.svg",
  "mstile-*.png",
  "logo.svg",
  "logo.png",
  "favicon.ico",
  "favico.ico",
];

/** Searched first, in this order. */
export const PRIORITY_DIRS = ["public", "static", "priv/static", "assets", "images", "img"];

/** Monorepo package folders (packages/*, apps/*). */
export const MONOREPO_PACKAGE_DIRS = ["packages", "apps"];

export const IGNORED_DIRS = [
  ".git",
  "node_modules",
  "dist",
  "build",
  ".next",
  ".nuxt",
  ".output",
  "coverage",
  ".cache",
  "vendor",
  "src",
  "lib",
  "test",
  "tests",
  "__tests__",
];

export interface ProjectIcon {
  data: string;
  mimeType: string;
}

/** An automatic icon larger than this is ignored rather than shrunk. */
export const MAX_ICON_SIZE = 32 * 1024;

export interface ImageDimensions {
  width: number;
  height: number;
}

function getPngDimensions(buffer: Buffer): ImageDimensions | null {
  if (buffer.length < 24) return null;
  if (buffer[0] !== 0x89 || buffer[1] !== 0x50 || buffer[2] !== 0x4e || buffer[3] !== 0x47) return null;
  return { width: buffer.readUInt32BE(16), height: buffer.readUInt32BE(20) };
}

function getJpegDimensions(buffer: Buffer): ImageDimensions | null {
  if (buffer.length < 4) return null;
  if (buffer[0] !== 0xff || buffer[1] !== 0xd8) return null;
  let offset = 2;
  while (offset < buffer.length - 8) {
    if (buffer[offset] !== 0xff) {
      offset++;
      continue;
    }
    const marker = buffer[offset + 1];
    // SOF0–SOF2 carry the size.
    if (marker >= 0xc0 && marker <= 0xc2) {
      return { width: buffer.readUInt16BE(offset + 7), height: buffer.readUInt16BE(offset + 5) };
    }
    offset += 2 + buffer.readUInt16BE(offset + 2);
  }
  return null;
}

function getGifDimensions(buffer: Buffer): ImageDimensions | null {
  if (buffer.length < 10) return null;
  if (buffer[0] !== 0x47 || buffer[1] !== 0x49 || buffer[2] !== 0x46) return null;
  return { width: buffer.readUInt16LE(6), height: buffer.readUInt16LE(8) };
}

function getWebpDimensions(buffer: Buffer): ImageDimensions | null {
  if (buffer.length < 30) return null;
  if (buffer.toString("ascii", 0, 4) !== "RIFF") return null;
  if (buffer.toString("ascii", 8, 12) !== "WEBP") return null;
  const chunkType = buffer.toString("ascii", 12, 16);
  if (chunkType === "VP8 ") {
    return { width: buffer.readUInt16LE(26) & 0x3fff, height: buffer.readUInt16LE(28) & 0x3fff };
  }
  if (chunkType === "VP8L") {
    const bits = buffer.readUInt32LE(21);
    return { width: (bits & 0x3fff) + 1, height: ((bits >> 14) & 0x3fff) + 1 };
  }
  return null;
}

export function getImageDimensions(buffer: Buffer, mimeType: string): ImageDimensions | null {
  switch (mimeType) {
    case "image/png":
      return getPngDimensions(buffer);
    case "image/jpeg":
      return getJpegDimensions(buffer);
    case "image/gif":
      return getGifDimensions(buffer);
    case "image/webp":
      return getWebpDimensions(buffer);
    // ICO and SVG are trusted to be square, as the daemon does.
    case "image/x-icon":
    case "image/svg+xml":
      return { width: 1, height: 1 };
    default:
      return null;
  }
}

function isSquareImage(buffer: Buffer, mimeType: string): boolean {
  const dimensions = getImageDimensions(buffer, mimeType);
  return dimensions !== null && dimensions.width === dimensions.height;
}

const PNG_SIGNATURE = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);

/** The type by magic bytes: many favicon.ico files are PNG data renamed. */
export function sniffMimeType(buffer: Buffer): string | null {
  if (buffer.length >= 8 && buffer.subarray(0, 8).equals(PNG_SIGNATURE)) return "image/png";
  if (buffer.length >= 3 && buffer[0] === 0xff && buffer[1] === 0xd8 && buffer[2] === 0xff) return "image/jpeg";
  if (buffer.length >= 6 && buffer.toString("ascii", 0, 3) === "GIF") return "image/gif";
  if (buffer.length >= 12 && buffer.toString("ascii", 0, 4) === "RIFF" && buffer.toString("ascii", 8, 12) === "WEBP") {
    return "image/webp";
  }
  if (buffer.length >= 6 && buffer.readUInt16LE(0) === 0 && buffer.readUInt16LE(2) === 1 && buffer.readUInt16LE(4) > 0) {
    return "image/x-icon";
  }
  return null;
}

/** The largest PNG frame of an ICO container, which native clients can draw; null if none. */
export function extractIcoPngFrame(buffer: Buffer): Buffer | null {
  if (buffer.length < 6 || buffer.readUInt16LE(0) !== 0 || buffer.readUInt16LE(2) !== 1) return null;
  const frameCount = buffer.readUInt16LE(4);
  let best: Buffer | null = null;
  let bestWidth = -1;
  for (let index = 0; index < frameCount; index += 1) {
    const entryOffset = 6 + index * 16;
    if (entryOffset + 16 > buffer.length) break;
    // Width byte 0 means 256.
    const width = buffer[entryOffset] === 0 ? 256 : (buffer[entryOffset] ?? 0);
    const dataSize = buffer.readUInt32LE(entryOffset + 8);
    const dataOffset = buffer.readUInt32LE(entryOffset + 12);
    if (dataOffset + dataSize > buffer.length) continue;
    const frame = buffer.subarray(dataOffset, dataOffset + dataSize);
    if (frame.length >= 8 && frame.subarray(0, 8).equals(PNG_SIGNATURE) && width > bestWidth) {
      best = frame;
      bestWidth = width;
    }
  }
  return best;
}

function getMimeType(filename: string): string {
  switch (extname(filename).toLowerCase()) {
    case ".ico":
      return "image/x-icon";
    case ".png":
      return "image/png";
    case ".svg":
      return "image/svg+xml";
    case ".jpg":
    case ".jpeg":
      return "image/jpeg";
    case ".gif":
      return "image/gif";
    case ".webp":
      return "image/webp";
    default:
      return "application/octet-stream";
  }
}

export function matchesPattern(filename: string, pattern: string): boolean {
  if (pattern.includes("*")) {
    const regexPattern = pattern.replace(/\./g, "\\.").replace(/\*/g, ".*");
    return new RegExp(`^${regexPattern}$`).test(filename);
  }
  return filename === pattern;
}

async function isExistingFile(fullPath: string): Promise<boolean> {
  try {
    return (await stat(fullPath)).isFile();
  } catch {
    return false;
  }
}

async function isExistingDirectory(fullPath: string): Promise<boolean> {
  try {
    return (await stat(fullPath)).isDirectory();
  } catch {
    return false;
  }
}

async function findIconInDir(dir: string, patterns: string[]): Promise<string | null> {
  let entries: string[];
  try {
    entries = await readdir(dir);
  } catch {
    return null;
  }
  // Pattern order first, then directory order.
  const candidatePaths: string[] = [];
  for (const pattern of patterns) {
    for (const entry of entries) if (matchesPattern(entry, pattern)) candidatePaths.push(join(dir, entry));
  }
  const exists = await Promise.all(candidatePaths.map((p) => isExistingFile(p)));
  const foundIndex = exists.findIndex(Boolean);
  return foundIndex === -1 ? null : (candidatePaths[foundIndex] ?? null);
}

async function searchPriorityDirs(basePath: string, ignoredDirs: Set<string>, remainingDepth: number): Promise<string | null> {
  const priorityPaths = PRIORITY_DIRS.map((priorityDir) => join(basePath, priorityDir));
  const exists = await Promise.all(priorityPaths.map((p) => isExistingDirectory(p)));
  const results = await Promise.all(
    priorityPaths.map((p, index) =>
      exists[index] ? searchDirRecursively(p, ICON_PATTERNS, ignoredDirs, remainingDepth) : Promise.resolve(null),
    ),
  );
  return results.find((result): result is string => result !== null) ?? null;
}

async function searchDirRecursively(
  dir: string,
  patterns: string[],
  ignoredDirs: Set<string>,
  maxDepth: number,
  currentDepth = 0,
): Promise<string | null> {
  if (currentDepth > maxDepth) return null;
  const found = await findIconInDir(dir, patterns);
  if (found) return found;
  let entries: string[];
  try {
    entries = await readdir(dir);
  } catch {
    return null;
  }
  const candidatePaths = entries.filter((entry) => !ignoredDirs.has(entry)).map((entry) => join(dir, entry));
  const isDir = await Promise.all(candidatePaths.map((p) => isExistingDirectory(p)));
  const results = await Promise.all(
    candidatePaths.map((p, index) =>
      isDir[index] ? searchDirRecursively(p, patterns, ignoredDirs, maxDepth, currentDepth + 1) : Promise.resolve(null),
    ),
  );
  return results.find((result): result is string => result !== null) ?? null;
}

/** The icon file of a project: priority folders, then monorepo packages, then the root. */
export async function findProjectIcon(projectDir: string, maxDepth = 3): Promise<string | null> {
  const ignoredDirs = new Set(IGNORED_DIRS);

  const priorityResult = await searchPriorityDirs(projectDir, ignoredDirs, maxDepth - 1);
  if (priorityResult) return priorityResult;

  const monoPaths = MONOREPO_PACKAGE_DIRS.map((monoDir) => join(projectDir, monoDir));
  const monoEntries = await Promise.all(
    monoPaths.map(async (monoPath): Promise<string[] | null> => {
      try {
        return await readdir(monoPath);
      } catch {
        return null;
      }
    }),
  );
  const monoResults = await Promise.all(
    monoPaths.map(async (monoPath, monoIndex): Promise<string | null> => {
      const packageEntries = monoEntries[monoIndex];
      if (!packageEntries) return null;
      const packagePaths = packageEntries.map((packageName) => join(monoPath, packageName));
      const isDir = await Promise.all(packagePaths.map((p) => isExistingDirectory(p)));
      const packageResults = await Promise.all(
        packagePaths.map(async (packagePath, index): Promise<string | null> => {
          if (!isDir[index]) return null;
          const packagePriorityResult = await searchPriorityDirs(packagePath, ignoredDirs, maxDepth - 1);
          if (packagePriorityResult) return packagePriorityResult;
          return await findIconInDir(packagePath, ICON_PATTERNS);
        }),
      );
      return packageResults.find((result): result is string => result !== null) ?? null;
    }),
  );
  const monoMatch = monoResults.find((result): result is string => result !== null);
  if (monoMatch) return monoMatch;

  return await findDirRecursively(projectDir);
}

async function findDirRecursively(dir: string, maxDepth = 2, currentDepth = 0): Promise<string | null> {
  const ignoredDirs = new Set(IGNORED_DIRS);
  const priorityDirs = new Set(PRIORITY_DIRS);
  if (currentDepth > maxDepth) return null;
  const found = await findIconInDir(dir, ICON_PATTERNS);
  if (found) return found;
  // The daemon stops at the root: the priority folders were already searched.
  if (currentDepth === 0) return null;
  let entries: string[];
  try {
    entries = await readdir(dir);
  } catch {
    return null;
  }
  const candidatePaths = entries
    .filter((entry) => !ignoredDirs.has(entry) && !priorityDirs.has(entry))
    .map((entry) => join(dir, entry));
  const isDir = await Promise.all(candidatePaths.map((p) => isExistingDirectory(p)));
  const results = await Promise.all(
    candidatePaths.map((p, index) => (isDir[index] ? findDirRecursively(p, maxDepth, currentDepth + 1) : Promise.resolve(null))),
  );
  return results.find((result): result is string => result !== null) ?? null;
}

/** The project's automatic icon as base64: square and at most 32 KB, or null. */
export async function getProjectIcon(projectDir: string): Promise<ProjectIcon | null> {
  const iconPath = await findProjectIcon(projectDir);
  if (!iconPath) return null;
  try {
    if ((await stat(iconPath)).size > MAX_ICON_SIZE) return null;
    const fileBuffer = await readFile(iconPath);
    let mimeType = sniffMimeType(fileBuffer) ?? getMimeType(iconPath);
    let buffer: Buffer = fileBuffer;
    if (mimeType === "image/x-icon") {
      const pngFrame = extractIcoPngFrame(fileBuffer);
      if (pngFrame) {
        buffer = pngFrame;
        mimeType = "image/png";
      }
    }
    if (!isSquareImage(buffer, mimeType)) return null;
    return { data: buffer.toString("base64"), mimeType };
  } catch {
    return null;
  }
}
