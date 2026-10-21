"use client";

import { usePathname } from "next/navigation";
import { PayoutSupportSkeleton } from "./support-skeletons";

export function SupportLoading() {
  return <PayoutSupportSkeleton detail={usePathname().startsWith("/admin/payouts/")} />;
}
