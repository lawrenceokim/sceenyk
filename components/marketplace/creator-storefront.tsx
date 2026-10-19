import type { CreatorProfile } from "@/lib/marketplace/creators/contract";
import type { Listing } from "@/lib/marketplace/contract";
import { CreatorAvatar } from "./creator-avatar";
import { ListingCard } from "./listing-card";
import { MarketplacePagination } from "./pagination";

export function CreatorStorefront({ data }: { data: { profile: CreatorProfile; adoptionCount: number; total: number; items: Listing[]; page: number; pageSize: number } }) {
  const { profile } = data;
  return <div className="space-y-8">
    <header className={`
      [@layer_components]:[border:1px_solid_var(--border)] [@layer_components]:rounded-[var(--radius-xl)]
      [@layer_components]:[background:var(--card)] [@layer_components]:text-[color:var(--card-foreground)]
      [@layer_components]:[box-shadow:var(--elevation-card)] sceenyk-card flex min-w-0 flex-col gap-5 p-5 sm:flex-row sm:p-8
      [.marketplace-configuration_>_&&]:[border:0] [.marketplace-configuration_>_&&]:rounded-[0]
      [.marketplace-configuration_>_&&]:[background:transparent] [.marketplace-configuration_>_&&]:pt-[16px]
      [.marketplace-configuration_>_&&]:pr-[0] [.marketplace-configuration_>_&&]:pb-[0]
      [.marketplace-configuration_>_&&]:pl-[0] [[data-workspace-shell]_&&]:[box-shadow:none]
      [.workspace-settings-inner_label&&]:min-h-[0] [.workspace-settings-inner_label&&]:gap-[8px]
      [.workspace-settings-inner_label&&]:pt-[12px] [.workspace-settings-inner_label&&]:pr-[12px]
      [.workspace-settings-inner_label&&]:pb-[12px] [.workspace-settings-inner_label&&]:pl-[12px]
      [.workspace-settings-inner_label&&_svg]:w-[18px] [.workspace-settings-inner_label&&_svg]:h-[18px]
    `}>
      <CreatorAvatar name={profile.displayName} url={profile.avatarUrl} large />
      <div className="min-w-0 space-y-3"><p className={`
      [@layer_components]:text-[color:var(--link)] [@layer_components]:text-[length:var(--text-caption)]
      [@layer_components]:font-[600] [@layer_components]:tracking-[0.12em] eyebrow
      [.workspace-page[data-workspace-page='content']_&&]:hidden
    `}>MARKETPLACE CREATOR</p><h1 className="break-words text-3xl font-bold tracking-tight sm:text-4xl">{profile.displayName}</h1><p className="break-all text-body-sm text-muted-foreground">{profile.slug}</p>{profile.bio && <p className="max-w-2xl whitespace-pre-wrap break-words text-body leading-relaxed text-muted-foreground">{profile.bio}</p>}
        <dl className="flex flex-wrap gap-x-6 gap-y-3 text-body-sm"><div><dt className="text-muted-foreground">Published items</dt><dd className="mt-1 font-semibold">{data.total}</dd></div><div><dt className="text-muted-foreground">Adoptions of published items</dt><dd className="mt-1 font-semibold">{data.adoptionCount}</dd></div><div><dt className="text-muted-foreground">Creator since</dt><dd className="mt-1 font-semibold">{new Date(profile.creatorSince).toLocaleDateString("en", { month: "short", year: "numeric", timeZone: "UTC" })}</dd></div></dl>
      </div>
    </header>
    <section className="space-y-6" aria-labelledby="creator-items"><h2 id="creator-items" className="text-2xl font-semibold tracking-tight">Published templates</h2>{data.total === 0 ? <div className={`
      [@layer_components]:[border:1px_solid_var(--border)] [@layer_components]:rounded-[var(--radius-xl)]
      [@layer_components]:[background:var(--card)] [@layer_components]:text-[color:var(--card-foreground)]
      [@layer_components]:[box-shadow:var(--elevation-card)] sceenyk-card p-6 [.marketplace-configuration_>_&&]:[border:0]
      [.marketplace-configuration_>_&&]:rounded-[0] [.marketplace-configuration_>_&&]:[background:transparent]
      [.marketplace-configuration_>_&&]:pt-[16px] [.marketplace-configuration_>_&&]:pr-[0]
      [.marketplace-configuration_>_&&]:pb-[0] [.marketplace-configuration_>_&&]:pl-[0]
      [[data-workspace-shell]_&&]:[box-shadow:none] [.workspace-settings-inner_label&&]:min-h-[0]
      [.workspace-settings-inner_label&&]:gap-[8px] [.workspace-settings-inner_label&&]:pt-[12px]
      [.workspace-settings-inner_label&&]:pr-[12px] [.workspace-settings-inner_label&&]:pb-[12px]
      [.workspace-settings-inner_label&&]:pl-[12px] [.workspace-settings-inner_label&&_svg]:w-[18px]
      [.workspace-settings-inner_label&&_svg]:h-[18px]
    `}><p className="text-muted-foreground">This creator has no published Marketplace items yet.</p></div> : <><div className={"workspace-gallery [[data-workspace-shell]_&&]:grid [[data-workspace-shell]_&&]:[grid-template-columns:repeat(auto-fill,minmax(min(100%,180px),1fr))] [[data-workspace-shell]_&&]:gap-[16px] max-599:[[data-workspace-shell]_&&]:[grid-template-columns:repeat(2,minmax(0,1fr))] max-599:[[data-workspace-shell]_&&]:gap-[8px] max-359:[[data-workspace-shell]_&&]:[grid-template-columns:minmax(0,1fr)]"}>{data.items.map(listing => <ListingCard key={listing.id} listing={listing} />)}</div><MarketplacePagination page={data.page} total={data.total} pageSize={data.pageSize} href={p => `/marketplace/creators/${profile.slug}?page=${p}`} /></>}</section>
  </div>;
}
