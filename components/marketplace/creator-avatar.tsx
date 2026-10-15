import Image from "next/image";

export function CreatorAvatar({ name, url, large = false }: { name: string; url: string | null; large?: boolean }) {
  return <span className={`relative flex shrink-0 items-center justify-center overflow-hidden rounded-full bg-accent font-semibold text-accent-foreground ${large ? "size-24 text-3xl" : "size-9 text-sm"}`}>
    {url ? <Image src={url} width={large ? 96 : 36} height={large ? 96 : 36} alt="" unoptimized className="size-full object-cover" /> : <span aria-hidden="true">{name.slice(0, 1).toUpperCase()}</span>}
  </span>;
}
