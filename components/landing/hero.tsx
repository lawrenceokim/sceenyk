import Link from "next/link";
import { ArrowRight, Sparkles } from "lucide-react";
import { buttonVariants } from "@/components/ui/button";

export function Hero() {
  return (
    <section className={`
      sceenyk-landing-hero [&&]:relative [&&]:z-[1] [&&]:isolate [&&]:flex [&&]:items-end [&&]:h-[100dvh]
      [&&]:pt-[calc(100px_+_env(safe-area-inset-top,_0px))] [&&]:pb-[clamp(28px,_4dvh,_48px)]
      max-699:[&&]:pt-[calc(82px_+_env(safe-area-inset-top,_0px))] max-699:[&&]:pb-[34px]
      [@media_(max-height:_540px)]:[&&]:relative [@media_(max-height:_540px)]:[&&]:h-[auto]
      [@media_(max-height:_540px)]:[&&]:min-h-[100dvh]
      [@media_(max-height:_540px)]:[&&]:pt-[calc(100px_+_env(safe-area-inset-top,_0px))]
      [@media_(max-height:_540px)]:[&&]:pb-[48px]
    `} aria-labelledby="landing-title" data-landing-hero>
      <div className={`
      sceenyk-landing-container [&&]:w-[min(100%,_1320px)] [&&]:ml-[auto] [&&]:mr-[auto] [&&]:pl-[clamp(20px,_4vw,_60px)]
      [&&]:pr-[clamp(20px,_4vw,_60px)] max-699:[&&]:pl-[20px] max-699:[&&]:pr-[20px] max-359:[&&]:pl-[16px]
      max-359:[&&]:pr-[16px] sceenyk-landing-heroCopy [&&]:[--hero-fade:180px] [&&]:relative [&&]:z-[2] [&&]:grid
      [&&]:[grid-template-columns:minmax(0,_1.5fr)_minmax(0,_1fr)] [&&]:[align-items:end] [&&]:gap-[46px] [&&]:pt-[0]
      [&&]:pb-[0] [&&::before]:[content:''] [&&::before]:absolute [&&::before]:top-[calc(-1_*_var(--hero-fade))]
      [&&::before]:right-[calc(50%_-_50vw)] [&&::before]:bottom-[-100vh] [&&::before]:left-[calc(50%_-_50vw)]
      [&&::before]:z-[-1] [&&::before]:pointer-events-none
      [&&::before]:[background:linear-gradient(to_bottom,_transparent_0,_color-mix(in_srgb,_var(--background)_35%,_transparent)_calc(var(--hero-fade)_*_.3),_color-mix(in_srgb,_var(--background)_82%,_transparent)_calc(var(--hero-fade)_*_.7),_var(--background)_var(--hero-fade),_var(--background)_100%)]
      [&&_h1]:text-[length:clamp(42px,_5.2vw,_78px)] [&&_h1]:leading-[0.99] [&&_h1]:font-[750] [&&_h1]:tracking-[-0.055em]
      max-1100:[&&]:gap-[30px] max-1100:[&&]:[grid-template-columns:minmax(0,_1.35fr)_minmax(0,_1fr)]
      max-1100:[&&_h1]:text-[length:clamp(48px,_5.5vw,_64px)] max-999:[&&]:[align-items:start] max-999:[&&]:gap-[24px]
      max-999:[&&_h1]:text-[length:clamp(42px,_5.5vw,_55px)] max-699:[&&]:[--hero-fade:120px] max-699:[&&]:block
      max-699:[&&]:pt-[0] max-699:[&&]:pb-[0] max-699:[&&_h1]:text-[length:clamp(37px,_9.7vw,_63px)]
      max-699:[&&_h1]:tracking-[-.055em] max-359:[&&_h1]:text-[length:36px] [@media_(max-height:_540px)]:[&&]:pt-[0]
      [@media_(max-height:_540px)]:[&&]:pb-[0]
    `}>
        <div>
          <p className={`
      sceenyk-landing-heroBadge [&&]:inline-flex [&&]:items-center [&&]:gap-[6px]
      [&&]:[border:1px_solid_color-mix(in_srgb,_var(--brand-purple)_50%,_var(--border))] [&&]:pt-[3px] [&&]:pr-[11px]
      [&&]:pb-[3px] [&&]:pl-[11px] [&&]:[background:var(--background)] [&&]:rounded-[999px] [&&]:text-[length:11px]
      [&&]:leading-[18px] [&&]:mb-[13px] [&&_svg]:text-[color:var(--link)] max-699:[&&]:text-[length:10px]
      max-699:[&&]:mb-[12px]
    `}><Sparkles size={13} aria-hidden="true" /> AI video + visual creation</p>
          <h1 id="landing-title">Create the scene<br />you imagine.</h1>
        </div>
        <div className={`
      sceenyk-landing-heroDescription [&&]:pb-[2px] [&&]:max-w-[410px] [&&_>_p]:text-[length:16px] [&&_>_p]:leading-[1.55]
      [&&_>_p]:text-[color:var(--muted-foreground)] max-1100:[&&_>_p]:text-[length:14px] max-699:[&&]:mt-[18px]
      max-699:[&&]:max-w-[480px] max-699:[&&_>_p]:text-[length:14px] max-699:[&&_>_p]:leading-[1.6]
      max-699:[&&_>_p]:max-w-[390px]
    `}>
          <p>Generate cinematic videos and visuals from prompts, clips, and creative direction — all inside one studio.</p>
          <div className={`
      sceenyk-landing-actions [&&]:flex [&&]:flex-wrap [&&]:items-center [&&]:gap-[12px] [&&]:mt-[18px]
      [&&_a]:text-[length:13px] [.sceenyk-landing-finalCta_&&]:justify-center [.sceenyk-landing-finalCta_&&]:mt-[15px]
      max-1100:[&&]:gap-[8px] max-1100:[&&_a]:pl-[14px] max-1100:[&&_a]:pr-[14px] max-1100:[&&_a]:text-[length:12px]
      max-999:[.sceenyk-landing-heroDescription_&&]:flex-col max-999:[.sceenyk-landing-heroDescription_&&]:items-stretch
      max-699:[.sceenyk-landing-heroDescription_&&]:flex-row max-699:[&&_a]:pl-[14px] max-699:[&&_a]:pr-[14px]
      max-699:[&&_a]:text-[length:12px] max-359:[.sceenyk-landing-heroDescription_&&_a]:pl-[10px]
      max-359:[.sceenyk-landing-heroDescription_&&_a]:pr-[10px]
      max-359:[.sceenyk-landing-heroDescription_&&_a]:text-[length:11px]
    `}>
            <Link href="/studio" className={buttonVariants()}>Open Studio <ArrowRight aria-hidden="true" /></Link>
            <Link href="/marketplace" className={buttonVariants({ variant: "outline" })}>Browse Marketplace</Link>
          </div>
        </div>
      </div>
    </section>
  );
}
