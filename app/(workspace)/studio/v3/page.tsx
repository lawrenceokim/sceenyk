import { Suspense } from "react";
import type { Metadata } from "next";
import { requireClerkUser } from "@/lib/auth/require-user";
import { readOwnedV3 } from "@/lib/final-video-generation-v3/runtime-server";
import { v3LocalEnabled } from "@/lib/final-video-generation-v3/runtime-config";
import { V3Studio } from "@/components/creation/v3-studio";
import { unstable_rethrow } from "next/navigation";
import type { RuntimeDto } from "@/lib/final-video-generation-v3/runtime-server";

export const metadata: Metadata = { title: "V3 test workspace — Sceenyk", robots: { index: false, follow: false } };
async function OwnedV3({ searchParams }: { searchParams: Promise<{ project?: string }> }) {
  await requireClerkUser();
  const { project } = await searchParams;
  if (!v3LocalEnabled()) return <p className="p-6 text-sm text-muted-foreground">The V3 test workspace is disabled. Enable the local V3 planning configuration to create a new project.</p>;
  if (!project) return <V3Studio initial={null} />;
  let initial: RuntimeDto;
  try { initial = await readOwnedV3(project); }
  catch (error) { unstable_rethrow(error); return <p role="alert" className="p-6 text-sm text-muted-foreground">This V3 project is unavailable. Check the local database setup and reopen an owned V3 project.</p>; }
  return <V3Studio initial={initial} />;
}
export default function V3Page(props: { searchParams: Promise<{ project?: string }> }) {
  return <div className="mx-auto w-full max-w-5xl p-4 sm:p-6"><h1 className="mb-4 text-2xl font-semibold">V3 test workspace</h1>
    <Suspense fallback={<p role="status" className="text-sm text-muted-foreground">Loading your V3 workspace…</p>}><OwnedV3 {...props} /></Suspense></div>;
}
