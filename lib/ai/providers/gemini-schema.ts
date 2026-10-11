import "server-only";
import { z } from "zod";
import { productionPlanSchema } from "../plan";

// Google's supported generation schema is narrower than Zod's full JSON
// Schema. Keep strict validation locally; send only supported grammar fields.
function supportedSchema(schema: Record<string, unknown>): Record<string, unknown> {
  const result: Record<string, unknown> = {};
  for (const key of ["type", "required", "additionalProperties", "enum"]) {
    if (key in schema) result[key] = schema[key];
  }
  if ("const" in schema) result.enum = [schema.const];
  if (schema.properties && typeof schema.properties === "object") result.properties = Object.fromEntries(Object.entries(schema.properties).map(([key, value]) => [key, supportedSchema(value)]));
  if (schema.items && typeof schema.items === "object" && !Array.isArray(schema.items)) result.items = supportedSchema(schema.items as Record<string, unknown>);
  if (Array.isArray(schema.anyOf)) {
    const alternatives = schema.anyOf.map(supportedSchema);
    const value = alternatives.find(s => s.type !== "null");
    if (value && alternatives.length === 2 && alternatives.some(s => s.type === "null")) Object.assign(result, value, { type: [value.type, "null"] });
    else result.anyOf = alternatives;
  }
  return result;
}
export function geminiPlanJsonSchema() { return supportedSchema(z.toJSONSchema(productionPlanSchema)); }
