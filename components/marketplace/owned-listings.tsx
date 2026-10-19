"use client";

import Link from "next/link";
import { useAuth } from "@clerk/nextjs";
import { Store } from "lucide-react";
import { useAuthAvailable } from "@/components/auth/auth-availability";
import { AccountAction } from "@/components/account-action";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/empty-state";
import type { ListingPage, OwnedListing } from "@/lib/marketplace/contract";
import { TemplateLibrary } from "@/components/templates/template-library";
import { OwnedInfiniteGallery } from "./owned-infinite-gallery";

type Props = { clerkUserId: string; result: ListingPage<OwnedListing>; presentation?: "management" | "library" };
export function OwnedListings(props: Props) {
  return useAuthAvailable() ? <AccountListings {...props} /> : <p>Sign in is temporarily unavailable.</p>;
}
function AccountListings({ clerkUserId, result, presentation = "management" }: Props) {
  const { isLoaded, userId } = useAuth();
  if (!isLoaded) return <p role="status">Opening your listings…</p>;
  if (userId !== clerkUserId) return <AccountAction intent="sign-in">Sign in to manage listings</AccountAction>;
  if (presentation === "library") return <TemplateLibrary result={result} />;
  return result.items.length
    ? <OwnedInfiniteGallery key={`${clerkUserId}:${JSON.stringify(result)}`} initial={result} clerkUserId={clerkUserId} />
    : <div className="sceenyk-card"><EmptyState icon={<Store className="size-7" />} title="Share your creative approach" description="Publish a reusable template from an owned saved project. Your original project and media stay private." primaryAction={<Button nativeButton={false} render={<Link href="/settings/templates/new" />}>Choose a project</Button>} /></div>;
}
