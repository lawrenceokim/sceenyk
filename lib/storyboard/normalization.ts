import { z } from "zod";
import { storyboardSchema, type Storyboard } from "./schema";
import type { StoryboardBinding } from "./contract";
import { StoryboardValidationError, schemaValidationIssues, validationPath, type StoryboardNormalization } from "./validation-diagnostics";

function object(value: unknown): value is Record<string, unknown> { return !!value && typeof value === "object" && !Array.isArray(value); }
function json(value: string): unknown {
  try { return JSON.parse(value); }
  catch { throw new StoryboardValidationError({ validatorVersion: 2, valid: false, normalizations: [], issues: [{ code: "JSON_PARSE_FAILED", fieldPath: "$", expected: "JSON storyboard object", expectedType: "object", received: `string(length=${value.length})`, receivedType: "string" }] }); }
}
function milliseconds(value: unknown): unknown {
  if (typeof value !== "string") return value;
  const text = value.trim();
  if (/^\d+(?:\s*ms)?$/.test(text)) return Number(text.replace(/\s*ms$/, ""));
  const seconds = /^(\d+)(?:\.(\d{1,3}))?\s*s$/.exec(text);
  if (seconds) return Number(seconds[1]) * 1000 + Number((seconds[2] ?? "").padEnd(3, "0"));
  const clock = /^(?:(\d{1,2}):)?(\d{1,2}):(\d{2})(?:\.(\d{1,3}))?$/.exec(text);
  if (clock && Number(clock[2]) < 60 && Number(clock[3]) < 60) return ((Number(clock[1] ?? 0) * 60 + Number(clock[2])) * 60 + Number(clock[3])) * 1000 + Number((clock[4] ?? "").padEnd(3, "0"));
  return value;
}
export function normalizeStoryboardOutput(input: unknown, binding: StoryboardBinding): { document: Storyboard; normalizations: StoryboardNormalization[] } {
  let value = typeof input === "string" ? json(input) : structuredClone(input);
  const changes: StoryboardNormalization[] = [];
  const note = (code: string, path: (string | number)[], from: unknown, to: string | number) => changes.push({ code, fieldPath: validationPath(path), from: typeof from === "number" ? from : from == null ? null : typeof from, to });
  if (object(value) && value.schemaVersion === undefined) {
    if (object(value.output_parsed)) { value = value.output_parsed; note("STRUCTURED_OUTPUT_UNWRAPPED", [], "output_parsed", "storyboard object"); }
    else if (Object.keys(value).length === 1 && object(value.storyboard)) { value = value.storyboard; note("STORYBOARD_WRAPPER_UNWRAPPED", [], "storyboard wrapper", "storyboard object"); }
    else if (value.object === "response" && value.status === "completed" && Array.isArray(value.output)) {
      const parts: string[] = [];
      for (const item of value.output) if (object(item) && item.type === "message" && Array.isArray(item.content)) for (const part of item.content) if (object(part) && part.type === "output_text" && typeof part.text === "string") parts.push(part.text);
      if (parts.length === 1) { value = json(parts[0]); note("RESPONSES_CONTAINER_UNWRAPPED", [], "response container", "storyboard object"); }
    }
  }
  function strip(node: unknown, schema: z.ZodType, path: (string | number)[]): unknown {
    if (schema instanceof z.ZodObject && object(node)) {
      const result: Record<string, unknown> = {};
      for (const [key, item] of Object.entries(node)) {
        if (Object.hasOwn(schema.shape, key)) result[key] = strip(item, schema.shape[key], [...path, key]);
        else note("UNSUPPORTED_FIELD_REMOVED", [...path, key], typeof item, "removed from derived document; original retained");
      }
      return result;
    }
    if (schema instanceof z.ZodArray && Array.isArray(node)) return node.map((item, i) => strip(item, schema.element as z.ZodType, [...path, i]));
    return node;
  }
  value = strip(value, storyboardSchema, []);
  if (object(value)) {
    if (value.durationMs === undefined && [5000, 10000, 30000].includes(binding.durationMs)) { value.durationMs = binding.durationMs; note("SELECTED_DURATION_DERIVED", ["durationMs"], undefined, binding.durationMs); }
    if (value.schemaVersion === "1") { value.schemaVersion = 1; note("SCHEMA_VERSION_NUMBER_NORMALIZED", ["schemaVersion"], "1", 1); }
    const normalizeTime = (node: Record<string, unknown>, key: string, path: (string | number)[]) => {
      const before = node[key]; const after = milliseconds(before);
      if (after !== before) { node[key] = after; note("TIMESTAMP_TO_MILLISECONDS", [...path, key], before, after as number); }
    };
    normalizeTime(value, "durationMs", []);
    const enums: [Record<string, unknown>, string, string[], (string | number)[]][] = [
      [value, "visualStyle", storyboardSchema.shape.visualStyle.options, []], [value, "tone", storyboardSchema.shape.tone.options, []],
    ];
    if (object(value.voice)) enums.push([value.voice, "pace", ["slow", "natural", "energetic"], ["voice"]]);
    if (typeof value.aspectRatio === "string") {
      const ratio = value.aspectRatio.replace(/\s/g, "").replace(/[x/]/i, ":");
      if (["9:16", "16:9", "1:1"].includes(ratio) && ratio !== value.aspectRatio) { value.aspectRatio = ratio; note("ASPECT_RATIO_FORMAT_NORMALIZED", ["aspectRatio"], "string", ratio); }
    }
    if (Array.isArray(value.scenes)) for (const [i, scene] of value.scenes.entries()) if (object(scene)) {
      const path = ["scenes", i];
      if (scene.number === undefined) { scene.number = i + 1; note("SCENE_NUMBER_DERIVED", [...path, "number"], undefined, i + 1); }
      if (scene.generationNotes == null) { scene.generationNotes = ""; note("OPTIONAL_NOTES_NORMALIZED", [...path, "generationNotes"], null, "empty optional directions"); }
      normalizeTime(scene, "startMs", path); normalizeTime(scene, "endMs", path);
      for (const group of ["actions", "speech"]) if (Array.isArray(scene[group])) for (const [j, part] of scene[group].entries()) if (object(part)) {
        normalizeTime(part, "startMs", [...path, group, j]); normalizeTime(part, "endMs", [...path, group, j]);
        if (group === "speech") enums.push([part, "speaker", ["character", "narration"], [...path, group, j]]);
      }
    }
    for (const [node, key, choices, path] of enums) if (typeof node[key] === "string") {
      const canonical = choices.find(choice => choice.toLowerCase() === (node[key] as string).trim().toLowerCase());
      if (canonical && canonical !== node[key]) { node[key] = canonical; note("ENUM_CASE_NORMALIZED", [...path, key], "string", canonical); }
    }
  }
  const parsed = storyboardSchema.safeParse(value);
  if (!parsed.success) throw new StoryboardValidationError({ validatorVersion: 2, valid: false, issues: schemaValidationIssues(parsed.error, value), normalizations: changes });
  return { document: parsed.data, normalizations: changes };
}
