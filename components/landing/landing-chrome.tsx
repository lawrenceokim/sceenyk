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
import { landingArtwork } from "./artwork";

function ConfiguredAccount() {
  const { isLoaded, isSignedIn } = useAuth();
  if (!isLoaded)
    return (
      <span
        className={"sceenyk-landing-accountPlaceholder [&&]:block [&&]:w-[170px] [&&]:h-[44px]"}
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
      <span className={"sceenyk-landing-signup [.sceenyk-landing-mobileAccount_&&]:inline max-1100:[&&]:hidden"}>
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
        className={"sceenyk-landing-accountPlaceholder [&&]:block [&&]:w-[170px] [&&]:h-[44px]"}
      />
    );
  return isSignedIn ? (
    <Link
      href="/settings/account"
      onClick={onClose}
      className={"sceenyk-landing-drawerAvatar [&&]:flex [&&]:items-center [&&]:gap-[12px] [&&]:min-h-[48px] [&&]:font-[600]"}
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
        className={`
      sceenyk-landing-navbar [&&]:[--navbar-fade:40px] [&&]:[--navbar-blur:18px] [&&]:fixed [&&]:top-[0] [&&]:right-[0]
      [&&]:bottom-[auto] [&&]:left-[0] [&&]:z-[40] [&&]:isolate [&&]:pt-[env(safe-area-inset-top,_0px)] [&&]:[border:0]
      [&&]:[background:transparent] [&&::before]:[content:''] [&&::before]:absolute [&&::before]:top-[0]
      [&&::before]:right-[0] [&&::before]:bottom-[calc(-1_*_var(--navbar-fade))] [&&::before]:left-[0] [&&::before]:z-[-1]
      [&&::before]:pointer-events-none [&&::before]:[background:color-mix(in_srgb,_var(--background)_68%,_transparent)]
      [&&::before]:[-webkit-backdrop-filter:blur(var(--navbar-blur))_saturate(1.08)]
      [&&::before]:[backdrop-filter:blur(var(--navbar-blur))_saturate(1.08)]
      [&&::before]:[mask-image:linear-gradient(to_bottom,_black_calc(100%_-_var(--navbar-fade)),_transparent_100%)]
      [&&_a:focus-visible]:[outline:2px_solid_var(--ring)] [&&_a:focus-visible]:[outline-offset:5px]
      [&&_a:focus-visible]:rounded-[6px] max-699:[&&]:[--navbar-fade:28px] max-699:[&&]:[--navbar-blur:16px]
      backdrop-blur-none
    `}
        data-landing-navbar
      >
        <div className={`
      sceenyk-landing-container [&&]:w-[min(100%,_1320px)] [&&]:ml-[auto] [&&]:mr-[auto] [&&]:pl-[clamp(20px,_4vw,_60px)]
      [&&]:pr-[clamp(20px,_4vw,_60px)] max-699:[&&]:pl-[20px] max-699:[&&]:pr-[20px] max-359:[&&]:pl-[16px]
      max-359:[&&]:pr-[16px] sceenyk-landing-navbarInner [&&]:min-h-[76px] [&&]:flex [&&]:items-center [&&]:justify-between
      [&&]:gap-[20px] max-999:[&&]:min-h-[68px] max-699:[&&]:gap-[10px]
    `}>
          <div className={`
      sceenyk-landing-navbarLeft [&&]:flex [&&]:items-center [&&]:gap-[36px] [&&_img]:w-[144px] max-1100:[&&]:gap-[24px]
      max-999:[&&]:gap-[12px] max-699:[&&_img]:w-[118px] max-359:[&&_img]:w-[103px]
    `}>
            <SheetTrigger
              render={
                <Button
                  size="icon"
                  variant="ghost"
                  className={"sceenyk-landing-mobileMenu [&&]:hidden max-999:[&&]:inline-flex max-999:[&&]:shrink-0"}
                  aria-label="Open navigation"
                />
              }
            >
              <Menu aria-hidden="true" />
            </SheetTrigger>
            <Brand variant="full" />
            <nav aria-label="Main navigation" className={`
      sceenyk-landing-desktopLinks [&&]:flex [&&]:items-center [&&]:gap-[30px] [&&_a]:text-[color:var(--foreground)]
      [&&_a]:text-[length:14px] [&&_a]:font-[500] [&&_a:hover]:text-[color:var(--link)] max-999:[&&]:hidden
    `}>
              <Link href="/marketplace">Marketplace</Link>
              <Link href="/#pricing">Pricing</Link>
            </nav>
          </div>
          <div className={`
      sceenyk-landing-navbarActions [&&]:flex [&&]:items-center [&&]:gap-[12px] max-999:[&&_>_a]:h-[44px]
      max-999:[&&_>_a]:text-[length:12px] max-999:[&&_>_a]:pl-[14px] max-999:[&&_>_a]:pr-[14px] max-699:[&&]:gap-[5px]
      max-699:[&&_>_a_svg]:hidden max-359:[&&_>_a]:pl-[10px] max-359:[&&_>_a]:pr-[10px]
    `}>
            <Link href="/studio" className={buttonVariants()}>
              Open Studio <ArrowRight aria-hidden="true" />
            </Link>
            <div className={"sceenyk-landing-desktopAccount [&&]:flex [&&]:items-center [&&]:gap-[8px] max-999:[&&]:hidden"}>
              <LandingAccount />
            </div>
          </div>
        </div>
      </header>
      <SheetContent side="left" className="overflow-y-auto p-6 pt-16">
        <Brand variant="full" />
        <SheetTitle>Explore Sceenyk</SheetTitle>
        <SheetDescription>Your next creative starting point.</SheetDescription>
        <nav aria-label="Mobile navigation" className={`
      sceenyk-landing-mobileLinks [&&_a]:text-[color:var(--foreground)] [&&_a]:text-[length:14px] [&&_a]:font-[500]
      [&&_a]:flex [&&_a]:min-h-[48px] [&&_a]:items-center [&&_a]:[border-bottom:1px_solid_var(--border)] [&&]:grid
      [&&]:gap-[8px] [&&]:mt-[16px] [&&_a:focus-visible]:[outline:2px_solid_var(--ring)]
      [&&_a:focus-visible]:[outline-offset:3px]
    `}>
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
        <div className={"sceenyk-landing-mobileAccount [&&]:grid [&&]:gap-[16px] [&&]:mt-[auto] [&&]:pt-[24px] [&&_>_a]:flex [&&_>_a]:min-h-[44px] [&&_>_a]:items-center [&&_>_a]:text-[length:14px]"} data-landing-drawer-account>
          <DrawerAccount
            onClose={() => setOpen(false)}
            onAuthenticate={authenticate}
          />
          <Link
            href="/settings/appearance"
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
    <footer className={`
      sceenyk-landing-footer [&&_a:hover]:text-[color:var(--foreground)] [&&_a:hover]:[text-decoration:underline]
      [&&_a:hover]:[text-underline-offset:4px] [&&_a:focus-visible]:[outline:2px_solid_var(--ring)]
      [&&_a:focus-visible]:[outline-offset:5px] [&&_a:focus-visible]:rounded-[6px] [&&]:relative [&&]:isolate
      [&&]:overflow-clip [&&]:[background:var(--background)] [&&]:[border-top:1px_solid_var(--border)] [&&]:pt-[40px]
      [&&]:pb-[20px] [&&::after]:[content:''] [&&::after]:absolute [&&::after]:top-[0] [&&::after]:right-[0]
      [&&::after]:bottom-[0] [&&::after]:left-[0] [&&::after]:z-[-1] [&&::after]:pointer-events-none
      [&&::after]:[background:linear-gradient(color-mix(in_srgb,_var(--background)_70%,_transparent),_color-mix(in_srgb,_var(--background)_25%,_transparent))]
    `} data-landing-footer>
      <Image
        src={landingArtwork.underwater}
        alt=""
        aria-hidden="true"
        fill
        sizes="100vw"
        className={"sceenyk-landing-footerArtwork [&&]:z-[-2] [&&]:object-cover [&&]:[object-position:50%_52%] [&&]:opacity-[.28]"}
      />
      <div className={`
      sceenyk-landing-container [&&]:w-[min(100%,_1320px)] [&&]:ml-[auto] [&&]:mr-[auto] [&&]:pl-[clamp(20px,_4vw,_60px)]
      [&&]:pr-[clamp(20px,_4vw,_60px)] max-699:[&&]:pl-[20px] max-699:[&&]:pr-[20px] max-359:[&&]:pl-[16px]
      max-359:[&&]:pr-[16px]
    `}>
        <div className={`
      sceenyk-landing-footerTop [&&_img]:w-[144px] [&&]:grid
      [&&]:[grid-template-columns:minmax(0,_2.2fr)_repeat(3,_minmax(0,_1fr))] [&&]:gap-[32px] [&&_p]:text-[length:11px]
      [&&_p]:text-[color:color-mix(in_srgb,_var(--foreground)_85%,_var(--background))] [&&_p]:mt-[3px] [&&_nav]:flex
      [&&_nav]:flex-col [&&_nav]:items-start [&&_h2]:text-[length:11px] [&&_h2]:font-[650] [&&_h2]:mb-[8px]
      [&&_nav_a]:text-[length:11px] [&&_nav_a]:leading-[1.3] [&&_nav_a]:pt-[6px] [&&_nav_a]:pb-[6px]
      [&&_nav_a]:text-[color:color-mix(in_srgb,_var(--foreground)_85%,_var(--background))]
      max-999:[&&]:[grid-template-columns:minmax(0,_1.5fr)_repeat(3,_minmax(0,_1fr))] max-999:[&&]:gap-[20px]
      max-999:[&&_nav_a]:min-h-[44px] max-999:[&&_nav_a]:flex max-999:[&&_nav_a]:items-center
      max-699:[&&]:[grid-template-columns:repeat(2,_minmax(0,_1fr))] max-699:[&&]:gap-[25px_20px]
      max-699:[&&_>_div]:[grid-column:1_/_-1] max-699:[&&_nav_h2]:text-[length:12px] max-699:[&&_nav_a]:text-[length:12px]
    `}>
          <div>
            <Brand variant="full" />
            <p>Create the scene you imagine.</p>
            <Link href="/studio" className={"sceenyk-landing-footerStudio [&&]:inline-flex [&&]:min-h-[44px] [&&]:items-center [&&]:gap-[12px] [&&]:mt-[10px] [&&]:text-[length:12px] [&&]:text-[color:var(--foreground)]"}>
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
            <Link href="/projects">Projects</Link>
            <Link href="/settings/account">Account</Link>
            <Link href="/settings/creator-profile">
              Creator Profile
            </Link>
          </nav>
          <nav aria-label="Footer settings navigation">
            <h2>Preferences</h2>
            <Link href="/settings/appearance">Appearance</Link>
            <Link href="/settings/privacy">
              Privacy &amp; Security
            </Link>
          </nav>
        </div>
        <div className={`
      sceenyk-landing-footerBottom [&&]:flex [&&]:justify-between [&&]:[border-top:1px_solid_var(--border)] [&&]:mt-[20px]
      [&&]:pt-[13px] [&&]:text-[length:10px] [&&]:text-[color:color-mix(in_srgb,_var(--foreground)_85%,_var(--background))]
      max-699:[&&]:flex-col max-699:[&&]:gap-[8px]
    `}>
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
