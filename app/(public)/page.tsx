import { Hero } from "@/components/landing/hero";
import { HeroGallery } from "@/components/landing/hero-gallery";
import { CreativeInvitation, LandingPricing, MarketplaceStory, StudioShowcase } from "@/components/landing/creative-sections";
import { LandingMotion } from "@/components/landing/landing-motion";

export default function Home() {
  return (
    <div className={`
      sceenyk-landing-landing [&&]:overflow-clip
      [&&]:[background:radial-gradient(ellipse_at_40%_15%,_color-mix(in_srgb,_var(--brand-purple)_5%,_transparent),_transparent_32%),_var(--background)]
    `} data-landing-page>
      <LandingMotion>
        <HeroGallery />
        <Hero />
        <div className={`
      sceenyk-landing-scrollContent [&&]:relative [&&]:z-[2] [&&]:flex [&&]:flex-col [&&]:gap-[clamp(56px,_7vw,_100px)]
      [&&]:pt-[clamp(36px,_5vw,_72px)] [&&]:pb-[clamp(56px,_7vw,_100px)] [&&]:[background:var(--background)]
      [&&]:[border-top:1px_solid_var(--border)] [&&]:rounded-[24px_24px_0_0]
      [&&]:[box-shadow:0_-12px_40px_color-mix(in_srgb,_var(--foreground)_4%,_transparent)] [&&_>_section]:pt-[0]
      [&&_>_section]:pb-[0] [&&_>_section]:[scroll-margin-top:0px]
    `} data-landing-content>
          <StudioShowcase />
          <MarketplaceStory />
          <LandingPricing />
          <CreativeInvitation />
        </div>
      </LandingMotion>
    </div>
  );
}
