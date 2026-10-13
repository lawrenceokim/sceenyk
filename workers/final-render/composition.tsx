import React from "react";
import { AbsoluteFill, Audio, Composition, Img, OffthreadVideo, Sequence, registerRoot, getInputProps } from "remotion";
import type { CompositionPlan } from "../../lib/composition/contract";
import { renderConfiguration, renderShape } from "../../lib/final-render/contract";

export type FinalRenderProps = { plan: CompositionPlan; sources: Record<string, string>; renderAudio?: boolean };
export const frameAt = (ms: number) => Math.round(ms * renderConfiguration.fps / 1000);
export function FinalVideo({ plan, sources, renderAudio = true }: FinalRenderProps) {
  // Only the trusted worker supplies props. Shared boundary rounding preserves
  // scene adjacency; source audio is always muted, including fal native audio.
  return <AbsoluteFill style={{ backgroundColor: "black" }}>
    {plan.scenes.map(scene => {
      const visual = scene.visual;
      if (!visual) throw new Error("INVALID_READY_COMPOSITION");
      const from = frameAt(scene.start_ms), duration = frameAt(scene.end_ms) - from;
      const fit = { width: "100%", height: "100%", objectFit: "contain" as const };
      return <React.Fragment key={scene.scene_execution_id}>
        <Sequence from={from} durationInFrames={duration}>
          {visual.media_type === "image" ? <Img src={sources[visual.asset_id]} style={fit} /> :
            <OffthreadVideo src={sources[visual.asset_id]} trimBefore={frameAt(visual.input_start_ms)} durationInFrames={duration} muted style={fit} />}
        </Sequence>
        {renderAudio && scene.narration && <Sequence from={frameAt(scene.narration.start_ms)} durationInFrames={frameAt(scene.narration.end_ms) - frameAt(scene.narration.start_ms)}>
          <Audio src={sources[scene.narration.asset_id]} volume={1} />
        </Sequence>}
      </React.Fragment>;
    })}
  </AbsoluteFill>;
}
const Root = () => <Composition id="FinalVideo" component={FinalVideo} defaultProps={getInputProps<FinalRenderProps>()}
  width={640} height={360} fps={renderConfiguration.fps} durationInFrames={240}
  calculateMetadata={({ props }) => ({ ...renderShape(props.plan.aspect_ratio), durationInFrames: frameAt(props.plan.total_duration_ms) })}
/>;
registerRoot(Root);
