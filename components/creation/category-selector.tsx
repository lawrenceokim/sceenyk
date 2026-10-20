import { useId } from "react";
import { UserRound } from "lucide-react";
import type { CategoryId } from "./creation-options";
import { Select } from "@/components/ui/select";

// UGC is the sole visible Studio type. Keep the existing brief category intact:
// saved projects, adopted templates and account defaults use the current enum.
export function CategorySelector({ selected }: { selected: CategoryId }) {
  const id = useId();
  return <section className="min-w-0" aria-labelledby={id + "-heading"}>
    <h3 id={id + "-heading"} className="mb-2 text-[11px] font-medium uppercase tracking-wide text-muted-foreground">Creation type</h3>
    <div className="relative">
      <UserRound className="pointer-events-none absolute top-1/2 left-2 z-10 size-4 -translate-y-1/2 text-muted-foreground" aria-hidden="true" />
      <Select id={id} aria-labelledby={id + "-heading"} name="creation-type" value={selected}
        options={[{ value: selected, label: "UGC" }]} className="pl-8" />
    </div>
  </section>;
}
