import Link from "next/link";
import { SceenykLogo } from "@/components/brand/sceenyk-logo";

export function Brand({ onNavigate, variant = "responsive" }: {
  onNavigate?: () => void;
  variant?: "full" | "compact" | "responsive";
}) {
  return (
    <Link
      href="/"
      onNavigate={onNavigate}
      aria-label="Sceenyk home"
      className="inline-flex min-h-11 shrink-0 items-center rounded-lg focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-ring"
    >
      <SceenykLogo variant={variant} decorative />
    </Link>
  );
}
