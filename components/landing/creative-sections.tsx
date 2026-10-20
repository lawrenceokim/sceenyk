import Image from "next/image";
import Link from "next/link";
import { ArrowRight, Captions, Check, ChevronDown, Clapperboard, CloudUpload, Coins, Gift, ImageIcon, Layers, Maximize, Moon, Play, Save, Sparkles, Star, Volume2 } from "lucide-react";
import { Brand } from "@/components/brand";
import { buttonVariants } from "@/components/ui/button";
import { landingArtwork } from "./artwork";

export function StudioShowcase() {
  return (
    <section id="studio-preview" className={`
      sceenyk-landing-container [&&]:w-[min(100%,_1320px)] [&&]:ml-[auto] [&&]:mr-[auto] [&&]:pl-[clamp(20px,_4vw,_60px)]
      [&&]:pr-[clamp(20px,_4vw,_60px)] max-699:[&&]:pl-[20px] max-699:[&&]:pr-[20px] max-359:[&&]:pl-[16px]
      max-359:[&&]:pr-[16px] sceenyk-landing-studioSection [&&]:w-[min(100%,_1440px)] [&&]:pl-[clamp(16px,_3.4vw,_48px)]
      [&&]:pr-[clamp(16px,_3.4vw,_48px)] [&&]:pt-[4px] [&&]:pb-[26px] [&&]:relative [&&]:z-[2] max-699:[&&]:pb-[32px]
    `} aria-labelledby="studio-heading" data-reveal>
      <h2 id="studio-heading" className="sr-only">Your idea. A whole creative workspace.</h2>
      <div className={`
      sceenyk-landing-studioFrame [&&]:[border:1px_solid_color-mix(in_srgb,_var(--brand-purple)_55%,_var(--border))]
      [&&]:rounded-[16px] [&&]:[background:var(--card)] [&&]:pt-[10px] [&&]:pr-[14px] [&&]:pb-[14px] [&&]:pl-[14px]
      [&&]:[box-shadow:0_8px_36px_color-mix(in_srgb,_var(--brand-purple)_9%,_transparent)] max-699:[&&]:pt-[9px]
      max-699:[&&]:pr-[9px] max-699:[&&]:pb-[9px] max-699:[&&]:pl-[9px] max-699:[&&]:rounded-[11px]
    `}>
        <div className={"sceenyk-landing-windowDots [&&]:flex [&&]:gap-[5px] [&&]:h-[14px] [&&_i]:w-[8px] [&&_i]:h-[8px] [&&_i]:rounded-[50%] [&&_i]:[background:var(--input)]"} aria-hidden="true"><i /><i /><i /></div>
        <div className={`
      sceenyk-landing-studioBrand [&&]:flex [&&]:items-center [&&]:justify-between [&&]:pt-[0] [&&]:pr-[0] [&&]:pb-[8px]
      [&&]:pl-[0] [&&_img]:w-[120px] [&&_>_span]:text-[length:10px] [&&_>_span]:text-[color:var(--muted-foreground)]
      max-699:[&&_img]:w-[105px]
    `}><Brand variant="full" /><span>Studio concept</span></div>
        <div className={`
      sceenyk-landing-studioGrid [&&]:grid [&&]:[grid-template-columns:minmax(0,_.75fr)_minmax(0,_2fr)_minmax(0,_.85fr)]
      [&&]:gap-[9px] max-999:[&&]:[grid-template-columns:minmax(0,_.65fr)_minmax(0,_2fr)] max-699:[&&]:block
    `}>
          <div className={`
      sceenyk-landing-sources [&&]:min-w-[0] [&&]:pt-[10px] [&&]:pr-[10px] [&&]:pb-[10px] [&&]:pl-[10px]
      [&&]:[border:1px_solid_var(--border)] [&&]:rounded-[8px] [&&]:[background:var(--background)] max-999:[&&]:pt-[8px]
      max-999:[&&]:pr-[8px] max-999:[&&]:pb-[8px] max-999:[&&]:pl-[8px] max-699:[&&]:hidden
    `} aria-hidden="true">
            <p className={"sceenyk-landing-panelLabel [&&]:text-[color:var(--link)] [&&]:text-[length:10px] [&&]:font-[650] [&&]:mb-[10px] max-699:[&&]:text-[length:9px] max-699:[&&]:mb-[5px]"}>01. SOURCES</p>
            <span className={`
      sceenyk-landing-fieldLabel [&&]:block [&&]:text-[color:var(--muted-foreground)] [&&]:text-[length:10px] [&&]:mb-[5px]
      [.sceenyk-landing-properties_&&]:mt-[11px] [.sceenyk-landing-properties_&&]:text-[color:var(--foreground)]
      [.sceenyk-landing-properties_&&]:font-[600] max-1100:[.sceenyk-landing-properties_&&]:mt-[8px]
    `}>Project title</span><div className={`
      sceenyk-landing-mockField [&&]:flex [&&]:items-center [&&]:gap-[7px] [&&]:min-h-[34px] [&&]:pt-[6px] [&&]:pr-[9px]
      [&&]:pb-[6px] [&&]:pl-[9px] [&&]:text-[length:11px] [&&]:[border:1px_solid_var(--border)] [&&]:rounded-[6px]
      [&&]:[background:var(--field)] [&&_>_svg:last-child]:ml-[auto] [.sceenyk-landing-previewToolbar_&&]:text-[length:10px]
      max-1100:[&&]:min-h-[30px] max-1100:[&&]:text-[length:10px]
      max-699:[.sceenyk-landing-previewToolbar_&&]:text-[length:9px] max-699:[.sceenyk-landing-previewToolbar_&&]:pt-[4px]
      max-699:[.sceenyk-landing-previewToolbar_&&]:pr-[6px] max-699:[.sceenyk-landing-previewToolbar_&&]:pb-[4px]
      max-699:[.sceenyk-landing-previewToolbar_&&]:pl-[6px]
    `}>Neon Dreams</div>
            <div className={`
      sceenyk-landing-sourceTabs [&&]:flex [&&]:gap-[5px] [&&]:text-[length:10px] [&&]:mt-[10px] [&&]:mr-[0] [&&]:mb-[10px]
      [&&]:ml-[0] [&&_span]:[border:1px_solid_var(--border)] [&&_span]:rounded-[6px] [&&_span]:pt-[6px] [&&_span]:pr-[8px]
      [&&_span]:pb-[6px] [&&_span]:pl-[8px] [&&_span:first-child]:[background:var(--primary)]
      [&&_span:first-child]:text-[color:var(--primary-foreground)] [&&_span:first-child]:[border-color:transparent]
      max-999:[&&]:gap-[3px] max-999:[&&_span]:pl-[5px] max-999:[&&_span]:pr-[5px] max-999:[&&_span]:text-[length:9px]
    `}><span>Upload</span><span>Image</span><span>Video</span></div>
            <div className={"sceenyk-landing-sourceImage [&&]:relative [&&]:h-[100px] [&&]:rounded-[6px] [&&]:overflow-hidden [&&_img]:[object-position:50%_30%] max-1100:[&&]:h-[85px]"}><Image src={landingArtwork.portrait} alt="" fill sizes="230px" className={"sceenyk-landing-artwork [&&]:object-cover"} /></div>
            <div className={`
      sceenyk-landing-dropzone [&&]:min-h-[82px] [&&]:mt-[10px] [&&]:mb-[10px] [&&]:flex [&&]:flex-col [&&]:items-center
      [&&]:justify-center [&&]:gap-[5px] [&&]:[border:1px_dashed_var(--input)] [&&]:rounded-[6px] [&&]:text-center
      [&&]:text-[length:9px] [&&]:leading-[1.3] [&&]:text-[color:var(--muted-foreground)] max-1100:[&&]:min-h-[64px]
    `}><CloudUpload size={20} /><span>Your inspiration<br />starts here</span></div>
            <div className={`
      sceenyk-landing-sourceRow [&&]:flex [&&]:items-center [&&]:gap-[7px] [&&]:pt-[7px] [&&]:pr-[3px] [&&]:pb-[7px]
      [&&]:pl-[3px] [&&]:[border-bottom:1px_solid_var(--border)] [&&]:text-[length:10px] [&&_span]:ml-[auto]
      max-1100:[&&]:text-[length:9px]
    `}><ImageIcon size={15} /> Image to video <span>›</span></div>
            <div className={`
      sceenyk-landing-sourceRow [&&]:flex [&&]:items-center [&&]:gap-[7px] [&&]:pt-[7px] [&&]:pr-[3px] [&&]:pb-[7px]
      [&&]:pl-[3px] [&&]:[border-bottom:1px_solid_var(--border)] [&&]:text-[length:10px] [&&_span]:ml-[auto]
      max-1100:[&&]:text-[length:9px]
    `}><Clapperboard size={15} /> Text to video <span>›</span></div>
            <div className={`
      sceenyk-landing-sourceRow [&&]:flex [&&]:items-center [&&]:gap-[7px] [&&]:pt-[7px] [&&]:pr-[3px] [&&]:pb-[7px]
      [&&]:pl-[3px] [&&]:[border-bottom:1px_solid_var(--border)] [&&]:text-[length:10px] [&&_span]:ml-[auto]
      max-1100:[&&]:text-[length:9px]
    `}><Layers size={15} /> Start from a template <span>›</span></div>
          </div>
          <div className={`
      sceenyk-landing-previewPanel [&&]:min-w-[0] [&&]:pt-[10px] [&&]:pr-[10px] [&&]:pb-[10px] [&&]:pl-[10px]
      [&&]:[border:1px_solid_var(--border)] [&&]:rounded-[8px] [&&]:[background:var(--background)] max-699:[&&]:pt-[7px]
      max-699:[&&]:pr-[7px] max-699:[&&]:pb-[7px] max-699:[&&]:pl-[7px]
    `}>
            <p className={"sceenyk-landing-panelLabel [&&]:text-[color:var(--link)] [&&]:text-[length:10px] [&&]:font-[650] [&&]:mb-[10px] max-699:[&&]:text-[length:9px] max-699:[&&]:mb-[5px]"}>02. PREVIEW</p>
            <div className={`
      sceenyk-landing-previewToolbar [&&]:flex [&&]:items-center [&&]:gap-[7px] [&&]:h-[40px] [&&]:mb-[8px]
      [&&]:whitespace-nowrap max-699:[&&]:h-[32px] max-699:[&&]:gap-[5px] max-699:[&&]:mb-[7px]
    `} aria-hidden="true">
              <span className={`
      sceenyk-landing-mockField [&&]:flex [&&]:items-center [&&]:gap-[7px] [&&]:min-h-[34px] [&&]:pt-[6px] [&&]:pr-[9px]
      [&&]:pb-[6px] [&&]:pl-[9px] [&&]:text-[length:11px] [&&]:[border:1px_solid_var(--border)] [&&]:rounded-[6px]
      [&&]:[background:var(--field)] [&&_>_svg:last-child]:ml-[auto] [.sceenyk-landing-previewToolbar_&&]:text-[length:10px]
      max-1100:[&&]:min-h-[30px] max-1100:[&&]:text-[length:10px]
      max-699:[.sceenyk-landing-previewToolbar_&&]:text-[length:9px] max-699:[.sceenyk-landing-previewToolbar_&&]:pt-[4px]
      max-699:[.sceenyk-landing-previewToolbar_&&]:pr-[6px] max-699:[.sceenyk-landing-previewToolbar_&&]:pb-[4px]
      max-699:[.sceenyk-landing-previewToolbar_&&]:pl-[6px]
    `}>16:9 <ChevronDown size={13} /></span>
              <span className={`
      sceenyk-landing-mockField [&&]:flex [&&]:items-center [&&]:gap-[7px] [&&]:min-h-[34px] [&&]:pt-[6px] [&&]:pr-[9px]
      [&&]:pb-[6px] [&&]:pl-[9px] [&&]:text-[length:11px] [&&]:[border:1px_solid_var(--border)] [&&]:rounded-[6px]
      [&&]:[background:var(--field)] [&&_>_svg:last-child]:ml-[auto] [.sceenyk-landing-previewToolbar_&&]:text-[length:10px]
      max-1100:[&&]:min-h-[30px] max-1100:[&&]:text-[length:10px]
      max-699:[.sceenyk-landing-previewToolbar_&&]:text-[length:9px] max-699:[.sceenyk-landing-previewToolbar_&&]:pt-[4px]
      max-699:[.sceenyk-landing-previewToolbar_&&]:pr-[6px] max-699:[.sceenyk-landing-previewToolbar_&&]:pb-[4px]
      max-699:[.sceenyk-landing-previewToolbar_&&]:pl-[6px]
    `}><Save size={13} /> Saved</span>
              <span className={`
      sceenyk-landing-previewStatus [&&]:[flex:1] [&&]:flex [&&]:items-center [&&]:gap-[6px] [&&]:text-[length:9px]
      [&&]:text-[color:var(--muted-foreground)] [&&_>_span]:block [&&_>_span]:[background:var(--link)] [&&_>_span]:w-[5px]
      [&&_>_span]:h-[5px] [&&_>_span]:rounded-[50%] max-1100:[&&]:hidden
    `}><span /> Creative direction</span>
              <span className={`
      sceenyk-landing-previewBadge [&&]:text-[length:9px] [&&]:text-[color:var(--link)] [&&]:pt-[6px] [&&]:pr-[6px]
      [&&]:pb-[6px] [&&]:pl-[6px] [&&]:[background:var(--accent)] [&&]:rounded-[5px] max-1100:[&&]:ml-[auto]
      max-699:[&&]:text-[length:8px] max-699:[&&]:pl-[4px] max-699:[&&]:pr-[4px]
    `}>Concept preview</span>
            </div>
            <div className={"sceenyk-landing-stage [&&]:relative [&&]:[aspect-ratio:16_/_9] [&&]:overflow-hidden [&&]:rounded-[6px] [&&]:[background:var(--neutral-950)]"}>
              <Image src={landingArtwork.portrait} alt="Cinematic concept artwork: a woman under violet and blue city lights" fill sizes="(max-width: 700px) 90vw, (max-width: 1000px) 65vw, 760px" className={"sceenyk-landing-stageImage [&&]:object-cover [&&]:[object-position:50%_33%]"} />
              <div className={`
      sceenyk-landing-playerDecoration [&&]:absolute [&&]:top-[auto] [&&]:right-[0] [&&]:bottom-[0] [&&]:left-[0]
      [&&]:pt-[32px] [&&]:pr-[15px] [&&]:pb-[10px] [&&]:pl-[15px]
      [&&]:[background:linear-gradient(transparent,_var(--neutral-950))] [&&]:text-[color:var(--primary-foreground)]
      [&&_>_div]:h-[2px] [&&_>_div]:[background:color-mix(in_srgb,_var(--primary-foreground)_75%,_transparent)]
      [&&_>_div]:mb-[10px] [&&_>_span]:flex [&&_>_span]:items-center [&&_>_span]:gap-[14px] [&&_small]:text-[length:9px]
      [&&_small]:[flex:1] max-699:[&&]:pl-[10px] max-699:[&&]:pr-[10px] max-699:[&&_>_span]:gap-[10px]
    `} aria-hidden="true"><div /><span><Play size={20} fill="currentColor" /><Volume2 size={14} /><small>Visual concept</small><Captions size={18} /><Maximize size={17} /></span></div>
            </div>
          </div>
          <div className={`
      sceenyk-landing-properties [&&]:min-w-[0] [&&]:pt-[10px] [&&]:pr-[10px] [&&]:pb-[10px] [&&]:pl-[10px]
      [&&]:[border:1px_solid_var(--border)] [&&]:rounded-[8px] [&&]:[background:var(--background)] max-999:[&&]:hidden
    `} aria-hidden="true">
            <p className={"sceenyk-landing-panelLabel [&&]:text-[color:var(--link)] [&&]:text-[length:10px] [&&]:font-[650] [&&]:mb-[10px] max-699:[&&]:text-[length:9px] max-699:[&&]:mb-[5px]"}>03. PROPERTIES</p>
            <span className={`
      sceenyk-landing-fieldLabel [&&]:block [&&]:text-[color:var(--muted-foreground)] [&&]:text-[length:10px] [&&]:mb-[5px]
      [.sceenyk-landing-properties_&&]:mt-[11px] [.sceenyk-landing-properties_&&]:text-[color:var(--foreground)]
      [.sceenyk-landing-properties_&&]:font-[600] max-1100:[.sceenyk-landing-properties_&&]:mt-[8px]
    `}>Prompt</span>
            <div className={`
      sceenyk-landing-mockPrompt [&&]:pt-[9px] [&&]:pr-[9px] [&&]:pb-[9px] [&&]:pl-[9px] [&&]:min-h-[88px]
      [&&]:[border:1px_solid_var(--border)] [&&]:rounded-[6px] [&&]:[background:var(--field)]
      [&&]:text-[color:var(--muted-foreground)] [&&]:text-[length:10px] [&&]:leading-[1.6] max-1100:[&&]:text-[length:9px]
      max-1100:[&&]:min-h-[70px]
    `}>A cinematic scene of a woman in a rainy neon city, dramatic lighting, shallow depth of field.</div>
            <span className={`
      sceenyk-landing-fieldLabel [&&]:block [&&]:text-[color:var(--muted-foreground)] [&&]:text-[length:10px] [&&]:mb-[5px]
      [.sceenyk-landing-properties_&&]:mt-[11px] [.sceenyk-landing-properties_&&]:text-[color:var(--foreground)]
      [.sceenyk-landing-properties_&&]:font-[600] max-1100:[.sceenyk-landing-properties_&&]:mt-[8px]
    `}>Visual style</span><div className={`
      sceenyk-landing-mockField [&&]:flex [&&]:items-center [&&]:gap-[7px] [&&]:min-h-[34px] [&&]:pt-[6px] [&&]:pr-[9px]
      [&&]:pb-[6px] [&&]:pl-[9px] [&&]:text-[length:11px] [&&]:[border:1px_solid_var(--border)] [&&]:rounded-[6px]
      [&&]:[background:var(--field)] [&&_>_svg:last-child]:ml-[auto] [.sceenyk-landing-previewToolbar_&&]:text-[length:10px]
      max-1100:[&&]:min-h-[30px] max-1100:[&&]:text-[length:10px]
      max-699:[.sceenyk-landing-previewToolbar_&&]:text-[length:9px] max-699:[.sceenyk-landing-previewToolbar_&&]:pt-[4px]
      max-699:[.sceenyk-landing-previewToolbar_&&]:pr-[6px] max-699:[.sceenyk-landing-previewToolbar_&&]:pb-[4px]
      max-699:[.sceenyk-landing-previewToolbar_&&]:pl-[6px]
    `}><ImageIcon size={15} /> Cinematic <ChevronDown size={12} /></div>
            <span className={`
      sceenyk-landing-fieldLabel [&&]:block [&&]:text-[color:var(--muted-foreground)] [&&]:text-[length:10px] [&&]:mb-[5px]
      [.sceenyk-landing-properties_&&]:mt-[11px] [.sceenyk-landing-properties_&&]:text-[color:var(--foreground)]
      [.sceenyk-landing-properties_&&]:font-[600] max-1100:[.sceenyk-landing-properties_&&]:mt-[8px]
    `}>Tone</span><div className={`
      sceenyk-landing-mockField [&&]:flex [&&]:items-center [&&]:gap-[7px] [&&]:min-h-[34px] [&&]:pt-[6px] [&&]:pr-[9px]
      [&&]:pb-[6px] [&&]:pl-[9px] [&&]:text-[length:11px] [&&]:[border:1px_solid_var(--border)] [&&]:rounded-[6px]
      [&&]:[background:var(--field)] [&&_>_svg:last-child]:ml-[auto] [.sceenyk-landing-previewToolbar_&&]:text-[length:10px]
      max-1100:[&&]:min-h-[30px] max-1100:[&&]:text-[length:10px]
      max-699:[.sceenyk-landing-previewToolbar_&&]:text-[length:9px] max-699:[.sceenyk-landing-previewToolbar_&&]:pt-[4px]
      max-699:[.sceenyk-landing-previewToolbar_&&]:pr-[6px] max-699:[.sceenyk-landing-previewToolbar_&&]:pb-[4px]
      max-699:[.sceenyk-landing-previewToolbar_&&]:pl-[6px]
    `}><Moon size={15} /> Moody <ChevronDown size={12} /></div>
            <span className={`
      sceenyk-landing-fieldLabel [&&]:block [&&]:text-[color:var(--muted-foreground)] [&&]:text-[length:10px] [&&]:mb-[5px]
      [.sceenyk-landing-properties_&&]:mt-[11px] [.sceenyk-landing-properties_&&]:text-[color:var(--foreground)]
      [.sceenyk-landing-properties_&&]:font-[600] max-1100:[.sceenyk-landing-properties_&&]:mt-[8px]
    `}>Duration</span><div className={`
      sceenyk-landing-mockField [&&]:flex [&&]:items-center [&&]:gap-[7px] [&&]:min-h-[34px] [&&]:pt-[6px] [&&]:pr-[9px]
      [&&]:pb-[6px] [&&]:pl-[9px] [&&]:text-[length:11px] [&&]:[border:1px_solid_var(--border)] [&&]:rounded-[6px]
      [&&]:[background:var(--field)] [&&_>_svg:last-child]:ml-[auto] [.sceenyk-landing-previewToolbar_&&]:text-[length:10px]
      max-1100:[&&]:min-h-[30px] max-1100:[&&]:text-[length:10px]
      max-699:[.sceenyk-landing-previewToolbar_&&]:text-[length:9px] max-699:[.sceenyk-landing-previewToolbar_&&]:pt-[4px]
      max-699:[.sceenyk-landing-previewToolbar_&&]:pr-[6px] max-699:[.sceenyk-landing-previewToolbar_&&]:pb-[4px]
      max-699:[.sceenyk-landing-previewToolbar_&&]:pl-[6px]
    `}>10 seconds <ChevronDown size={12} /></div>
            <span className={`
      sceenyk-landing-fieldLabel [&&]:block [&&]:text-[color:var(--muted-foreground)] [&&]:text-[length:10px] [&&]:mb-[5px]
      [.sceenyk-landing-properties_&&]:mt-[11px] [.sceenyk-landing-properties_&&]:text-[color:var(--foreground)]
      [.sceenyk-landing-properties_&&]:font-[600] max-1100:[.sceenyk-landing-properties_&&]:mt-[8px]
    `}>Aspect ratio</span><div className={`
      sceenyk-landing-mockField [&&]:flex [&&]:items-center [&&]:gap-[7px] [&&]:min-h-[34px] [&&]:pt-[6px] [&&]:pr-[9px]
      [&&]:pb-[6px] [&&]:pl-[9px] [&&]:text-[length:11px] [&&]:[border:1px_solid_var(--border)] [&&]:rounded-[6px]
      [&&]:[background:var(--field)] [&&_>_svg:last-child]:ml-[auto] [.sceenyk-landing-previewToolbar_&&]:text-[length:10px]
      max-1100:[&&]:min-h-[30px] max-1100:[&&]:text-[length:10px]
      max-699:[.sceenyk-landing-previewToolbar_&&]:text-[length:9px] max-699:[.sceenyk-landing-previewToolbar_&&]:pt-[4px]
      max-699:[.sceenyk-landing-previewToolbar_&&]:pr-[6px] max-699:[.sceenyk-landing-previewToolbar_&&]:pb-[4px]
      max-699:[.sceenyk-landing-previewToolbar_&&]:pl-[6px]
    `}><Maximize size={15} /> 16:9 (Landscape)</div>
          </div>
        </div>
      </div>
      <div className={`
      sceenyk-landing-studioCaption [&&]:flex [&&]:items-center [&&]:flex-col [&&]:gap-[10px] [&&]:pt-[13px]
      [&&_p]:text-[length:10px] [&&_p]:text-[color:var(--muted-foreground)] [&&_p]:text-center [&&_a]:rounded-[999px]
      [&&_a]:text-[length:12px] [&&_a]:pl-[24px] [&&_a]:pr-[24px] max-699:[&&_p]:text-[length:10px]
      max-699:[&&_p]:leading-[1.5] max-699:[&&_p]:max-w-[300px]
    `}><p>A glimpse of the creative direction. Illustrative preview, not a live generation.</p><Link className={buttonVariants()} href="/studio">Try the Studio <ArrowRight aria-hidden="true" /></Link></div>
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
    <section id="marketplace-story" className={`
      sceenyk-landing-container [&&]:w-[min(100%,_1320px)] [&&]:ml-[auto] [&&]:mr-[auto] [&&]:pl-[clamp(20px,_4vw,_60px)]
      [&&]:pr-[clamp(20px,_4vw,_60px)] max-699:[&&]:pl-[20px] max-699:[&&]:pr-[20px] max-359:[&&]:pl-[16px]
      max-359:[&&]:pr-[16px] sceenyk-landing-marketplaceSection [&&]:relative [&&]:z-[3] [&&]:pt-[10px] [&&]:pb-[24px]
      max-699:[&&]:pt-[0] max-699:[&&]:pb-[32px]
    `} aria-labelledby="marketplace-heading" data-reveal>
      <div className={`
      sceenyk-landing-sectionHeading [&&]:flex [&&]:justify-between [&&]:[align-items:end] [&&]:gap-[24px] [&&]:mb-[16px]
      [&&_h2]:text-[length:clamp(25px,_2.65vw,_38px)] [&&_h2]:leading-[1.15] [&&_h2]:font-[750] [&&_h2]:tracking-[-0.04em]
      [&&_h2]:mt-[8px] [&&_>_div_>_p:last-child]:text-[color:var(--muted-foreground)]
      [&&_>_div_>_p:last-child]:text-[length:15px] [&&_>_div_>_p:last-child]:leading-[1.5] [&&_>_div_>_p:last-child]:mt-[7px]
      [&&_>_a]:text-[length:12px] max-999:[&&]:[align-items:start] max-999:[&&_>_a]:hidden max-699:[&&_h2]:text-[length:29px]
      max-699:[&&_>_div_>_p:last-child]:text-[length:14px]
    `}>
        <div><p className={`
      [@layer_components]:text-[color:var(--link)] [@layer_components]:text-[length:var(--text-caption)]
      [@layer_components]:font-[600] [@layer_components]:tracking-[0.12em] eyebrow
      [.workspace-page[data-workspace-page='content']_&&]:hidden
    `}>MARKETPLACE</p><h2 id="marketplace-heading">Start from great work, then make it yours.</h2><p>Adopt reusable creator projects, remix them with your own idea, and publish your own standout work.</p></div>
        <Link href="/marketplace" className={buttonVariants({ variant: "outline" })}>Browse marketplace <ArrowRight aria-hidden="true" /></Link>
      </div>
      <div className={`
      sceenyk-landing-conceptGrid [&&]:grid [&&]:[grid-template-columns:repeat(4,_minmax(0,_1fr))] [&&]:gap-[16px]
      max-999:[&&]:[grid-template-columns:repeat(2,_minmax(0,_1fr))] max-699:[&&]:gap-[12px]
      max-359:[&&]:[grid-template-columns:1fr]
    `}>
        {concepts.map(concept => <article className={"sceenyk-landing-conceptCard [&&]:min-w-[0] [&&]:overflow-hidden [&&]:[border:1px_solid_var(--border)] [&&]:rounded-[10px] [&&]:[background:var(--card)]"} key={concept.title}>
          <Link href="/marketplace" aria-label={`Explore Marketplace inspiration: ${concept.title}`} className={`
      sceenyk-landing-conceptLink [&&]:block [&&]:h-[100%] [&&:focus-visible]:[outline:3px_solid_var(--ring)]
      [&&:focus-visible]:[outline-offset:-3px] [&&:focus-visible]:rounded-[10px]
      [@media_(hover:_hover)_and_(prefers-reduced-motion:_no-preference)]:[&&:hover_img]:[transform:scale(1.025)]
    `}>
            <div className={`
      sceenyk-landing-conceptImage [&&]:relative [&&]:[aspect-ratio:2.05] [&&]:overflow-hidden
      [&&_img]:[object-position:50%_35%] [&&_img]:[transition:transform_var(--motion-popover)_var(--motion-ease)] max-999:[&&]:[aspect-ratio:2.2]
      max-699:[&&]:[aspect-ratio:1.5] max-359:[&&]:[aspect-ratio:2]
      [@media_(prefers-reduced-motion:_reduce)]:[&&_img]:[transition:none]
    `}><Image src={landingArtwork[concept.image]} alt="" fill sizes="(max-width: 550px) 90vw, (max-width: 1000px) 45vw, 310px" className={"sceenyk-landing-artwork [&&]:object-cover"} /></div>
            <div className={`
      sceenyk-landing-conceptBody [&&]:pt-[10px] [&&]:pr-[12px] [&&]:pb-[12px] [&&]:pl-[12px] [&&_h3]:text-[length:14px]
      [&&_h3]:font-[650] [&&_h3]:tracking-[-.02em] [&&_>_p]:text-[length:12px] [&&_>_p]:leading-[1.4]
      [&&_>_p]:text-[color:var(--muted-foreground)] [&&_>_p]:min-h-[35px] [&&_>_p]:mt-[4px] [&&_>_p]:mb-[8px]
      max-999:[&&_>_p]:min-h-[auto] max-699:[&&]:pt-[10px] max-699:[&&]:pr-[10px] max-699:[&&]:pb-[10px]
      max-699:[&&]:pl-[10px] max-699:[&&_h3]:text-[length:13px] max-699:[&&_>_p]:text-[length:11px]
      max-699:[&&_>_p]:min-h-[47px] max-359:[&&_>_p]:min-h-[auto]
    `}><h3>{concept.title}</h3><p>{concept.description}</p><div className={`
      sceenyk-landing-tags [&&]:flex [&&]:flex-wrap [&&]:gap-[5px] [&&_span]:text-[length:10px]
      [&&_span]:[border:1px_solid_var(--border)] [&&_span]:pt-[2px] [&&_span]:pr-[7px] [&&_span]:pb-[2px] [&&_span]:pl-[7px]
      [&&_span]:rounded-[999px] [&&_span]:text-[color:var(--muted-foreground)] max-699:[&&_span]:text-[length:9px]
      max-699:[&&_span]:pl-[5px] max-699:[&&_span]:pr-[5px]
    `}>{concept.tags.map(tag => <span key={tag}>{tag}</span>)}</div><div className={`
      sceenyk-landing-conceptMeta [&&]:flex [&&]:justify-between [&&]:items-center [&&]:mt-[13px] [&&]:text-[length:10px]
      [&&]:text-[color:var(--muted-foreground)] [&&_svg]:text-[color:var(--link)] max-699:[&&]:text-[length:9px]
    `}><span>Creative inspiration</span><ArrowRight size={15} aria-hidden="true" /></div></div>
          </Link>
        </article>)}
      </div>
      <p className={"sceenyk-landing-sectionNote [&&]:text-[length:11px] [&&]:leading-[1.5] [&&]:text-[color:var(--muted-foreground)] [&&]:mt-[12px]"}>Illustrative concepts. Explore Marketplace for available creator listings and adoption prices. Generation costs are reviewed separately in Studio.</p>
    </section>
  );
}

const offers = [
  { title: "Free", subtitle: "2 lifetime free generations", description: "Explore Studio and see what you can create.", icon: Gift, features: ["Up to 10 seconds per free generation", "Start with a prompt or your own media", "Explore templates and Marketplace"], action: "Explore Studio", href: "/studio" },
  { title: "Credit Top-up", subtitle: "Create at your own pace", description: "Flexible pay-as-you-go usage. No subscription.", icon: Coins, features: ["Review cost before generating", "Purchased credits do not expire", "Manually top up when you need more", "Free allowance stays separate"], action: "Explore credit packs", href: "/credits", featured: true },
  { title: "Creator Earnings", subtitle: "Publish to Marketplace", description: "Share a creative starting point. Earn from your work.", icon: Star, features: ["Publish your own reusable projects", "Earn a 90% creator share", "10% platform fee", "Adoption money is separate from AI credits"], action: "Explore Marketplace", href: "/marketplace" },
];

export function LandingPricing() {
  return <section id="pricing" className={`
      sceenyk-landing-container [&&]:w-[min(100%,_1320px)] [&&]:ml-[auto] [&&]:mr-[auto] [&&]:pl-[clamp(20px,_4vw,_60px)]
      [&&]:pr-[clamp(20px,_4vw,_60px)] max-699:[&&]:pl-[20px] max-699:[&&]:pr-[20px] max-359:[&&]:pl-[16px]
      max-359:[&&]:pr-[16px] sceenyk-landing-pricingSection [&&]:pt-[12px] [&&]:pb-[24px] [&&]:[scroll-margin-top:0px]
      max-699:[&&]:pt-[0] max-699:[&&]:pb-[32px]
    `} aria-labelledby="pricing-heading">
    <div className={`
      sceenyk-landing-sectionHeading [&&]:flex [&&]:justify-between [&&]:[align-items:end] [&&]:gap-[24px] [&&]:mb-[16px]
      [&&_h2]:text-[length:clamp(25px,_2.65vw,_38px)] [&&_h2]:leading-[1.15] [&&_h2]:font-[750] [&&_h2]:tracking-[-0.04em]
      [&&_h2]:mt-[8px] [&&_>_div_>_p:last-child]:text-[color:var(--muted-foreground)]
      [&&_>_div_>_p:last-child]:text-[length:15px] [&&_>_div_>_p:last-child]:leading-[1.5] [&&_>_div_>_p:last-child]:mt-[7px]
      [&&_>_a]:text-[length:12px] max-999:[&&]:[align-items:start] max-999:[&&_>_a]:hidden max-699:[&&_h2]:text-[length:29px]
      max-699:[&&_>_div_>_p:last-child]:text-[length:14px]
    `}><div><p className={`
      [@layer_components]:text-[color:var(--link)] [@layer_components]:text-[length:var(--text-caption)]
      [@layer_components]:font-[600] [@layer_components]:tracking-[0.12em] eyebrow
      [.workspace-page[data-workspace-page='content']_&&]:hidden
    `}>PRICING</p><h2 id="pricing-heading">Pay only for what you create.</h2><p>Start free, then top up credits as you need them. Buy credits. Create what you need. Top up when you need more.</p></div></div>
    <div className={`
      sceenyk-landing-pricingGrid [&&]:grid [&&]:[grid-template-columns:repeat(3,_minmax(0,_1fr))] [&&]:gap-[18px]
      max-999:[&&]:gap-[12px] max-699:[&&]:[grid-template-columns:1fr] max-699:[&&]:gap-[20px]
    `}>{offers.map(offer => <article key={offer.title} className={`${`
      sceenyk-landing-priceCard [&&]:flex [&&]:flex-col [&&]:relative [&&]:[border:1px_solid_var(--border)]
      [&&]:rounded-[12px] [&&]:[background:var(--card)] [&&]:pt-[24px] [&&]:pr-[18px] [&&]:pb-[18px] [&&]:pl-[18px]
      [&&_h3]:text-[length:17px] [&&_h3]:font-[700] [&&_h3]:tracking-[-.03em] [&&_ul]:mt-[18px] [&&_ul]:mb-[24px]
      [&&_ul]:grid [&&_ul]:[align-content:start] [&&_ul]:gap-[9px] [&&_ul]:[flex:1] [&&_li]:flex [&&_li]:items-start
      [&&_li]:gap-[9px] [&&_li]:text-[length:12px] [&&_li]:leading-[1.45] [&&_li_svg]:shrink-0 [&&_li_svg]:mt-[1px]
      [&&_>_a]:w-[100%] [&&_>_a]:text-[length:12px] [&&_>_a]:whitespace-normal [&&_>_a]:text-center max-999:[&&]:pt-[21px]
      max-999:[&&]:pr-[13px] max-999:[&&]:pb-[14px] max-999:[&&]:pl-[13px] max-999:[&&_h3]:text-[length:16px]
      max-699:[&&]:pt-[22px] max-699:[&&]:pr-[20px] max-699:[&&]:pb-[20px] max-699:[&&]:pl-[20px]
      max-699:[&&_h3]:text-[length:19px] max-699:[&&_li]:text-[length:13px] max-699:[&&_>_a]:min-h-[44px]
      max-699:[&&_>_a]:text-[length:13px]
    `} ${offer.featured ? `
      sceenyk-landing-featuredPrice [&&]:[border-color:var(--brand-purple)]
      [&&]:[background:linear-gradient(145deg,_var(--card),_color-mix(in_srgb,_var(--brand-purple)_7%,_var(--card)))]
      [&&]:[box-shadow:0_0_0_3px_color-mix(in_srgb,_var(--brand-purple)_7%,_transparent)]
    ` : ""}`}>
      {offer.featured && <span className={`
      sceenyk-landing-priceBadge [&&]:absolute [&&]:top-[-9px] [&&]:right-[13px] [&&]:pt-[2px] [&&]:pr-[7px] [&&]:pb-[2px]
      [&&]:pl-[7px] [&&]:[border:1px_solid_color-mix(in_srgb,_var(--brand-purple)_55%,_var(--border))] [&&]:rounded-[999px]
      [&&]:text-[color:var(--link)] [&&]:[background:var(--card)] [&&]:text-[length:9px] [&&]:font-[600]
    `}>PAY AS YOU GO</span>}
      <div className={`
      sceenyk-landing-priceIntro [&&]:flex [&&]:items-start [&&]:gap-[15px] [&&_p]:text-[length:12px] [&&_p]:leading-[1.45]
      [&&_p]:mt-[4px] [&&_p]:text-[color:var(--muted-foreground)] max-1100:[&&]:gap-[10px] max-999:[&&]:flex-col
      max-699:[&&]:flex-row max-699:[&&]:gap-[15px] max-699:[&&_p]:text-[length:13px]
    `}><span className={`
      sceenyk-landing-priceIcon [&&]:flex [&&]:items-center [&&]:justify-center [&&]:w-[52px] [&&]:h-[52px] [&&]:shrink-0
      [&&]:rounded-[12px] [&&]:[background:var(--accent)] [&&]:text-[color:var(--link)]
      [.sceenyk-landing-priceCard:nth-child(2)_&&]:text-[color:var(--secondary-foreground)]
      [.sceenyk-landing-priceCard:nth-child(2)_&&]:[background:var(--secondary)] max-1100:[&&]:w-[40px]
      max-1100:[&&]:h-[40px] max-1100:[&&_svg]:w-[24px]
    `}><offer.icon size={28} aria-hidden="true" /></span><div><h3>{offer.title}</h3><p className={"sceenyk-landing-priceSubtitle [.sceenyk-landing-priceIntro_&&]:text-[color:var(--link)] [.sceenyk-landing-priceIntro_&&]:text-[length:13px] [.sceenyk-landing-priceIntro_&&]:font-[550] max-699:[.sceenyk-landing-priceIntro_&&]:text-[length:14px]"}>{offer.subtitle}</p><p>{offer.description}</p></div></div>
      <ul>{offer.features.map(feature => <li key={feature}><Check size={16} aria-hidden="true" />{feature}</li>)}</ul>
      <Link href={offer.href} className={buttonVariants({ variant: offer.featured ? "default" : "outline" })}>{offer.action} <ArrowRight aria-hidden="true" /></Link>
    </article>)}</div>
    <p className={"sceenyk-landing-sectionNote [&&]:text-[length:11px] [&&]:leading-[1.5] [&&]:text-[color:var(--muted-foreground)] [&&]:mt-[12px]"}>PayPal Sandbox test payments only. Production pack prices and generation rates are awaiting approval.</p>
  </section>;
}

export function CreativeInvitation() {
  return <>
    <section className={`
      sceenyk-landing-container [&&]:w-[min(100%,_1320px)] [&&]:ml-[auto] [&&]:mr-[auto] [&&]:pl-[clamp(20px,_4vw,_60px)]
      [&&]:pr-[clamp(20px,_4vw,_60px)] max-699:[&&]:pl-[20px] max-699:[&&]:pr-[20px] max-359:[&&]:pl-[16px]
      max-359:[&&]:pr-[16px] sceenyk-landing-invitation [&&_h2]:text-[length:clamp(25px,_2.65vw,_38px)]
      [&&_h2]:leading-[1.15] [&&_h2]:font-[750] [&&_h2]:tracking-[-0.04em] [&&_h2]:mt-[8px] [&&]:pt-[8px] [&&]:pb-[8px]
      max-699:[&&]:pb-[0]
    `} aria-labelledby="invitation-heading" data-reveal>
      <div className={`
      sceenyk-landing-invitationPanel [&&]:text-center [&&]:overflow-hidden [&&]:[border:1px_solid_var(--border)]
      [&&]:rounded-[15px] [&&]:pt-[26px] [&&]:pr-[20px] [&&]:pb-[26px] [&&]:pl-[20px]
      [&&]:[background:radial-gradient(ellipse_at_12%_20%,_color-mix(in_srgb,_var(--brand-violet)_22%,_transparent),_transparent_47%),_radial-gradient(ellipse_at_90%_75%,_color-mix(in_srgb,_var(--brand-cyan)_19%,_transparent),_transparent_48%),_var(--accent)]
      [&&_>_svg]:ml-[auto] [&&_>_svg]:mr-[auto] [&&_>_svg]:text-[color:var(--link)] [&&_h2]:text-[length:28px]
      [&&_p]:text-[length:13px] [&&_p]:text-[color:var(--muted-foreground)] [&&_p]:mt-[8px] [&&_p]:mr-[auto] [&&_p]:mb-[15px]
      [&&_p]:ml-[auto] [&&_p]:max-w-[450px] [&&_a]:text-[length:12px] [&&_a]:rounded-[999px] max-699:[&&]:pt-[25px]
      max-699:[&&]:pr-[17px] max-699:[&&]:pb-[25px] max-699:[&&]:pl-[17px] max-699:[&&_h2]:text-[length:26px]
    `}><Sparkles size={20} aria-hidden="true" /><h2 id="invitation-heading">Your next spark is out there.</h2><p>Discover creative starting points and make something unmistakably yours.</p><Link href="/marketplace" className={buttonVariants({ variant: "outline" })}>Find your inspiration <ArrowRight aria-hidden="true" /></Link></div>
    </section>
    <section className={`
      sceenyk-landing-container [&&]:w-[min(100%,_1320px)] [&&]:ml-[auto] [&&]:mr-[auto] [&&]:pl-[clamp(20px,_4vw,_60px)]
      [&&]:pr-[clamp(20px,_4vw,_60px)] max-699:[&&]:pl-[20px] max-699:[&&]:pr-[20px] max-359:[&&]:pl-[16px]
      max-359:[&&]:pr-[16px] sceenyk-landing-finalCta [.sceenyk-landing-scrollContent_>_&&]:pt-[16px]
      [.sceenyk-landing-scrollContent_>_&&]:pb-[16px] [&&_h2]:text-[length:clamp(24px,_2.5vw,_34px)] [&&_h2]:leading-[1.15]
      [&&_h2]:font-[750] [&&_h2]:tracking-[-0.04em] [&&_h2]:mt-[8px] [&&]:relative [&&]:text-center [&&]:pt-[34px]
      [&&]:pb-[34px] [&&_p]:text-[length:13px] [&&_p]:text-[color:var(--muted-foreground)] [&&_p]:mt-[9px]
      max-699:[&&]:pt-[35px] max-699:[&&]:pb-[35px]
    `} aria-labelledby="final-heading"><h2 id="final-heading">Your next visual story starts here.</h2><p>Open the studio, shape your idea, and take the first step toward your next scene.</p><div className={`
      sceenyk-landing-actions [&&]:flex [&&]:flex-wrap [&&]:items-center [&&]:gap-[12px] [&&]:mt-[18px]
      [&&_a]:text-[length:13px] [.sceenyk-landing-finalCta_&&]:justify-center [.sceenyk-landing-finalCta_&&]:mt-[15px]
      max-1100:[&&]:gap-[8px] max-1100:[&&_a]:pl-[14px] max-1100:[&&_a]:pr-[14px] max-1100:[&&_a]:text-[length:12px]
      max-999:[.sceenyk-landing-heroDescription_&&]:flex-col max-999:[.sceenyk-landing-heroDescription_&&]:items-stretch
      max-699:[.sceenyk-landing-heroDescription_&&]:flex-row max-699:[&&_a]:pl-[14px] max-699:[&&_a]:pr-[14px]
      max-699:[&&_a]:text-[length:12px] max-359:[.sceenyk-landing-heroDescription_&&_a]:pl-[10px]
      max-359:[.sceenyk-landing-heroDescription_&&_a]:pr-[10px]
      max-359:[.sceenyk-landing-heroDescription_&&_a]:text-[length:11px]
    `}><Link href="/studio" className={buttonVariants()}>Open Studio <ArrowRight aria-hidden="true" /></Link><a href="#pricing" className={buttonVariants({ variant: "outline" })}>See Pricing</a></div></section>
  </>;
}
