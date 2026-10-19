"use client";

import { usePathname } from "next/navigation";
import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

export function WorkspacePageFrame({ children, className }: { children: ReactNode; className?: string }) {
  const pathname = usePathname();
  const studio = pathname === "/studio" || pathname.startsWith("/projects/");
  const detail = pathname.startsWith("/templates/") || (/^\/marketplace\/[^/]+$/.test(pathname) && pathname !== "/marketplace/purchases");
  const documentation = pathname === "/documentation" || pathname.startsWith("/documentation/");
  const settings = pathname === "/settings" || pathname.startsWith("/settings/");
  const view = settings ? "settings" : pathname === "/projects" ? "projects" : documentation ? "documentation" : pathname === "/templates" ? "templates" : pathname === "/marketplace" ? "marketplace" : detail ? "template-detail" : undefined;
  return <div data-workspace-page={studio ? "studio" : "content"} data-workspace-view={view} className={cn(`
      workspace-page min-w-0
      [.workspace-content_&&[data-workspace-page='content'][data-workspace-view='marketplace']]:pt-[54px]
      [.workspace-content_&&[data-workspace-page='content'][data-workspace-view='marketplace']]:pr-[24px]
      [.workspace-content_&&[data-workspace-page='content'][data-workspace-view='marketplace']]:pb-[32px]
      [.workspace-content_&&[data-workspace-page='content'][data-workspace-view='marketplace']]:pl-[24px]
      [.workspace-content_&&[data-workspace-page='content'][data-workspace-view='templates']]:pt-[60px]
      [.workspace-content_&&[data-workspace-page='content'][data-workspace-view='templates']]:pr-[24px]
      [.workspace-content_&&[data-workspace-page='content'][data-workspace-view='templates']]:pb-[32px]
      [.workspace-content_&&[data-workspace-page='content'][data-workspace-view='templates']]:pl-[24px]
      [.workspace-content_&&[data-workspace-page='content'][data-workspace-view='template-detail']]:pt-[0]
      [.workspace-content_&&[data-workspace-page='content'][data-workspace-view='template-detail']]:pr-[0]
      [.workspace-content_&&[data-workspace-page='content'][data-workspace-view='template-detail']]:pb-[0]
      [.workspace-content_&&[data-workspace-page='content'][data-workspace-view='template-detail']]:pl-[0]
      max-1023:[.workspace-content_>_&&:is(_[data-workspace-view='marketplace'],_[data-workspace-view='templates'],_[data-workspace-view='template-detail']_)]:h-[100%]
      max-1023:[.workspace-content_>_&&:is(_[data-workspace-view='marketplace'],_[data-workspace-view='templates'],_[data-workspace-view='template-detail']_)]:min-h-[0]
      max-1023:[.workspace-content_>_&&:is(_[data-workspace-view='marketplace'],_[data-workspace-view='templates'],_[data-workspace-view='template-detail']_)]:overflow-y-auto
      max-1023:[.workspace-content_>_&&:is(_[data-workspace-view='marketplace'],_[data-workspace-view='templates'],_[data-workspace-view='template-detail']_)]:overscroll-contain
      max-599:[.workspace-content_&&[data-workspace-page='content'][data-workspace-view='marketplace']]:pt-[40px]
      max-599:[.workspace-content_&&[data-workspace-page='content'][data-workspace-view='marketplace']]:pr-[16px]
      max-599:[.workspace-content_&&[data-workspace-page='content'][data-workspace-view='marketplace']]:pb-[24px]
      max-599:[.workspace-content_&&[data-workspace-page='content'][data-workspace-view='marketplace']]:pl-[16px]
      max-599:[.workspace-content_&&[data-workspace-page='content'][data-workspace-view='templates']]:pt-[32px]
      max-599:[.workspace-content_&&[data-workspace-page='content'][data-workspace-view='templates']]:pr-[16px]
      max-599:[.workspace-content_&&[data-workspace-page='content'][data-workspace-view='templates']]:pb-[24px]
      max-599:[.workspace-content_&&[data-workspace-page='content'][data-workspace-view='templates']]:pl-[16px]
      [&&[data-workspace-page='content']]:pt-[24px] [&&[data-workspace-page='content']]:pr-[24px]
      [&&[data-workspace-page='content']]:pb-[24px] [&&[data-workspace-page='content']]:pl-[24px]
      [&&[data-workspace-page='content']_>_*_+_*]:mt-[24px] [&&[data-workspace-page='studio']]:pt-[0]
      [&&[data-workspace-page='studio']]:pr-[0] [&&[data-workspace-page='studio']]:pb-[0]
      [&&[data-workspace-page='studio']]:pl-[0] [&&[data-workspace-page='content']_h1]:text-[length:36px]
      [&&[data-workspace-page='content']_h1]:leading-[1.15] [&&[data-workspace-page='content']_h1]:tracking-[-.04em]
      min-[1024px]:[&&[data-workspace-page='content']]:pt-[48px] min-[1024px]:[&&[data-workspace-page='content']]:pr-[24px]
      min-[1024px]:[&&[data-workspace-page='content']]:pb-[24px] min-[1024px]:[&&[data-workspace-page='content']]:pl-[24px]
      max-599:[&&[data-workspace-page='content']]:pt-[24px] max-599:[&&[data-workspace-page='content']]:pr-[16px]
      max-599:[&&[data-workspace-page='content']]:pb-[24px] max-599:[&&[data-workspace-page='content']]:pl-[16px]
      max-599:[&&[data-workspace-page='content']_h1]:text-[length:28px]
      [&&[data-workspace-page='content'][data-workspace-view='documentation']]:h-[100%]
      [&&[data-workspace-page='content'][data-workspace-view='documentation']]:min-h-[0]
      [&&[data-workspace-page='content'][data-workspace-view='documentation']]:pt-[0]
      [&&[data-workspace-page='content'][data-workspace-view='documentation']]:pr-[0]
      [&&[data-workspace-page='content'][data-workspace-view='documentation']]:pb-[0]
      [&&[data-workspace-page='content'][data-workspace-view='documentation']]:pl-[0]
      [&&[data-workspace-page='content'][data-workspace-view='documentation']]:[container:documentation_/_inline-size]
      [&&[data-workspace-page='content'][data-workspace-view='projects']]:pt-[54px]
      [&&[data-workspace-page='content'][data-workspace-view='projects']]:pr-[22px]
      [&&[data-workspace-page='content'][data-workspace-view='projects']]:pb-[24px]
      [&&[data-workspace-page='content'][data-workspace-view='projects']]:pl-[22px]
      [&&[data-workspace-page='content'][data-workspace-view='projects']_h1]:text-[length:32px]
      [&&[data-workspace-page='content'][data-workspace-view='projects']_h1]:leading-[38px]
      [&&[data-workspace-page='content'][data-workspace-view='projects']_h1]:font-[650]
      [&&[data-workspace-page='content'][data-workspace-view='projects']_h1]:tracking-[-.035em]
      max-767:[&&[data-workspace-page='content'][data-workspace-view='projects']]:pt-[26px]
      max-767:[&&[data-workspace-page='content'][data-workspace-view='projects']]:pr-[14px]
      max-767:[&&[data-workspace-page='content'][data-workspace-view='projects']]:pb-[20px]
      max-767:[&&[data-workspace-page='content'][data-workspace-view='projects']]:pl-[14px]
      max-767:[&&[data-workspace-page='content'][data-workspace-view='projects']_h1]:text-[length:26px]
      max-767:[&&[data-workspace-page='content'][data-workspace-view='projects']_h1]:leading-[32px]
      [&&[data-workspace-page='content'][data-workspace-view='settings']]:relative
      [&&[data-workspace-page='content'][data-workspace-view='settings']]:h-[calc(100dvh_-_var(--workspace-mobile-header-height)_-_var(--workspace-inset)_*_2_-_2px)]
      [&&[data-workspace-page='content'][data-workspace-view='settings']]:min-h-[0]
      [&&[data-workspace-page='content'][data-workspace-view='settings']]:pt-[0]
      [&&[data-workspace-page='content'][data-workspace-view='settings']]:pr-[0]
      [&&[data-workspace-page='content'][data-workspace-view='settings']]:pb-[0]
      [&&[data-workspace-page='content'][data-workspace-view='settings']]:pl-[0]
      [&&[data-workspace-page='content'][data-workspace-view='settings']]:[container:documentation_/_inline-size]
      min-[1024px]:[&&[data-workspace-page='content'][data-workspace-view='settings']]:h-[calc(100dvh_-_var(--workspace-inset)_*_2_-_2px)]
    `, className)}>{children}</div>;
}
