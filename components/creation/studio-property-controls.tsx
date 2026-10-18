"use client";
import { createContext, useContext, type ReactNode } from "react";
import { createPortal } from "react-dom";

export const StudioPropertiesTarget = createContext<HTMLElement | null | undefined>(undefined);

// Move only presentation. Caption fetching, playback and preference state stay
// in their existing owner and render one set of controls into Properties.
export function StudioPropertyControls({ children }: { children: ReactNode }) {
  const target = useContext(StudioPropertiesTarget);
  return target === undefined ? children : target ? createPortal(children, target) : null;
}
