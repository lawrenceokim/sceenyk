import Image from "next/image";
import { cn } from "@/lib/utils";
import fullLight from "@/designs/sceenyk logo lightmode.png";
import fullDark from "@/designs/sceenyk logo darkmode.png";
import compactLight from "@/designs/sceenyk small-logo lightmode.png";
import compactDark from "@/designs/sceenyk small-logo darkmode.png";

type LogoVariant = "full" | "compact" | "responsive";

export function SceenykLogo({
  variant = "responsive",
  className,
  decorative = false,
}: {
  variant?: LogoVariant;
  className?: string;
  decorative?: boolean;
}) {
  const alt = decorative ? "" : "Sceenyk";
  return (
    <span className={cn("inline-flex shrink-0 items-center", className)}>
      {variant !== "compact" && (
        <span className={variant === "responsive" ? "hidden lg:block" : "block"}>
          <Image src={fullLight} alt={alt} sizes="176px" className="h-auto w-44 max-w-full dark:hidden" />
          <Image src={fullDark} alt={alt} sizes="176px" className="hidden h-auto w-44 max-w-full dark:block" />
        </span>
      )}
      {variant !== "full" && (
        <span className={variant === "responsive" ? "block lg:hidden" : "block"}>
          <Image src={compactLight} alt={alt} sizes="44px" className="h-auto w-11 max-w-full dark:hidden" />
          <Image src={compactDark} alt={alt} sizes="44px" className="hidden h-auto w-11 max-w-full dark:block" />
        </span>
      )}
    </span>
  );
}
