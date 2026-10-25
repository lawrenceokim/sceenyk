// Pure synthetic diagnostics only. No environment, database, storage or providers.
import assert from "node:assert/strict";
import { v5DatabaseDiagnostic } from "../lib/character-v5/database-diagnostics";

const context = { operation: "start_workflow", phase: "candidate_insertion", slot: "face", version: 1 } as const;
const secret = "PRIVATE_TEST_CREDENTIAL";
const unsafeUrl = `https://private.invalid/image?credential=${secret}`;
const diagnostic = v5DatabaseDiagnostic({ code: "42703", message: 'column "retryable" of relation "ugc_generation_jobs" does not exist',
  details: unsafeUrl, hint: secret, connectionString: secret }, context);
assert.equal(diagnostic.dbCode, "42703");
assert.equal(diagnostic.category, "database_schema");
assert.equal(diagnostic.table, "ugc_generation_jobs");
assert.equal(diagnostic.column, "retryable");
assert.equal(diagnostic.function, "ugc_character_v5_start");
assert.equal(diagnostic.slot, "face"); assert.equal(diagnostic.version, 1);
assert(!JSON.stringify(diagnostic).includes(secret));
const malformed = v5DatabaseDiagnostic({ code: unsafeUrl, message: unsafeUrl, details: secret }, context);
assert(!JSON.stringify(malformed).includes(secret)); assert(!malformed.dbCode);
assert.equal(v5DatabaseDiagnostic({ code: "23514", message: 'violates check constraint "ugc_character_v5_candidates_state_check"' }, context).constraint,
  "ugc_character_v5_candidates_state_check");
assert.equal(v5DatabaseDiagnostic({ code: "42501", message: secret }, context).category, "database_permission");
assert.equal(v5DatabaseDiagnostic({ code: "57014", message: secret }, context).category, "database_timeout");
assert.equal(v5DatabaseDiagnostic({ message: "TypeError: fetch failed" }, context).category, "database_transport");
assert.equal(v5DatabaseDiagnostic(null, context).category, "database_fence");
assert.equal(v5DatabaseDiagnostic({ code: "PGRST202", message: unsafeUrl }, context).category, "database_schema");
assert.equal(v5DatabaseDiagnostic({ code: "22P02", message: unsafeUrl }, context).category, "database_schema");
console.info(JSON.stringify({ checks: 17, scope: "pure safe diagnostic categories, identifiers and redaction", providerRequests: 0 }));
