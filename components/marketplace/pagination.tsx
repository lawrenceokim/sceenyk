import Link from "next/link";
import { Button } from "@/components/ui/button";

export function MarketplacePagination({ page, total, pageSize, href }: { page: number; total: number; pageSize: number; href: (page: number) => string }) {
  const pages = Math.max(1, Math.ceil(total / pageSize));
  return <nav aria-label="Listing pages" className="flex flex-wrap items-center justify-center gap-4 pt-4">
    {page > 1 && <Button variant="outline" nativeButton={false} render={<Link href={href(page - 1)} />}>Previous</Button>}
    <span className="text-body-sm text-muted-foreground">Page {page} · {total} {total === 1 ? "listing" : "listings"}</span>
    {page < pages && <Button variant="outline" nativeButton={false} render={<Link href={href(page + 1)} />}>Next</Button>}
  </nav>;
}
