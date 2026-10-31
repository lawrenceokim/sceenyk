import "server-only";
import { inspectImage } from "./runtime-media";

// Decode/size limits protect storage and rendering. Layout, content and style are the user's decision.
export const inspectLocationSheet = (bytes: Buffer) => inspectImage(bytes);
