import { Suspense } from "react";
import type { Metadata } from "next";
import Link from "next/link";
import { unstable_rethrow } from "next/navigation";
import { ensureAppUser } from "@/lib/auth/ensure-app-user";
import { listOwnedMarketplaceListings } from "@/lib/marketplace/server";
import { OwnedListings } from "@/components/marketplace/owned-listings";
import { MarketplaceFailure } from "@/components/marketplace/listing-card";
import { Button } from "@/components/ui/button";
import { Plus } from "lucide-react";

export const metadata: Metadata = { title: "Templates — Sceenyk", robots: { index: false, follow: false } };

async function Templates({ searchParams }: { searchParams: Promise<{ page?: string | string[] }> }) {
  const user = await ensureAppUser();
  const { page } = await searchParams;
  const current = typeof page === "string" && /^\d{1,6}$/.test(page) ? Math.max(1, Math.min(100000, Number(page))) : 1;
  let result;
  try { result = await listOwnedMarketplaceListings(current); }
  catch (error) { unstable_rethrow(error); return <MarketplaceFailure href="/templates" />; }
  return <OwnedListings clerkUserId={user.clerk_user_id} result={result} presentation="library" />;
}

export default function TemplatesPage({ searchParams }: { searchParams: Promise<{ page?: string | string[] }> }) {
  return (
    <div className={`
      workspace-templates
      [.workspace-content_.workspace-page[data-workspace-page='content'][data-workspace-view='templates']_>_&&]:mt-[0]
      [&&_>_#templates]:mt-[40px] max-599:[&&_>_#templates]:mt-[24px]
    `}>
      <header className="flex flex-wrap items-end justify-between gap-4 max-md:flex-col max-md:items-start">
      <div className={`
      marketplace-heading [&&_h1]:mt-[0] [&&_h1]:mr-[0] [&&_h1]:mb-[0] [&&_h1]:ml-[0] [&&_h1]:font-[700]
      [&&_>_p]:max-w-[610px] [&&_>_p]:mt-[12px] [&&_>_p]:text-[color:var(--muted-foreground)] [&&_>_p]:text-[length:20px]
      [&&_>_p]:leading-[1.4] [&&_>_p]:tracking-[-0.025em] max-599:[&&_>_p]:text-[length:18px] max-599:[&&_>_p]:leading-[27px]
      max-599:[.workspace-templates_&&_>_p]:text-[length:16px] max-599:[.workspace-templates_&&_>_p]:leading-[24px]
    `}><h1>My Templates</h1><p>Templates you&apos;ve created. Open one to manage or continue your work.</p></div>
        <Button nativeButton={false} render={<Link href="/settings/templates/new" />} className="h-8 min-h-8 shrink-0 gap-1.5 rounded-[7px] px-3 text-xs [@media(pointer:coarse)]:min-h-11"><Plus className="size-3.5" aria-hidden="true" />New Template</Button>
      </header>
      <Suspense fallback={<p role="status" className="py-8 text-muted-foreground">Opening your templates…</p>}><Templates searchParams={searchParams} /></Suspense>

    </div>
  );
}
