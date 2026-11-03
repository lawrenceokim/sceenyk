"use client";

import { useEffect, useRef } from "react";
import { useStudioPanels } from "./studio-workspace-panels";

// These inputs come from the saved workspace. Only the edge detector is local:
// opening/closing the drawer never acknowledges or completes workflow work.
export function StudioWorkflowGuidance({ projectId, ready, referencesComplete, complete, selectStoryboard }: {
  projectId: string; ready: boolean; referencesComplete: boolean; complete: boolean;
  selectStoryboard: () => void;
}) {
  const panels = useStudioPanels();
  const publish = panels?.setWorkflowAttention, open = panels?.openWorkflow;
  const previous = useRef<{ projectId: string; referencesComplete: boolean } | null>(null);
  useEffect(() => {
    publish?.(ready && referencesComplete && !complete);
  }, [publish, ready, referencesComplete, complete]);
  useEffect(() => () => publish?.(false), [publish]);
  useEffect(() => {
    if (!ready) return;
    const before = previous.current;
    previous.current = { projectId, referencesComplete };
    // The first loaded snapshot establishes a baseline, including when the
    // project is reopened with references already approved. Polls are not edges.
    if (before?.projectId === projectId && !before.referencesComplete && referencesComplete && !complete) {
      selectStoryboard();
      open?.();
    }
  }, [projectId, ready, referencesComplete, complete, selectStoryboard, open]);
  return null;
}
