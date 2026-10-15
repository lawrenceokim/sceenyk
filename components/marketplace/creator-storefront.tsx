import type { CreatorProfile } from "@/lib/marketplace/creators/contract";
import type { Listing } from "@/lib/marketplace/contract";
import { CreatorAvatar } from "./creator-avatar";
import { ListingCard } from "./listing-card";
import { MarketplacePagination } from "./pagination";

export function CreatorStorefront({ data }: { data: { profile: CreatorProfile; adoptionCount: number; total: number; items: Listing[]; page: number; pageSize: number } }) {
  const { profile } = data;
  return <div className="space-y-8">
    <header className="sceenyk-card flex min-w-0 flex-col gap-5 p-5 sm:flex-row sm:p-8">
      <CreatorAvatar name={profile.displayName} url={profile.avatarUrl} large />
      <div className="min-w-0 space-y-3"><p className="eyebrow">MARKETPLACE CREATOR</p><h1 className="break-words text-3xl font-bold tracking-tight sm:text-4xl">{profile.displayName}</h1><p className="break-all text-body-sm text-muted-foreground">{profile.slug}</p>{profile.bio && <p className="max-w-2xl whitespace-pre-wrap break-words text-body leading-relaxed text-muted-foreground">{profile.bio}</p>}
        <dl className="flex flex-wrap gap-x-6 gap-y-3 text-body-sm"><div><dt className="text-muted-foreground">Published items</dt><dd className="mt-1 font-semibold">{data.total}</dd></div><div><dt className="text-muted-foreground">Adoptions of published items</dt><dd className="mt-1 font-semibold">{data.adoptionCount}</dd></div><div><dt className="text-muted-foreground">Creator since</dt><dd className="mt-1 font-semibold">{new Date(profile.creatorSince).toLocaleDateString("en", { month: "short", year: "numeric", timeZone: "UTC" })}</dd></div></dl>
      </div>
    </header>
    <section className="space-y-6" aria-labelledby="creator-items"><h2 id="creator-items" className="text-2xl font-semibold tracking-tight">Published templates</h2>{data.total === 0 ? <div className="sceenyk-card p-6"><p className="text-muted-foreground">This creator has no published Marketplace items yet.</p></div> : <><div className="grid gap-6 sm:grid-cols-2 xl:grid-cols-3">{data.items.map(listing => <ListingCard key={listing.id} listing={listing} />)}</div><MarketplacePagination page={data.page} total={data.total} pageSize={data.pageSize} href={p => `/marketplace/creators/${profile.slug}?page=${p}`} /></>}</section>
  </div>;
}
