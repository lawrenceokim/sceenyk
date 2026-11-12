import { defaultStudioMode, studioModeSchema, type StudioMode, type StudioModeResult } from "./contract";

export type ModeScope = { userId: string | null | undefined; projectId: string | null };
export const modeScopeKey = ({ userId, projectId }: ModeScope) => `${userId ?? (userId === null ? "guest" : "loading")}:${projectId ?? "new"}`;
export type ModeSnapshot = { key: string; mode: StudioMode; ready: boolean; pending: boolean; error: string };
type ModePersistence = {
  read: (projectId: string | null) => Promise<StudioModeResult>;
  save: (input: { projectId: string | null; mode: StudioMode }) => Promise<StudioModeResult>;
  readGuest: () => unknown;
  saveGuest: (mode: StudioMode) => void;
};

// Independent external state: mode changes notify the shell without remounting
// the editor or touching its local inputs, files, Preview or generation state.
export class StudioModeStore {
  private snapshot: ModeSnapshot = { key: "", mode: defaultStudioMode, ready: false, pending: false, error: "" };
  private listeners = new Set<() => void>();
  private scope: ModeScope = { userId: undefined, projectId: null };
  private revision = 0;
  private write: Promise<void> = Promise.resolve();
  private guestMode: StudioMode = defaultStudioMode;
  private opening?: { key: string; promise: Promise<void> };

  constructor(private persistence: ModePersistence) {}
  getSnapshot = () => this.snapshot;
  subscribe = (listener: () => void) => {
    this.listeners.add(listener);
    return () => { this.listeners.delete(listener); };
  };
  private publish(value: ModeSnapshot) {
    this.snapshot = value;
    this.listeners.forEach(listener => listener());
  }
  open(scope: ModeScope) {
    const key = modeScopeKey(scope);
    if (this.opening?.key === key && this.snapshot.key === key && !this.snapshot.pending) return this.opening.promise;
    const promise = this.readScope(scope);
    const opening = { key, promise };
    this.opening = opening;
    const clear = () => { if (this.opening === opening) this.opening = undefined; };
    void promise.then(clear, clear);
    return promise;
  }
  private async readScope(scope: ModeScope) {
    this.scope = scope;
    const key = modeScopeKey(scope), revision = ++this.revision;
    this.publish({ key, mode: key === this.snapshot.key ? this.snapshot.mode : defaultStudioMode, ready: false, pending: false, error: "" });
    if (scope.userId === undefined) return;
    // Navigation must read after an already submitted mode write, even if that
    // write's old route is no longer visible. Late responses cannot win a race.
    await this.write;
    if (revision !== this.revision) return;
    if (scope.userId === null) {
      try { this.guestMode = studioModeSchema.parse(this.persistence.readGuest()); } catch { /* Browser storage is optional for guests. */ }
      this.publish({ key, mode: this.guestMode, ready: true, pending: false, error: "" });
      return;
    }
    try {
      const result = await this.persistence.read(scope.projectId);
      if (revision !== this.revision) return;
      if (!result.ok || result.data.clerkUserId !== scope.userId) throw new Error("MODE_READ_FAILED");
      this.publish({ key, mode: scope.projectId ? result.data.projectMode ?? defaultStudioMode : result.data.preferredMode, ready: true, pending: false, error: "" });
    } catch {
      if (revision === this.revision) this.publish({ ...this.snapshot, error: "Studio mode couldn’t be loaded. Try again." });
    }
  }
  select(mode: StudioMode) {
    const value = studioModeSchema.safeParse(mode);
    if (!value.success || !this.snapshot.ready || this.snapshot.pending || mode === this.snapshot.mode) return this.write;
    const scope = this.scope, key = modeScopeKey(scope), revision = ++this.revision;
    if (scope.userId === null) {
      this.guestMode = mode;
      try { this.persistence.saveGuest(mode); } catch { /* Retain the choice in this workspace session. */ }
      this.publish({ key, mode, ready: true, pending: false, error: "" });
      return this.write;
    }
    this.publish({ ...this.snapshot, pending: true, error: "" });
    this.write = (async () => {
      try {
        const result = await this.persistence.save({ projectId: scope.projectId, mode });
        if (revision !== this.revision) return;
        if (!result.ok || result.data.clerkUserId !== scope.userId) throw new Error("MODE_SAVE_FAILED");
        this.publish({ key, mode: scope.projectId ? result.data.projectMode ?? defaultStudioMode : result.data.preferredMode, ready: true, pending: false, error: "" });
      } catch {
        if (revision === this.revision) this.publish({ ...this.snapshot, pending: false, error: "Studio mode couldn’t be saved. Try again." });
      }
    })();
    return this.write;
  }
}
