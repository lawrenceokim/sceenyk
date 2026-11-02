// Only confirmed deletions are remembered. No project content is persisted here.
const prefix = "sceenyk:deleted-project:";
const deleted = new Set<string>();
const listeners = new Set<() => void>();

export function isProjectDeleted(projectId: string | null) {
  if (!projectId) return false;
  if (deleted.has(projectId)) return true;
  try { return localStorage.getItem(`${prefix}${projectId}`) === "1"; }
  catch { return false; }
}

export function markProjectDeleted(projectId: string) {
  deleted.add(projectId);
  try { localStorage.setItem(`${prefix}${projectId}`, "1"); }
  catch { /* Same-document cleanup also works without browser storage. */ }
  for (const listener of listeners) listener();
}

export function subscribeProjectDeletion(listener: () => void) {
  listeners.add(listener);
  const onStorage = (event: StorageEvent) => {
    if (event.key?.startsWith(prefix)) listener();
  };
  window.addEventListener("storage", onStorage);
  return () => {
    listeners.delete(listener);
    window.removeEventListener("storage", onStorage);
  };
}
