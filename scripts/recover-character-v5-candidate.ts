import { loadEnvConfig } from "@next/env";
import { z } from "zod";

async function main() {
  const args = process.argv.slice(2);
  if (args.length !== 4 || args[0] !== "--job" || args[2] !== "--candidate" || !z.uuid().safeParse(args[1]).success || !z.uuid().safeParse(args[3]).success) {
    throw new Error("USE_EXPLICIT_JOB_AND_CANDIDATE_UUIDS");
  }
  loadEnvConfig(process.cwd(), true, { info() {}, error() {} });
  const { recoverCharacterV5Candidate } = await import("../lib/character-v5/recovery");
  console.info("UGC_CHARACTER_V5_RECOVERY", JSON.stringify(await recoverCharacterV5Candidate({ jobId: args[1], candidateId: args[3] }, AbortSignal.timeout(180_000))));
}
main().catch(async error => {
  const { CharacterV5Error } = await import("../lib/character-v5/contract");
  const { logV5Failure } = await import("../lib/character-v5/database-diagnostics");
  if (error instanceof CharacterV5Error) logV5Failure(error);
  else console.error("UGC_CHARACTER_V5_RECOVERY_UNAVAILABLE: verify explicit UUIDs, configuration and database setup.");
  process.exitCode = 1;
});
