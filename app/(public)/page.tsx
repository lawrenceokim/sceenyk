import { Hero } from "@/components/landing/hero";
import {
  CreationCategories,
  FeatureSection,
  FinalCta,
  HowItWorks,
  PricingPreview,
  Showcase,
} from "@/components/landing/landing-sections";

export default function Home() {
  return (
    <>
      <Hero />
      <CreationCategories />
      <HowItWorks />
      <FeatureSection />
      <Showcase />
      <PricingPreview />
      <FinalCta />
    </>
  );
}
