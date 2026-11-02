// TEMPORARY Inngest shutdown (2026-11-02): acknowledge stale Cloud callbacks
// without loading the SDK, registering functions, reading bodies or doing work.
// vercel.json also terminates /api/inngest and /api/ingest before function routing.
// Restore the preserved signed handlers in lib/workflows/legacy-route.ts only
// together with the other guards listed in context/inngest-pause.md.
function disabledResponse() {
  return new Response(null, {
    status: 204,
    headers: { "X-Sceenyk-Inngest": "temporarily-disabled" },
  });
}

export {
  disabledResponse as GET,
  disabledResponse as POST,
  disabledResponse as PUT,
  disabledResponse as PATCH,
  disabledResponse as DELETE,
  disabledResponse as HEAD,
  disabledResponse as OPTIONS,
};
