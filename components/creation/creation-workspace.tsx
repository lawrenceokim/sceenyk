"use client";

import { useState } from "react";
import { Sparkles } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { CategorySelector } from "./category-selector";
import { CreationPreview } from "./creation-preview";
import { GenerationSettings } from "./generation-settings";
import { MediaDropzone } from "./media-dropzone";
import { PromptComposer } from "./prompt-composer";
import {
  creationCategories,
  getMediaKind,
  type CategoryId,
  type CreationSettings,
  type LocalMedia,
} from "./creation-options";

function GenerateButton({ disabled }: { disabled: boolean }) {
  return (
    <div className="sceenyk-card flex flex-col gap-4 p-5 sm:flex-row sm:items-center sm:justify-between sm:p-6">
      <div>
        <p className="text-body-sm font-medium">Ready for the next scene?</p>
        <p
          id="generate-help"
          className="mt-1 text-caption text-muted-foreground"
        >
          Preview only. Generation isn’t connected yet.
        </p>
      </div>
      <Dialog>
        <DialogTrigger
          render={
            <Button
              type="button"
              size="lg"
              disabled={disabled}
              aria-describedby="generate-help"
              className="w-full sm:w-auto"
            />
          }
        >
          <Sparkles className="size-5" aria-hidden="true" />
          Generate
        </DialogTrigger>
        <DialogContent>
          <span className="flex size-12 items-center justify-center rounded-xl bg-accent text-accent-foreground">
            <Sparkles className="size-6" aria-hidden="true" />
          </span>
          <DialogTitle className="text-heading-3 font-semibold">
            Generation is coming soon
          </DialogTitle>
          <DialogDescription className="text-body leading-relaxed">
            This is a local workspace preview. You can explore your prompt,
            media, and settings, but no content will be generated or saved.
          </DialogDescription>
          <DialogClose render={<Button variant="outline" className="mt-2" />}>
            Keep creating your brief
          </DialogClose>
        </DialogContent>
      </Dialog>
    </div>
  );
}

export function CreationWorkspace() {
  const [selectedCategory, setSelectedCategory] =
    useState<CategoryId>("cinematic");
  const [prompt, setPrompt] = useState("");
  const [selectedFiles, setSelectedFiles] = useState<LocalMedia[]>([]);
  const [selectedFileId, setSelectedFileId] = useState<string | null>(null);
  const [mediaError, setMediaError] = useState("");
  const [settings, setSettings] = useState<CreationSettings>({
    aspectRatio: "16:9",
    duration: "10",
    visualStyle: "Original",
    tone: "Storytelling",
  });
  const category =
    creationCategories.find((item) => item.id === selectedCategory) ??
    creationCategories[2];
  const activeMedia =
    selectedFiles.find((media) => media.id === selectedFileId) ??
    selectedFiles[0];

  function addFiles(files: File[]) {
    const accepted: LocalMedia[] = [];
    const rejected: string[] = [];
    for (const file of files) {
      const kind = getMediaKind(file);
      if (!kind || file.size === 0) {
        rejected.push(file.name);
        continue;
      }
      accepted.push({ id: crypto.randomUUID(), file, kind });
    }
    setSelectedFiles((current) => {
      const updated = [...current];
      for (const media of accepted) {
        if (
          !updated.some(
            ({ file }) =>
              file.name === media.file.name &&
              file.size === media.file.size &&
              file.lastModified === media.file.lastModified &&
              file.type === media.file.type,
          )
        )
          updated.push(media);
      }
      return updated;
    });
    setMediaError(
      rejected.length
        ? `Couldn’t add ${rejected.join(", ")}. Choose a non-empty image, video, or audio file.`
        : "",
    );
  }

  function removeFile(id: string) {
    setSelectedFiles((files) => files.filter((media) => media.id !== id));
    if (selectedFileId === id) setSelectedFileId(null);
    setMediaError("");
  }

  return (
    <div className="grid items-start gap-6 lg:grid-cols-[minmax(0,1.5fr)_minmax(0,1fr)] lg:gap-8">
      <div className="min-w-0 space-y-6">
        <CategorySelector
          selected={selectedCategory}
          onChange={setSelectedCategory}
        />
        <PromptComposer
          prompt={prompt}
          category={category}
          onChange={setPrompt}
        />
        <MediaDropzone
          files={selectedFiles}
          selectedId={activeMedia?.id}
          error={mediaError}
          onAdd={addFiles}
          onSelect={setSelectedFileId}
          onRemove={removeFile}
        />
        <GenerationSettings settings={settings} onChange={setSettings} />
        <GenerateButton disabled={!prompt.trim()} />
      </div>
      <CreationPreview
        category={category}
        settings={settings}
        prompt={prompt}
        media={activeMedia}
      />
    </div>
  );
}
