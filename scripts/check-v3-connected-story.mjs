// Actual saved-project/route/worker/disposable SQL fixture; no external I/O.
process.argv.push('--connected-story-only');
await import('./check-v3-location-director.mjs');
