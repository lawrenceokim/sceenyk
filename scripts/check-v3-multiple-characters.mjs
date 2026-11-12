// Reuse the actual route/worker fixture with only the focused M2 scenarios.
process.argv.push('--multiple-characters-only');
await import('./check-v3-location-director.mjs');
