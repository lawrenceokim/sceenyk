"use client";

import { createContext, useContext, type ReactNode } from "react";
import { createPortal } from "react-dom";

export const StudioToolbarTarget = createContext<HTMLElement | null | undefined>(undefined);

// Reposition existing result actions without moving their fetching or state.
export function StudioToolbarAction({ children }: { children: ReactNode }) {
  const target = useContext(StudioToolbarTarget);
  return target === undefined ? children : target ? createPortal(children, target) : null;
}
