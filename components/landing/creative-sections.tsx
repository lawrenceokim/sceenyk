import Image from "next/image";
import Link from "next/link";
import { ArrowRight, Captions, Check, ChevronDown, Clapperboard, CloudUpload, Coins, Gift, ImageIcon, Layers, Maximize, Moon, Play, Save, Sparkles, Star, Volume2 } from "lucide-react";
import { Brand } from "@/components/brand";
import { buttonVariants } from "@/components/ui/button";
import { landingArtwork } from "./artwork";
import { landingStyles as styles } from "./landing-styles";

export function StudioShowcase() {
  return (
    <section id="studio-preview" className={`${styles.container} ${styles.studioSection}`} aria-labelledby="studio-heading" data-reveal>
      <h2 id="studio-heading" className="sr-only">Your idea. A whole creative workspace.</h2>
      <div className={styles.studioFrame}>
        <div className={styles.windowDots} aria-hidden="true"><i /><i /><i /></div>
        <div className={styles.studioBrand}><Brand variant="full" /><span>Studio concept</span></div>
        <div className={styles.studioGrid}>
          <div className={styles.sources} aria-hidden="true">
            <p className={styles.panelLabel}>01. SOURCES</p>
            <span className={styles.fieldLabel}>Project title</span><div className={styles.mockField}>Neon Dreams</div>
            <div className={styles.sourceTabs}><span>Upload</span><span>Image</span><span>Video</span></div>
            <div className={styles.sourceImage}><Image src={landingArtwork.portrait} alt="" fill sizes="230px" className={styles.artwork} /></div>
            <div className={styles.dropzone}><CloudUpload size={20} /><span>Your inspiration<br />starts here</span></div>
            <div className={styles.sourceRow}><ImageIcon size={15} /> Image to video <span>›</span></div>
            <div className={styles.sourceRow}><Clapperboard size={15} /> Text to video <span>›</span></div>
            <div className={styles.sourceRow}><Layers size={15} /> Start from a template <span>›</span></div>
          </div>
          <div className={styles.previewPanel}>
            <p className={styles.panelLabel}>02. PREVIEW</p>
            <div className={styles.previewToolbar} aria-hidden="true">
              <span className={styles.mockField}>16:9 <ChevronDown size={13} /></span>
              <span className={styles.mockField}><Save size={13} /> Saved</span>
              <span className={styles.previewStatus}><span /> Creative direction</span>
              <span className={styles.previewBadge}>Concept preview</span>
            </div>
            <div className={styles.stage}>
              <Image src={landingArtwork.portrait} alt="Cinematic concept artwork: a woman under violet and blue city lights" fill sizes="(max-width: 700px) 90vw, (max-width: 1000px) 65vw, 760px" className={styles.stageImage} />
              <div className={styles.playerDecoration} aria-hidden="true"><div /><span><Play size={20} fill="currentColor" /><Volume2 size={14} /><small>Visual concept</small><Captions size={18} /><Maximize size={17} /></span></div>
            </div>
          </div>
          <div className={styles.properties} aria-hidden="true">
            <p className={styles.panelLabel}>03. PROPERTIES</p>
            <span className={styles.fieldLabel}>Prompt</span>
            <div className={styles.mockPrompt}>A cinematic scene of a woman in a rainy neon city, dramatic lighting, shallow depth of field.</div>
            <span className={styles.fieldLabel}>Visual style</span><div className={styles.mockField}><ImageIcon size={15} /> Cinematic <ChevronDown size={12} /></div>
            <span className={styles.fieldLabel}>Tone</span><div className={styles.mockField}><Moon size={15} /> Moody <ChevronDown size={12} /></div>
            <span className={styles.fieldLabel}>Duration</span><div className={styles.mockField}>10 seconds <ChevronDown size={12} /></div>
            <span className={styles.fieldLabel}>Aspect ratio</span><div className={styles.mockField}><Maximize size={15} /> 16:9 (Landscape)</div>
          </div>
        </div>
      </div>
      <div className={styles.studioCaption}><p>A glimpse of the creative direction. Illustrative preview, not a live generation.</p><Link className={buttonVariants()} href="/create">Try the Studio <ArrowRight aria-hidden="true" /></Link></div>
    </section>
  );
}

const concepts = [
  { title: "Neon Portrait", image: "portrait", description: "Cinematic portraits with neon lighting and atmosphere.", tags: ["Cinematic", "Portrait"] },
  { title: "Dreamy Landscapes", image: "landscape", description: "Imagine distant worlds and mountains above the clouds.", tags: ["Landscape", "Cinematic"] },
  { title: "Underwater Visions", image: "underwater", description: "Surreal underwater worlds, alive with color and light.", tags: ["Surreal", "Abstract"] },
  { title: "Urban Drive", image: "city", description: "A new perspective on the city after dark.", tags: ["City", "Stylized"] },
] as const;

export function MarketplaceStory() {
  return (
    <section id="marketplace-story" className={`${styles.container} ${styles.marketplaceSection}`} aria-labelledby="marketplace-heading" data-reveal>
      <div className={styles.sectionHeading}>
        <div><p className="eyebrow">MARKETPLACE</p><h2 id="marketplace-heading">Start from great work, then make it yours.</h2><p>Adopt reusable creator projects, remix them with your own idea, and publish your own standout work.</p></div>
        <Link href="/marketplace" className={buttonVariants({ variant: "outline" })}>Browse marketplace <ArrowRight aria-hidden="true" /></Link>
      </div>
      <div className={styles.conceptGrid}>
        {concepts.map(concept => <article className={styles.conceptCard} key={concept.title}>
          <Link href="/marketplace" aria-label={`Explore Marketplace inspiration: ${concept.title}`} className={styles.conceptLink}>
            <div className={styles.conceptImage}><Image src={landingArtwork[concept.image]} alt="" fill sizes="(max-width: 550px) 90vw, (max-width: 1000px) 45vw, 310px" className={styles.artwork} /></div>
            <div className={styles.conceptBody}><h3>{concept.title}</h3><p>{concept.description}</p><div className={styles.tags}>{concept.tags.map(tag => <span key={tag}>{tag}</span>)}</div><div className={styles.conceptMeta}><span>Creative inspiration</span><ArrowRight size={15} aria-hidden="true" /></div></div>
          </Link>
        </article>)}
      </div>
      <p className={styles.sectionNote}>Illustrative concepts. Explore Marketplace for available creator listings and adoption prices. Generation costs are reviewed separately in Studio.</p>
    </section>
  );
}

const offers = [
  { title: "Free", subtitle: "2 lifetime free generations", description: "Explore Studio and see what you can create.", icon: Gift, features: ["Up to 10 seconds per free generation", "Start with a prompt or your own media", "Explore templates and Marketplace"], action: "Explore Studio", href: "/create" },
  { title: "Credit Top-up", subtitle: "Create at your own pace", description: "Flexible pay-as-you-go usage. No subscription.", icon: Coins, features: ["Review cost before generating", "Purchased credits do not expire", "Manually top up when you need more", "Free allowance stays separate"], action: "Explore credit packs", href: "/dashboard/settings/credits", featured: true },
  { title: "Creator Earnings", subtitle: "Publish to Marketplace", description: "Share a creative starting point. Earn from your work.", icon: Star, features: ["Publish your own reusable projects", "Earn a 90% creator share", "10% platform fee", "Adoption money is separate from AI credits"], action: "Explore Marketplace", href: "/marketplace" },
];

export function LandingPricing() {
  return <section id="pricing" className={`${styles.container} ${styles.pricingSection}`} aria-labelledby="pricing-heading">
    <div className={styles.sectionHeading}><div><p className="eyebrow">PRICING</p><h2 id="pricing-heading">Pay only for what you create.</h2><p>Start free, then top up credits as you need them. Buy credits. Create what you need. Top up when you need more.</p></div></div>
    <div className={styles.pricingGrid}>{offers.map(offer => <article key={offer.title} className={`${styles.priceCard} ${offer.featured ? styles.featuredPrice : ""}`}>
      {offer.featured && <span className={styles.priceBadge}>PAY AS YOU GO</span>}
      <div className={styles.priceIntro}><span className={styles.priceIcon}><offer.icon size={28} aria-hidden="true" /></span><div><h3>{offer.title}</h3><p className={styles.priceSubtitle}>{offer.subtitle}</p><p>{offer.description}</p></div></div>
      <ul>{offer.features.map(feature => <li key={feature}><Check size={16} aria-hidden="true" />{feature}</li>)}</ul>
      <Link href={offer.href} className={buttonVariants({ variant: offer.featured ? "default" : "outline" })}>{offer.action} <ArrowRight aria-hidden="true" /></Link>
    </article>)}</div>
    <p className={styles.sectionNote}>PayPal Sandbox test payments only. Production pack prices and generation rates are awaiting approval.</p>
  </section>;
}

export function CreativeInvitation() {
  return <>
    <section className={`${styles.container} ${styles.invitation}`} aria-labelledby="invitation-heading" data-reveal>
      <div className={styles.invitationPanel}><Sparkles size={20} aria-hidden="true" /><h2 id="invitation-heading">Your next spark is out there.</h2><p>Discover creative starting points and make something unmistakably yours.</p><Link href="/marketplace" className={buttonVariants({ variant: "outline" })}>Find your inspiration <ArrowRight aria-hidden="true" /></Link></div>
    </section>
    <section className={`${styles.container} ${styles.finalCta}`} aria-labelledby="final-heading"><h2 id="final-heading">Your next visual story starts here.</h2><p>Open the studio, shape your idea, and take the first step toward your next scene.</p><div className={styles.actions}><Link href="/create" className={buttonVariants()}>Open Studio <ArrowRight aria-hidden="true" /></Link><a href="#pricing" className={buttonVariants({ variant: "outline" })}>See Pricing</a></div></section>
  </>;
}
