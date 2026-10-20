"use client";

import { useRef, useState, type ComponentPropsWithoutRef } from "react";
import { Select as SelectPrimitive } from "@base-ui/react/select";
import { Check, ChevronDown } from "lucide-react";
import { cn } from "@/lib/utils";
import { popupMotion } from "./motion";

export interface SelectOption<T extends string> {
  value: T;
  label: string;
  group?: string;
  disabled?: boolean;
}

type SelectProps<T extends string> = Pick<ComponentPropsWithoutRef<typeof SelectPrimitive.Trigger>,
  "id" | "className" | "aria-label" | "aria-labelledby" | "aria-describedby" | "aria-invalid"
> & {
  options: readonly SelectOption<T>[];
  value?: T;
  defaultValue?: T;
  onValueChange?: (value: T) => void;
  name?: string;
  form?: string;
  disabled?: boolean;
  required?: boolean;
};

// One compact, theme-aware select for client state and ordinary named forms.
// Base UI owns keyboard/typeahead, focus, dismissal and presence transitions.
export function Select<T extends string>({
  options, value, defaultValue, onValueChange, name, form, disabled, required,
  className, ...triggerProps
}: SelectProps<T>) {
  const trigger = useRef<HTMLButtonElement>(null);
  const [portalContainer, setPortalContainer] = useState<HTMLDialogElement | null>(null);
  const groups = [...new Set(options.map(option => option.group))];
  const renderOption = (option: SelectOption<T>) => (
    <SelectPrimitive.Item key={option.value} value={option.value} disabled={option.disabled}
      className="flex min-h-7 cursor-pointer items-center justify-between gap-2 rounded-md px-2 py-1 text-xs leading-4 outline-none transition-colors duration-[var(--motion-micro)] ease-[var(--motion-ease)] data-selected:bg-muted data-highlighted:bg-muted data-disabled:cursor-not-allowed data-disabled:opacity-50 motion-reduce:transition-none [@media(pointer:coarse)]:min-h-11">
      <SelectPrimitive.ItemText className="min-w-0 flex-1 truncate">{option.label}</SelectPrimitive.ItemText>
      <span className="flex size-3.5 shrink-0 items-center justify-center">
        <SelectPrimitive.ItemIndicator><Check className="size-3.5" aria-hidden="true" /></SelectPrimitive.ItemIndicator>
      </span>
    </SelectPrimitive.Item>
  );

  return <SelectPrimitive.Root<T> value={value} defaultValue={defaultValue ?? (value === undefined ? options[0]?.value : undefined)}
    items={options} name={name} form={form} disabled={disabled} required={required}
    onValueChange={next => { if (next !== null && options.some(option => option.value === next)) onValueChange?.(next); }}
    onOpenChange={open => {
      // A body portal would sit behind a native modal's top layer and become inert.
      if (open) setPortalContainer(trigger.current?.closest<HTMLDialogElement>("dialog[open]") ?? null);
    }}>
    <SelectPrimitive.Trigger ref={trigger} data-slot="select-trigger" {...triggerProps}
      className={cn("flex h-8 w-full min-w-0 cursor-pointer items-center justify-between gap-2 rounded-lg border border-input bg-field px-2 text-left text-xs font-medium text-foreground outline-none transition-[background-color,border-color,box-shadow] duration-[var(--motion-micro)] ease-[var(--motion-ease)] hover:bg-muted focus-visible:border-ring focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring disabled:cursor-not-allowed disabled:opacity-50 aria-invalid:border-destructive motion-reduce:transition-none [@media(pointer:coarse)]:h-11", className)}>
      <SelectPrimitive.Value className="min-w-0 flex-1 truncate" />
      <SelectPrimitive.Icon><ChevronDown className="size-3.5 shrink-0 text-muted-foreground" aria-hidden="true" /></SelectPrimitive.Icon>
    </SelectPrimitive.Trigger>
    {/* Explicit null tells Base UI to wait; undefined uses its normal portal. */}
    <SelectPrimitive.Portal container={portalContainer ?? undefined}>
      <SelectPrimitive.Positioner side="bottom" align="start" sideOffset={4} collisionPadding={8} positionMethod="fixed" className="z-[80]">
        <SelectPrimitive.Popup data-slot="select-content" data-lenis-prevent
          className={cn(popupMotion, "min-w-[var(--anchor-width)] max-w-[calc(100vw-1rem)] overflow-hidden rounded-lg border border-border bg-popover p-0.5 text-popover-foreground shadow-popover outline-none")}>
          <SelectPrimitive.List className="max-h-[min(20rem,calc(var(--available-height)-8px))] overflow-y-auto overscroll-contain">
            {groups.map(group => group === undefined
              ? options.filter(option => option.group === undefined).map(renderOption)
              : <SelectPrimitive.Group key={group}>
                <SelectPrimitive.GroupLabel className="px-2 pt-2 pb-1 text-[11px] font-medium text-muted-foreground">{group}</SelectPrimitive.GroupLabel>
                {options.filter(option => option.group === group).map(renderOption)}
              </SelectPrimitive.Group>)}
          </SelectPrimitive.List>
        </SelectPrimitive.Popup>
      </SelectPrimitive.Positioner>
    </SelectPrimitive.Portal>
  </SelectPrimitive.Root>;
}
