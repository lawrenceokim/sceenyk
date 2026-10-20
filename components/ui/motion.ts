// Shared Base UI presence transitions. Keep these strings static for Tailwind.
export const popupMotion = "origin-[var(--transform-origin)] transition-[opacity,transform,translate,scale] duration-[var(--motion-popover)] ease-[var(--motion-ease)] data-starting-style:opacity-0 data-starting-style:translate-y-1 data-starting-style:scale-[0.98] data-ending-style:opacity-0 data-ending-style:translate-y-1 data-ending-style:scale-[0.98] motion-reduce:transition-none motion-reduce:translate-none! motion-reduce:scale-100!";

export const backdropMotion = "transition-opacity duration-[var(--motion-modal)] ease-[var(--motion-ease)] data-starting-style:opacity-0 data-ending-style:opacity-0 motion-reduce:transition-none";
