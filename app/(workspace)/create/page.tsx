import { WorkspaceLegacyLinks } from "@/components/workspace/workspace-legacy-links";
import type { Metadata } from "next";
import { CreationWorkspace } from "@/components/creation/creation-workspace";
import { CreationHeader } from "@/components/creation/creation-header";

export const metadata: Metadata = {
  title: "Sceenyk Studio — Your imagination studio",
  description:
    "Choose a content type, describe your idea, and save your creative brief as a private Sceenyk project draft.",
};

export default function CreatePage() {
  return (
    <div className="space-y-8">
      <WorkspaceLegacyLinks />
      <CreationHeader />
      <CreationWorkspace />
    </div>
  );
}
