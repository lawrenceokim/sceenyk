import Link from "next/link";
import { FolderOpen } from "lucide-react";
import { EmptyState } from "@/components/empty-state";
import { Button } from "@/components/ui/button";

export function ProjectUnavailable() {
  return (
    <section className="sceenyk-card">
      <EmptyState
        icon={<FolderOpen className="size-7" />}
        title="Project unavailable"
        description="Open a saved project from your dashboard."
        primaryAction={
          <Button
            nativeButton={false}
            render={<Link href="/dashboard#projects" />}
          >
            Your projects
          </Button>
        }
      />
    </section>
  );
}
