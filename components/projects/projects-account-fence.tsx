"use client";

import { useAuth } from "@clerk/nextjs";
import type { ReactNode } from "react";
import { ProjectsGallerySkeleton } from "./projects-section";

export function ProjectsAccountFence({ clerkUserId, children }: { clerkUserId: string; children: ReactNode }) {
  const { isLoaded, userId } = useAuth();
  if (!isLoaded) return <ProjectsGallerySkeleton />;
  if (userId !== clerkUserId) return <p role="status" className="text-muted-foreground">Reopen Projects for your current account.</p>;
  return children;
}
