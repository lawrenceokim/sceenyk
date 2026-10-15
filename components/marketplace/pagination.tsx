import Link from "next/link";
import { Button } from "@/components/ui/button";

export function MarketplacePagination({ page, total, pageSize, href, itemLabel = "listing" }: { page: number; total: number; pageSize: number; href: (page: number) => string; itemLabel?: string }) {
  const pages = Math.max(1, Math.ceil(total / pageSize));
  return <nav aria-label={`${itemLabel} pages`} className="flex flex-wrap items-center justify-center gap-4 pt-4">
    {page > 1 && <Button variant="outline" nativeButton={false} render={<Link href={href(page - 1)} />}>Previous</Button>}
    <span className="text-body-sm text-muted-foreground">Page {page} · {total} {total === 1 ? itemLabel : `${itemLabel}s`}</span>
    {page < pages && <Button variant="outline" nativeButton={false} render={<Link href={href(page + 1)} />}>Next</Button>}
  </nav>;
}
