"use client";

import { useId, useRef, useState, type FormEvent } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useAuth } from "@clerk/nextjs";
import { Archive, ArrowUpRight, Check, Clock3, CloudUpload, Info, Layers3, LoaderCircle, Monitor, Save, Store, Tag } from "lucide-react";
import { Select } from "@/components/ui/select";
import { Button } from "@/components/ui/button";
import { AccountAction } from "@/components/account-action";
import { useAuthAvailable } from "@/components/auth/auth-availability";
import { creationCategories } from "@/components/creation/creation-options";
import { createMarketplaceAction, updateMarketplaceAction } from "@/app/actions/marketplace";
import { usd, sandboxMarketplacePricing } from "@/lib/marketplace/payments/contract";
import type { OwnedListing, TemplateSnapshot } from "@/lib/marketplace/contract";
import type { SavedProject } from "@/lib/projects/types";
import type { CategoryId } from "@/lib/projects/options";
import { TemplateCover } from "./listing-card";
import { templatePreviewPoster } from "./template-media-preview";
import { ListingEditorSkeleton } from "./detail-skeletons";

type Props = { clerkUserId: string; project?: SavedProject; listing?: OwnedListing };

const fieldClass = "mt-1.5 w-full min-w-0 rounded-lg border border-input bg-field px-3 py-2 text-[13px]! leading-5 text-foreground outline-none transition-colors placeholder:text-muted-foreground focus-visible:border-ring focus-visible:ring-2 focus-visible:ring-ring/30 disabled:cursor-not-allowed disabled:opacity-50 motion-reduce:transition-none";
const labelClass = "block text-[13px]! font-medium leading-5 text-foreground";

export function ListingEditor(props: Props) {
  return useAuthAvailable() ? <AccountEditor {...props} /> : <p role="alert">Sign in is temporarily unavailable.</p>;
}

function AccountEditor(props: Props) {
  const { isLoaded, userId } = useAuth();
  if (!isLoaded) return <ListingEditorSkeleton />;
  if (userId !== props.clerkUserId) return <AccountAction intent="sign-in">Sign in to manage listings</AccountAction>;
  return <Editor key={`${userId}:${props.listing?.id ?? props.project?.id}`} {...props} />;
}

function DetailTile({ icon: Icon, label, value }: { icon: typeof Monitor; label: string; value: string }) {
  return <div className="flex min-w-0 items-center gap-2.5 rounded-lg border border-border bg-muted/30 px-3 py-2.5">
    <Icon className="size-4 shrink-0 text-primary" aria-hidden="true" />
    <div className="min-w-0"><dt className="text-[11px] leading-4 text-muted-foreground">{label}</dt><dd className="truncate text-[12px] font-medium leading-4 text-foreground" title={value}>{value}</dd></div>
  </div>;
}

function Editor({ project, listing }: Props) {
  const router = useRouter();
  const prefix = useId();
  const attempt = useRef<string | null>(listing?.id ?? null);
  const inFlight = useRef(false);
  const [title, setTitle] = useState(listing?.title ?? project?.title ?? "");
  const [description, setDescription] = useState(listing?.description ?? project?.prompt.slice(0, 2000) ?? "");
  const [category, setCategory] = useState<CategoryId>(listing?.category ?? project!.category);
  const [tags, setTags] = useState(listing?.tags.join(", ") ?? "");
  const [instructions, setInstructions] = useState(listing?.template.instructions ?? project?.prompt ?? "");
  // Older text-only listings need a fresh review before a source preview is made public.
  const [rights, setRights] = useState(!!listing?.previewUrl && !!listing.rightsConfirmed);
  const [adoptionType, setAdoptionType] = useState<"free" | "paid">(listing?.adoptionType ?? "free");
  const [price, setPrice] = useState(listing?.adoptionType === "paid" ? (listing.priceMinor / 100).toFixed(2) : "2.00");
  const [pending, setPending] = useState("");
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  const snapshot: TemplateSnapshot = listing?.template ?? { version: 1, category: project!.category, instructions, settings: project!.settings };
  const archived = listing?.status === "archived";
  const categoryLabel = creationCategories.find(item => item.id === category)?.title ?? category;

  async function save(status: OwnedListing["status"]) {
    if (inFlight.current) return;
    inFlight.current = true; setPending(status); setError(""); setSuccess("");
    attempt.current ??= crypto.randomUUID();
    const metadata = { id: attempt.current, title, description, category, tags: tags.split(",").map(tag => tag.trim()).filter(Boolean), rightsConfirmed: rights, adoptionType, priceMinor: adoptionType === "free" ? 0 : Math.round(Number(price) * 100) };
    try {
      let preview: FormData | undefined;
      if (listing && rights && !listing.previewUrl && (status === "published" || status === "draft")) {
        try { preview = await templatePreviewPoster(listing.id); }
        catch { setError("The project preview couldn’t be prepared. Check that the image or video loads, then try again."); return; }
      }
      const result = listing ? await updateMarketplaceAction({ ...metadata, status, ...(!listing.publishedAt && listing.status === "draft" ? { instructions } : {}) }, preview) : await createMarketplaceAction({ ...metadata, sourceProjectId: project!.id, instructions, publish: status === "published" });
      if (!result.ok || !("listingId" in result)) { setError(result.ok ? "Please try again." : result.message); return; }
      setSuccess(result.existing ? "This project already has a listing. Opening it…" : status === "published" ? "Published to Marketplace." : status === "unpublished" ? "Listing unpublished." : status === "archived" ? "Listing archived." : "Draft saved.");
      router.replace(`/settings/templates/${result.listingId}`); router.refresh();
    } catch { setError("Your listing couldn’t be saved. Try again to recover the same listing."); }
    finally { setPending(""); inFlight.current = false; }
  }

  function submit(event: FormEvent<HTMLFormElement>) { event.preventDefault(); void save("published"); }

  return <div className="min-w-0 space-y-5">
    <header className="flex min-w-0 items-center gap-3">
      <span className="flex size-11 shrink-0 items-center justify-center rounded-xl border border-primary/20 bg-primary/10 text-primary"><Store className="size-5" aria-hidden="true" /></span>
      <div className="min-w-0"><h2 className="text-[19px]! font-semibold! leading-6! tracking-tight">Manage Template</h2><p className="text-[13px] leading-5 text-muted-foreground">Review and control how your template appears in Marketplace.</p></div>
    </header>

    <div className="grid min-w-0 items-start gap-5 xl:grid-cols-[minmax(0,1.7fr)_minmax(300px,1fr)]">
      <form onSubmit={submit} className="min-w-0 rounded-2xl border border-border bg-card p-4 text-card-foreground shadow-card sm:p-5">
        <div className="flex min-w-0 items-start justify-between gap-3 border-b border-border pb-4">
          <div className="flex min-w-0 items-start gap-3"><span className="flex size-10 shrink-0 items-center justify-center rounded-xl border border-primary/15 bg-primary/10 text-primary"><Store className="size-[18px]" aria-hidden="true" /></span><div className="min-w-0"><h4 className="text-[16px] font-semibold leading-5">Listing Details</h4><p className="text-[12px] leading-5 text-muted-foreground">Set up your Marketplace listing.</p></div></div>
          <span className="shrink-0 rounded-full bg-primary/10 px-3 py-1 text-[11px] font-medium capitalize text-primary">{listing?.status ?? "Draft"}</span>
        </div>

        <fieldset disabled={!!pending || archived} className="min-w-0 space-y-4 pt-4">
          <div><label className={labelClass} htmlFor={`${prefix}-title`}>Listing title</label><input id={`${prefix}-title`} name="title" required maxLength={120} className={fieldClass} value={title} onChange={event => setTitle(event.target.value)} /></div>
          <div><label className={labelClass} htmlFor={`${prefix}-description`}>Description</label><textarea id={`${prefix}-description`} name="description" required maxLength={2000} rows={2} className={`${fieldClass} min-h-20 resize-y`} value={description} onChange={event => setDescription(event.target.value)} /></div>
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="min-w-0"><label className={labelClass} htmlFor={`${prefix}-category`}>Listing category</label><Select id={`${prefix}-category`} name="category" disabled={!!pending || archived} value={category} onValueChange={setCategory} options={creationCategories.map(item => ({ value: item.id, label: item.title }))} className="mt-1.5 w-full" /></div>
            <div className="min-w-0"><label className={labelClass} htmlFor={`${prefix}-tags`}>Tags</label><input id={`${prefix}-tags`} name="tags" className={fieldClass} value={tags} maxLength={247} onChange={event => setTags(event.target.value)} placeholder="Add tags..." aria-describedby={`${prefix}-tags-help`} /><p id={`${prefix}-tags-help`} className="mt-1 text-[11px] leading-4 text-muted-foreground">Up to 8 tags, separated by commas.</p></div>
          </div>
          <div><label className={labelClass} htmlFor={`${prefix}-instructions`}>Public reusable instructions</label><textarea id={`${prefix}-instructions`} name="instructions" required readOnly={!!listing?.publishedAt} maxLength={4000} rows={3} className={`${fieldClass} min-h-24 resize-y`} value={instructions} onChange={event => setInstructions(event.target.value)} aria-describedby={`${prefix}-instructions-help`} /><p id={`${prefix}-instructions-help`} className="mt-1 text-[11px] leading-4 text-muted-foreground">{listing?.publishedAt ? "The published template configuration is fixed. You can edit its listing metadata." : "Review for personal details, links, private IDs and access keys. Adopters can edit this starting prompt."}</p></div>

          <div className="border-t border-border pt-4">
            <label className={labelClass} id={`${prefix}-adoption-label`}>Creator adoption price</label>
            <input type="hidden" name="adoptionType" value={adoptionType} />
            <div className="mt-2 grid gap-3 sm:grid-cols-[minmax(0,1fr)_minmax(0,1fr)] sm:items-center">
              <div className="flex rounded-lg border border-input bg-muted/40 p-1" role="group" aria-labelledby={`${prefix}-adoption-label`}>
                {(["free", "paid"] as const).map(type => <button key={type} type="button" aria-pressed={adoptionType === type} onClick={() => setAdoptionType(type)} className={`min-h-8 flex-1 rounded-md px-3 text-[12px] font-medium transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring motion-reduce:transition-none ${adoptionType === type ? "bg-primary text-primary-foreground shadow-sm" : "text-muted-foreground hover:text-foreground"}`}>{type === "free" ? "Free" : "Paid"}</button>)}
              </div>
              <p className="flex items-start gap-2 border-l border-border pl-3 text-[11px] leading-4 text-muted-foreground"><Info className="mt-0.5 size-4 shrink-0" aria-hidden="true" /><span>AI generation credits are separate from adoption.</span></p>
            </div>
            {adoptionType === "paid" && <div className="mt-3 space-y-1"><label className={labelClass} htmlFor={`${prefix}-price`}>Adoption price (USD)</label><input id={`${prefix}-price`} name="price" type="number" inputMode="decimal" min={sandboxMarketplacePricing.minMinor / 100} max={sandboxMarketplacePricing.maxMinor / 100} step="0.01" required className={`${fieldClass} max-w-48`} value={price} onChange={event => setPrice(event.target.value)} /><p className="text-[11px] leading-4 text-muted-foreground">PayPal Sandbox · {usd(sandboxMarketplacePricing.minMinor)}–{usd(sandboxMarketplacePricing.maxMinor)}. New prices apply to new purchases; saved checkouts retain their price. Paid sales record pending earnings; withdrawals are unavailable.</p></div>}
          </div>

          <label className="flex min-h-12 cursor-pointer items-start gap-3 rounded-lg border border-border bg-muted/20 p-3 text-[12px] leading-[18px]"><input name="rightsConfirmed" type="checkbox" checked={rights} onChange={event => setRights(event.target.checked)} className="mt-0.5 size-4 shrink-0 accent-primary" /><span>I have reviewed the public text and preview for private information. I have the right to publish, share and, for paid adoption, monetize this reusable template and its preview.</span></label>

          <div className="flex flex-wrap items-center gap-2 border-t border-border pt-4">
            <Button type="submit" size="sm" disabled={!rights}><CloudUpload className="size-4" aria-hidden="true" />{pending === "published" && <LoaderCircle className="size-4 motion-safe:animate-spin" aria-hidden="true" />}{pending === "published" ? "Publishing…" : listing?.status === "published" ? "Save published listing" : "Publish to Marketplace"}</Button>
            {(!listing || listing.status === "draft") && <Button type="button" size="sm" variant="outline" onClick={() => void save("draft")}><Save className="size-4" aria-hidden="true" />Save draft</Button>}
            {listing?.status === "published" && <Button type="button" size="sm" variant="outline" onClick={() => void save("unpublished")}>Unpublish</Button>}
            {listing && <Button type="button" size="sm" variant="outline" onClick={() => void save("archived")}><Archive className="size-4" aria-hidden="true" />Archive</Button>}
            <Link href="/settings/templates" className="inline-flex min-h-9 items-center gap-1 rounded-md px-2 text-[12px] font-medium text-primary hover:underline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring sm:ml-auto">My Marketplace Listings <ArrowUpRight className="size-3.5" aria-hidden="true" /></Link>
          </div>
        </fieldset>
        <div role="status" aria-live="polite" className={`text-[12px] ${error ? "text-destructive" : "text-success-foreground"}`}>{error || success || (pending && pending !== "published" ? "Saving listing…" : "")}</div>
        {archived && <p className="mt-2 text-[12px] text-muted-foreground">This archived listing is retained for adoption history and cannot be republished.</p>}
        {listing?.status === "published" && <Link href={`/marketplace/${listing.id}`} className="mt-2 inline-flex min-h-8 items-center gap-1 text-[12px] font-medium text-primary hover:underline focus-visible:outline-2 focus-visible:outline-ring">View public listing <ArrowUpRight className="size-3.5" aria-hidden="true" /></Link>}
      </form>

      <aside className="min-w-0 rounded-2xl border border-border bg-card p-4 text-card-foreground shadow-card sm:p-5">
        <div className="overflow-hidden rounded-xl border border-border bg-muted"><TemplateCover template={snapshot} fallbackColor={listing?.fallbackColor} previewId={listing?.id} previewUrl={listing?.previewUrl} owned /></div>
        <h4 className="mt-4 text-[16px] font-semibold leading-5">Template Preview</h4>
        <div className="mt-2 flex flex-wrap items-center gap-2 text-[11px] font-medium"><span className="inline-flex items-center gap-1 rounded-full bg-primary/10 px-2.5 py-1 capitalize text-primary"><span className="size-1.5 rounded-full bg-primary" />{listing?.status ?? "Draft"}</span><span className="inline-flex items-center gap-1 rounded-full border border-border px-2.5 py-1"><Store className="size-3.5 text-primary" aria-hidden="true" />{adoptionType === "free" ? "Free to adopt" : `${usd(Math.round(Number(price || 0) * 100))} to adopt`}</span></div>
        <p className="mt-3 text-[12px] leading-[18px] text-muted-foreground">Copies {snapshot.settings.aspectRatio}, {snapshot.settings.duration}s, {snapshot.settings.visualStyle} and {snapshot.settings.tone} settings. Review the preview before publishing. Original media stays private.</p>
        <div className="mt-4 border-t border-border pt-4"><h5 className="text-[13px] font-semibold">Template Details</h5><dl className="mt-2 grid min-w-0 grid-cols-2 gap-2"><DetailTile icon={Monitor} label="Format" value={snapshot.settings.aspectRatio} /><DetailTile icon={Clock3} label="Duration" value={`${snapshot.settings.duration}s`} /><DetailTile icon={Layers3} label="Style" value={snapshot.settings.visualStyle} /><DetailTile icon={Tag} label="Category" value={categoryLabel} /><div className="col-span-2"><DetailTile icon={Check} label="Tone" value={snapshot.settings.tone} /></div>{snapshot.creationType && <div className="col-span-2"><DetailTile icon={Layers3} label="Type" value={snapshot.creationType === "ugc" ? `UGC · ${snapshot.ugcType ?? "advertisement"}` : "Freestyle"} /></div>}</dl></div>
      </aside>
    </div>
  </div>;
}
