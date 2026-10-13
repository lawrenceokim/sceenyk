import { z } from "zod";
import { captionStyle } from "./contract";

export const captionStyleSelectionSchema = z.strictObject({
  schema_version: z.literal(1),
  preset: z.enum(["default", "clean", "bold"]),
  position: z.enum(["bottom", "top"]),
  size: z.enum(["normal", "large"]),
  alignment: z.enum(["center", "left"]),
  contrast: z.enum(["default", "high", "shadow"]),
});
export type CaptionStyleSelection = z.infer<typeof captionStyleSelectionSchema>;

// Presets change a small, controlled set of choices. Subsequent controls are
// explicit overrides, so a saved selection always resolves deterministically.
export const captionStylePresets = {
  default: { size: "normal", contrast: "default", fontWeight: 600 },
  clean: { size: "normal", contrast: "shadow", fontWeight: 600 },
  bold: { size: "large", contrast: "high", fontWeight: 700 },
} as const;

export const defaultCaptionStyleSelection: CaptionStyleSelection = {
  schema_version: 1, preset: "default", position: "bottom", size: "normal",
  alignment: "center", contrast: "default",
};

export function selectionForCaptionPreset(preset: CaptionStyleSelection["preset"]): CaptionStyleSelection {
  const choice = captionStylePresets[preset];
  return { schema_version: 1, preset, position: "bottom", alignment: "center",
    size: choice.size, contrast: choice.contrast };
}

export function resolveCaptionStyle(input: CaptionStyleSelection, aspectRatio: "16:9" | "9:16" | "1:1") {
  const selection = captionStyleSelectionSchema.parse(input);
  const preset = captionStylePresets[selection.preset];
  const safe = captionStyle.safe_area_percent[aspectRatio];
  const shadowStrong = selection.contrast === "shadow";
  return {
    schema_version: 1 as const,
    preset: selection.preset,
    position: selection.position,
    alignment: selection.alignment,
    font_family: captionStyle.font_family,
    font_weight: selection.contrast === "high" ? 700 : preset.fontWeight,
    font_size_height_percent: Math.round(captionStyle.font_size_height_percent * (selection.size === "large" ? 1.2 : 1) * 10) / 10,
    line_height: 1.25,
    max_lines: captionStyle.max_lines,
    max_width: captionStyle.max_width,
    overflow: captionStyle.overflow,
    safe_area_percent: { horizontal: safe.horizontal, vertical: selection.position === "bottom" ? safe.bottom : safe.horizontal },
    text_color: captionStyle.text_color,
    background_color: captionStyle.background_color,
    background_opacity: selection.contrast === "shadow" ? 0 : selection.contrast === "high" ? 0.95 : captionStyle.background_opacity,
    padding_horizontal_height_percent: 2.2,
    padding_vertical_height_percent: 1.1,
    corner_radius_height_percent: 1.5,
    shadow: {
      color: captionStyle.background_color,
      offset_x_height_percent: 0,
      offset_y_height_percent: shadowStrong ? 0.55 : 0.25,
      blur_height_percent: shadowStrong ? 1.1 : 0.55,
    },
  };
}

export type ResolvedCaptionStyle = ReturnType<typeof resolveCaptionStyle>;

// Converts the renderer's frame-relative values for the current browser preview.
// A 12px display floor keeps very small mobile previews legible; it is not
// persisted and does not alter renderer output dimensions or style values.
export function previewCaptionPaint(style: ResolvedCaptionStyle, frameHeight: number) {
  const unit = Math.max(0, frameHeight) / 100;
  const alpha = Math.round(style.background_opacity * 255).toString(16).padStart(2, "0");
  const shadow = style.shadow;
  return {
    fontFamily: style.font_family,
    fontWeight: style.font_weight,
    fontSize: Math.max(12, Math.min(32, unit * style.font_size_height_percent)),
    lineHeight: style.line_height,
    color: style.text_color,
    backgroundColor: `${style.background_color}${alpha}`,
    padding: `${unit * style.padding_vertical_height_percent}px ${unit * style.padding_horizontal_height_percent}px`,
    borderRadius: unit * style.corner_radius_height_percent,
    textShadow: `${unit * shadow.offset_x_height_percent}px ${unit * shadow.offset_y_height_percent}px ${unit * shadow.blur_height_percent}px ${shadow.color}`,
  };
}

// A future renderer can parse this independently of browser CSS and theme state.
export const resolvedCaptionStyleSchema = z.strictObject({
  schema_version: z.literal(1), preset: captionStyleSelectionSchema.shape.preset,
  position: captionStyleSelectionSchema.shape.position,
  alignment: captionStyleSelectionSchema.shape.alignment,
  font_family: z.literal(captionStyle.font_family), font_weight: z.union([z.literal(600), z.literal(700)]),
  font_size_height_percent: z.number().min(4.5).max(5.4), line_height: z.literal(1.25),
  max_lines: z.literal(2), max_width: z.literal("safe-area"), overflow: z.literal("shrink-to-fit"),
  safe_area_percent: z.strictObject({ horizontal: z.number().min(8).max(10), vertical: z.number().min(8).max(18) }),
  text_color: z.literal(captionStyle.text_color), background_color: z.literal(captionStyle.background_color),
  background_opacity: z.number().min(0).max(1),
  padding_horizontal_height_percent: z.literal(2.2), padding_vertical_height_percent: z.literal(1.1),
  corner_radius_height_percent: z.literal(1.5),
  shadow: z.strictObject({ color: z.literal(captionStyle.background_color),
    offset_x_height_percent: z.literal(0), offset_y_height_percent: z.number().min(0).max(1),
    blur_height_percent: z.number().min(0).max(2) }),
});
