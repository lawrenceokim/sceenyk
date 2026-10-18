"use client";

import { useEffect, useRef, useState } from "react";
import { usePathname } from "next/navigation";
import Link from "next/link";
import Image from "next/image";
import { UserAvatar, UserButton, useAuth, useClerk } from "@clerk/nextjs";
import { ArrowRight, Menu } from "lucide-react";
import { Navbar } from "@/components/navbar";
import { Footer } from "@/components/footer";
import { Brand } from "@/components/brand";
import { AccountAction } from "@/components/account-action";
import { useAuthAvailable } from "@/components/auth/auth-availability";
import { Button, buttonVariants } from "@/components/ui/button";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetTitle,
  SheetTrigger,
} from "@/components/ui/sheet";
import { landingStyles as styles } from "./landing-styles";
import { landingArtwork } from "./artwork";

function ConfiguredAccount() {
  const { isLoaded, isSignedIn } = useAuth();
  if (!isLoaded)
    return (
      <span
        className={styles.accountPlaceholder}
        aria-label="Loading account"
        role="status"
      />
    );
  return isSignedIn ? (
    <UserButton userProfileMode="modal" />
  ) : (
    <>
      <AccountAction intent="sign-in" variant="outline">
        Sign In
      </AccountAction>
      <span className={styles.signup}>
        <AccountAction intent="sign-up" variant="ghost">
          Get Started
        </AccountAction>
      </span>
    </>
  );
}

function LandingAccount() {
  const available = useAuthAvailable();
  return available ? (
    <ConfiguredAccount />
  ) : (
    <AccountAction intent="sign-in" variant="outline">
      Sign In
    </AccountAction>
  );
}

function ConfiguredDrawerAccount({
  onClose,
  onAuthenticate,
}: {
  onClose: () => void;
  onAuthenticate: (launch: () => void) => void;
}) {
  const { isLoaded, isSignedIn } = useAuth();
  const { openSignIn } = useClerk();
  if (!isLoaded)
    return (
      <span
        role="status"
        aria-label="Loading account"
        className={styles.accountPlaceholder}
      />
    );
  return isSignedIn ? (
    <Link
      href="/dashboard/settings/account"
      onClick={onClose}
      className={styles.drawerAvatar}
    >
      <UserAvatar /> <span>Your account</span>
    </Link>
  ) : (
    <Button
      variant="outline"
      onClick={() =>
        onAuthenticate(() => {
          void openSignIn();
        })
      }
    >
      Sign In
    </Button>
  );
}

function DrawerAccount(props: {
  onClose: () => void;
  onAuthenticate: (launch: () => void) => void;
}) {
  const available = useAuthAvailable();
  return available ? (
    <ConfiguredDrawerAccount {...props} />
  ) : (
    <AccountAction intent="sign-in" variant="outline">
      Sign In
    </AccountAction>
  );
}

function LandingNavbar() {
  const [open, setOpen] = useState(false);
  const pendingAccount = useRef<(() => void) | null>(null);
  function authenticate(launch: () => void) {
    pendingAccount.current = launch;
    setOpen(false);
  }
  useEffect(() => {
    const desktop = matchMedia("(min-width: 1000px)");
    const close = () => {
      if (desktop.matches) setOpen(false);
    };
    desktop.addEventListener("change", close);
    return () => desktop.removeEventListener("change", close);
  }, []);
  return (
    <Sheet
      open={open}
      onOpenChange={setOpen}
      onOpenChangeComplete={(isOpen) => {
        if (isOpen) return;
        const launch = pendingAccount.current;
        pendingAccount.current = null;
        launch?.();
      }}
    >
      <header
        className={`${styles.navbar} backdrop-blur-none`}
        data-landing-navbar
      >
        <div className={`${styles.container} ${styles.navbarInner}`}>
          <div className={styles.navbarLeft}>
            <SheetTrigger
              render={
                <Button
                  size="icon"
                  variant="ghost"
                  className={styles.mobileMenu}
                  aria-label="Open navigation"
                />
              }
            >
              <Menu aria-hidden="true" />
            </SheetTrigger>
            <Brand variant="full" />
            <nav aria-label="Main navigation" className={styles.desktopLinks}>
              <Link href="/marketplace">Marketplace</Link>
              <Link href="/#pricing">Pricing</Link>
            </nav>
          </div>
          <div className={styles.navbarActions}>
            <Link href="/studio" className={buttonVariants()}>
              Open Studio <ArrowRight aria-hidden="true" />
            </Link>
            <div className={styles.desktopAccount}>
              <LandingAccount />
            </div>
          </div>
        </div>
      </header>
      <SheetContent side="left" className="overflow-y-auto p-6 pt-16">
        <Brand variant="full" />
        <SheetTitle>Explore Sceenyk</SheetTitle>
        <SheetDescription>Your next creative starting point.</SheetDescription>
        <nav aria-label="Mobile navigation" className={styles.mobileLinks}>
          <Link href="/studio" onClick={() => setOpen(false)}>
            Studio
          </Link>
          <Link href="/marketplace" onClick={() => setOpen(false)}>
            Marketplace
          </Link>
          <Link href="/#pricing" onClick={() => setOpen(false)}>
            Pricing
          </Link>
        </nav>
        <div className={styles.mobileAccount} data-landing-drawer-account>
          <DrawerAccount
            onClose={() => setOpen(false)}
            onAuthenticate={authenticate}
          />
          <Link
            href="/dashboard/settings/appearance"
            onClick={() => setOpen(false)}
          >
            Appearance
          </Link>
        </div>
      </SheetContent>
    </Sheet>
  );
}

function LandingFooter() {
  return (
    <footer className={styles.footer} data-landing-footer>
      <Image
        src={landingArtwork.underwater}
        alt=""
        aria-hidden="true"
        fill
        sizes="100vw"
        className={styles.footerArtwork}
      />
      <div className={styles.container}>
        <div className={styles.footerTop}>
          <div>
            <Brand variant="full" />
            <p>Create the scene you imagine.</p>
            <Link href="/studio" className={styles.footerStudio}>
              Find your creative flow{" "}
              <ArrowRight size={15} aria-hidden="true" />
            </Link>
          </div>
          <nav aria-label="Footer product navigation">
            <h2>Product</h2>
            <Link href="/studio">Studio</Link>
            <Link href="/marketplace">Marketplace</Link>
            <Link href="/#pricing">Pricing</Link>
            <Link href="/documentation">Documentation</Link>
          </nav>
          <nav aria-label="Footer account navigation">
            <h2>Your workspace</h2>
            <Link href="/dashboard/projects">Projects</Link>
            <Link href="/dashboard/settings/account">Account</Link>
            <Link href="/dashboard/settings/creator-profile">
              Creator Profile
            </Link>
          </nav>
          <nav aria-label="Footer settings navigation">
            <h2>Preferences</h2>
            <Link href="/dashboard/settings/appearance">Appearance</Link>
            <Link href="/dashboard/settings/privacy">
              Privacy &amp; Security
            </Link>
          </nav>
        </div>
        <div className={styles.footerBottom}>
          <span>© 2026 Sceenyk. All rights reserved.</span>
          <span>Built for creators.</span>
        </div>
      </div>
    </footer>
  );
}

// Existing shared public chrome is unchanged on /studio, Marketplace and private
// project pages. Only the home route opts into the new landing composition.
export function PublicNavbar() {
  return usePathname() === "/" ? <LandingNavbar /> : <Navbar />;
}
export function PublicFooter() {
  return usePathname() === "/" ? <LandingFooter /> : <Footer />;
}
