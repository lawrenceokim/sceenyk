export const projectMediaLifetimeMs = 5 * 60_000;
export type ProjectMediaReply = { state: "pending" | "unavailable" } | {
  state: "ready"; version: string; expiresAt: string; mimeType?: string; bytes?: Uint8Array; url?: string;
};
