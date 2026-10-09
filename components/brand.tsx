import Link from "next/link";
import { Sparkle } from "lucide-react";

export function Brand({ onNavigate }: { onNavigate?: () => void }) {
  return (
    <Link
      href="/"
      onNavigate={onNavigate}
      aria-label="Sceenyk home"
      className="inline-flex min-h-11 shrink-0 items-center gap-1.5 rounded-lg focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-ring"
    >
      <span className="text-heading-3 font-bold tracking-tight">Sceenyk</span>
      <span className="flex size-5 items-center justify-center rounded-full bg-primary text-primary-foreground">
        <Sparkle className="size-3.5 fill-current" aria-hidden="true" />
      </span>
    </Link>
  );
}
