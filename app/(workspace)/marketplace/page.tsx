import { WorkspaceGalleryPage } from "@/components/workspace/workspace-gallery-page";
import { MarketplaceDiscoverySkeleton } from "@/components/marketplace/gallery-skeletons";
import { MarketplaceDiscovery } from "@/components/marketplace/discovery";
import { Suspense } from "react";
import type { Metadata } from "next";
import Link from "next/link";

export const metadata: Metadata = {
  title: "Marketplace — Sceenyk",
  description: "Discover creator templates, adopt a creative starting point and make it your own.",
};
export default function MarketplacePage() {
  return (
    <WorkspaceGalleryPage view="marketplace"><div className={"workspace-marketplace marketplace-index p-5 [&&]:flex [&&]:flex-col [&&]:gap-[24px] [&&_header]:max-w-[100%] [&&_header_h1]:max-w-[660px] [.workspace-marketplace&&]:gap-[24px]"}>
      <header className={`
      marketplace-heading [&&_h1]:mt-[0] [&&_h1]:mr-[0] [&&_h1]:mb-[0] [&&_h1]:ml-[0] [&&_h1]:font-[700]
      [&&_>_p]:max-w-[610px] [&&_>_p]:mt-[12px] [&&_>_p]:text-[color:var(--muted-foreground)] [&&_>_p]:text-[length:20px]
      [&&_>_p]:leading-[1.4] [&&_>_p]:tracking-[-0.025em] max-599:[&&_>_p]:text-[length:18px] max-599:[&&_>_p]:leading-[27px]
      max-599:[.workspace-templates_&&_>_p]:text-[length:16px] max-599:[.workspace-templates_&&_>_p]:leading-[24px]
    `}>
        <h1>Marketplace</h1>
        <p>Discover creative projects. Make them your own.</p>
      </header>
      <Suspense fallback={<MarketplaceDiscoverySkeleton />}>
        <MarketplaceDiscovery />
      </Suspense>
      <Link
        href="/settings/templates"
        className={`
      [@layer_components]:inline-flex [@layer_components]:min-h-[var(--control-height)] [@layer_components]:items-center
      [@layer_components]:gap-[var(--space-1)] [@layer_components]:text-[color:var(--muted-foreground)]
      [@layer_components]:text-[length:var(--text-body-sm)] [@layer_components]:font-[500]
      [@layer_components]:[transition:color_var(--duration-fast)]
      [@layer_components]:[@media_(prefers-reduced-motion:_reduce)]:[transition:none] marketplace-management-link nav-link
      text-muted-foreground hidden [&&]:[align-self:flex-start] [&&]:text-[length:12px]
      [@layer_components]:[&:hover]:text-[color:var(--link)]
      [@layer_components]:[&:focus-visible]:[outline:2px_solid_var(--ring)]
      [@layer_components]:[&:focus-visible]:[outline-offset:4px] [.marketplace-detail-info_>_&&]:min-h-[32px]
      [.marketplace-detail-info_>_&&]:gap-[8px] [.marketplace-detail-info_>_&&]:text-[length:13px]
      [.marketplace-detail-info_>_&&_img]:w-[28px] [.marketplace-detail-info_>_&&_img]:h-[28px]
      [.marketplace-detail-info_>_&&_.rounded-full]:w-[28px] [.marketplace-detail-info_>_&&_.rounded-full]:h-[28px]
      [.workspace-gallery-copy_&&]:min-h-[24px] [.workspace-gallery-copy_&&]:gap-[6px]
      [.workspace-gallery-copy_&&]:text-[length:inherit] [.workspace-gallery-copy_&&]:leading-[inherit]
      [.workspace-settings-inner_&&]:min-h-[28px] [.workspace-settings-inner_&&]:text-[length:12px]
      [@media_(pointer:_coarse)]:[.workspace-settings-inner_&&]:min-h-[44px]
    `}
      >
        Manage my listings
      </Link>
    </div></WorkspaceGalleryPage>
  );
}
