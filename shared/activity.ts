/**
 * When a project was last used.
 *
 * Only marks the user leaves count. The daemon rewrites every agent record when it restarts, and
 * re-derives workspace status from scratch, so `updatedAt`, `lastActivityAt` and `statusEnteredAt`
 * all jump to "now" for every project at once. Reading those as use put every project back into
 * Recents after each restart, however short the window.
 */

export function toMs(value: string | null | undefined): number {
  const at = Date.parse(value ?? "");
  return Number.isNaN(at) ? 0 : at;
}

/** Only the fields that say something about use; the bookkeeping ones are deliberately absent. */
export interface AgentLike {
  workspaceId?: string;
  createdAt?: string | null;
  lastUserMessageAt?: string | null;
}

/**
 * Whether a project belongs in Recents. `latest` is its last use inside the window (0 if none);
 * `hiddenAt` is when the user hid it, if they did. Without a limit every project belongs, used or
 * not; a hidden one still waits until it is used again.
 */
export function inRecents(latest: number, hiddenAt: number | undefined, unlimited: boolean): boolean {
  if (hiddenAt !== undefined) return latest > hiddenAt;
  return unlimited || latest > 0;
}

/** The user's last prompt in a workspace, or when it was made. 0 if neither. */
export function workspaceUsedAt(w: { lastPromptAt: string | null; createdAt: string | null }): number {
  return toMs(w.lastPromptAt) || toMs(w.createdAt);
}

/** The user's last message to this session, or failing that when they created it. 0 if neither. */
export function usedAt(agent: AgentLike): number {
  return toMs(agent.lastUserMessageAt) || toMs(agent.createdAt);
}

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

/** How long ago, as Paseo's sidebar shows it: now, 5m, 2h, 3d, then the date. Empty for 0. */
export function compactAgo(at: number, now: number): string {
  if (!at) return "";
  const minutes = Math.floor((now - at) / 60_000);
  if (minutes < 1) return "now";
  if (minutes < 60) return `${minutes}m`;
  if (minutes < 24 * 60) return `${Math.floor(minutes / 60)}h`;
  if (minutes < 7 * 24 * 60) return `${Math.floor(minutes / (24 * 60))}d`;
  const date = new Date(at);
  return `${MONTHS[date.getMonth()]} ${date.getDate()}`;
}
