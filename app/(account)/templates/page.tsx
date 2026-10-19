import { Suspense } from "react";
import type { Metadata } from "next";
import Link from "next/link";
import { unstable_rethrow } from "next/navigation";
import { ensureAppUser } from "@/lib/auth/ensure-app-user";
import { listOwnedMarketplaceListings } from "@/lib/marketplace/server";
import { OwnedListings } from "@/components/marketplace/owned-listings";
import { MarketplaceFailure } from "@/components/marketplace/listing-card";

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
      <header className={`
      marketplace-heading [&&_h1]:mt-[0] [&&_h1]:mr-[0] [&&_h1]:mb-[0] [&&_h1]:ml-[0] [&&_h1]:font-[700]
      [&&_>_p]:max-w-[610px] [&&_>_p]:mt-[12px] [&&_>_p]:text-[color:var(--muted-foreground)] [&&_>_p]:text-[length:20px]
      [&&_>_p]:leading-[1.4] [&&_>_p]:tracking-[-0.025em] max-599:[&&_>_p]:text-[length:18px] max-599:[&&_>_p]:leading-[27px]
      max-599:[.workspace-templates_&&_>_p]:text-[length:16px] max-599:[.workspace-templates_&&_>_p]:leading-[24px]
    `}><h1>My Templates</h1><p>Templates you&apos;ve published. Open one to manage or continue your work.</p></header>
      <Suspense fallback={<p role="status" className="py-8 text-muted-foreground">Opening your templates…</p>}><Templates searchParams={searchParams} /></Suspense>
      <footer className={`
      template-library-footer [&&_a:focus-visible]:[outline:2px_solid_var(--ring)] [&&_a:focus-visible]:[outline-offset:3px]
      [&&]:grid [&&]:gap-[12px] [&&]:mt-[32px] [&&]:text-[color:var(--muted-foreground)] [&&]:text-[length:12px]
      [&&]:leading-[18px] [&&_nav]:flex [&&_nav]:flex-wrap [&&_nav]:gap-[8px_20px] [&&_a:hover]:text-[color:var(--link)]
      [&&_p_a]:[text-decoration:underline] [&&_p_a]:[text-underline-offset:3px]
    `}>
        <nav aria-label="Template library links"><Link href="/settings/templates/new">Publish from a project</Link><Link href="/settings/templates">Manage listings</Link><Link href="/marketplace/purchases">Marketplace purchases</Link></nav>
        <p>Adopted templates live in <Link href="/projects">Projects</Link>.</p>
      </footer>
    </div>
  );
}
