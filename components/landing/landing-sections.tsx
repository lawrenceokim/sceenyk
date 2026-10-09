import type { ReactNode } from "react";
import {
  ArrowRight,
  ArrowUpRight,
  AudioLines,
  Captions,
  Check,
  Clapperboard,
  Film,
  Gamepad2,
  Layers,
  Lightbulb,
  Package,
  Scan,
  Sparkles,
  Upload,
  WandSparkles,
  type LucideIcon,
} from "lucide-react";
import { AccountAction } from "@/components/account-action";
import { SceneArtwork, type SceneVariant } from "@/components/scene-artwork";
import { cn } from "@/lib/utils";

function SectionHeading({
  eyebrow,
  title,
  children,
}: {
  eyebrow: string;
  title: string;
  children?: ReactNode;
}) {
  return (
    <div className="max-w-2xl">
      <p className="eyebrow">{eyebrow}</p>
      <h2 className="mt-3 text-heading-2 font-bold tracking-tight md:text-heading-1">
        {title}
      </h2>
      {children && (
        <p className="mt-4 text-body-lg text-muted-foreground">{children}</p>
      )}
    </div>
  );
}

const categories = [
  {
    title: "Video Transformation",
    description:
      "Your footage, reimagined. Give an existing clip a whole new world, mood, or style.",
    icon: WandSparkles,
    label: "REIMAGINE",
  },
  {
    title: "Product Ads",
    description:
      "Make your product the main character with scroll-stopping campaign ideas.",
    icon: Package,
    label: "MAKE IT STAND OUT",
  },
  {
    title: "Cinematic",
    description:
      "Bring ambitious scenes and atmospheric visual worlds out of your imagination.",
    icon: Film,
    label: "SET THE SCENE",
  },
  {
    title: "Storytelling",
    description:
      "Turn a small spark into a story with scenes, narration, and a little movie magic.",
    icon: Lightbulb,
    label: "TELL YOUR STORY",
  },
  {
    title: "Gaming",
    description:
      "Explore game-inspired worlds, character moments, and epic highlight concepts.",
    icon: Gamepad2,
    label: "BUILD A WORLD",
  },
  {
    title: "Social Content",
    description:
      "Create expressive short-form ideas made for your audience and your feed.",
    icon: Clapperboard,
    label: "FIND YOUR AUDIENCE",
  },
];

export function CreationCategoryCard({
  title,
  description,
  icon: Icon,
  label,
  index,
}: (typeof categories)[number] & { index: number }) {
  return (
    <article className="sceenyk-card flex flex-col p-6">
      <div className="mb-6 flex items-center justify-between">
        <span
          className={cn(
            "flex size-12 items-center justify-center rounded-xl",
            index % 3 === 1
              ? "bg-secondary text-secondary-foreground"
              : "bg-accent text-accent-foreground",
          )}
        >
          <Icon className="size-6" aria-hidden="true" />
        </span>
        <span className="font-mono text-caption text-muted-foreground">
          0{index + 1}
        </span>
      </div>
      <h3 className="text-xl font-semibold tracking-tight">{title}</h3>
      <p className="mt-3 flex-1 text-body-sm leading-relaxed text-muted-foreground">
        {description}
      </p>
      <p className="mt-6 text-caption font-medium tracking-wider text-link">
        {label}
      </p>
    </article>
  );
}

export function CreationCategories() {
  return (
    <section id="features" className="landing-section sceenyk-container">
      <div className="flex flex-col justify-between gap-6 md:flex-row md:items-end">
        <SectionHeading
          eyebrow="A NEW WAY TO CREATE"
          title="What’s your next scene?"
        >
          One studio. So many directions. Start with the kind of content you
          want to bring to life.
        </SectionHeading>
        <p className="max-w-48 text-body-sm text-muted-foreground">
          Built for bold ideas,
          <br />
          whatever your canvas.
        </p>
      </div>
      <div className="mt-10 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {categories.map((category, index) => (
          <CreationCategoryCard
            key={category.title}
            {...category}
            index={index}
          />
        ))}
      </div>
    </section>
  );
}

export function HowItWorksStep({
  number,
  title,
  description,
  icon: Icon,
}: {
  number: string;
  title: string;
  description: string;
  icon: LucideIcon;
}) {
  return (
    <li className="relative">
      <div className="mb-6 flex items-center gap-4">
        <span className="flex size-14 items-center justify-center rounded-xl border border-border bg-card text-link shadow-card">
          <Icon className="size-6" aria-hidden="true" />
        </span>
        <span className="font-mono text-caption text-muted-foreground">
          STEP {number}
        </span>
      </div>
      <h3 className="text-heading-3 font-semibold tracking-tight">{title}</h3>
      <p className="mt-3 max-w-sm text-body text-muted-foreground">
        {description}
      </p>
    </li>
  );
}

export function HowItWorks() {
  return (
    <section id="how-it-works" className="border-y border-border bg-muted/40">
      <div className="landing-section sceenyk-container">
        <SectionHeading
          eyebrow="LESS FRICTION. MORE IMAGINATION."
          title="You bring the idea. We bring it together."
        />
        <ol className="mt-12 grid gap-10 md:grid-cols-3 md:gap-8">
          <HowItWorksStep
            number="01"
            title="Upload or describe"
            description="Start with a thought, a video, an image, or your product. Tell Sceenyk what you have in mind."
            icon={Upload}
          />
          <HowItWorksStep
            number="02"
            title="Sceenyk plans and creates"
            description="A connected production flow brings scenes, scripts, voice, captions, and effects together."
            icon={Sparkles}
          />
          <HowItWorksStep
            number="03"
            title="Receive finished content"
            description="Get a finished video to preview, download, and share when your creation is ready."
            icon={Clapperboard}
          />
        </ol>
        <p className="mt-8 text-caption text-muted-foreground">
          The creation experience is in development. This is a preview of the
          planned workflow.
        </p>
      </div>
    </section>
  );
}

export function FeatureSection() {
  return (
    <section className="landing-section sceenyk-container grid items-center gap-12 lg:grid-cols-2">
      <div className="sceenyk-feature-card relative overflow-hidden p-6 sm:p-8">
        <div className="flex items-center justify-between text-caption">
          <span className="font-medium tracking-wider text-muted-foreground">
            YOUR CONNECTED CREATIVE FLOW
          </span>
          <Sparkles className="size-5 text-link" aria-hidden="true" />
        </div>
        <div className="my-8 grid grid-cols-2 gap-3">
          {[
            { icon: Scan, label: "Understand your idea" },
            { icon: Layers, label: "Plan the scenes" },
            { icon: Film, label: "Create the visuals" },
            { icon: AudioLines, label: "Find the voice" },
            { icon: Captions, label: "Add the details" },
            { icon: Clapperboard, label: "Bring it together" },
          ].map(({ icon: Icon, label }) => (
            <div
              key={label}
              className="flex min-w-0 flex-col gap-3 rounded-xl border border-border bg-card/80 p-4 text-body-sm font-medium"
            >
              <Icon className="size-5 text-link" aria-hidden="true" />
              {label}
            </div>
          ))}
        </div>
        <div className="flex items-center justify-between gap-3 rounded-lg bg-primary p-4 text-primary-foreground">
          <span className="text-body-sm font-medium">
            One idea. One studio. Your finished scene.
          </span>
          <ArrowUpRight className="size-5 shrink-0" aria-hidden="true" />
        </div>
      </div>
      <div>
        <SectionHeading
          eyebrow="ALL THE PIECES. ONE PLACE."
          title="Stay in your creative flow."
        >
          Your ideas shouldn’t get lost between five different tools and an
          empty editing timeline.
        </SectionHeading>
        <p className="mt-5 text-body text-muted-foreground">
          Sceenyk is designed to connect the whole production process, so you
          can focus on the story you want to tell. Less tool-switching. More
          room for the unexpected.
        </p>
        <ul className="mt-6 space-y-3 text-body-sm font-medium">
          {[
            "Creative direction starts with you",
            "Planning, visuals, and finishing in one flow",
            "A finished result, rather than disconnected assets",
          ].map((text) => (
            <li key={text} className="flex items-center gap-3">
              <Check className="size-4 shrink-0 text-link" aria-hidden="true" />
              {text}
            </li>
          ))}
        </ul>
      </div>
    </section>
  );
}

export function MediaPreviewCard({
  title,
  category,
  prompt,
  variant,
}: {
  title: string;
  category: string;
  prompt: string;
  variant: SceneVariant;
}) {
  return (
    <article className="sceenyk-card overflow-hidden">
      <div className="relative aspect-[16/10] overflow-hidden">
        <SceneArtwork variant={variant} className="size-full" />
        <span className="absolute left-4 top-4 rounded-md border border-primary-foreground/20 bg-neutral-950/80 px-2 py-1 text-caption font-medium text-primary-foreground">
          {category}
        </span>
        <span className="absolute bottom-3 right-3 rounded-md bg-neutral-950/80 px-2 py-1 text-caption text-primary-foreground">
          Concept artwork
        </span>
      </div>
      <div className="p-5">
        <h3 className="text-lg font-semibold tracking-tight">{title}</h3>
        <p className="mt-2 text-body-sm leading-relaxed text-muted-foreground">
          {prompt}
        </p>
      </div>
    </article>
  );
}

export function Showcase() {
  return (
    <section id="showcase" className="border-y border-border bg-muted/30">
      <div className="landing-section sceenyk-container">
        <SectionHeading
          eyebrow="A LITTLE INSPIRATION"
          title="Imagine what comes next."
        >
          A product launch. An impossible landscape. A world of your own. Every
          scene begins with an idea.
        </SectionHeading>
        <div className="mt-10 grid gap-5 md:grid-cols-3">
          <MediaPreviewCard
            title="Beyond the ordinary"
            category="CINEMATIC"
            prompt="A violet horizon, an unfamiliar planet, and a journey to the other side."
            variant="cinematic"
          />
          <MediaPreviewCard
            title="Made to be noticed"
            category="PRODUCT AD"
            prompt="A clean product reveal with sculpted light, bold color, and a fresh perspective."
            variant="product"
          />
          <MediaPreviewCard
            title="After hours, another world"
            category="GAMING"
            prompt="A neon skyline. A retro-future world. The opening scene of your next adventure."
            variant="gaming"
          />
        </div>
        <p className="mt-5 text-caption text-muted-foreground">
          Illustrative scene concepts, not generated videos. Real creation and
          playback are coming in a later phase.
        </p>
      </div>
    </section>
  );
}

export function PricingCard({
  title,
  label,
  description,
  features,
  featured = false,
  children,
}: {
  title: string;
  label: string;
  description: string;
  features: string[];
  featured?: boolean;
  children: ReactNode;
}) {
  return (
    <article
      className={cn(
        "sceenyk-card relative flex flex-col p-6 sm:p-8",
        featured &&
          "sceenyk-feature-card border-primary shadow-glow",
      )}
    >
      {featured && (
        <span className="absolute -top-3 left-6 rounded-full bg-primary px-3 py-1 text-caption font-medium text-primary-foreground">
          KEEP THE IDEAS COMING
        </span>
      )}
      <p className="text-caption font-medium tracking-wider text-muted-foreground">
        {label}
      </p>
      <h3 className="mt-3 text-heading-3 font-semibold">{title}</h3>
      <p className="mt-3 text-body-sm leading-relaxed text-muted-foreground">
        {description}
      </p>
      <ul className="my-6 flex-1 space-y-3 text-body-sm">
        {features.map((feature) => (
          <li key={feature} className="flex items-start gap-2">
            <Check
              className="mt-0.5 size-4 shrink-0 text-link"
              aria-hidden="true"
            />
            {feature}
          </li>
        ))}
      </ul>
      {children}
    </article>
  );
}

export function PricingPreview() {
  return (
    <section id="pricing" className="landing-section sceenyk-container">
      <div className="mx-auto max-w-2xl text-center">
        <p className="eyebrow">START SMALL. DREAM BIG.</p>
        <h2 className="mt-3 text-heading-2 font-bold tracking-tight md:text-heading-1">
          Room for your first spark.
        </h2>
        <p className="mt-4 text-body-lg text-muted-foreground">
          Try your first ideas free. Keep creating with paid plans or credits
          afterward.
        </p>
      </div>
      <div className="mx-auto mt-12 grid max-w-4xl gap-6 md:grid-cols-2">
        <PricingCard
          title="Your first creations"
          label="FREE TO START"
          description="A little space to explore what your imagination can do."
          features={[
            "2 free short generations for new users",
            "About 10 seconds per generation",
            "Explore the creation experience at launch",
          ]}
        >
          <AccountAction variant="outline" className="w-full">
            Get Started <ArrowRight aria-hidden="true" />
          </AccountAction>
        </PricingCard>
        <PricingCard
          title="Keep creating"
          label="PLANS & CREDITS"
          description="More room for your stories, campaigns, and creative experiments."
          features={[
            "Paid plans or credits after your free generations",
            "Choose capacity for your next ideas",
            "Pricing and plan details coming soon",
          ]}
          featured
        >
          <p className="flex min-h-11 items-center justify-center gap-2 rounded-lg border border-border bg-card text-body-sm font-medium text-muted-foreground">
            Plans coming soon <Sparkles className="size-4" aria-hidden="true" />
          </p>
        </PricingCard>
      </div>
      <p className="mt-6 text-center text-caption text-muted-foreground">
        Pricing preview only. Purchases are not available.
      </p>
    </section>
  );
}

export function FinalCta() {
  return (
    <section className="sceenyk-container pb-16 md:pb-24">
      <div className="final-cta relative overflow-hidden rounded-2xl border border-border px-6 py-14 text-center sm:px-12">
        <span className="relative mx-auto mb-5 flex size-12 items-center justify-center rounded-xl bg-accent text-accent-foreground">
          <Sparkles className="size-6" aria-hidden="true" />
        </span>
        <h2 className="relative mx-auto max-w-2xl text-heading-2 font-bold tracking-tight md:text-heading-1">
          That idea you can’t stop thinking about?
          <br />
          <span className="text-link">Let’s give it a scene.</span>
        </h2>
        <p className="relative mx-auto mt-5 max-w-lg text-body-lg text-muted-foreground">
          From “what if” to something worth sharing. Your imagination has a new
          home.
        </p>
        <AccountAction size="lg" className="relative mt-8">
          Create with Sceenyk{" "}
          <ArrowUpRight className="size-5" aria-hidden="true" />
        </AccountAction>
      </div>
    </section>
  );
}
