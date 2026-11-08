// Offline saved-state fixtures and real presentation/refresh handlers. No project records or providers.
import assert from "node:assert/strict";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { build } from "esbuild";
import { createRequire } from "node:module";
import { resolve } from "node:path";
const require = createRequire(import.meta.url);
let slots = [], cursor = 0, effects = [];
globalThis.__progressReact = { ...React,
  useState(initial) { const i = cursor++; if (!(i in slots)) slots[i] = initial; return [slots[i], value => { slots[i] = typeof value === "function" ? value(slots[i]) : value; }]; },
  useRef(initial) { const i = cursor++; if (!(i in slots)) slots[i] = { current: initial }; return slots[i]; },
  useEffect(effect, deps) { effects.push({ effect, deps }); }, useCallback: value => value, useMemo: value => value(),
};
const bundle = await build({ absWorkingDir: process.cwd(), stdin: { contents: 'export { workflowProgress } from "./components/creation/v3-progress-state"; export { V3WorkflowProgress } from "./components/creation/v3-workflow-progress"; export { V3WorkflowPreview } from "./components/creation/v3-workflow-preview";', resolveDir: process.cwd(), loader: "tsx" },
  tsconfig: resolve("tsconfig.json"), bundle: true, write: false, platform: "node", format: "cjs", packages: "external", plugins: [{ name: "offline-ui", setup(builder) {
    builder.onResolve({ filter: /^\.\/components\// }, args => ({ path: resolve(args.path + (args.path.endsWith("-state") ? ".ts" : ".tsx")) }));
    builder.onResolve({ filter: /^(react|next\/image|@\/components\/workspace\/studio-mode-provider|@\/components\/ui\/(button|dialog)|\.\/studio-workspace-panels)$/ }, args => ({ path: args.path, namespace: "fixture" }));
    builder.onLoad({ filter: /.*/, namespace: "fixture" }, args => {
      if (args.path === "react") return { contents: "const r=globalThis.__progressReact; export const useState=r.useState,useRef=r.useRef,useEffect=r.useEffect,useCallback=r.useCallback,useMemo=r.useMemo;" };
      if (args.path === "@/components/workspace/studio-mode-provider") return { contents: "export const useStudioMode=()=>({mode:'basic'});" };
      if (args.path === "./studio-workspace-panels") return { contents: "export const useStudioPanels=()=>null; export const StudioPanelPortal=props=>props.children; export const StudioWorkflowMedia=()=>null;" };
      if (args.path === "next/image") return { contents: "export default function Image(){return null;}" };
      const names = args.path.endsWith("/button") ? ["Button"] : ["Dialog", "DialogClose", "DialogTrigger", "DialogContent", "DialogDescription", "DialogFooter", "DialogHeader", "DialogTitle"];
      return { contents: names.map(name => `export function ${name}(props){return props.children;}`).join("\n") };
    });
  } }] });
const bundled = { exports: {} };
new Function("require", "module", "exports", bundle.outputFiles[0].text)(require, bundled, bundled.exports);
const { workflowProgress, V3WorkflowProgress, V3WorkflowPreview } = bundled.exports;
let checks = 0, realNetworkCalls = 0;
const equal = (a, b) => { assert.deepEqual(a, b); checks++; };
const ok = value => { assert.ok(value); checks++; };
const originalFetch = globalThis.fetch;
globalThis.fetch = async () => { realNetworkCalls++; throw Error("NETWORK_FORBIDDEN"); };
const artifact = (kind, extra = {}) => ({ id: kind, kind, version: 1, activeSlot: true, approved: true, current: true, rejected: false, storyboard: null, location: null, preview: null, ...extra });
const task = (kind, status, extra = {}) => ({ id: kind + "-task", kind, status, current: true, providerStarted: false, createdAt: "2026-11-04T00:00:00Z", leaseUntil: null, errorCode: null, packageBuild: null, diagnostics: null, location: null, recoveryAvailable: false, canStartNew: false, ...extra });
const run = (state, extra = {}) => ({ id: "run", packageId: "package", segmentId: "segment-1", state, current: true, completedAt: null, hasKnownRequest: false, errorCode: null, submissionBlocker: null, preview: state === "awaiting_review" ? "saved-preview" : null,
  stage: null, actualDurationMs: null, hasAudio: null, estimatedCostMicrousd: 2056670, displayEstimatedCostMicrousd: 2056670, actualCostMicrousd: null,
  provider: "higgsfield", model: "bytedance/seedance-2.5/reference-to-video", aspectRatio: "9:16", resolution: "480p", expectedDialogue: [], shotTimings: [], outputHostname: null, ...extra });
const preflight = { packageId: "package", packageHash: "saved-package-hash", currentness: "current", authorizationState: "bound", canSubmit: true, transportEnabled: true, estimatedCostMicrousd: 2056670, quoteId: "quote", segmentCount: 1, issues: [] };
const empty = { projectId: "private-project-id", artifacts: [], tasks: [], runs: [], preflight: null, complete: false, packageStale: false, processing: false, referenceCleanup: { enabled: true, pendingCount: 0 }, localEnabled: true };
const refs = { ...empty, artifacts: [artifact("character"), artifact("location")] };
const story = { ...refs, artifacts: [...refs.artifacts, artifact("storyboard")] };
const packaged = { ...story, preflight };
const state = (w, product = false) => workflowProgress(w, product);
const statuses = w => state(w).stages.map(s => s.status);
const render = (w, extras = {}) => renderToStaticMarkup(React.createElement(V3WorkflowProgress, { workspace: w, productRequired: false, busy: false, locked: false, buildFailure: null, act: async () => true, ...extras }));
const elements = node => node == null ? [] : Array.isArray(node) ? node.flatMap(elements) : typeof node === "object" && node.props ? [node, ...elements(node.props.children)] : [];
const text = node => node == null || typeof node === "boolean" ? "" : Array.isArray(node) ? node.map(text).join("") : typeof node === "object" ? text(node.props?.children) : String(node);
const find = (node, predicate) => { const found = elements(node).find(predicate); assert.ok(found); return found; };
try {
  equal(statuses(empty), ["not_started", "not_started", "not_started", "not_started"]);
  equal(state({ ...empty, artifacts: [artifact("character")] }).current.status, "in_progress");
  equal(state(refs).current.id, "storyboard");
  equal(state(refs, true).stages[0].status, "in_progress");
  equal(state({ ...refs, artifacts: [...refs.artifacts, artifact("product", { approved: false })] }, true).current.status, "waiting_approval");
  equal(state({ ...refs, artifacts: [...refs.artifacts, artifact("product")] }, true).stages[0].status, "completed");
  for (const kind of ["character", "product", "location"]) {
    const w = { ...empty, tasks: [task(kind, "running")] };
    equal(state(w, kind === "product").current.status, "in_progress");
    equal(state({ ...w, tasks: [task(kind, "failed", { diagnostics: { category: "storage" }, recoveryAvailable: true })] }, kind === "product").current.status, "failed");
  }
  equal(state({ ...refs, artifacts: refs.artifacts.map(a => a.kind === "location" ? { ...a, approved: false } : a) }).current.status, "waiting_approval");
  equal(state({ ...refs, tasks: [task("storyboard", "queued")] }).current.status, "in_progress");
  const storyReview = { ...story, artifacts: story.artifacts.map(a => a.kind === "storyboard" ? { ...a, approved: false } : a) };
  equal(state(storyReview).current.id, "storyboard"); equal(state(storyReview).current.status, "waiting_approval");
  ok(state(storyReview).current.guidance.includes("Review and approve your Storyboard"));
  equal(state(story).current.id, "package");
  equal(state({ ...story, tasks: [task("package", "running")] }).current.status, "in_progress");
  equal(state({ ...story, tasks: [task("package", "failed", { packageBuild: { code: "COST_ESTIMATE_UNAVAILABLE", recoverable: false } })] }).current.status, "failed");
  const packageReview = { ...packaged, preflight: { ...preflight, authorizationState: "missing" } };
  equal(state(packageReview).current.status, "waiting_approval");
  ok(state(packageReview).current.guidance.includes("estimated video cost"));
  equal(state({ ...packaged, preflight: { ...preflight, issues: ["V3_AUTHORIZATION_EXPIRED"] } }).current.description, "Your package approval has expired.");
  equal(state(packaged).current.id, "final"); equal(state(packaged).current.status, "not_started");
  for (const execution of ["queued", "submitting", "provider_processing", "result_saved"]) {
    const w = { ...packaged, runs: [run(execution)] };
    equal(state(w).current.status, "in_progress"); ok(state(w).current.description.includes(execution === "provider_processing" ? "processing" : execution === "result_saved" ? "saving" : execution));
    equal(state(w).complete, false);
  }
  equal(state({ ...packaged, runs: [run("provider_processing", { stage: { stage: "HIGGSFIELD_RESULT_RECEIVED" } })] }).current.description, "Your video: downloading.");
  const videoReady = { ...packaged, preflight: { ...preflight, canSubmit: false, issues: ["V3_SEGMENT_AUTHORIZATION_REQUIRED", "EXISTING_INTENT_RECONCILE_OR_REUSE"] }, runs: [run("awaiting_review")] };
  equal(state(videoReady).current.status, "waiting_approval"); equal(state(videoReady).complete, false);
  equal(state(videoReady).current.description, "Your video is ready for review.");
  equal(state({ ...videoReady, runs: [run("awaiting_review", { preview: null })] }).current.status, "needs_attention");
  equal(state({ ...videoReady, tasks: [task("package", "done", { packageBuild: { code: "COST_ESTIMATE_UNAVAILABLE", estimateStatus: "unavailable" } })] }).stages[2].status, "completed");
  const complete = { ...videoReady, complete: true, runs: [run("approved", { completedAt: "2026-11-04T12:00:00Z" })] };
  equal(statuses(complete), ["completed", "completed", "completed", "completed"]); equal(state(complete).complete, true);
  equal(state({ ...complete, complete: false }).complete, false);
  equal(state({ ...complete, runs: [run("approved")] }).complete, false);
  const stale = { ...complete, artifacts: complete.artifacts.map(a => a.kind === "character" ? { ...a, current: false } : a) };
  equal(statuses(stale), ["needs_attention", "needs_attention", "needs_attention", "needs_attention"]); equal(state(stale).complete, false);
  equal(state({ ...complete, preflight: { ...preflight, currentness: "stale" } }).complete, false);
  equal(state({ ...complete, preflight: null, packageStale: true }).stages[2].status, "needs_attention");
  equal(state({ ...packaged, runs: [run("failed")] }).current.status, "failed");
  equal(state({ ...packaged, runs: [run("reconciliation_required", { hasKnownRequest: true })] }).current.status, "in_progress");
  equal(state({ ...packaged, runs: [run("reconciliation_required", { hasKnownRequest: false })] }).current.status, "needs_attention");
  equal(state({ ...packaged, runs: [run("reconciliation_required", { hasKnownRequest: true, errorCode: "OUTPUT_HOST_APPROVAL_REQUIRED" })] }).current.status, "needs_attention");
  equal(state({ ...packaged, runs: [run("queued", { submissionBlocker: "PAID_V3_EXECUTION_DISABLED" })] }).current.status, "needs_attention");
  equal(state({ ...packaged, runs: [run("failed"), run("provider_processing", { id: "new-attempt" })] }).current.status, "in_progress");
  const multi = { ...packaged, preflight: { ...preflight, segmentCount: 2 }, runs: [run("approved", { completedAt: "now" }), run("approved", { id: "second", segmentId: "segment-2", completedAt: "now" })] };
  equal(state(multi).complete, false); equal(state(multi).current.status, "in_progress");
  equal(state({ ...multi, runs: [run("awaiting_review"), multi.runs[1]] }).current.status, "waiting_approval");
  equal(state({ ...multi, tasks: [task("join", "failed")] }).current.status, "failed");
  equal(state({ ...multi, runs: [...multi.runs, run("awaiting_review", { id: "joined", segmentId: "joined" })] }).current.description, "Your video is ready for review.");
  equal(state({ ...multi, complete: true, runs: [...multi.runs, run("approved", { id: "joined", segmentId: "joined", completedAt: "now" })] }).complete, true);

  for (const w of [empty, refs, storyReview, packageReview, packaged, videoReady, complete, stale, multi]) {
    const markup = render(w);
    for (const label of ["Generation stages", "References", "Storyboard", "Package", "Final Video", "Current state", "What this means", "Package technical details", "Final Video prerequisites", "Final Video details"]) ok(markup.includes(label));
    equal((markup.match(/<details/g) ?? []).length, 3); ok(!/<details[^>]*\sopen[\s=>]/.test(markup));
    ok(!markup.includes("Check status")); ok(!markup.includes("private-project-id"));
    ok(markup.includes("aria-current=\"step\"")); ok(markup.includes("@min-[30rem]/progress:grid-cols-"));
  }
  const readyMarkup = render(videoReady); ok(readyMarkup.includes("already generated")); ok(readyMarkup.includes("New-request prerequisite codes"));
  const emptyMarkup = render(empty); ok(!emptyMarkup.includes("Actual provider cost")); ok(!emptyMarkup.includes("Unavailable")); ok(!emptyMarkup.includes("Not measured"));
  const costs = render({ ...packaged, runs: [run("awaiting_review", { actualDurationMs: 10080, hasAudio: true, actualCostMicrousd: 0 })] });
  ok(costs.includes("10.08s")); ok(costs.includes("~$2.06")); ok(costs.includes("$0.00"));
  const actions = [];
  const recovery = V3WorkflowProgress({ workspace: { ...refs, tasks: [task("storyboard", "reconciliation_required", { recoveryAvailable: true })] }, productRequired: false, busy: false, locked: false, buildFailure: null, act: async (...args) => { actions.push(args); return true; } });
  find(recovery, n => n.type?.name === "Button" && text(n) === "Recover saved response").props.onClick();
  equal(actions, [["recover_task", { id: "storyboard-task" }]]);

  // Exercise the existing owner: polling results, saved-action results, lifecycle refresh and stale-read fencing.
  let initial = { ...packaged, processing: true, runs: [run("provider_processing")] };
  const owner = () => { cursor = 0; effects = []; return V3WorkflowPreview({ initial, projectId: initial.projectId, assets: [], dirty: false, revision: "saved" }); };
  const progressProps = tree => find(tree, n => n.type === V3WorkflowProgress).props;
  slots = []; let tree = owner(); equal(state(progressProps(tree).workspace).current.status, "in_progress");
  const listeners = new Map(), timers = new Map(); let timerId = 0;
  const originals = { window: globalThis.window, document: globalThis.document, setTimeout: globalThis.setTimeout, clearTimeout: globalThis.clearTimeout };
  const addEventListener = (name, handler) => listeners.set(name, handler), removeEventListener = name => listeners.delete(name);
  globalThis.window = { addEventListener, removeEventListener };
  globalThis.document = { visibilityState: "visible", addEventListener, removeEventListener };
  globalThis.setTimeout = (callback, delay) => { const id = ++timerId; timers.set(id, { callback, delay }); return id; };
  globalThis.clearTimeout = id => timers.delete(id);
  const requests = [];
  globalThis.fetch = async (url, options = {}) => { requests.push({ url, options }); return Response.json({ ok: true, workspace: videoReady }); };
  const flush = async () => { for (let i = 0; i < 12; i++) await Promise.resolve(); };
  try {
    const setups = effects.map(({ effect }) => effect());
    const poll = [...timers.values()].find(t => t.delay === 3000); ok(poll);
    await poll.callback(); tree = owner(); equal(state(progressProps(tree).workspace).current.status, "waiting_approval");
    for (const name of ["focus", "pageshow", "visibilitychange"]) ok(listeners.has(name));
    globalThis.fetch = async () => Response.json({ ok: true, workspace: complete });
    listeners.get("focus")(); await flush(); tree = owner(); equal(state(progressProps(tree).workspace).complete, true);
    globalThis.fetch = async () => Response.json({ ok: true, workspace: videoReady });
    listeners.get("visibilitychange")(); await flush(); tree = owner(); equal(state(progressProps(tree).workspace).complete, false);
    globalThis.fetch = async () => Response.json({ ok: false, code: "V3_STATUS_UNAVAILABLE" });
    listeners.get("focus")(); await flush(); tree = owner(); equal(progressProps(tree).error, "V3_STATUS_UNAVAILABLE");
    globalThis.fetch = async () => Response.json({ ok: true, workspace: videoReady });
    listeners.get("focus")(); await flush(); tree = owner(); equal(progressProps(tree).error, "");
    // A pending old status response arrives after an approval action: keep the action's newer DTO.
    let finishOldRead;
    globalThis.fetch = (_url, options = {}) => options.method === "POST" ? Promise.resolve(Response.json({ ok: true, workspace: complete }))
      : new Promise(resolveRead => { finishOldRead = resolveRead; });
    listeners.get("pageshow")();
    await progressProps(tree).act("approve", { id: "run", reviewMode: "direct" });
    finishOldRead(Response.json({ ok: true, workspace: videoReady })); await flush();
    tree = owner(); equal(state(progressProps(tree).workspace).complete, true);
    setups.forEach(cleanup => cleanup?.()); equal(listeners.size, 0);
    ok(requests.every(r => r.options.method !== "POST"));
  } finally { Object.assign(globalThis, originals); }
  // Reload/reopen takes the persisted approval rather than a local visited-tab flag.
  initial = complete; slots = []; equal(state(progressProps(owner()).workspace).complete, true);
  equal(realNetworkCalls, 0);
  console.log(JSON.stringify({ checks, realNetworkCalls, scope: "V3 Progress saved states, disclosures, recovery and automatic synchronization" }));
} finally { globalThis.fetch = originalFetch; delete globalThis.__progressReact; }
