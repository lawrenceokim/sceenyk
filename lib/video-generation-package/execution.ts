import "server-only";
import { validateExecutableStoryboard } from "@/lib/storyboard/validation";
import { storyboardBinding } from "@/lib/storyboard/contract";
import { finalPreflight } from "@/lib/final-video-generation/preflight";
import { finalConfiguration } from "@/lib/final-video-generation/config";
import { finalProviders } from "@/lib/final-video-generation/adapters/registry";
import { FinalPreflightError } from "@/lib/final-video-generation/capabilities";
import { buildVideoGenerationPackage, validatePackageInput } from "./builder";

// No provider requests. M9 validates creative executability independently of
// sufficient spending authority; insufficient funding still blocks M10 only.
export function assertPackageExecutable(value: unknown, revision: number) {
  const input = validatePackageInput(value);
  validateExecutableStoryboard(input.storyboard.document, storyboardBinding(input.source));
  const doc = buildVideoGenerationPackage(input, revision);
  const plan = finalPreflight(doc, finalConfiguration().value, finalProviders());
  const creative = plan.diagnostics.filter(issue => issue.layer !== "funding");
  if (creative.length) throw new FinalPreflightError(creative);
  return doc;
}
