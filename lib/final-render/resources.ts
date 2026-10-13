import "server-only";
import { readFile } from "node:fs/promises";

// Cgroup usage includes Chromium, FFmpeg, Node and charged filesystem pages.
// Node RSS alone must never be presented as the container's memory requirement.
export async function renderResources() {
  const bytes = async (file: string) => {
    try {
      const value = Number((await readFile(file, "utf8")).trim());
      return Number.isSafeInteger(value) && value >= 0 ? value : null;
    } catch { return null; }
  };
  const current = await bytes("/sys/fs/cgroup/memory.current") ?? await bytes("/sys/fs/cgroup/memory/memory.usage_in_bytes");
  const limit = await bytes("/sys/fs/cgroup/memory.max") ?? await bytes("/sys/fs/cgroup/memory/memory.limit_in_bytes");
  return { nodeRssBytes: process.memoryUsage().rss, cgroupCurrentBytes: current, cgroupLimitBytes: limit };
}
