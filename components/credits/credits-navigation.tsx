import Link from "next/link";
import { cn } from "@/lib/utils";

export function CreditsNavigation({ activeSection }: { activeSection: "billing" | "earnings" }) {
  return <aside className="min-h-0 min-w-0" aria-label="Credits navigation">
    <nav aria-label="Credit sections" className="grid gap-1">
      {([
        ["billing", "/credits", "Credits & Billing"],
        ["earnings", "/credits/earnings", "Earnings & Payouts"],
      ] as const).map(([section, href, label]) => <Link key={section} href={href} aria-current={activeSection === section ? "page" : undefined}
        className={cn("flex min-h-7 items-center rounded-[7px] px-2.5 py-1 text-xs leading-5 outline-none transition-colors duration-[var(--motion-micro)] ease-[var(--motion-ease)] focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-ring hover:bg-accent motion-reduce:transition-none [@media(pointer:coarse)]:min-h-11", activeSection === section ? "bg-accent text-accent-foreground" : "text-foreground")}>{label}</Link>)}
    </nav>
  </aside>;
}
