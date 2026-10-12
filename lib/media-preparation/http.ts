import "server-only";
import { createServer, type IncomingMessage } from "node:http";
import { verifyWorkerRequest, workerSignatureHeader, workerTimestampHeader, workerNonceHeader } from "./auth";
import type { WorkerRequestRegistration } from "./replay";
import { workerPreparationRequest } from "./context";
import { PreparationError } from "./contract";

function requestBody(request: IncomingMessage) {
  return new Promise<Buffer | null>((resolve, reject) => {
    const chunks: Buffer[] = [];
    let length = 0;
    const receive = (chunk: Buffer) => {
      length += chunk.length;
      if (length > 4096) {
        request.off("data", receive);
        request.resume();
        resolve(null);
      } else chunks.push(chunk);
    };
    request.on("data", receive);
    request.once("end", () => resolve(Buffer.concat(chunks)));
    request.once("error", reject);
    request.once("aborted", () => reject(new Error("INVALID_REQUEST")));
  });
}

// Production supplies the existing processor; tests exercise this HTTP boundary
// without invoking paid providers or hosted writes.
export function createPreparationServer(secret: string, execute: (input: unknown) => Promise<{ ready: boolean }>, register: (nonce: string, timestamp: string) => Promise<WorkerRequestRegistration>, narrate?: (input: unknown) => Promise<{ ready: boolean }>) {
  let active = 0;
  let draining = false;
  const server = createServer(async (request, response) => {
    const reply = (status: number, body: object) => {
      if (!request.complete) {
        response.setHeader("Connection", "close");
        request.resume();
      }
      response.writeHead(status, { "Content-Type": "application/json", "Cache-Control": "no-store", "X-Content-Type-Options": "nosniff" });
      response.end(JSON.stringify(body));
    };
    if (request.method === "GET" && request.url === "/health") {
      reply(draining ? 503 : 200, { ok: !draining });
      return;
    }
    // No browser session, CORS permission or bearer-token fallback. A captured
    // signed request is also refused when sent from a browser origin.
    const timestamp = request.headers[workerTimestampHeader];
    const signature = request.headers[workerSignatureHeader];
    const nonce = request.headers[workerNonceHeader];
    if (request.method !== "POST" || !(request.url === "/prepare" || request.url === "/narrate" && narrate) || request.headers.origin !== undefined || request.headers["sec-fetch-site"] !== undefined || typeof timestamp !== "string" || typeof signature !== "string" || typeof nonce !== "string") {
      reply(401, { code: "UNAUTHORIZED" });
      return;
    }
    if (draining || active >= 2) { reply(503, { code: "PREPARATION_BUSY" }); return; }
    active++;
    const bodyDeadline = setTimeout(() => request.destroy(), 10_000);
    try {
      const body = await requestBody(request);
      clearTimeout(bodyDeadline);
      if (!body) {
        response.setHeader("Connection", "close");
        reply(413, { code: "INVALID_REQUEST" });
        return;
      }
      if (!verifyWorkerRequest(secret, request.method, request.url, timestamp, nonce, signature, body)) {
        reply(401, { code: "UNAUTHORIZED" });
        return;
      }
      if (request.headers["content-type"] !== "application/json") { reply(400, { code: "INVALID_REQUEST" }); return; }
      const parsed = workerPreparationRequest.safeParse(JSON.parse(body.toString("utf8")));
      if (!parsed.success) { reply(400, { code: "INVALID_REQUEST" }); return; }
      // Commit the nonce before any side effect. Outages fail closed. A lost
      // response requires a newly signed retry, never reuse of this nonce.
      const registration = await register(nonce, timestamp);
      if (registration === "replay") { reply(409, { code: "REPLAY_DETECTED" }); return; }
      if (registration !== "accepted") { reply(401, { code: "UNAUTHORIZED" }); return; }
      reply(200, await (request.url === "/narrate" && narrate ? narrate : execute)(parsed.data));
    } catch (error) {
      const unavailable = error instanceof PreparationError && !error.temporary;
      reply(error instanceof SyntaxError ? 400 : unavailable ? 403 : 503, { code: error instanceof SyntaxError ? "INVALID_REQUEST" : unavailable ? "SOURCE_UNAVAILABLE" : "PREPARATION_UNAVAILABLE" });
    } finally {
      clearTimeout(bodyDeadline);
      active--;
    }
  });
  server.requestTimeout = 250_000;
  server.headersTimeout = 10_000;
  return { server, drain: () => { draining = true; server.close(); } };
}
