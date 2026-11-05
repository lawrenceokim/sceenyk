"use client";

import { createContext, useContext, useEffect, useMemo, useState, useSyncExternalStore, type ReactNode } from "react";
import { usePathname } from "next/navigation";
import { useAuth } from "@clerk/nextjs";
import { useAuthAvailable } from "@/components/auth/auth-availability";
import { readStudioModeAction, saveStudioModeAction } from "@/app/actions/studio-mode";
import { StudioModeStore, modeScopeKey, type ModeSnapshot } from "@/lib/studio-mode/client-state";
import { defaultStudioMode, needsBasicConfirmation, type StudioMode } from "@/lib/studio-mode/contract";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";

type ModeContext = { mode: StudioMode; ready: boolean; pending: boolean; error: string; select: (mode: StudioMode) => void; retry: () => void };
const StudioModeContext = createContext<ModeContext>({ mode: defaultStudioMode, ready: false, pending: false, error: "", select: () => {}, retry: () => {} });
const guestKey = "sceenyk-guest-studio-mode";
const noIncompatibleFeatures: readonly string[] = [];
export const useStudioMode = () => useContext(StudioModeContext);

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

  useEffect(() => {
    void store.open(scope);
    // The persistent layout re-reads metadata on route reveal/native URL binding.
    // This does not refresh, hide, reset or key the Studio editor.
  }, [store, scope, pathname]);

  return <StudioModeContext value={{
    mode, ready: current && snapshot.ready, pending: current && snapshot.pending,
    error: current ? snapshot.error : "",
    retry: () => { void store.open(scope); },
    select: next => {
      if (!current || !snapshot.ready || snapshot.pending) return;
      if (needsBasicConfirmation(mode, next, incompatibleFeatures)) setConfirmation(snapshot);
      else void store.select(next);
    },
  }}>
    {children}
    <Dialog open={current && confirmation === snapshot} onOpenChange={open => { if (!open) setConfirmation(null); }}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Switch to Basic Studio?</DialogTitle>
          <DialogDescription>These Pro features will be hidden: {incompatibleFeatures.join(", ")}. All saved Pro data will be preserved. Switch back to Pro to use it again.</DialogDescription>
        </DialogHeader>
        <DialogFooter>
          <Button variant="outline" onClick={() => setConfirmation(null)}>Cancel</Button>
          <Button onClick={() => { setConfirmation(null); void store.select("basic"); }}>Switch to Basic</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  </StudioModeContext>;
}
