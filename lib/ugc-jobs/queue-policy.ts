export const localQueues = ["character", "location", "storyboard", "regeneration", "generation"] as const;
export type LocalQueue = typeof localQueues[number];
export type QueueRetry = { failures: number; retryAt: number | null; paused: boolean };

// Local transport backoff only. Never resets database attempts or paid intents.
export class LocalQueuePolicy {
  private cursor = 0;
  private states = new Map<LocalQueue, QueueRetry>();
  order(now: number) {
    return [...localQueues.slice(this.cursor), ...localQueues.slice(0, this.cursor)].filter(queue => {
      const state = this.states.get(queue);
      return !state?.paused && (state?.retryAt == null || state.retryAt <= now);
    });
  }
  worked(queue: LocalQueue) { this.states.delete(queue); this.cursor = (localQueues.indexOf(queue) + 1) % localQueues.length; }
  failed(queue: LocalQueue, now: number, retryable: boolean): QueueRetry {
    const failures = (this.states.get(queue)?.failures ?? 0) + 1;
    const paused = !retryable || failures >= 3;
    const state = { failures, paused, retryAt: paused ? null : now + Math.min(300_000, 5000 * 2 ** (failures - 1)) };
    this.states.set(queue, state); this.cursor = (localQueues.indexOf(queue) + 1) % localQueues.length;
    return state;
  }
}
