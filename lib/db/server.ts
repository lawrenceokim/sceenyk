import "server-only";
import { createClient } from "@supabase/supabase-js";
import { getDatabaseConfig } from "./config";
import type { Database } from "./types";

export function createDatabaseClient() {
  const { url, secretKey } = getDatabaseConfig();
  return createClient<Database>(url, secretKey, {
    auth: {
      persistSession: false,
      autoRefreshToken: false,
      detectSessionInUrl: false,
    },
    global: {
      fetch: (input, init) =>
        fetch(input, {
          ...init,
          cache: "no-store",
          signal: init?.signal ?? AbortSignal.timeout(10_000),
        }),
    },
  });
}
