import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Plus } from "lucide-react";

export function TemplatesHeading() {
  return <header className="flex flex-wrap items-end justify-between gap-4 max-md:flex-col max-md:items-start">
      <div className={`
      marketplace-heading [&&_h1]:mt-[0] [&&_h1]:mr-[0] [&&_h1]:mb-[0] [&&_h1]:ml-[0] [&&_h1]:font-[700]
      [&&_>_p]:max-w-[610px] [&&_>_p]:mt-[12px] [&&_>_p]:text-[color:var(--muted-foreground)] [&&_>_p]:text-[length:20px]
      [&&_>_p]:leading-[1.4] [&&_>_p]:tracking-[-0.025em] max-599:[&&_>_p]:text-[length:18px] max-599:[&&_>_p]:leading-[27px]
      max-599:[.workspace-templates_&&_>_p]:text-[length:16px] max-599:[.workspace-templates_&&_>_p]:leading-[24px]
    `}><h1>My Templates</h1><p>Templates you&apos;ve created. Open one to manage or continue your work.</p></div>
        <Button nativeButton={false} render={<Link href="/settings/templates/new" />} className="h-8 min-h-8 shrink-0 gap-1.5 rounded-[7px] px-3 text-xs [@media(pointer:coarse)]:min-h-11"><Plus className="size-3.5" aria-hidden="true" />New Template</Button>
      </header>;
}
