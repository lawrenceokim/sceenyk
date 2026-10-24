import "server-only";
import { OpenAIProductSheetProvider } from "./openai";
import type { ProductSheetProvider } from "./provider";

export function createProductSheetProvider(): ProductSheetProvider { return new OpenAIProductSheetProvider(); }
