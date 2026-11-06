// Truth Engine client for the live Worker.
//
// Matches what the old front end sent:
//   POST /v1/audit        { messages, type: 'docket', stream: true, audit_id? }
//                         returns OpenRouter's SSE passthrough:
//                         data: {"choices":[{"delta":{"content":"..."}}]} ... data: [DONE]
//   POST /v1/audit/store  { content, type, fullText, messages, audit_id? } -> { audit_id }
//   GET  /v1/audit/:id    the stored audit as JSON
//
// The Worker accepts `messages` verbatim, so the client carries the whole
// conversation, including its system line and the assistant's replies.

export class AuditHttpError extends Error {
  constructor(status, code, message) {
    super(message);
    this.name = 'AuditHttpError';
    this.status = status;
    this.code = code;
  }
}

// OpenRouter sends the token as delta.content while streaming, or
// message.content when it answers in one piece.
export function extractDelta(payload) {
  const choice = payload && payload.choices && payload.choices[0];
  if (!choice) return null;
  const text = choice.delta ? choice.delta.content : choice.message ? choice.message.content : null;
  return typeof text === 'string' ? text : null;
}

// Reasoning models (the @preset/truth preset currently resolves to one) stream
// their working in delta.reasoning and may send an empty delta.content for a
// long time. Without this the page looks blank while the model is thinking.
export function extractReasoning(payload) {
  const choice = payload && payload.choices && payload.choices[0];
  if (!choice || !choice.delta) return null;
  const text = choice.delta.reasoning;
  return typeof text === 'string' && text ? text : null;
}

async function readError(res) {
  const raw = await res.text().catch(() => '');
  let parsed = null;
  try {
    parsed = JSON.parse(raw);
  } catch (e) {
    parsed = null;
  }
  // The Worker answers errors as { error: 'audit_not_found' } — a token, not a
  // sentence. Keep it as the code and give the person something readable.
  const token =
    parsed && typeof parsed.error === 'string' && /^[a-z][a-z0-9_]*$/.test(parsed.error) ? parsed.error : null;
  const code = (parsed && parsed.code) || token || `http_${res.status}`;
  const message =
    (parsed && (parsed.message || parsed.detail)) ||
    (res.status === 404 ? 'Nothing is stored under that id.' : null) ||
    (parsed && parsed.error) ||
    raw ||
    res.statusText ||
    'The Worker refused the request.';
  return new AuditHttpError(res.status, code, typeof message === 'string' ? message : JSON.stringify(message));
}

/**
 * Stream one audit.
 * onDelta receives the whole text so far; onStatus receives { text, warn }.
 * Resolves with { text }.
 */
export async function runAudit({ base, messages, auditId, onDelta, onReasoning, onStatus, signal }) {
  if (onStatus) onStatus({ text: 'Auditing', warn: false });

  const body = { messages, type: 'docket', stream: true };
  if (auditId) body.audit_id = auditId;

  const res = await fetch(`${base}/v1/audit`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
    signal,
  });

  if (!res.ok) throw await readError(res);
  if (!res.body || !res.body.getReader) throw new Error('This browser cannot read a streaming response.');

  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let buffer = '';
  let text = '';
  let reasoning = '';
  let streamError = null;

  const handleLine = (line) => {
    const trimmed = line.trimStart();
    if (!trimmed || trimmed.charAt(0) === ':') return; // blank or keepalive comment
    if (trimmed.slice(0, 5) !== 'data:') return;
    const data = trimmed.slice(5).trim();
    if (!data) return;
    if (data === '[DONE]') return;

    let parsed = null;
    try {
      parsed = JSON.parse(data);
    } catch (e) {
      return; // an unreadable chunk is skipped, not fatal
    }
    if (parsed && parsed.error) {
      streamError = parsed.error.message || String(parsed.error);
      return;
    }
    const delta = extractDelta(parsed);
    if (delta) {
      text += delta;
      if (onDelta) onDelta(text);
    }
    const think = extractReasoning(parsed);
    if (think) {
      reasoning += think;
      if (onReasoning) onReasoning(reasoning);
    }
  };

  try {
    for (;;) {
      const chunk = await reader.read();
      if (chunk.done) break;
      buffer += decoder.decode(chunk.value, { stream: true });
      let cut;
      while ((cut = buffer.indexOf('\n')) !== -1) {
        handleLine(buffer.slice(0, cut).replace(/\r$/, ''));
        buffer = buffer.slice(cut + 1);
      }
    }
    if (buffer) handleLine(buffer.replace(/\r$/, ''));
  } finally {
    reader.releaseLock();
  }

  if (streamError) throw new AuditHttpError(502, 'stream_error', streamError);

  if (!text.trim()) {
    // Reasoning without an answer is a preset/model problem, not a transport
    // problem: report it as such instead of showing nothing.
    if (reasoning.trim()) return { text: '', reasoning, noAnswer: true };
    throw new Error('The Worker streamed no text. Check OPENROUTER_API_KEY and the @preset/truth preset.');
  }
  return { text, reasoning };
}

// The stored record is rebuilt from what /v1/audit/store was sent, but read it
// defensively: an older audit, or one written by another client, may carry the
// conversation under a different key.
export function normalizeAudit(json, fallbackId) {
  if (!json || typeof json !== 'object') return null;
  const record = json.audit && typeof json.audit === 'object' ? json.audit : json;

  const auditId = String(record.audit_id || record.auditId || record.id || fallbackId || '').trim();
  const content = typeof record.content === 'string' ? record.content : '';
  const fullText =
    typeof record.fullText === 'string'
      ? record.fullText
      : typeof record.full_text === 'string'
        ? record.full_text
        : '';

  const source = Array.isArray(record.messages)
    ? record.messages
    : Array.isArray(record.conversation)
      ? record.conversation
      : [];

  let messages = source
    .filter((m) => m && typeof m === 'object' && typeof m.role === 'string')
    .map((m) => ({ role: m.role, content: typeof m.content === 'string' ? m.content : String(m.content || '') }));

  if (!messages.length && fullText) {
    messages = [
      ...(content ? [{ role: 'user', content }] : []),
      { role: 'assistant', content: fullText },
    ];
  }

  if (!messages.length) return null;

  return {
    auditId: auditId || 'unknown',
    content,
    fullText,
    messages,
    createdAt: record.created_at || record.createdAt || null,
  };
}

// Brings a stored audit back up from its id or permalink.
export async function fetchAudit({ base, id, signal }) {
  const key = String(id || '').trim();
  if (!key) throw new AuditHttpError(400, 'missing_audit_id', 'An audit id is needed.');

  const res = await fetch(`${base}/v1/audit/${encodeURIComponent(key)}`, {
    headers: { accept: 'application/json' },
    signal,
  });
  if (!res.ok) throw await readError(res);

  const json = await res.json().catch(() => null);
  const audit = normalizeAudit(json, key);
  if (!audit) {
    throw new AuditHttpError(502, 'audit_unreadable', 'The Worker returned something that is not an audit.');
  }
  return audit;
}

// Saves the audit and returns its id. Without this there is no permalink.
export async function storeAudit({ base, content, messages, fullText, auditId, signal }) {
  const body = { content, type: 'docket', fullText, messages };
  if (auditId) body.audit_id = auditId;

  const res = await fetch(`${base}/v1/audit/store`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
    signal,
  });
  if (!res.ok) throw await readError(res);
  const json = await res.json().catch(() => ({}));
  return json && json.audit_id ? String(json.audit_id) : null;
}
