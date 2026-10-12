// Isolated Node worker. The Next.js/Inngest handler only calls its HTTP boundary.
import { createServer } from "node:http";
import { createHash, timingSafeEqual } from "node:crypto";
import { loadEnvConfig } from "@next/env";
import { executePreparation } from "../lib/media-preparation/processor";
import { preparationRequest } from "../lib/media-preparation/context";
import { PreparationError } from "../lib/media-preparation/contract";

loadEnvConfig(process.cwd(), false, { info() {}, error() {} });
const token = process.env.MEDIA_PREPARATION_WORKER_TOKEN?.trim();
if (!token || token.length < 32) throw new Error("WORKER_TOKEN_REQUIRED");
const fingerprint = (value: string) => createHash("sha256").update(value).digest();
const expected = fingerprint(`Bearer ${token}`);
let active = 0;
const server = createServer(async (request, response) => {
  const reply = (status: number, body: object) => { response.writeHead(status, { "Content-Type": "application/json", "Cache-Control": "no-store" }); response.end(JSON.stringify(body)); };
  if (request.method !== "POST" || request.url !== "/prepare" || !timingSafeEqual(fingerprint(request.headers.authorization ?? ""), expected)) { reply(401, { code: "UNAUTHORIZED" }); return; }
  if (active >= 2) { reply(503, { code: "PREPARATION_BUSY" }); return; }
  active++;
  try {
    const chunks: Buffer[] = []; let length = 0;
    for await (const chunk of request) { length += chunk.length; if (length > 4096) { reply(413, { code: "INVALID_REQUEST" }); return; } chunks.push(chunk); }
    const parsed = preparationRequest.safeParse(JSON.parse(Buffer.concat(chunks).toString("utf8")));
    if (!parsed.success) { reply(400, { code: "INVALID_REQUEST" }); return; }
    reply(200, await executePreparation(parsed.data));
  } catch (error) {
    const code = error instanceof PreparationError ? error.code : "PREPARATION_UNAVAILABLE";
    reply(error instanceof SyntaxError ? 400 : 503, { code });
  } finally { active--; }
});
server.requestTimeout = 250_000; server.headersTimeout = 10_000;
server.listen(Number(process.env.MEDIA_PREPARATION_WORKER_PORT ?? 3012), process.env.MEDIA_PREPARATION_WORKER_HOST ?? "127.0.0.1", () => console.log(JSON.stringify({ stage: "media_preparation_worker_ready" })));
