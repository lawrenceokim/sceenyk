import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { renderToStaticMarkup } from "react-dom/server";
import { V3WorkflowPreview } from "../components/creation/v3-workflow-preview";
import type { RuntimeDto } from "../lib/final-video-generation-v3/runtime-server";

let checks = 0;
const ok = (value: unknown) => { assert.ok(value); checks++; };
globalThis.fetch = async () => { throw new Error("NETWORK_FORBIDDEN"); };
const initial: RuntimeDto = { projectId: "00000000-0000-4000-8000-000000000001", packageStale: true,
  referenceCleanup:{enabled:false,pendingCount:0},
  artifacts: [
    { id: "old", kind: "character", version: 1, activeSlot: false, current: false, approved: true, rejected: false, storyboard: null, preview: null, location: null },
    { id: "new", kind: "character", version: 2, activeSlot: true, current: false, approved: true, rejected: false, storyboard: null, preview: null, location: null },
  ], runs: [], preflight: null, complete: false, tasks: [], processing: false, localEnabled: true };
const markup = renderToStaticMarkup(<V3WorkflowPreview initial={initial} projectId={initial.projectId} assets={[]} dirty={false} revision="saved-style" />);
for (const label of ["Preview view", "Progress", "References", "Storyboard", "Package", "Final Video", "Reference history", "Previously approved", "Stale — regenerate and approve"]) ok(markup.includes(label));
ok(!/V3|Higgsfield|capability|transport|execution version/i.test(markup));
ok(!/<form|type="file"|<textarea/.test(markup));
const studio = readFileSync("app/(workspace)/studio/page.tsx", "utf8");
ok(studio.includes("<CreationWorkspace")); ok(!studio.includes("studio/v3"));
const project = readFileSync("app/(workspace)/projects/[id]/page.tsx", "utf8");
ok(project.includes("<CreationWorkspace")); ok(!project.includes("<V3Studio"));
const editor = readFileSync("components/creation/creation-workspace.tsx", "utf8");
for (const name of ["StudioLayout", "StudioReferenceSources", "GenerationSettings", "PromptComposer", "V3WorkflowPreview"]) ok(editor.includes(name));
const legacy = readFileSync("app/(workspace)/studio/v3/page.tsx", "utf8");
ok(legacy.includes("redirect(")); ok(!legacy.includes("V3Studio"));
const rejectedMarkup = renderToStaticMarkup(<V3WorkflowPreview initial={{ ...initial, artifacts: [
  { id: "rejected", kind: "character", version: 1, activeSlot: true, current: false, approved: false, rejected: true, storyboard: null, preview: "https://private.example.test/retained.png", location: null },
] }} projectId={initial.projectId} assets={[]} dirty={false} revision="rejected" />);
ok(rejectedMarkup.includes("Reference history")); ok(!rejectedMarkup.includes("Rejected")); ok(!rejectedMarkup.includes("retained.png"));
const locationMarkup=renderToStaticMarkup(<V3WorkflowPreview initial={{...initial,referenceCleanup:{enabled:true,pendingCount:1,processing:true},artifacts:[
  {id:"loc",kind:"location",version:1,activeSlot:true,current:true,approved:false,rejected:false,storyboard:null,location:null,preview:"https://private.example.test/location.png"},
  {id:"unapproved",kind:"product",version:1,activeSlot:false,current:false,approved:false,rejected:false,storyboard:null,location:null,preview:"https://private.example.test/unapproved.png"},
]}} projectId={initial.projectId} assets={[]} dirty={false} revision="location-review"/>);
for(const label of ["location.png","Approve","Reject and Delete","Regenerate Location","ChatGPT prepares a customized prompt","Retry image cleanup"])ok(locationMarkup.includes(label));
for(const label of ["unapproved.png","Location Blueprint","consistency checks","one correction"])ok(!locationMarkup.includes(label));
const approveAttributes=locationMarkup.match(/<button([^>]*)>Approve<\/button>/)?.[1];
ok(approveAttributes!==undefined&&!/\sdisabled(?:\s|=|$)/.test(approveAttributes));
console.info(`${checks} canonical Studio rendering/wiring checks passed; zero network calls.`);
