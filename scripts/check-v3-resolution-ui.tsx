import assert from "node:assert/strict";
import fs from "node:fs";
import { renderToStaticMarkup } from "react-dom/server";
import { StudioResolution } from "../components/creation/studio-resolution";
import { videoResolutions, projectVideoResolution } from "../lib/projects/video-resolution";

let checks = 0;
const ok = (value: unknown) => { assert.ok(value); checks++; };
for (const value of videoResolutions) {
  const html = renderToStaticMarkup(<StudioResolution value={value} onChange={() => { throw new Error("SSR must not change a saved setting"); }} />);
  ok((html.match(/type="radio"/g) ?? []).length === 3);
  ok((html.match(/checked=""/g) ?? []).length === 1);
  ok((html.match(/<input[^>]+>/g) ?? []).some(input => input.includes(`value="${value}"`) && input.includes('checked=""')));
  for (const resolution of videoResolutions) ok(html.includes(`value="${resolution}"`));
  ok(!html.includes("<select"));
  ok(html.includes("grid-cols-3")); ok(html.includes("min-w-0")); ok(html.includes("min-h-11"));
  ok(html.includes("peer-checked:bg-primary/15")); ok(html.includes("peer-focus-visible:ring-2"));
  ok(html.includes("Higher resolutions may take longer to generate."));
}
ok(projectVideoResolution(undefined) === "480p");
const workspace = fs.readFileSync("components/creation/creation-workspace.tsx", "utf8");
ok(!workspace.includes('title="Narration"'));
ok(workspace.includes('title="Resolution"'));
ok(workspace.includes("onChange={resolution => setSettings({ ...settings, resolution })}"));
ok(workspace.includes("projectVideoResolution(settings.resolution) !== projectVideoResolution(savedBrief.settings.resolution)"));
console.log(`${checks} Resolution radio, default, shared-theme and responsive-layout assertions passed; browser visual acceptance remains manual.`);
