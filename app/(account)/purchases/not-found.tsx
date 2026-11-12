import Link from "next/link";
import { ShoppingBag } from "lucide-react";
import { EmptyState } from "@/components/empty-state";
import { Button } from "@/components/ui/button";

export default function PurchaseNotFound() {
  return <EmptyState icon={<ShoppingBag className="size-7" />} title="Purchase unavailable" description="Open a template from your own purchases."
    primaryAction={<Button nativeButton={false} render={<Link href="/purchases" />}>Your purchases</Button>} />;
}
