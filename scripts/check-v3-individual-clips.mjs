// Actual owner route, worker and disposable PostgreSQL; all external I/O is mocked.
process.argv.push('--individual-clips-only');
await import('./check-v3-location-director.mjs');
