"use client";

import { createContext, useContext, useEffect, useLayoutEffect, useMemo, type ReactNode } from "react";
import { useAuth, useClerk } from "@clerk/nextjs";
import { useAuthAvailable } from "@/components/auth/auth-availability";
import { accountSessionCache } from "@/lib/cache/account-cache";
import "@/lib/cache/gallery-bridge";

const CacheIdentity = createContext<{ scope: string | null; viewer: string | null }>({ scope: null, viewer: null });
export const useCacheIdentity = () => useContext(CacheIdentity);
let source: unknown, release: (() => void) | undefined;
function AuthenticatedCacheProvider({ children }: { children: ReactNode }) {
  const { isLoaded, userId, sessionId } = useAuth(), clerk = useClerk();
  const scope = isLoaded && userId && sessionId ? `${userId}/${sessionId}` : null;
  const value = useMemo(() => ({ scope, viewer: isLoaded ? userId ?? null : null }), [scope, isLoaded, userId]);
  useLayoutEffect(() => { if (isLoaded) accountSessionCache.setScope(scope); }, [isLoaded, scope]);
  useEffect(() => {
    if (!isLoaded || source === clerk) return;
    release?.(); source = clerk;
    release = clerk.addListener(({ user, session }) => {
      if (clerk.loaded) accountSessionCache.setScope(user?.id && session?.id ? `${user.id}/${session.id}` : null);
    });
  }, [clerk, isLoaded]);
  useEffect(() => {
    const creditChange = (event: Event) => {
      if ((event as CustomEvent<{ confirmedWallet?: boolean }>).detail?.confirmedWallet) return;
      void accountSessionCache.confirmed(["wallet", "allowance"]);
    };
    window.addEventListener("sceenyk:credits", creditChange);
    const storage = (event: StorageEvent) => { if (event.key === "sceenyk:credits-changed") creditChange(event); };
    window.addEventListener("storage", storage);
    return () => { window.removeEventListener("sceenyk:credits", creditChange); window.removeEventListener("storage", storage); };
  }, []);
  return <CacheIdentity.Provider value={value}>{children}</CacheIdentity.Provider>;
}
export function SmartCacheProvider({ children }: { children: ReactNode }) {
  return useAuthAvailable() ? <AuthenticatedCacheProvider>{children}</AuthenticatedCacheProvider> : children;
}
