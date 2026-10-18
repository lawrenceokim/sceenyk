import Link from "next/link";
export default function NotFound() {
  return <section className="sceenyk-container py-12"><div className="sceenyk-card space-y-4 p-6"><h1 className="text-2xl font-bold">Creator not found</h1><p className="text-muted-foreground">This public storefront is unavailable.</p><Link href="/marketplace" className="nav-link text-link">Browse Marketplace</Link></div></section>;
}
