/*
 * How Paseo draws a project icon (components/project-icon-view.tsx, project-icon-image.tsx,
 * utils/project-display-name.ts, utils/project-status-badge-content.ts and projects/icon-cache.ts,
 * v0.16), minus the drawing.
 */
import { findSvgIconProblem } from "@getpaseo/plugin";

/** The generated square's corner, as a share of its side. An uploaded image is never rounded. */
const RADIUS_RATIO = 0.25;

export function projectIconRadius(size: number): number {
  return Math.round(size * RADIUS_RATIO);
}

/** The letter on the generated square: the first of the display name's last `/` segment. */
export function projectIconInitial(displayName: string): string {
  const trimmed = displayName.trim();
  if (!trimmed) return "";
  const segments = trimmed.split("/").filter(Boolean);
  return (segments[segments.length - 1] || trimmed).charAt(0).toUpperCase();
}

/**
 * The query key part that names an icon's version. The app caches by the project's revision and
 * treats a project without one as "automatic", refetched only when the cache is dropped.
 */
export function projectIconRevision(iconRevision: string | null): string {
  return iconRevision ?? "automatic";
}

export type ProjectIconPicture = { kind: "svg"; xml: string } | { kind: "image"; uri: string } | { kind: "fallback" };

const ICO_MIME_TYPES = new Set(["image/x-icon", "image/vnd.microsoft.icon"]);

/**
 * How to draw a daemon icon. ICO falls back as in the app. SVG is drawn from its markup, through
 * the plugin `Icon`, which refuses some markup the app's renderer accepts (`<style>` for one);
 * such an SVG falls back too.
 */
export function selectProjectIconPicture(icon: { mimeType: string; data: string } | null): ProjectIconPicture {
  if (!icon || !icon.data) return { kind: "fallback" };
  const mimeType = icon.mimeType.toLowerCase();
  if (ICO_MIME_TYPES.has(mimeType)) return { kind: "fallback" };
  if (mimeType === "image/svg+xml") {
    const xml = decodeBase64Utf8(icon.data);
    if (xml === null) return { kind: "fallback" };
    const trimmed = xml.trim();
    return findSvgIconProblem(trimmed) === null ? { kind: "svg", xml: trimmed } : { kind: "fallback" };
  }
  return { kind: "image", uri: `data:${mimeType};base64,${icon.data}` };
}

const BASE64_ALPHABET = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/";

/** Base64 to UTF-8 text without `atob` or `Buffer`, which not every client runtime has. Null if malformed. */
export function decodeBase64Utf8(input: string): string | null {
  const clean = input.replace(/\s+/g, "").replace(/=+$/, "");
  if (clean.length % 4 === 1) return null;
  const bytes = new Uint8Array(Math.floor((clean.length * 3) / 4));
  let buffer = 0;
  let bits = 0;
  let offset = 0;
  for (const character of clean) {
    const value = BASE64_ALPHABET.indexOf(character);
    if (value < 0) return null;
    buffer = (buffer << 6) | value;
    bits += 6;
    if (bits >= 8) {
      bits -= 8;
      bytes[offset++] = (buffer >> bits) & 0xff;
    }
  }
  return decodeUtf8(bytes.subarray(0, offset));
}

/** Strict UTF-8, by hand: `TextDecoder` is missing on some native runtimes. Null if malformed. */
function decodeUtf8(bytes: Uint8Array): string | null {
  let text = "";
  for (let index = 0; index < bytes.length; ) {
    const first = bytes[index];
    const length = first < 0x80 ? 1 : first >= 0xc2 && first < 0xe0 ? 2 : first >= 0xe0 && first < 0xf0 ? 3 : first >= 0xf0 && first < 0xf5 ? 4 : 0;
    if (length === 0 || index + length > bytes.length) return null;
    let point = length === 1 ? first : first & (0xff >> (length + 1));
    for (let next = 1; next < length; next += 1) {
      const byte = bytes[index + next];
      if ((byte & 0xc0) !== 0x80) return null;
      point = (point << 6) | (byte & 0x3f);
    }
    // Overlong forms, surrogates and points past U+10FFFF are not UTF-8.
    if ((length === 3 && (point < 0x800 || (point >= 0xd800 && point < 0xe000))) || (length === 4 && (point < 0x10000 || point > 0x10ffff))) {
      return null;
    }
    text += String.fromCodePoint(point);
    index += length;
  }
  return text;
}

export type ProjectStatusBadgeContent = { kind: "alert" } | { kind: "dot"; bucket: "failed" | "attention" | "running" };

/** The corner badge on a project icon: an alert for needs_input, a dot for three others, else none. */
export function getProjectStatusBadgeContent(indicator: string | null): ProjectStatusBadgeContent | null {
  if (indicator === "needs_input") return { kind: "alert" };
  if (indicator === "failed" || indicator === "attention" || indicator === "running") return { kind: "dot", bucket: indicator };
  return null;
}
