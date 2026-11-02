// TEMPORARY production usage pause (2026-11-02). Cloud acceptance/sync scripts
// must stop before loading credentials, polling, registering jobs or sending
// events. Remove their side-effect imports only when restoring Inngest as
// documented in context/inngest-pause.md. Offline fixture tests stay available.
throw new Error("INNGEST_TEMPORARILY_DISABLED: Cloud acceptance and sync are paused.");
