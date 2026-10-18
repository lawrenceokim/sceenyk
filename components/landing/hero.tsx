import Link from "next/link";
import { ArrowRight, Sparkles } from "lucide-react";
import { buttonVariants } from "@/components/ui/button";
import { landingStyles as styles } from "./landing-styles";

export function Hero() {
  return (
    <section className={styles.hero} aria-labelledby="landing-title" data-landing-hero>
      <div className={`${styles.container} ${styles.heroCopy}`}>
        <div>
          <p className={styles.heroBadge}><Sparkles size={13} aria-hidden="true" /> AI video + visual creation</p>
          <h1 id="landing-title">Create the scene<br />you imagine.</h1>
        </div>
        <div className={styles.heroDescription}>
          <p>Generate cinematic videos and visuals from prompts, clips, and creative direction — all inside one studio.</p>
          <div className={styles.actions}>
            <Link href="/studio" className={buttonVariants()}>Open Studio <ArrowRight aria-hidden="true" /></Link>
            <Link href="/marketplace" className={buttonVariants({ variant: "outline" })}>Browse Marketplace</Link>
          </div>
        </div>
      </div>
    </section>
  );
}
