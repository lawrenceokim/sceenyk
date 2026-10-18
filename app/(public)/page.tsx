import { Hero } from "@/components/landing/hero";
import { HeroGallery } from "@/components/landing/hero-gallery";
import { CreativeInvitation, LandingPricing, MarketplaceStory, StudioShowcase } from "@/components/landing/creative-sections";
import { LandingMotion } from "@/components/landing/landing-motion";
import { landingStyles as styles } from "@/components/landing/landing-styles";

export default function Home() {
  return (
    <div className={styles.landing} data-landing-page>
      <LandingMotion>
        <HeroGallery />
        <Hero />
        <div className={styles.scrollContent} data-landing-content>
          <StudioShowcase />
          <MarketplaceStory />
          <LandingPricing />
          <CreativeInvitation />
        </div>
      </LandingMotion>
    </div>
  );
}
