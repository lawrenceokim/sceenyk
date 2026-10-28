// Configuration only. Never imports the runner, invokes RPCs or starts jobs.
import { loadEnvConfig } from "@next/env";
import { finalConfiguration } from "../lib/final-video-generation/config";
import { finalConfigurationDiagnostic } from "../lib/final-video-generation/configuration-diagnostics";
import { assertFinalProviderConfiguration } from "../lib/final-video-generation/adapters/registry";
import { getDatabaseConfig, DatabaseConfigurationError } from "../lib/db/config";

loadEnvConfig(process.cwd(), true, { info() {}, error() {} });
globalThis.fetch = async () => { throw new Error("NETWORK_FORBIDDEN_IN_CONFIGURATION_CHECK"); };
let phase = "database_configuration";
try {
  getDatabaseConfig(); // Parses local settings; performs no database request.
  phase = "final_video_configuration";
  const configured = finalConfiguration();
  phase = "final_video_provider_configuration";
  assertFinalProviderConfiguration(true); // Both keys for the full speech path; no API call.
  console.info("UGC_FINAL_VIDEO_CONFIGURATION_READY", { funding: configured.value.funding,
    limitsValidated: true, canonicalCeilingsValidated: true, fullPipelineCredentialsConfigured: true,
    databaseConnectionTested: false, providerAccessTested: false, workerStarted: false });
} catch (error) {
  console.error("UGC_FINAL_VIDEO_CONFIGURATION_FAILED", { phase,
    ...(finalConfigurationDiagnostic(error) ?? { reason: error instanceof DatabaseConfigurationError ? error.code : "configuration_unavailable" }) });
  process.exitCode = 1;
}
