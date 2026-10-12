// Run after npm run build. Print counts only, never secret values or matches.
import fs from "node:fs";
import path from "node:path";
import nextEnv from "@next/env";

nextEnv.loadEnvConfig(process.cwd(), false, { info() {}, error() {} });
const names = [
  "ELEVENLABS_API_KEY",
  "WORKER_SHARED_SECRET",
  "MEDIA_PREPARATION_WORKER_TOKEN",
  "FAL_KEY",
  "RUNWAYML_API_SECRET",
  "GEMINI_API_KEY",
  "CLERK_SECRET_KEY",
  "SUPABASE_SECRET_KEY",
  "SUPABASE_SERVICE_ROLE_KEY",
  "R2_ACCESS_KEY_ID",
  "R2_SECRET_ACCESS_KEY",
  "INNGEST_EVENT_KEY",
  "INNGEST_SIGNING_KEY",
  "INNGEST_SIGNING_KEY_FALLBACK",
];
const secrets = names.map((name) => process.env[name]).filter(Boolean);
const markers =
  /GEMINI_API_KEY|generativelanguage\.googleapis\.com|begin_generation_analysis|finish_generation_analysis|SUPABASE_SECRET_KEY|SUPABASE_SERVICE_ROLE_KEY|INNGEST_EVENT_KEY|INNGEST_SIGNING_KEY|SCEENYK_TEST_PRICING_JSON|issue_generation_quote|confirm_generation_quote|reserve_generation_dispatch|claim_generation_job|admit_generation|complete_generation_with_result|trustedGenerationCost|WORKFLOW_NOT_CONFIGURED|GENERATION_UNAVAILABLE_OR_INVALID/;
let files = 0,
  leaks = 0,
  serverMarkers = 0;
function visit(dir) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const file = path.join(dir, entry.name);
    if (entry.isDirectory()) visit(file);
    else if (/\.(js|map)$/.test(file)) {
      files++;
      const body = fs.readFileSync(file, "utf8");
      if (secrets.some((secret) => body.includes(secret))) leaks++;
      if (markers.test(body) || /composition_asset_ref|claim_composition_generation|record_composition_asset_check|finish_composition_generation|ELEVENLABS_API_KEY|api\.elevenlabs\.io|begin_narration_submission|complete_narration_segment|WORKER_SHARED_SECRET|MEDIA_WORKER_URL|MEDIA_PREPARATION_WORKER_TOKEN|reserve_source_segment|complete_source_segment|FAL_KEY|queue\.fal\.run|RUNWAYML_API_SECRET|api\.dev\.runwayml\.com|begin_visual_submission|record_visual_task/.test(body)) serverMarkers++;
    }
  }
}
visit(".next/static");
console.log(
  JSON.stringify({
    clientFilesScanned: files,
    configuredSecretsChecked: secrets.length,
    secretLeaks: leaks,
    serverMarkers,
    cloudWorkflowKeysConfigured: Boolean(
      process.env.INNGEST_EVENT_KEY && process.env.INNGEST_SIGNING_KEY,
    ),
  }),
);
if (!files || leaks || serverMarkers) process.exitCode = 1;
