import type { Instrumentation } from "next";
import { serverRenderDiagnostic } from "@/lib/diagnostics/server-render";

export const onRequestError: Instrumentation.onRequestError = (error, _request, context) => {
  if (process.env.NODE_ENV !== "development") return;
  console.error("SCEENYK_SERVER_REQUEST_ERROR", serverRenderDiagnostic(error, context));
};
