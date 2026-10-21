import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Plus } from "lucide-react";

export function ProjectsHeading() {
  return <header className={`
      workspace-projects-heading [&&]:flex [&&]:items-end [&&]:justify-between [&&]:gap-[24px] [&&]:mb-[36px]
      [&&_p]:max-w-[520px] [&&_p]:mt-[10px] [&&_p]:text-[length:15px] [&&_p]:leading-[23px]
      [&&_p]:text-[color:var(--muted-foreground)] [&&_[data-slot='button']]:h-[32px] [&&_[data-slot='button']]:min-h-[32px]
      [&&_[data-slot='button']]:pt-[0] [&&_[data-slot='button']]:pr-[12px] [&&_[data-slot='button']]:pb-[0]
      [&&_[data-slot='button']]:pl-[12px] [&&_[data-slot='button']]:shrink-0 [&&_[data-slot='button']]:text-[length:12px]
      [&&_[data-slot='button']]:rounded-[7px] [&&_svg]:w-[14px] [&&_svg]:h-[14px] max-767:[&&]:items-start
      max-767:[&&]:flex-col max-767:[&&]:gap-[14px] max-767:[&&]:mb-[20px] max-767:[&&_p]:text-[length:14px]
      max-767:[&&_p]:leading-[22px] [@media_(pointer:_coarse)]:[&&_[data-slot='button']]:min-h-[44px]
    `}>
      <div><h1>My Projects</h1><p>Projects you&apos;ve saved. Open one to pick up right where you left off.</p></div>
      <Button nativeButton={false} render={<Link href="/studio" />}><Plus aria-hidden="true" />New Project</Button>
    </header>;
}
