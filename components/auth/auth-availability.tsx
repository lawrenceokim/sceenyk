"use client";

import { createContext, useContext, type ReactNode } from "react";

const AuthAvailability = createContext(false);

// This flag describes SDK configuration, never authentication or authorization.
export function AuthAvailabilityProvider({
  enabled,
  children,
}: {
  enabled: boolean;
  children: ReactNode;
}) {
  return <AuthAvailability value={enabled}>{children}</AuthAvailability>;
}

export function useAuthAvailable() {
  return useContext(AuthAvailability);
}
