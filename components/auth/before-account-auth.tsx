"use client";
import { createContext } from "react";

// Optional point-of-need preparation; Clerk remains the authentication owner.
export const BeforeAccountAuth = createContext<(() => void) | undefined>(undefined);
