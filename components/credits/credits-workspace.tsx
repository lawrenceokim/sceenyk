"use client";

import type { ReactNode } from "react";
import { usePathname } from "next/navigation";
import { SettingsWorkspace } from "@/components/settings/settings-workspace";
import { CreditsNavigation } from "./credits-navigation";

export function CreditsWorkspace({ children }: { children: ReactNode }) {
  const earnings = usePathname() === "/credits/earnings";
  return <SettingsWorkspace
    title={earnings ? "Earnings & Payouts" : "Credits & Billing"}
    description={earnings ? "Your creator earnings and withdrawals, separate from AI credits." : "Buy credits. Create what you need. Top up when you need more."}
    navigation={<CreditsNavigation activeSection={earnings ? "earnings" : "billing"} />}
    regionLabel={earnings ? "Earnings and payouts content" : "Credits and billing content"}>
    {children}
  </SettingsWorkspace>;
}
