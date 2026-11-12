// Quick derivative pickup, then slow discovery if the media worker is offline.
// Pure scheduling policy; playback, authorization deadlines and bytes stay cached.
export function previewPendingDelay(attempt: number) {
  return attempt <= 5 ? Math.min(30_000, 2500 * 2 ** Math.min(attempt, 4)) : 300_000;
}
