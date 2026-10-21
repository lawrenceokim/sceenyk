import { useId } from "react";
import { Sparkles, UserRound } from "lucide-react";
import type { CreationType } from "@/lib/projects/options";
import { Select } from "@/components/ui/select";

export function CategorySelector({ selected, onChange }: {
  selected: CreationType;
  onChange: (value: CreationType) => void;
}) {
  const id = useId();
  const Icon = selected === "ugc" ? UserRound : Sparkles;
  return <section className="min-w-0" aria-labelledby={id + "-heading"}>
    <h3 id={id + "-heading"} className="mb-2 text-[11px] font-medium uppercase tracking-wide text-muted-foreground">Creation type</h3>
    <div className="relative">
      <Icon className="pointer-events-none absolute top-1/2 left-2 z-10 size-4 -translate-y-1/2 text-muted-foreground" aria-hidden="true" />
      <Select id={id} aria-labelledby={id + "-heading"} name="creation-type" value={selected}
        options={[{ value: "ugc", label: "UGC" }, { value: "freestyle", label: "Freestyle" }]}
        onValueChange={onChange} className="pl-8" />
    </div>
  </section>;
}
