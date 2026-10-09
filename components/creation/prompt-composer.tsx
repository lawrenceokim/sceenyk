import { Sparkles } from "lucide-react";
import { Button } from "@/components/ui/button";
import type { CreationCategory } from "./creation-options";

export function PromptComposer({
  prompt,
  category,
  onChange,
}: {
  prompt: string;
  category: CreationCategory;
  onChange: (value: string) => void;
}) {
  return (
    <section
      className="sceenyk-card p-5 sm:p-6"
      aria-labelledby="prompt-heading"
    >
      <h2
        id="prompt-heading"
        className="flex items-center gap-3 text-lg font-semibold tracking-tight"
      >
        <span className="font-mono text-caption text-link">02</span>Describe
        your scene
      </h2>
      <label
        htmlFor="creation-prompt"
        className="mt-5 block text-body-sm font-medium"
      >
        Your creative direction
      </label>
      <textarea
        id="creation-prompt"
        name="prompt"
        value={prompt}
        onChange={(event) => onChange(event.target.value)}
        rows={6}
        placeholder="Describe what you want Sceenyk to create..."
        aria-describedby="prompt-help prompt-count"
        className="sceenyk-field mt-2 min-h-44 resize-y text-body"
      />
      <div className="mt-2 flex flex-wrap justify-between gap-2 text-caption text-muted-foreground">
        <p id="prompt-help">
          Think subject, mood, movement, and the story you want to tell.
        </p>
        <span id="prompt-count">
          {prompt.length.toLocaleString()} characters
        </span>
      </div>
      <div className="mt-5 border-t border-border pt-4">
        <p className="mb-2 text-caption font-medium text-muted-foreground">
          NEED A FIRST SPARK?
        </p>
        <Button
          type="button"
          variant="ghost"
          onClick={() => onChange(category.example)}
          className="h-auto min-h-11 w-full justify-start gap-3 whitespace-normal px-3 py-3 text-left font-normal"
        >
          <Sparkles className="size-4 shrink-0 text-link" aria-hidden="true" />
          <span>{category.example}</span>
        </Button>
      </div>
    </section>
  );
}
