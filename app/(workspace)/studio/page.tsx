import { WorkspaceLegacyLinks } from "@/components/workspace/workspace-legacy-links";
import type { Metadata } from "next";
import { CreationWorkspace } from "@/components/creation/creation-workspace";
import { CreationHeader } from "@/components/creation/creation-header";
import Link from "next/link";

export const metadata: Metadata = {
  title: "Sceenyk Studio — Your imagination studio",
  description:
    "Choose a content type, describe your idea, and save your creative brief as a private Sceenyk project draft.",
};

export default function StudioPage() {
  return (
    <div className="min-w-0">
      <WorkspaceLegacyLinks />
      <CreationHeader />
      {process.env.NODE_ENV === "development" && <Link href="/studio/v3" className="mx-4 mb-3 inline-block text-sm text-muted-foreground underline underline-offset-4">New V3 test project</Link>}
      <CreationWorkspace />
    </div>
  );
}
