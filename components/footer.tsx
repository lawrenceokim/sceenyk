import { ArrowUpRight } from "lucide-react";
import Link from "next/link";
import { Brand } from "@/components/brand";

export function Footer() {
  return (
    <footer className="border-t border-border bg-card py-10">
      <div className="sceenyk-container">
        <div className="flex flex-col justify-between gap-8 sm:flex-row sm:items-center">
          <div>
            <Brand />
            <p className="mt-2 text-body-sm text-muted-foreground">
              Create the scene you imagine.
            </p>
          </div>
          <nav
            aria-label="Footer navigation"
            className="flex flex-wrap gap-x-6 gap-y-2"
          >
            <Link className="nav-link" href="/#features">
              Features
            </Link>
            <Link className="nav-link" href="/#showcase">
              Inspiration <ArrowUpRight className="size-4" aria-hidden="true" />
            </Link>
            <Link className="nav-link" href="/#pricing">
              Pricing
            </Link>
          </nav>
        </div>
        <div className="mt-8 flex flex-col justify-between gap-2 border-t border-border pt-6 text-caption text-muted-foreground sm:flex-row">
          <p>© 2026 Sceenyk. Made for your imagination.</p>
          <p>Development preview · More creativity ahead.</p>
        </div>
      </div>
    </footer>
  );
}
