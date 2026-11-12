// Truth Engine front-end configuration.
// This is the only place a backend address belongs.

// The Worker the old front end called (window.TRUTH_ENGINE_API).
// Audits are answered by op, the pi harness: it owns the conversation, can
// search and read files, and keeps the docket in play across follow-ups.
// Saved records come back through op's /v1/audit/store proxy, so permalinks
// and the stored docket are unchanged.
export const WORKER_BASE = (import.meta.env.VITE_WORKER_BASE || 'https://pi-harness-example.ai-n.workers.dev').replace(
  /\/+$/,
  ''
);
