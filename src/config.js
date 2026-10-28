// Truth Engine front-end configuration.
// This is the only place a backend address belongs.

// The Worker the old front end called (window.TRUTH_ENGINE_API).
export const WORKER_BASE = (import.meta.env.VITE_WORKER_BASE || 'https://orproxy.ai-n.workers.dev').replace(
  /\/+$/,
  ''
);
