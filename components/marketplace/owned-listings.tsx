"use client";

import Link from "next/link";
import { useAuth } from "@clerk/nextjs";
import { Store } from "lucide-react";
import { useAuthAvailable } from "@/components/auth/auth-availability";
import { AccountAction } from "@/components/account-action";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/empty-state";
import { usd } from "@/lib/marketplace/payments/contract";
import { TemplateCover } from "./listing-card";
import { MarketplacePagination } from "./pagination";
import type { ListingPage, OwnedListing } from "@/lib/marketplace/contract";
import { TemplateLibrary } from "@/components/templates/template-library";

type Props = { clerkUserId: string; result: ListingPage<OwnedListing>; presentation?: "management" | "library" };
export function OwnedListings(props: Props) {
  return useAuthAvailable() ? <AccountListings {...props} /> : <p>Sign in is temporarily unavailable.</p>;
}
function AccountListings({ clerkUserId, result, presentation = "management" }: Props) {
  const { isLoaded, userId } = useAuth();
  if (!isLoaded) return <p role="status">Opening your listings…</p>;
  if (userId !== clerkUserId) return <AccountAction intent="sign-in">Sign in to manage listings</AccountAction>;
  if (presentation === "library") return <TemplateLibrary result={result} />;
  return <div className="space-y-6">{result.items.length ? <div className="grid gap-6 sm:grid-cols-2 xl:grid-cols-3">{result.items.map(listing => <article className="sceenyk-card min-w-0 overflow-hidden" key={listing.id}><TemplateCover template={listing.template} fallbackColor={listing.fallbackColor} previewId={listing.id} /><div className="space-y-3 p-5"><div className="flex flex-wrap items-center justify-between gap-2"><h2 className="break-words text-lg font-semibold">{listing.title}</h2><span className="rounded-full bg-accent px-3 py-1 text-caption capitalize text-accent-foreground">{listing.status}</span></div><p className="line-clamp-2 break-words text-body-sm text-muted-foreground">{listing.description}</p><p className="text-body-sm">Adoptions: {listing.adoptionCount} · Paid sales: {listing.paidSalesCount}</p><p className="text-body-sm">Creator earnings: {usd(listing.creatorEarningsMinor)}</p><div className="flex flex-wrap gap-3"><Button nativeButton={false} variant="outline" render={<Link href={`/settings/templates/${listing.id}`} />}>{listing.status === "archived" ? "View listing" : "Manage listing"}</Button>{listing.status === "published" && <Link className="nav-link text-link" href={`/marketplace/${listing.id}`}>Open public listing</Link>}</div></div></article>)}</div> : <div className="sceenyk-card"><EmptyState icon={<Store className="size-7" />} title="Share your creative approach" description="Publish a reusable template from an owned saved project. Your original project and media stay private." primaryAction={<Button nativeButton={false} render={<Link href="/settings/templates/new" />}>Choose a project</Button>} /></div>}<MarketplacePagination {...result} href={page => `/settings/templates?page=${page}`} /></div>;
}
