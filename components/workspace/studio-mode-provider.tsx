"use client";

import { createContext, useCallback, useContext, useEffect, useId, useMemo, useState, useSyncExternalStore, type ReactNode } from "react";
import { usePathname } from "next/navigation";
import { useAuth } from "@clerk/nextjs";
import { useAuthAvailable } from "@/components/auth/auth-availability";
import { readStudioModeAction, saveStudioModeAction } from "@/app/actions/studio-mode";
import { StudioModeStore, modeScopeKey, type ModeSnapshot } from "@/lib/studio-mode/client-state";
import { defaultStudioMode, needsBasicConfirmation, type StudioMode } from "@/lib/studio-mode/contract";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";

type ModeContext = { mode: StudioMode; ready: boolean; pending: boolean; error: string; select: (mode: StudioMode) => void; retry: () => void;
  reportFeatures: (id: string, projectId: string | null, features: string[]) => () => void };
const StudioModeContext = createContext<ModeContext>({ mode: defaultStudioMode, ready: false, pending: false, error: "", select: () => {}, retry: () => {}, reportFeatures: () => () => {} });
const guestKey = "sceenyk-guest-studio-mode";
const noIncompatibleFeatures: readonly string[] = [];
export const useStudioMode = () => useContext(StudioModeContext);
export function useStudioModeIncompatibilities(projectId: string | null, features: readonly string[]) {
  const { reportFeatures } = useStudioMode(), id = useId(), serialized = JSON.stringify(features);
  useEffect(() => reportFeatures(id, projectId, JSON.parse(serialized)), [reportFeatures, id, projectId, serialized]);
}

export function StudioModeProvider({ children, incompatibleFeatures = noIncompatibleFeatures }: { children: ReactNode; incompatibleFeatures?: readonly string[] }) {
  const available = useAuthAvailable();
  return available ? <AuthenticatedModes incompatibleFeatures={incompatibleFeatures}>{children}</AuthenticatedModes>
    : <ModeSession userId={null} incompatibleFeatures={incompatibleFeatures}>{children}</ModeSession>;
}

function AuthenticatedModes({ children, incompatibleFeatures }: { children: ReactNode; incompatibleFeatures: readonly string[] }) {
  const { isLoaded, userId } = useAuth();
  return <ModeSession userId={isLoaded ? userId ?? null : undefined} incompatibleFeatures={incompatibleFeatures}>{children}</ModeSession>;
}

function ModeSession({ children, userId, incompatibleFeatures }: { children: ReactNode; userId: string | null | undefined; incompatibleFeatures: readonly string[] }) {
  const pathname = usePathname();
  const projectId = /^\/projects\/([^/]+)\/?$/.exec(pathname)?.[1] ?? null;
  const scope = useMemo(() => ({ userId, projectId }), [userId, projectId]);
  const key = modeScopeKey(scope);
  const [store] = useState(() => new StudioModeStore({
    read: readStudioModeAction, save: saveStudioModeAction,
    readGuest: () => localStorage.getItem(guestKey),
    saveGuest: mode => localStorage.setItem(guestKey, mode),
  }));
  const snapshot = useSyncExternalStore(store.subscribe, store.getSnapshot, store.getSnapshot);
  const current = snapshot.key === key;
  const mode = current ? snapshot.mode : defaultStudioMode;
  const [confirmation, setConfirmation] = useState<ModeSnapshot | null>(null);
  const [reports, setReports] = useState<Record<string, { projectId: string | null; features: string[] }>>({});
  const reportFeatures = useCallback((id: string, projectId: string | null, features: string[]) => {
    setReports(current => ({ ...current, [id]: { projectId, features } }));
    return () => setReports(current => {
      if (current[id]?.features !== features) return current;
      const next = { ...current }; delete next[id]; return next;
    });
  }, []);
  const limitations = [...incompatibleFeatures, ...Object.values(reports).filter(r => r.projectId === projectId).flatMap(r => r.features)];

  useEffect(() => {
    void store.open(scope);
    // The persistent layout re-reads metadata on route reveal/native URL binding.
    // This does not refresh, hide, reset or key the Studio editor.
  }, [store, scope, pathname]);

  return <StudioModeContext value={{
    mode, ready: current && snapshot.ready, pending: current && snapshot.pending,
    error: current ? snapshot.error : "",
    reportFeatures,
    retry: () => { void store.open(scope); },
    select: next => {
      if (!current || !snapshot.ready || snapshot.pending) return;
      if (needsBasicConfirmation(mode, next, limitations)) setConfirmation(snapshot);
      else void store.select(next);
    },
  }}>
    {children}
    <Dialog open={current && confirmation === snapshot} onOpenChange={open => { if (!open) setConfirmation(null); }}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Switch to Basic Studio?</DialogTitle>
          <DialogDescription>Basic Studio cannot generate with: {limitations.join(", ")}. All characters, uploads and saved sheets will be preserved. Switch back to Pro to continue.</DialogDescription>
        </DialogHeader>
        <DialogFooter>
          <Button variant="outline" onClick={() => setConfirmation(null)}>Cancel</Button>
          <Button onClick={() => { setConfirmation(null); void store.select("basic"); }}>Switch to Basic</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  </StudioModeContext>;
}
