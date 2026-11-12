"use client";

import { useAuth } from "@clerk/nextjs";
import type { ReactNode } from "react";
import { ProjectsGallerySkeleton } from "./projects-section";
import { AppNotification } from "@/components/notifications/app-notification";


export function ProjectsAccountFence({ clerkUserId, children }: { clerkUserId: string; children: ReactNode }) {
  const { isLoaded, userId } = useAuth();
  if (!isLoaded) return <ProjectsGallerySkeleton />;
  if (userId !== clerkUserId) return <AppNotification role="status" className="text-muted-foreground">Reopen Projects for your current account.</AppNotification>;
  return children;
}
