"use client";

import { useId, useRef, useState, type FormEvent } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useAuth } from "@clerk/nextjs";
import { LoaderCircle, Store } from "lucide-react";
import { createMarketplaceAction, updateMarketplaceAction } from "@/app/actions/marketplace";
import { Button } from "@/components/ui/button";
import { AccountAction } from "@/components/account-action";
import { useAuthAvailable } from "@/components/auth/auth-availability";
import { creationCategories } from "@/components/creation/creation-options";
import { TemplateCover } from "./listing-card";
import type { OwnedListing, TemplateSnapshot } from "@/lib/marketplace/contract";
import type { SavedProject } from "@/lib/projects/types";
import type { CategoryId } from "@/lib/projects/options";
import { usd, sandboxMarketplacePricing } from "@/lib/marketplace/payments/contract";

type Props = { clerkUserId: string; project?: SavedProject; listing?: OwnedListing };
export function ListingEditor(props: Props) {
  return useAuthAvailable() ? <AccountEditor {...props} /> : <p role="alert">Sign in is temporarily unavailable.</p>;
}
function AccountEditor(props: Props) {
  const { isLoaded, userId } = useAuth();
  if (!isLoaded) return <p role="status">Opening your listing…</p>;
  if (userId !== props.clerkUserId) return <AccountAction intent="sign-in">Sign in to manage listings</AccountAction>;
  return <Editor key={`${userId}:${props.listing?.id ?? props.project?.id}`} {...props} />;
}
function Editor({ project, listing }: Props) {
  const router = useRouter(); const prefix = useId(); const attempt = useRef<string | null>(listing?.id ?? null); const inFlight = useRef(false);
  const [title, setTitle] = useState(listing?.title ?? "");
  const [description, setDescription] = useState(listing?.description ?? "");
  const [category, setCategory] = useState<CategoryId>(listing?.category ?? project!.category);
  const [tags, setTags] = useState(listing?.tags.join(", ") ?? "");
  const [instructions, setInstructions] = useState(listing?.template.instructions ?? "");
  const [rights, setRights] = useState(listing?.rightsConfirmed ?? false);
  const [adoptionType, setAdoptionType] = useState<"free" | "paid">(listing?.adoptionType ?? "free");
  const [price, setPrice] = useState(listing?.adoptionType === "paid" ? (listing.priceMinor / 100).toFixed(2) : "2.00");
  const [pending, setPending] = useState(""); const [error, setError] = useState(""); const [success, setSuccess] = useState("");
  const snapshot: TemplateSnapshot = listing?.template ?? { version: 1, category: project!.category, instructions, settings: project!.settings };
  const archived = listing?.status === "archived";
  async function save(status: OwnedListing["status"]) {
    if (inFlight.current) return;
    inFlight.current = true; setPending(status); setError(""); setSuccess("");
    attempt.current ??= crypto.randomUUID();
    const metadata = { id: attempt.current, title, description, category, tags: tags.split(",").map(tag => tag.trim()).filter(Boolean), rightsConfirmed: rights, adoptionType, priceMinor: adoptionType === "free" ? 0 : Math.round(Number(price) * 100) };
    try {
      const result = listing ? await updateMarketplaceAction({ ...metadata, status }) : await createMarketplaceAction({ ...metadata, sourceProjectId: project!.id, instructions, publish: status === "published" });
      if (!result.ok || !("listingId" in result)) { setError(result.ok ? "Please try again." : result.message); return; }
      setSuccess(result.existing ? "This project already has a listing. Opening it…" : status === "published" ? "Published to Marketplace." : status === "unpublished" ? "Listing unpublished." : status === "archived" ? "Listing archived." : "Draft saved.");
      router.replace(`/settings/templates/${result.listingId}`); router.refresh();
    } catch { setError("Your listing couldn’t be saved. Try again to recover the same listing."); }
    finally { setPending(""); inFlight.current = false; }
  }
  function submit(event: FormEvent<HTMLFormElement>) { event.preventDefault(); void save("published"); }
  return <div className="grid items-start gap-6 lg:grid-cols-[minmax(0,1.5fr)_minmax(0,1fr)]">
    <form onSubmit={submit} className="sceenyk-card min-w-0 space-y-5 p-5 sm:p-7">
      <div className="flex flex-wrap items-center justify-between gap-2"><h2 className="flex items-center gap-2 text-lg font-semibold"><Store className="size-5 text-link" aria-hidden="true" />Listing details</h2><span className="rounded-full bg-accent px-3 py-1 text-caption text-accent-foreground">{listing?.status ?? "New draft"}</span></div>
      <p className="text-body-sm leading-relaxed text-muted-foreground">Write the public content you want to share. Review it for personal information and confirm your rights. Your original project and media stay private.</p>
      <fieldset disabled={!!pending || archived} className="space-y-5">
        <div><label className="text-body-sm font-medium" htmlFor={`${prefix}-title`}>Listing title</label><input id={`${prefix}-title`} name="title" required maxLength={120} className="sceenyk-field mt-2" value={title} onChange={e => setTitle(e.target.value)} /></div>
        <div><label className="text-body-sm font-medium" htmlFor={`${prefix}-description`}>Description</label><textarea id={`${prefix}-description`} name="description" required maxLength={2000} rows={4} className="sceenyk-field mt-2 resize-y" value={description} onChange={e => setDescription(e.target.value)} /></div>
        <div className="grid gap-5 sm:grid-cols-2"><div><label className="text-body-sm font-medium" htmlFor={`${prefix}-category`}>Listing category</label><select id={`${prefix}-category`} name="category" className="sceenyk-field mt-2" value={category} onChange={e => setCategory(e.target.value as CategoryId)}>{creationCategories.map(item => <option value={item.id} key={item.id}>{item.title}</option>)}</select></div>
          <div><label className="text-body-sm font-medium" htmlFor={`${prefix}-tags`}>Tags</label><input id={`${prefix}-tags`} name="tags" className="sceenyk-field mt-2" value={tags} maxLength={247} onChange={e => setTags(e.target.value)} aria-describedby={`${prefix}-tags-help`} /><p id={`${prefix}-tags-help`} className="mt-2 text-caption text-muted-foreground">Up to 8 tags, separated by commas.</p></div></div>
        <div><label className="text-body-sm font-medium" htmlFor={`${prefix}-instructions`}>Public reusable instructions</label><textarea id={`${prefix}-instructions`} name="instructions" required readOnly={!!listing} maxLength={4000} rows={6} className="sceenyk-field mt-2 resize-y" value={instructions} onChange={e => setInstructions(e.target.value)} aria-describedby={`${prefix}-instructions-help`} /><p id={`${prefix}-instructions-help`} className="mt-2 text-caption text-muted-foreground">{listing ? "The saved template is immutable. You can edit its listing metadata." : "Describe a reusable approach. Leave out personal details, links, private IDs and access keys. This becomes the adopter’s editable starting prompt."}</p></div>
        <div className="space-y-3 rounded-xl border border-border p-4"><label htmlFor={`${prefix}-adoption`} className="text-body-sm font-medium">Creator adoption price</label><select id={`${prefix}-adoption`} name="adoptionType" className="sceenyk-field" value={adoptionType} onChange={e => setAdoptionType(e.target.value as "free" | "paid")}><option value="free">Free</option><option value="paid">Paid — PayPal Sandbox</option></select>{adoptionType === "paid" && <><label htmlFor={`${prefix}-price`} className="block text-body-sm font-medium">Adoption price (USD)</label><input id={`${prefix}-price`} name="price" type="number" inputMode="decimal" min={sandboxMarketplacePricing.minMinor / 100} max={sandboxMarketplacePricing.maxMinor / 100} step="0.01" required className="sceenyk-field" value={price} onChange={e => setPrice(e.target.value)} /><p className="text-caption text-muted-foreground">Sandbox/demo limits: {usd(sandboxMarketplacePricing.minMinor)}–{usd(sandboxMarketplacePricing.maxMinor)}. Prices and fees are test configuration. New prices apply to new purchases; saved checkouts retain their price.</p></>}<p className="text-body-sm text-muted-foreground">AI generation credits are separate. Adoption includes no future AI generation usage. Paid sales record pending creator earnings, with no withdrawals.</p></div>
        <label className="flex min-h-11 items-start gap-3 rounded-lg border border-border p-3 text-body-sm"><input name="rightsConfirmed" type="checkbox" checked={rights} onChange={e => setRights(e.target.checked)} className="mt-1 size-4 shrink-0 accent-primary" /><span>I confirm that I have the right to publish, share and, for paid adoption, monetize this reusable template.</span></label>
        <div className="flex flex-col gap-3 sm:flex-row sm:flex-wrap">
          <Button type="submit" disabled={!rights}>{pending === "published" && <LoaderCircle className="size-4 motion-safe:animate-spin" aria-hidden="true" />}{pending === "published" ? "Publishing…" : listing?.status === "published" ? "Save published listing" : "Publish to Marketplace"}</Button>
          {(!listing || listing.status === "draft") && <Button type="button" variant="outline" onClick={() => void save("draft")}>Save draft</Button>}
          {listing?.status === "published" && <Button type="button" variant="outline" onClick={() => void save("unpublished")}>Unpublish</Button>}
          {listing && <Button type="button" variant="ghost" onClick={() => void save("archived")}>Archive</Button>}
        </div>
      </fieldset>
      <div role="status" aria-live="polite" className={`min-h-5 text-body-sm ${error ? "text-destructive" : "text-success-foreground"}`}>{error || success || (pending && pending !== "published" ? "Saving listing…" : "")}</div>
      {archived && <p className="text-body-sm text-muted-foreground">This archived listing is retained for adoption history and cannot be republished.</p>}
      <div className="flex flex-wrap gap-4 text-body-sm"><Link className="nav-link text-link" href="/settings/templates">My Marketplace Listings</Link>{listing?.status === "published" && <Link className="nav-link text-link" href={`/marketplace/${listing.id}`}>View public listing</Link>}</div>
    </form>
    <aside className="sceenyk-card min-w-0 overflow-hidden"><TemplateCover template={snapshot} fallbackColor={listing?.fallbackColor} previewId={listing?.id} large /><div className="space-y-3 p-5"><h2 className="text-lg font-semibold">{adoptionType === "free" ? "Free to adopt" : `Creator adoption price: ${usd(Math.round(Number(price || 0) * 100))}`}</h2><p className="text-body-sm text-muted-foreground">The template copies {snapshot.settings.aspectRatio}, {snapshot.settings.duration}s, {snapshot.settings.visualStyle} and {snapshot.settings.tone} settings. Its preview uses these choices; it contains no project media.</p><p className="text-body-sm text-muted-foreground">Adoption uses zero AI credits. Normal generation credits may still be required when someone creates their result.</p></div></aside>
  </div>;
}
