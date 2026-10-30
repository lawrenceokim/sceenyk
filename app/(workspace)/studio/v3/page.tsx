import { Suspense } from "react";
import { redirect } from "next/navigation";
import { z } from "zod";

// Retire old bookmarks into the canonical Studio/project route.
async function LegacyStudio({ searchParams }: { searchParams: Promise<{ project?: string }> }) {
  const { project } = await searchParams;
  return redirect(z.uuid().safeParse(project).success ? `/projects/${project}` : "/studio");
}
export default function Page(props: { searchParams: Promise<{ project?: string }> }) {
  return <Suspense fallback={null}><LegacyStudio {...props} /></Suspense>;
}
