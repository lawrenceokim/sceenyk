import "server-only";
import { z } from "zod";
import { ProductSheetError } from "./provider";

const schema = z.strictObject({ enabled: z.literal("1"), apiKey: z.string().min(1),
  model: z.literal("gpt-image-2.5-sunburst") });
export function getProductSheetConfig() {
  const result = schema.safeParse({ enabled: process.env.UGC_PRODUCT_SHEET_ENABLED,
    apiKey: process.env.OPENAI_API_KEY?.trim(), model: process.env.OPENAI_PRODUCT_SHEET_MODEL?.trim() });
  if (!result.success) throw new ProductSheetError("PRODUCT_CONFIG_INVALID", true);
  return result.data;
}
