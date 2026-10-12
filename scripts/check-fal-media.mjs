// Reopens actual completed private R2 outputs in a fresh Chrome process.
// No fal calls and no temporary capability is saved in the evidence artifact.
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { setTimeout as delay } from "node:timers/promises";
import nextEnv from "@next/env";
import { typescriptLoader } from "./lib/load-typescript.mjs";
nextEnv.loadEnvConfig(process.cwd(), false, { info() {}, error() {} });
const load = typescriptLoader(), db = load("lib/db/server.ts").createDatabaseClient();
const dir = fs.mkdtempSync(path.join(os.tmpdir(), "sceenyk-fal-media-"));
const chrome = spawn("C:/Program Files/Google/Chrome/Application/chrome.exe", ["--headless=new", "--disable-gpu", "--no-first-run", "--no-default-browser-check", "--remote-debugging-port=9342", "--user-data-dir=" + path.join(dir, "profile"), "about:blank"], { windowsHide: true, stdio: "ignore" });
let ws;
const evidence = [];
try {
  let tabs; for (let n = 0; n < 60; n++) { try { tabs = await (await fetch("http://127.0.0.1:9342/json")).json(); break; } catch { await delay(100); } }
  ws = new WebSocket(tabs.find(t => t.type === "page").webSocketDebuggerUrl);
  await new Promise((resolve, reject) => { ws.onopen = resolve; ws.onerror = reject; });
  let sequence = 0; const pending = new Map();
  ws.onmessage = e => { const m = JSON.parse(e.data); if (!m.id) return; const p = pending.get(m.id); pending.delete(m.id); if (m.error) p.reject(new Error(m.error.message)); else p.resolve(m.result); };
  const call = (method, params = {}) => new Promise((resolve, reject) => { const id = ++sequence; pending.set(id, { resolve, reject }); ws.send(JSON.stringify({ id, method, params })); });
  await call("Page.enable"); await call("Runtime.enable");
  for (const fixture of ["sceenyk-fal-acceptance.json", "sceenyk-fal-image-acceptance.json"]) {
    const state = JSON.parse(fs.readFileSync(path.join(os.tmpdir(), fixture), "utf8"));
    const scenes = await db.from("scene_executions").select("*").eq("job_id", state.jobId).order("scene_order"); assert.ok(!scenes.error);
    for (const scene of scenes.data.filter(s => s.provider_task_id)) {
      assert.equal(scene.status, "completed");
      const asset = await db.from("scene_assets").select("*").eq("id", scene.output_asset_id).single(); assert.ok(!asset.error);
      assert.equal(asset.data.owner_user_id, state.ownerId);
      const signed = await load("lib/storage/r2.ts").signR2Read(asset.data.storage_key, asset.data.verified_etag, asset.data.mime_type);
      const result = await call("Runtime.evaluate", { awaitPromise: true, returnByValue: true, expression: `(async()=>{document.body.innerHTML='<video controls style="width:900px;max-width:100%;background:#111"></video>';const v=document.querySelector('video');await new Promise((resolve,reject)=>{v.onloadedmetadata=resolve;v.onerror=()=>reject(new Error('Stored video cannot decode'));v.src=${JSON.stringify(signed.url)};});const metadata={width:v.videoWidth,height:v.videoHeight,duration:v.duration};await new Promise((resolve,reject)=>{v.onseeked=resolve;v.onerror=()=>reject(new Error('Stored video cannot seek'));v.currentTime=Math.min(1,v.duration/2);});return metadata;})()` });
      assert.ok(!result.exceptionDetails, "R2 output decodes independently of fal");
      const metadata = result.result.value; assert.ok(metadata.width > 0 && metadata.height > 0 && metadata.duration > 0);
      const frame = await call("Page.captureScreenshot", { format: "png" });
      fs.writeFileSync(path.join(dir, scene.operation + ".png"), Buffer.from(frame.data, "base64"));
      evidence.push({ operation: scene.operation, ...metadata, bytes: asset.data.size_bytes, privateR2Decode: true });
    }
  }
  assert.equal(evidence.length, 3);
  fs.writeFileSync(path.join(os.tmpdir(), "sceenyk-fal-media.json"), JSON.stringify({ passed: 3, evidence, artifacts: dir }, null, 2));
  console.log(JSON.stringify({ passed: 3, evidence, artifacts: dir }));
  await call("Browser.close");
} finally { ws?.close(); chrome.kill(); }
