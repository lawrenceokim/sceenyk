"use client";

import { usePathname } from "next/navigation";
import type { ReactNode } from "react";
import { SettingsNavigation } from "./settings-navigation";

export function SettingsWorkspace({ children, title = "Settings", description = "Make Sceenyk feel like a creative home.", navigation, regionLabel = "Selected settings section" }: { children: ReactNode; title?: string; description?: string; navigation?: ReactNode; regionLabel?: string }) {
  const pathname = usePathname();
  return <div className={`
      workspace-documentation workspace-settings [&&]:grid [&&]:[grid-template-rows:auto_minmax(0,_1fr)] [&&]:gap-[16px]
      [&&]:h-[100%] [&&]:min-w-[0] [&&]:min-h-[0] [&&]:pt-[20px] [&&]:pr-[16px] [&&]:pb-[0] [&&]:pl-[16px]
      [&&]:overflow-hidden @min-[760px]/documentation:[&&]:[grid-template-columns:198px_minmax(0,_1fr)]
      @min-[760px]/documentation:[&&]:[grid-template-rows:minmax(0,_1fr)] @min-[760px]/documentation:[&&]:gap-x-[40px]
      @min-[760px]/documentation:[&&]:pt-[32px] @min-[760px]/documentation:[&&]:pr-[22px]
      @min-[760px]/documentation:[&&]:pb-[0] @min-[760px]/documentation:[&&]:pl-[22px]
      [.workspace-page[data-workspace-layout='account']_&&]:absolute
      [.workspace-page[data-workspace-layout='account']_&&]:top-[0]
      [.workspace-page[data-workspace-layout='account']_&&]:right-[0]
      [.workspace-page[data-workspace-layout='account']_&&]:bottom-[0]
      [.workspace-page[data-workspace-layout='account']_&&]:left-[0]
      [.workspace-page[data-workspace-layout='account']_&&]:h-[auto]
      [.workspace-page[data-workspace-layout='account']_&&]:mt-[0] [.workspace-page[data-workspace-layout='account']_&&]:mr-[0]
      [.workspace-page[data-workspace-layout='account']_&&]:mb-[0] [.workspace-page[data-workspace-layout='account']_&&]:ml-[0]
      min-[1024px]:[&&]:[grid-template-columns:198px_minmax(0,_1fr)] min-[1024px]:[&&]:[grid-template-rows:minmax(0,_1fr)]
      min-[1024px]:[&&]:gap-x-[40px] min-[1024px]:[&&]:pt-[32px] min-[1024px]:[&&]:pr-[22px] min-[1024px]:[&&]:pb-[0]
      min-[1024px]:[&&]:pl-[22px]
    `}>
    {navigation ?? <SettingsNavigation />}
    <div className={`
      workspace-doc-reader workspace-settings-main [&&]:grid [&&]:[grid-template-columns:minmax(0,_1fr)]
      [&&]:[grid-template-rows:auto_minmax(0,_1fr)] [&&]:min-w-[0] [&&]:min-h-[0] [&&]:overflow-hidden
      [&&_a:focus-visible]:rounded-[4px] [&&_a:focus-visible]:[outline:2px_solid_var(--ring)]
      [&&_a:focus-visible]:[outline-offset:-2px]
      @min-[1050px]/documentation:[&&[data-has-contents='true']]:[grid-template-columns:minmax(0,_1fr)_198px]
      @min-[1050px]/documentation:[&&[data-has-contents='true']]:gap-x-[48px] [&&]:h-[100%]
    `}>
      <header className={`
      workspace-doc-header workspace-settings-header [&&]:[grid-column:1_/_-1] [&&]:relative [&&]:z-[1] [&&]:pb-[20px]
      [&&]:[background:var(--card)] [.workspace-page[data-workspace-view='documentation']_&&_h1]:mt-[0]
      [.workspace-page[data-workspace-view='documentation']_&&_h1]:mr-[0]
      [.workspace-page[data-workspace-view='documentation']_&&_h1]:mb-[0]
      [.workspace-page[data-workspace-view='documentation']_&&_h1]:ml-[0]
      [.workspace-page[data-workspace-view='documentation']_&&_h1]:text-[length:28px]
      [.workspace-page[data-workspace-view='documentation']_&&_h1]:leading-[38px]
      [.workspace-page[data-workspace-view='documentation']_&&_h1]:font-[650]
      [.workspace-page[data-workspace-view='documentation']_&&_h1]:tracking-[-.035em] [&&_p]:mt-[10px]
      [&&_p]:text-[color:var(--muted-foreground)] [&&_p]:text-[length:14px] [&&_p]:leading-[22px]
      [&&_p]:[overflow-wrap:anywhere]
      @min-[760px]/documentation:[.workspace-page[data-workspace-view='documentation']_&&_h1]:text-[length:32px]
      @min-[1050px]/documentation:[&&_p]:max-w-[720px] [.workspace-page[data-workspace-layout='account']_&&_h1]:mt-[0]
      [.workspace-page[data-workspace-layout='account']_&&_h1]:mr-[0]
      [.workspace-page[data-workspace-layout='account']_&&_h1]:mb-[0]
      [.workspace-page[data-workspace-layout='account']_&&_h1]:ml-[0]
      [.workspace-page[data-workspace-layout='account']_&&_h1]:text-[length:28px]
      [.workspace-page[data-workspace-layout='account']_&&_h1]:leading-[38px]
      [.workspace-page[data-workspace-layout='account']_&&_h1]:font-[650]
      [.workspace-page[data-workspace-layout='account']_&&_h1]:tracking-[-.035em]
      @min-[760px]/documentation:[.workspace-page[data-workspace-layout='account']_&&_h1]:text-[length:32px]
      min-[1024px]:[.workspace-page[data-workspace-layout='account']_&&_h1]:text-[length:32px]
    `}>
        <h1>{title}</h1>
        <p>{description}</p>
      </header>
      <div key={pathname} className={`
      workspace-doc-article workspace-settings-content [&&]:min-w-[0] [&&]:min-h-[0] [&&]:overflow-y-auto
      [&&]:overscroll-contain [&&]:[scroll-padding-top:8px] [&&]:pt-[2px] [&&]:pr-[2px] [&&]:pb-[36px] [&&]:pl-[2px]
      [&&]:[overflow-wrap:anywhere] [&&]:text-[color:var(--muted-foreground)] [&&]:text-[length:14px] [&&]:leading-[23px]
      [&&:focus-visible]:[outline:2px_solid_var(--ring)] [&&:focus-visible]:[outline-offset:-2px] [&&_>_*_+_*]:mt-[28px]
      [&&_section_>_*_+_*]:mt-[16px] [&&_:is(h2,_h3)]:text-[color:var(--foreground)] [&&_:is(h2,_h3)]:text-[length:13px]
      [&&_:is(h2,_h3)]:leading-[20px] [&&_:is(h2,_h3)]:font-[600] [&&_:is(h2,_h3)]:tracking-[-.01em]
      [&&_:is(h2,_h3)]:[scroll-margin-top:8px] [&&_>_section:first-child_>_h2]:text-[length:20px]
      [&&_>_section:first-child_>_h2]:leading-[28px] [&&_>_section:first-child_>_h2]:tracking-[-.025em]
      [&&_[id]:focus-visible]:rounded-[4px] [&&_[id]:focus-visible]:[outline:2px_solid_var(--ring)]
      [&&_[id]:focus-visible]:[outline-offset:-2px] [&&_:is(ul,_ol)]:pl-[18px] [&&_li_+_li]:mt-[6px]
      [&&_strong]:text-[color:var(--foreground)] [&&_strong]:font-[600] [&&_table]:block [&&_table]:max-w-[100%]
      [&&_table]:overflow-x-auto [&&_table]:[border-collapse:collapse] [&&_table]:text-[length:13px]
      [&&_table]:leading-[19px] [&&_:is(th,_td)]:pt-[7px] [&&_:is(th,_td)]:pr-[10px] [&&_:is(th,_td)]:pb-[7px]
      [&&_:is(th,_td)]:pl-[10px] [&&_:is(th,_td)]:[border:1px_solid_var(--border)] [&&_:is(th,_td)]:text-left
      [&&_th]:text-[color:var(--foreground)] [&&_th]:font-[600] [&&_pre]:max-w-[100%] [&&_pre]:overflow-x-auto
      [&&_pre]:pt-[12px] [&&_pre]:pr-[12px] [&&_pre]:pb-[12px] [&&_pre]:pl-[12px] [&&_pre]:[border:1px_solid_var(--border)]
      [&&_pre]:rounded-[8px] [&&_pre]:[background:var(--background)] [&&_pre]:text-[length:12px] [&&_blockquote]:ml-[0]
      [&&_blockquote]:mr-[0] [&&_blockquote]:pt-[10px] [&&_blockquote]:pr-[12px] [&&_blockquote]:pb-[10px]
      [&&_blockquote]:pl-[12px] [&&_blockquote]:[border:1px_solid_var(--border)] [&&_blockquote]:rounded-[8px]
      [&&_blockquote]:[background:var(--background)] [&&_blockquote]:text-[length:13px] [&&_blockquote]:leading-[21px]
      [&&]:[grid-column:1] [&&]:[grid-row:2]
    `} tabIndex={0} role="region" aria-label={regionLabel}>
        <div className={`
      workspace-settings-inner [&&]:w-[100%] [&&]:max-w-[720px] [&&]:min-w-[0] [&&]:mt-[0] [&&]:mr-[0] [&&]:mb-[0]
      [&&]:ml-[0] [&&]:[overflow-wrap:anywhere] [&&_:is(h1,_h2,_h3)]:text-[color:var(--foreground)]
      [&&_:is(h1,_h2,_h3)]:text-[length:13px] [&&_:is(h1,_h2,_h3)]:leading-[20px] [&&_:is(h1,_h2,_h3)]:font-[600]
      [&&_:is(h1,_h2,_h3)]:tracking-[-.01em] [.workspace-page[data-workspace-layout='account']_&&_h1]:text-[length:20px]
      [.workspace-page[data-workspace-layout='account']_&&_h1]:leading-[28px]
      [.workspace-page[data-workspace-layout='account']_&&_h1]:font-[600]
      [.workspace-page[data-workspace-layout='account']_&&_h1]:tracking-[-.025em] [&&_p]:text-[length:13px]
      [&&_p]:leading-[21px] [&&_.text-body-sm]:text-[length:13px] [&&_.text-body-sm]:leading-[21px]
      [&&_.text-caption]:text-[length:11px] [&&_.text-caption]:leading-[17px] [&&_label]:text-[color:var(--foreground)]
      [&&_label]:text-[length:11px] [&&_label]:leading-[17px] [&&_:is(form,_fieldset)]:min-w-[0]
      [&&_:is(form,_fieldset)]:max-w-[100%] [&&_:is(.sceenyk-card,_.workspace-settings-card)]:min-w-[0]
      [&&_:is(.sceenyk-card,_.workspace-settings-card)]:pt-[14px] [&&_:is(.sceenyk-card,_.workspace-settings-card)]:pr-[14px]
      [&&_:is(.sceenyk-card,_.workspace-settings-card)]:pb-[14px] [&&_:is(.sceenyk-card,_.workspace-settings-card)]:pl-[14px]
      [&&_:is(.sceenyk-card,_.workspace-settings-card)]:[border:1px_solid_var(--border)]
      [&&_:is(.sceenyk-card,_.workspace-settings-card)]:rounded-[12px]
      [&&_:is(.sceenyk-card,_.workspace-settings-card)]:[background:var(--card)]
      [&&_:is(.sceenyk-card,_.workspace-settings-card)]:[box-shadow:none]
      [&&_:is(.sceenyk-field,_.sceenyk-input,_input:not([type='radio']):not([type='checkbox']),_select)]:min-w-[0]
      [&&_:is(.sceenyk-field,_.sceenyk-input,_input:not([type='radio']):not([type='checkbox']),_select)]:max-w-[100%]
      [&&_:is(.sceenyk-field,_.sceenyk-input,_input:not([type='radio']):not([type='checkbox']),_select)]:min-h-[36px]
      [&&_:is(.sceenyk-field,_.sceenyk-input,_input:not([type='radio']):not([type='checkbox']),_select)]:h-[36px]
      [&&_:is(.sceenyk-field,_.sceenyk-input,_input:not([type='radio']):not([type='checkbox']),_select)]:pt-[6px]
      [&&_:is(.sceenyk-field,_.sceenyk-input,_input:not([type='radio']):not([type='checkbox']),_select)]:pr-[8px]
      [&&_:is(.sceenyk-field,_.sceenyk-input,_input:not([type='radio']):not([type='checkbox']),_select)]:pb-[6px]
      [&&_:is(.sceenyk-field,_.sceenyk-input,_input:not([type='radio']):not([type='checkbox']),_select)]:pl-[8px]
      [&&_:is(.sceenyk-field,_.sceenyk-input,_input:not([type='radio']):not([type='checkbox']),_select)]:rounded-[7px]
      [&&_:is(.sceenyk-field,_.sceenyk-input,_input:not([type='radio']):not([type='checkbox']),_select)]:text-[color:var(--foreground)]
      [&&_:is(.sceenyk-field,_.sceenyk-input,_input:not([type='radio']):not([type='checkbox']),_select)]:text-[length:12px]
      [&&_input[type='file']]:h-[auto] [&&_input[type='file']]:min-h-[36px] [&&_input[type='file']]:max-w-[100%]
      [&&_input:is([type='radio'],_[type='checkbox'])]:w-[16px] [&&_input:is([type='radio'],_[type='checkbox'])]:h-[16px]
      [&&_[data-slot='button']]:max-w-[100%] [&&_[data-slot='button']]:h-[auto] [&&_[data-slot='button']]:min-h-[28px]
      [&&_[data-slot='button']]:pt-[4px] [&&_[data-slot='button']]:pr-[8px] [&&_[data-slot='button']]:pb-[4px]
      [&&_[data-slot='button']]:pl-[8px] [&&_[data-slot='button']]:rounded-[6px] [&&_[data-slot='button']]:text-[length:11px]
      [&&_[data-slot='button']]:leading-[18px] [&&_[data-slot='button']]:whitespace-normal
      [&&_[data-slot='button']_svg]:w-[14px] [&&_[data-slot='button']_svg]:h-[14px] [&&_dl_dd]:text-[length:13px]
      [&&_dl_dd]:leading-[20px] [@media_(pointer:_coarse)]:[&&_[data-slot='button']]:min-h-[44px]
      [@media_(pointer:_coarse)]:[&&_:is(.sceenyk-field,_.sceenyk-input,_input:not([type='radio']):not([type='checkbox']),_select)]:min-h-[44px]
    `}>{children}</div>
      </div>
    </div>
  </div>;
}
