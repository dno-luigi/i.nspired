// Truth Engine front-end configuration.
// This is the only place a backend address belongs.

// The Worker the old front end called (window.TRUTH_ENGINE_API). It answers
// /v1/audit, /v1/audit/store and /v1/audit/:id.
// op, the pi harness, does not serve those: its wrangler config runs the
// Worker only for /api/* and /agents/*, so /v1/* falls through to its static
// page and every audit call comes back as HTML.
export const WORKER_BASE = (import.meta.env.VITE_WORKER_BASE || 'https://orproxy.ai-n.workers.dev').replace(
  /\/+$/,
  ''
);
