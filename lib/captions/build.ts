import { captionConfiguration as limits, captionSourceSchema, captionTrackSchema,
  normalizeCaptionText, validateCaptionSource, wrapCaption, type CaptionSource, type CaptionTrack } from "./contract";

function phrases(text: string) {
  const result: string[] = []; let words: string[] = [];
  for (const word of text.split(" ")) {
    if (words.length && (words.length >= limits.preferred_words ||
      Array.from([...words, word].join(" ")).length > limits.line_characters)) {
      result.push(words.join(" ")); words = [];
    }
    words.push(word);
    if (/[.!?…]["'”’)]?$/u.test(word) || (words.length >= 3 && /[,;:]["'”’)]?$/u.test(word))) {
      result.push(words.join(" ")); words = [];
    }
  }
  if (words.length) result.push(words.join(" "));
  // Avoid a stranded last word after the preferred phrase-length boundary.
  for (let index = result.length - 1; index >= 0 && result.length > 1; index--) {
    if (result[index].includes(" ")) continue;
    const first = index === 0 ? 0 : index - 1;
    const merged = `${result[first]} ${result[first + 1]}`;
    if (wrapCaption(merged).length <= limits.max_lines) result.splice(first, 2, merged);
  }
  return result;
}

// Bounded proportional allocation: preserve measured endpoints exactly, with
// integer cumulative rounding and no claim of word-level provider alignment.
function durations(parts: string[], duration: number) {
  if (duration < parts.length * limits.min_duration_ms || duration > parts.length * limits.max_duration_ms) throw new Error("TIMING_LIMIT");
  const weights = parts.map(part => Array.from(part.replace(/\s/gu, "")).length);
  const values = weights.map(() => 0), pending = new Set(weights.map((_, index) => index));
  let remaining = duration;
  while (pending.size) {
    const weight = [...pending].reduce((sum, index) => sum + weights[index], 0);
    const clamped = [...pending].filter(index => remaining * weights[index] / weight < limits.min_duration_ms || remaining * weights[index] / weight > limits.max_duration_ms);
    if (!clamped.length) {
      for (const index of pending) values[index] = remaining * weights[index] / weight;
      break;
    }
    // Clamp only one side at a time, then recalculate remaining capacity.
    const small = clamped.filter(index => remaining * weights[index] / weight < limits.min_duration_ms);
    for (const index of small.length ? small : clamped) {
      values[index] = small.length ? limits.min_duration_ms : limits.max_duration_ms;
      remaining -= values[index]; pending.delete(index);
    }
  }
  let cursor = 0;
  return values.map(value => { const start = Math.round(cursor); cursor += value; return Math.round(cursor) - start; });
}

export function buildCaptionTrack(input: CaptionSource): CaptionTrack {
  const source = captionSourceSchema.parse(input), plan = source.plan;
  const base = { schema_version: 1 as const, generation_job_id: plan.generation_job_id,
    composition_version: 1 as const, alignment: "estimated_phrase" as const,
    configuration: limits, total_duration_ms: plan.total_duration_ms, aspect_ratio: plan.aspect_ratio };
  const cues: CaptionTrack["cues"] = [];
  try {
    if (plan.status !== "ready") throw new Error("SOURCE_MISMATCH");
    for (const scene of plan.scenes) {
      if (!scene.narration) continue;
      const narration = source.narration.find(n => n.scene_execution_id === scene.scene_execution_id);
      if (!narration) throw new Error("SOURCE_MISMATCH");
      const parts = phrases(normalizeCaptionText(narration.text));
      const duration = scene.narration.actual_duration_ms;
      // Merge short phrases until the audio can accommodate the minimum hold.
      while (parts.length > 1 && parts.length * limits.min_duration_ms > duration) {
        let best = 0;
        for (let i = 1; i < parts.length - 1; i++) if (parts[i].length + parts[i + 1].length < parts[best].length + parts[best + 1].length) best = i;
        parts.splice(best, 2, `${parts[best]} ${parts[best + 1]}`);
      }
      // Sparse speech may require splitting a phrase to respect maximum hold.
      while (parts.length * limits.max_duration_ms < duration) {
        const index = parts.findIndex(part => part.includes(" "));
        if (index < 0) throw new Error("TIMING_LIMIT");
        const words = parts[index].split(" "), middle = Math.ceil(words.length / 2);
        parts.splice(index, 1, words.slice(0, middle).join(" "), words.slice(middle).join(" "));
      }
      if (parts.some(part => wrapCaption(part).length > limits.max_lines)) throw new Error("READABILITY_LIMIT");
      const times = durations(parts, duration); let cursor = scene.narration.start_ms;
      for (const [index, part] of parts.entries()) {
        cues.push({ id: `s${scene.scene_order}-c${index + 1}`, generation_job_id: plan.generation_job_id,
          scene_id: scene.scene_execution_id, scene_order: scene.scene_order, narration_id: narration.id,
          start_ms: cursor, end_ms: cursor + times[index], text: part, cue_order: cues.length + 1 });
        cursor += times[index];
      }
    }
    const track = captionTrackSchema.parse({ ...base, status: "ready", issue: null, cues });
    validateCaptionSource(track, source);
    return track;
  } catch (error) {
    const issue = error instanceof Error && ["READABILITY_LIMIT", "TIMING_LIMIT"].includes(error.message) ? error.message : "SOURCE_MISMATCH";
    return captionTrackSchema.parse({ ...base, status: "timing_issue", issue, cues: [] });
  }
}
