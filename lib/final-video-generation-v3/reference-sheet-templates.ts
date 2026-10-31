// V3 OpenAI reference-sheet templates. Unversioned historical requests are version 1.
export const CHARACTER_SHEET_PROMPT_VERSION = 2 as const;
export const PRODUCT_SHEET_PROMPT_VERSION = 2 as const;

export const CHARACTER_SHEET_TEMPLATE = `Analyze the provided reference image and generate a professional, high-quality **character reference sheet** of the main subject.

The subject may be a **human, humanoid, animal, creature, mascot, cartoon character, or fictional character**. Preserve the subject’s **core identity**, recognizable features, silhouette, proportions, facial structure, hairstyle or fur pattern, body shape, colors, clothing, accessories, markings, and other distinctive traits so the result clearly represents the same subject.

## Visual Style

Apply the following user-selected visual style consistently across the entire output:

**Visual style:** \`"{{VISUAL_STYLE}}"\`

If the selected visual style is **"original"**, preserve the original visual style of the input image as closely as possible.

If the selected visual style is something else, restyle the subject into that style while preserving the subject’s identity and recognizability.

The selected visual style must affect the subject’s rendering, but **must not change the reference-sheet layout**.

---

## Layout

Create **one square image** arranged in a **2×2 grid** with **four equal panels**, separated by thin, subtle gray divider lines.

Use a **plain light-gray studio background** across all panels.
Use **clean, even studio lighting** with **no cast shadows**.
Keep the composition minimal, centered, and consistent.

---

## Panel Structure

### Top Left — Side View

Show the subject in a **strict side profile**.

- For humans, humanoids, animals, and creatures: show the **full body** in side view.
- Keep the pose neutral and suitable for a reference sheet.
- Preserve the subject’s outfit, accessories, proportions, and body structure.

### Top Right — Back View

Show the subject directly from the **back**.

- Preserve body proportions, outfit details, hairstyle/fur pattern, accessories, and silhouette.
- Infer back details conservatively if they are not visible in the original reference image.

### Bottom Left — Front View

Show the subject facing **forward**.

- For human or humanoid characters: show the **full body from the neck down**, intentionally excluding the head.
- For animals or non-humanoid subjects: show the **full front-facing body** if that is more appropriate.
- Keep proportions and clothing consistent with the other views.

### Bottom Right — Face Close-Up

Show a **detailed close-up portrait** of the character’s face.

- For humans and humanoids: show a **head-and-shoulders portrait**.
- For animals or creatures: show the **head and upper neck/shoulders area**, preserving facial identity.
- This panel should clearly highlight the subject’s most important facial features and identity.

---

## Consistency Rules

Maintain the **exact same subject** across all four panels.

- Keep facial identity consistent
- Keep body proportions consistent
- Keep hairstyle, fur, colors, outfit, and accessories consistent
- Keep species/type and silhouette consistent
- Do not redesign the character
- Do not add props, scenery, text, labels, or extra elements
- Do not add extra characters
- Do not add environmental shadows or decorative backgrounds

If unseen angles are missing from the input, infer them conservatively while staying faithful to the visible design.

---

## Output Requirements

Generate:

- **one square image**
- **1:1 aspect ratio**
- **2×2 reference-sheet layout**
- **plain light-gray background**
- **four equal panels**
- **thin gray divider lines**
- **high detail**
- **clean studio presentation**
- **no text**
- **no labels**
- **no watermark**
- **no props**
- **no scenery**

Return only the completed four-panel character reference sheet image.`;

export const PRODUCT_SHEET_TEMPLATE = `Analyze the provided product image and generate a professional, high-quality, four-view product reference sheet.

SUBJECT PRESERVATION

Identify the main product and preserve its exact recognizable design, shape, proportions, colors, materials, textures, logos, markings, and distinguishing details.

The input may contain any physical product, including vehicles, electronics, furniture, clothing, accessories, footwear, machinery, or household objects.

Remove the original surroundings and isolate the product. Show only one consistent product design across all views.

VISUAL STYLE

Apply the user-selected visual style: "{{VISUAL_STYLE}}".

If the style is "original", preserve the visual style and appearance of the uploaded image.

Otherwise, transform the product into the selected visual style while maintaining its recognizable identity, proportions, and important design features.

The selected style must be consistent across all four panels and must never change the grid layout.

LAYOUT

Generate one square image with a precise 2×2 grid of four equally sized panels, separated by thin, subtle gray divider lines.

Use a uniform, plain light-gray studio background (#D3D3D3) across every panel. Use clean, soft, even lighting to reveal the product's details without cast shadows, floor shadows, distracting reflections, or environmental scenery.

TOP-LEFT PANEL — SIDE VIEW

Show the complete product from a strict 90-degree side profile. Display the full product without cropping. For products with a clear front and back, use a consistent orientation.

TOP-RIGHT PANEL — FRONT VIEW

Show the complete product directly from the front, centered and straight-on, clearly revealing its main front-facing design.

BOTTOM-LEFT PANEL — BACK VIEW

Show the complete product directly from behind, preserving its rear structure, proportions, colors, materials, and details.

BOTTOM-RIGHT PANEL — TOP VIEW

Show the complete product from directly overhead (90-degree bird's-eye view), revealing its upper surface, outline, and top-facing details. This must be a true top-down view, not an angled perspective.

CONSISTENCY RULES

All four panels must show the same product, model, variant, dimensions, colors, materials, and accessories.

Maintain accurate geometry and consistent design features across every angle. Use straight-on, orthographic-style views with minimal perspective distortion.

When parts are not visible in the reference image, reconstruct them conservatively using the product's visible design and likely physical structure. Avoid inventing distinctive features, labels, logos, or components.

Adapt framing to the product's natural shape so that each view is as large and clear as possible without cropping or distortion.

OUTPUT

Create one high-resolution square image with a 1:1 aspect ratio.

Four equal panels:

Top-left: Side view.
Top-right: Front view.
Bottom-left: Back view.
Bottom-right: Top view.

Keep the product centered within each section, with balanced margins, a consistent visual style, and a clean gray studio background.

No additional text, captions, panel labels, watermarks, people, props, scenery, shadows, or unrelated objects. Preserve genuine product branding visible in the reference.

Return only the completed four-panel product reference sheet image.`;
