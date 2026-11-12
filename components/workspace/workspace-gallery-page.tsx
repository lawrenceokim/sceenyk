import type { ReactNode } from "react";

const gallerySpacing = {
  projects: "px-[22px] pt-[54px] pb-[24px] max-767:px-[14px] max-767:pt-[26px] max-767:pb-[20px]",
  templates: "px-[24px] pt-[60px] pb-[32px] max-599:px-[16px] max-599:pt-[32px] max-599:pb-[24px]",
  marketplace: "px-[24px] pt-[54px] pb-[32px] max-599:px-[16px] max-599:pt-[40px] max-599:pb-[24px]",
};

// Keep the inset inside the route's scroll target, with identical geometry for
// skeletons and results. Shared-layout padding can be scrolled past on navigation.
export function WorkspaceGalleryPage({ view, children }: {
  view: keyof typeof gallerySpacing;
  children: ReactNode;
}) {
  return <div data-gallery-page={view} className={`min-w-0 ${gallerySpacing[view]}`}>{children}</div>;
}
