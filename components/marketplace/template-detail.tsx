import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import type { ReactNode } from "react";
import type { Listing } from "@/lib/marketplace/contract";
import { creationCategories } from "@/components/creation/creation-options";
import { Button } from "@/components/ui/button";
import { usd } from "@/lib/marketplace/payments/contract";
import { AdoptButton } from "./adopt-button";
import { GenerationEstimate, ListingCreator, TemplateCover, TemplateInformation } from "./listing-card";
import { templateAppearance } from "./template-appearance";

export function TemplateDetail({ listing, owned = false, children }: { listing: Listing; owned?: boolean; children?: ReactNode }) {
  const category = creationCategories.find(item => item.id === listing.category)!;
  return <div className="marketplace-detail" style={templateAppearance(listing)}>
    <Link className="marketplace-back" href={owned ? "/templates" : "/marketplace"}><ArrowLeft className="size-3" aria-hidden="true" />{owned ? "Templates" : "Marketplace"}</Link>
    <div className="marketplace-detail-main">
      <div className="marketplace-detail-preview"><TemplateCover template={listing.template} fallbackColor={listing.fallbackColor} large /></div>
      <div className="marketplace-detail-info">
        <h1>{listing.title}</h1>
        <p className="marketplace-detail-description">{listing.description}</p>
        <div className="marketplace-tags"><span>{category.title}</span>{listing.tags.map(tag => <span key={tag}>{tag}</span>)}{owned && <span className="capitalize">{listing.status}</span>}</div>
        <ListingCreator listing={listing} />
        <div className="marketplace-detail-price"><p><span>Adoption price</span><strong>{listing.adoptionType === "free" ? "Free" : usd(listing.priceMinor)}</strong>{listing.adoptionType === "paid" && <span>USD · PayPal Sandbox</span>}</p><GenerationEstimate listing={listing} /></div>
        <div className="marketplace-detail-adopt">{owned ? <div className="grid gap-3">
          <Button nativeButton={false} render={<Link href={`/settings/templates/${listing.id}`} />}>Update Template</Button>
          {listing.status === "published" && <Button variant="outline" nativeButton={false} render={<Link href={`/marketplace/${listing.id}`} />}>View in Marketplace</Button>}
        </div> : <AdoptButton listingId={listing.id} paid={listing.adoptionType === "paid"} estimate={listing.estimate} />}</div>
        <p className="marketplace-detail-note">{owned ? "This is your reusable template. Your original project and private media remain separate." : "Adoption creates your own editable project; creator media stays private. AI generation is separate, with a quote shown before you generate."}</p>
        <details className="marketplace-configuration"><summary>{owned ? "Template configuration" : "What you’ll adopt"}</summary><TemplateInformation template={listing.template} /></details>
      </div>
    </div>
    {children}
  </div>;
}
