import type { Metadata } from "next";
import { CreationWorkspace } from "@/components/creation/creation-workspace";
import { CreationHeader } from "@/components/creation/creation-header";

export const metadata: Metadata = {
  title: "Create with Sceenyk — Your imagination studio",
  description:
    "Choose a content type, describe your idea, and save your creative brief as a private Sceenyk project draft.",
};

export default function CreatePage() {
  return (
    <div className="sceenyk-container py-8 md:py-12">
      <CreationHeader />
      <CreationWorkspace />
    </div>
  );
}
