// Select newly saved video once; signed URL refreshes must preserve later user choices.
export function newlyAvailableVideo(media: { id: string; kind: string }[], seen: Set<string>) {
  const added = media.filter(item => item.kind === "video" && !seen.has(item.id));
  for (const item of added) seen.add(item.id);
  return added.at(-1)?.id;
}
