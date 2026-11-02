type SheetStatus = {
  kind: string; activeSlot: boolean; current: boolean; approved: boolean;
  rejected: boolean; cleanupPending?: boolean;
};

// Product stays optional: only an uploaded Product source makes its sheet required.
export function locationReferenceFeedback(artifacts: SheetStatus[], sources: { character: boolean; product: boolean }): string | null {
  if (!sources.character) return "Add a Character image, then generate and approve its sheet to generate a Location.";
  const required = sources.product ? ["character", "product"] : ["character"];
  const sheets = required.map(kind => artifacts.find(a => a.kind === kind && a.activeSlot && !a.rejected));
  const missing = required.filter((_, index) => !sheets[index]);
  if (missing.length === 2) return "Create or generate a Character Sheet and Product Sheet first.";
  if (missing.length && sources.product) return `Generate the ${missing[0] === "character" ? "Character" : "Product"} Sheet first, then approve both references to generate a Location.`;
  if (missing.length) return "Create or generate a Character Sheet first.";
  if (sheets.some(a => !a?.current || !a.approved || a.cleanupPending)) return sources.product
    ? "Approve the Character Sheet and Product Sheet to generate a Location."
    : "Approve the Character Sheet to generate a Location.";
  return null;
}
