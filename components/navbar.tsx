"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { Menu, X } from "lucide-react";
import { Brand } from "@/components/brand";
import { ThemeToggle } from "@/components/theme-toggle";
import { AccountControls } from "@/components/auth/account-controls";
import { Button } from "@/components/ui/button";

const navigation = [
  { label: "Features", href: "/#features" },
  { label: "How it works", href: "/#how-it-works" },
  { label: "Pricing", href: "/#pricing" },
];

export function Navbar() {
  const [open, setOpen] = useState(false);
  const toggle = useRef<HTMLButtonElement>(null);
  useEffect(() => {
    const desktop = matchMedia("(min-width: 1024px)");
    const closeOnDesktop = () => {
      if (desktop.matches) setOpen(false);
    };
    desktop.addEventListener("change", closeOnDesktop);
    return () => desktop.removeEventListener("change", closeOnDesktop);
  }, []);
  return (
    <header
      className="sticky top-0 z-40 border-b border-border bg-background/95 backdrop-blur-xl"
      onKeyDown={(event) => {
        if (event.key === "Escape" && open) {
          setOpen(false);
          toggle.current?.focus();
        }
      }}
    >
      <div className="sceenyk-container flex h-20 items-center justify-between gap-4">
        <Brand />
        <nav
          aria-label="Main navigation"
          className="hidden items-center gap-8 lg:flex"
        >
          {navigation.map((item) => (
            <Link key={item.href} className="nav-link" href={item.href}>
              {item.label}
            </Link>
          ))}
        </nav>
        <div className="flex items-center gap-2">
          <ThemeToggle />
          <div className="hidden items-center gap-2 lg:flex">
            <AccountControls />
          </div>
          <Button
            ref={toggle}
            size="icon"
            variant="ghost"
            className="lg:hidden"
            aria-label={open ? "Close navigation" : "Open navigation"}
            aria-expanded={open}
            aria-controls="mobile-navigation"
            onClick={() => setOpen(!open)}
          >
            {open ? (
              <X className="size-5" aria-hidden="true" />
            ) : (
              <Menu className="size-5" aria-hidden="true" />
            )}
          </Button>
        </div>
      </div>
      <nav
        id="mobile-navigation"
        aria-label="Mobile navigation"
        hidden={!open}
        className="border-t border-border bg-card lg:hidden"
      >
        <div className="sceenyk-container flex flex-col gap-2 py-4">
          {navigation.map((item) => (
            <Link
              key={item.href}
              href={item.href}
              className="nav-link rounded-lg px-3"
              onClick={() => setOpen(false)}
            >
              {item.label}
            </Link>
          ))}
          <div className="mt-2 flex flex-wrap items-center gap-3 border-t border-border pt-4">
            <AccountControls onNavigate={() => setOpen(false)} />
          </div>
        </div>
      </nav>
    </header>
  );
}
