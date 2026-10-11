// Run after npm run build. Print counts only, never secret values or matches.
import fs from "node:fs";
import path from "node:path";
import nextEnv from "@next/env";

nextEnv.loadEnvConfig(process.cwd(), false, { info() {}, error() {} });
const names = [
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
  /SUPABASE_SECRET_KEY|SUPABASE_SERVICE_ROLE_KEY|INNGEST_EVENT_KEY|INNGEST_SIGNING_KEY|SCEENYK_TEST_PRICING_JSON|issue_generation_quote|confirm_generation_quote|reserve_generation_dispatch|claim_generation_job|admit_generation|complete_generation_with_result|trustedGenerationCost|WORKFLOW_NOT_CONFIGURED|GENERATION_UNAVAILABLE_OR_INVALID/;
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
      if (markers.test(body)) serverMarkers++;
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
