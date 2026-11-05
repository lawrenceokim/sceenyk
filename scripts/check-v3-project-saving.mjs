// Actual Save action/service with the real restricted server role, then the
// existing fixture route/worker. No hosted database, provider or media generation.
process.argv.push('--project-saving-only');
await import('./check-v3-location-director.mjs');
