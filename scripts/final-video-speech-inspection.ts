// Local measurement/test copies only. No provider, worker, admission or writes
// to the real execution spool/storage. Called by the GET-only inspector.
import { promises as fs } from "node:fs";
import path from "node:path";
import os from "node:os";
import { createHash } from "node:crypto";
import type { FinalExecution, Operation } from "../lib/final-video-generation/contract";
import { ElevenLabsVoiceGenerationProvider } from "../lib/final-video-generation/adapters/elevenlabs";
import { fitSpeechFile, SpeechFitLimitError } from "../lib/final-video-generation/speech-fitting";
import { planSpeechTiming } from "../lib/speech-timing/plan";
const hash = (bytes: Buffer) => createHash("sha256").update(bytes).digest("hex");
export async function inspectSavedSpeech(run: FinalExecution, operations: readonly Operation[]) {
  const results = [];
  for (const op of operations.filter(op => op.kind === "voice")) {
    const input = op.input as { text: string; startMs: number; endMs: number; delivery: { pace: "slow" | "natural" | "energetic" } };
    const directory = path.resolve(process.env.UGC_FINAL_RECOVERY_DIR || ".ugc-final-recovery", run.id);
    const responseFile = path.join(directory, `${op.id}.response.json`), sourceFile = path.join(directory, `${op.id}.source.bytes`);
    const responseStat = await fs.lstat(responseFile);
    if (!responseStat.isFile() || responseStat.isSymbolicLink() || responseStat.size > 48 * 1024 * 1024) throw new Error("INSPECTION_SPEECH_SOURCE_INVALID");
    const response = await fs.readFile(responseFile);
    if (!op.receipt?.recovery || hash(response) !== op.receipt.recovery.sha256) throw new Error("INSPECTION_SPEECH_PROOF_INVALID");
    const raw = JSON.parse(response.toString("utf8")) as { audio_base64: string };
    const audio = Buffer.from(raw.audio_base64, "base64");
    const stat = await fs.lstat(sourceFile);
    if (!stat.isFile() || stat.isSymbolicLink() || stat.size > 24 * 1024 * 1024 || hash(await fs.readFile(sourceFile)) !== hash(audio))
      throw new Error("INSPECTION_SPEECH_PROOF_INVALID");
    const target = planSpeechTiming(input.text, input.startMs, input.endMs, input.delivery.pace);
    const temp = await fs.mkdtemp(path.join(os.tmpdir(), "sceenyk-speech-inspect-"));
    try {
      const source = path.join(temp, "source.mp3"), output = path.join(temp, "fitted.wav");
      await fs.writeFile(source, audio);
      const alignment = new ElevenLabsVoiceGenerationProvider().timing(op.receipt);
      const fitted = await fitSpeechFile(source, output, input.text, target.windowMs, alignment);
      results.push({ operationId: op.id, sceneId: op.scene_id, state: op.state, text: input.text, startMs: input.startMs, endMs: input.endMs,
        windowMs: target.windowMs, providerSucceeded: true, requestId: op.request_id, actualCredits: op.receipt.usage?.actualCredits ?? null,
        actualImmediateCostMicrousd: op.receipt.usage?.actualCostMicrousd ?? null, sourceBytes: audio.length, sourceSha256: hash(audio),
        responseProofMatches: true, sourceMatchesSavedResponse: true, originalAlignmentText: alignment.original?.characters.join(""),
        originalAlignmentEndMs: alignment.original?.endsMs.at(-1), normalizedAlignmentSaved: !!alignment.normalized,
        containerDurationMs: fitted.proof.sourceContainerDurationMs, decodedDurationMs: fitted.proof.decodedDurationMs,
        nominalOverrunMs: fitted.proof.sourceContainerDurationMs - target.windowMs,
        oldToleranceOverrunMs: fitted.proof.sourceContainerDurationMs - target.windowMs - 50,
        localCorrection: { sufficient: true, tempo: fitted.proof.tempoPermille / 1000, maximumTempo: fitted.proof.policyMaxTempoPermille / 1000,
          outputDurationMs: fitted.proof.outputDurationMs, outputMimeType: fitted.metadata.mimeType,
          trimStartMs: fitted.proof.trimStartMs, trimEndMs: fitted.proof.trimEndMs,
          fittedAlignmentEndMs: fitted.proof.fittedAlignment.original?.endsMs.at(-1),
          interpretation: "temporary local test only; original audio/receipt/asset/counters unchanged" }, futureTarget: target });
    } catch (error) {
      if (!(error instanceof SpeechFitLimitError)) throw error;
      results.push({ operationId: op.id, sceneId: op.scene_id, text: input.text, startMs: input.startMs, endMs: input.endMs,
        providerSucceeded: true, requestId: op.request_id, sourceBytes: audio.length, sourceSha256: hash(audio),
        responseProofMatches: true, sourceMatchesSavedResponse: true, localCorrection: { sufficient: false, code: error.code, ...error.details }, futureTarget: target });
    } finally {
      const root = path.resolve(os.tmpdir()) + path.sep;
      if (!path.resolve(temp).startsWith(root) || !path.basename(temp).startsWith("sceenyk-speech-inspect-")) throw new Error("INSPECTION_TEMP_SCOPE");
      await fs.rm(temp, { recursive: true, force: true });
    }
  }
  return results;
}
