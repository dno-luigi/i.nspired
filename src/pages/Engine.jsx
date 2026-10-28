import { useEffect, useRef, useState } from 'react';
import ReactMarkdown from 'react-markdown';
import Reveal from '../components/Reveal';
import { WORKER_BASE } from '../config';
import { runAudit, storeAudit, AuditHttpError } from '../lib/truthEngine';

// The line the old front end sent as the first message. The Worker uses a
// supplied `messages` array verbatim, so this is what shapes the audit.
const SYSTEM_PROMPT =
  'This is the architect requesting an audit. Be sure to explain the situation clearly and provide actionable information. I am justice.';

// A reload must not cost a docket that was already uploaded.
const STORAGE_KEY = 'truth-engine:session:v1';

function readSaved() {
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return {};
    const parsed = JSON.parse(raw);
    return parsed && typeof parsed === 'object' ? parsed : {};
  } catch (e) {
    return {};
  }
}

function ThreadBlock({ role, note, children }) {
  return (
    <div className="border-b border-line pb-6 last:border-b-0">
      <div className="mb-2 flex flex-wrap items-center gap-2 font-mono text-[0.7rem] uppercase tracking-[0.14em] text-muted">
        <span>{role === 'user' ? 'You' : 'Truth Engine'}</span>
        {note ? <span className="normal-case tracking-normal text-danger">{note}</span> : null}
      </div>
      {children}
    </div>
  );
}

export default function Engine() {
  const savedRef = useRef(null);
  if (savedRef.current === null) savedRef.current = readSaved();
  const saved = savedRef.current;

  const [notes, setNotes] = useState(() => (typeof saved.notes === 'string' ? saved.notes : ''));
  const [thread, setThread] = useState(() => (Array.isArray(saved.thread) ? saved.thread : []));
  const [auditId, setAuditId] = useState(() => saved.auditId || null);
  const [streaming, setStreaming] = useState('');
  const [thinking, setThinking] = useState('');
  const [followup, setFollowup] = useState('');
  const [busy, setBusy] = useState(false);
  const [status, setStatus] = useState(null);
  const [error, setError] = useState(null);
  const [copied, setCopied] = useState(false);
  const [restored, setRestored] = useState(
    () =>
      (typeof saved.notes === 'string' && saved.notes.trim().length > 0) ||
      (Array.isArray(saved.thread) && saved.thread.length > 0)
  );

  const messagesRef = useRef(Array.isArray(saved.messages) ? saved.messages : []);
  const auditIdRef = useRef(saved.auditId || null);
  const fileRef = useRef(null);

  const started = thread.length > 0;
  const canRun = !busy && notes.trim().length > 0;

  // Everything painful to lose is kept on the device. If it is too large for
  // storage it simply stays in memory.
  useEffect(() => {
    try {
      window.localStorage.setItem(
        STORAGE_KEY,
        JSON.stringify({ notes, thread, messages: messagesRef.current, auditId })
      );
    } catch (e) {
      /* over quota: keep going in memory */
    }
  }, [notes, thread, auditId]);

  async function onPickFiles(ev) {
    const files = Array.from(ev.target.files || []);
    if (!files.length) return;

    setRestored(false);
    setError(null);
    setStatus({ text: `Reading ${files.length} file${files.length === 1 ? '' : 's'}`, busy: true });

    for (const file of files) {
      try {
        const { readFileToText } = await import('../lib/files');
        const { text, pages } = await readFileToText(file);
        // Same shape the old front end appended into the box.
        setNotes((prev) => `${prev}\n\n--- ${file.name} ---\n${text}`.trimStart());
        setStatus({
          text: `Added ${file.name}${pages ? ` (${pages} page${pages === 1 ? '' : 's'})` : ''}`,
        });
      } catch (e) {
        setError({ message: `${file.name}: ${(e && e.message) || 'could not be read'}` });
        setStatus(null);
      }
    }

    if (fileRef.current) fileRef.current.value = '';
  }

  async function send({ userContent, history }) {
    setBusy(true);
    setError(null);
    setStreaming('');
    setThinking('');
    setRestored(false);
    setStatus({ text: 'Auditing', busy: true });

    try {
      const messages = [...history, { role: 'user', content: userContent }];
      const { text, reasoning, noAnswer } = await runAudit({
        base: WORKER_BASE,
        messages,
        auditId: auditIdRef.current,
        onDelta: (t) => setStreaming(t),
        onReasoning: (t) => setThinking(t),
        onStatus: (s) => setStatus({ ...s, busy: true }),
      });

      // If the preset returned reasoning but never an answer, show the
      // reasoning and say so plainly rather than presenting a blank report.
      if (noAnswer) {
        const only = [...messages, { role: 'assistant', content: reasoning, reasoningOnly: true }];
        setThread(only.filter((m) => m.role !== 'system'));
        setStreaming('');
        setThinking('');
        setStatus({ text: 'The preset returned reasoning but no answer', warn: true });
        return false;
      }

      const withAnswer = [...messages, { role: 'assistant', content: text }];
      messagesRef.current = withAnswer;
      setThread(withAnswer.filter((m) => m.role !== 'system'));
      setStreaming('');
      setThinking('');

      // Save, so the audit has a permalink and follow-ups can continue it.
      try {
        const id = await storeAudit({
          base: WORKER_BASE,
          content: userContent,
          messages: withAnswer,
          fullText: text,
          auditId: auditIdRef.current,
        });
        if (id) {
          auditIdRef.current = id;
          setAuditId(id);
        }
        setStatus({ text: 'Complete' });
      } catch (e) {
        setStatus({ text: `Audit complete, but saving failed: ${e.message}`, warn: true });
      }

      return true;
    } catch (e) {
      const message =
        e instanceof AuditHttpError
          ? `${e.code}: ${e.message}`
          : /Failed to fetch|NetworkError/i.test((e && e.message) || '')
            ? 'Could not reach the Worker. Check the connection and try again.'
            : (e && e.message) || 'Could not reach the Worker.';
      setError({ message });
      setStatus({ text: message, warn: true });
      setStreaming('');
      setThinking('');
      return false;
    } finally {
      setBusy(false);
    }
  }

  async function runAuditNow() {
    const content = notes.trim();
    if (!content || busy) return;

    const history = [{ role: 'system', content: SYSTEM_PROMPT }];
    messagesRef.current = history;
    auditIdRef.current = null;
    setAuditId(null);
    setThread([]);

    const ok = await send({ userContent: content, history });
    if (ok) setNotes('');
  }

  async function runFollowup() {
    const content = followup.trim();
    if (!content || busy) return;
    setFollowup('');
    const ok = await send({ userContent: content, history: messagesRef.current });
    if (!ok) setFollowup(content);
  }

  const fullReport = thread
    .filter((m) => m.role === 'assistant')
    .map((m) => m.content)
    .join('\n\n---\n\n');

  async function copyReport() {
    try {
      await navigator.clipboard.writeText(fullReport);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch (e) {
      setError({ message: 'Could not copy. Select the report and copy it by hand.' });
    }
  }

  async function shareReport() {
    if (navigator.share) {
      try {
        await navigator.share({ title: 'Truth Engine Audit', text: fullReport });
        return;
      } catch (e) {
        /* the person cancelled the sheet */
      }
    }
    copyReport();
  }

  return (
    <main className="py-12 pb-20">
      <div className="shell">
        <Reveal y={16} className="mb-7 flex flex-wrap items-start justify-between gap-6">
          <div>
            <span className="eyebrow">Truth Engine</span>
            <h1 className="mt-2.5 text-[clamp(1.9rem,3.6vw,2.8rem)] font-semibold">Audit a docket</h1>
            <p className="mt-3 max-w-[56ch] text-muted">
              Upload a docket, minute order, or paste the text. The audit streams back and is saved, so you can
              continue the thread and return to it later.
            </p>
          </div>
          <span className="inline-flex items-center gap-2 rounded-full border border-primary/30 bg-primary/[0.06] px-3 py-1.5 font-mono text-[0.7rem] uppercase tracking-[0.12em] text-primary">
            <i className="block h-1.5 w-1.5 rounded-full bg-primary" />
            Live
          </span>
        </Reveal>

        <Reveal delay={0.06} y={16} className="rounded-base border border-line bg-surface p-5">
          <input
            ref={fileRef}
            id="docket-files"
            type="file"
            accept=".pdf,.txt,.doc,.docx,application/pdf,text/plain"
            multiple
            onChange={onPickFiles}
            disabled={busy}
            className="sr-only"
          />
          <label
            htmlFor="docket-files"
            className={`flex cursor-pointer flex-col items-center gap-2 rounded-base border-2 border-dashed border-line bg-bg px-6 py-8 text-center transition-colors hover:border-primary/50 ${
              busy ? 'pointer-events-none opacity-50' : ''
            }`}
          >
            <span className="text-[0.95rem] font-medium">Tap to upload docket, minute order, or PDF</span>
            <span className="text-[0.8rem] text-muted">PDF, DOC, DOCX, TXT</span>
          </label>

          {error ? (
            <div className="mt-3 rounded-base border border-danger/40 bg-danger/[0.06] px-3.5 py-2.5 text-[0.86rem] text-danger">
              {error.message}
            </div>
          ) : null}

          {restored ? (
            <div className="mt-3 flex flex-wrap items-center gap-2 rounded-base border border-line bg-bg px-3.5 py-2.5 text-[0.84rem] text-muted">
              <span>Restored from your last visit on this device.</span>
              <button
                type="button"
                className="font-mono text-[0.72rem] uppercase tracking-[0.08em] underline underline-offset-2 hover:text-danger"
                onClick={() => {
                  setNotes('');
                  setThread([]);
                  setAuditId(null);
                  setRestored(false);
                  messagesRef.current = [];
                  auditIdRef.current = null;
                  try {
                    window.localStorage.removeItem(STORAGE_KEY);
                  } catch (e) {
                    /* nothing to clear */
                  }
                }}
              >
                Clear
              </button>
            </div>
          ) : null}

          <div className="mt-4">
            <label className="eyebrow mb-2 block" htmlFor="audit-input">
              Docket text
            </label>
            <textarea
              id="audit-input"
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              onKeyDown={(e) => {
                if ((e.metaKey || e.ctrlKey) && e.key === 'Enter') runAuditNow();
              }}
              placeholder="Paste your docket text, summary, or notes here..."
              rows={8}
              disabled={busy}
              className="block w-full resize-y rounded-base border border-line bg-bg px-4 py-3.5 font-mono text-[0.88rem] leading-relaxed text-ink outline-none focus:border-primary/50 focus:ring-2 focus:ring-primary/20"
            />
          </div>

          <button type="button" onClick={runAuditNow} disabled={!canRun} className="btn btn-primary mt-4 w-full">
            {busy ? 'Auditing…' : 'Audit'}
          </button>
          {!notes.trim() ? (
            <p className="mt-2 text-center text-[0.8rem] text-muted">
              Upload a file or paste the docket text above to enable the audit.
            </p>
          ) : null}
        </Reveal>

        {status ? (
          <div
            className={`mt-5 flex min-h-[20px] items-center gap-2.5 font-mono text-[0.76rem] uppercase tracking-[0.06em] ${
              status.warn ? 'text-danger' : 'text-muted'
            }`}
            role="status"
            aria-live="polite"
          >
            <span
              className={`block h-[7px] w-[7px] shrink-0 rounded-full ${
                status.warn ? 'bg-danger' : 'bg-primary'
              } ${status.busy ? 'animate-pulse' : ''}`}
            />
            <span className="normal-case tracking-normal">{status.text}</span>
          </div>
        ) : null}

        {(thread.length > 0 || streaming || thinking) && (
          <div className="mt-8 grid gap-6">
            {thread.map((msg, i) =>
              msg.role === 'user' ? (
                <ThreadBlock key={i} role="user">
                  <div className="whitespace-pre-wrap text-[0.92rem] text-muted">{msg.content}</div>
                </ThreadBlock>
              ) : (
                <ThreadBlock
                  key={i}
                  role="assistant"
                  note={msg.reasoningOnly ? 'reasoning only — no answer returned' : null}
                >
                  <div className="report">
                    <ReactMarkdown>{msg.content}</ReactMarkdown>
                  </div>
                </ThreadBlock>
              )
            )}

            {streaming ? (
              <ThreadBlock role="assistant">
                <div className="report">
                  <ReactMarkdown>{streaming}</ReactMarkdown>
                </div>
              </ThreadBlock>
            ) : null}

            {!streaming && thinking ? (
              <ThreadBlock role="assistant" note="working">
                <details open className="rounded-base border border-line bg-surface px-4 py-3">
                  <summary className="cursor-pointer font-mono text-[0.74rem] uppercase tracking-[0.1em] text-muted">
                    Model reasoning
                  </summary>
                  <div className="mt-2 max-h-64 overflow-y-auto whitespace-pre-wrap text-[0.82rem] leading-relaxed text-muted">
                    {thinking}
                  </div>
                </details>
              </ThreadBlock>
            ) : null}
          </div>
        )}

        {started ? (
          <div className="mt-8">
            <textarea
              value={followup}
              onChange={(e) => setFollowup(e.target.value)}
              placeholder="Add follow-up information or ask a question..."
              rows={3}
              disabled={busy}
              className="block w-full resize-y rounded-base border border-line bg-bg px-4 py-3 font-mono text-[0.88rem] leading-relaxed text-ink outline-none focus:border-primary/50 focus:ring-2 focus:ring-primary/20"
            />
            <div className="mt-2 flex flex-wrap items-center gap-2">
              <button
                type="button"
                onClick={runFollowup}
                disabled={busy || !followup.trim()}
                className="btn btn-primary btn-sm"
              >
                Send follow-up
              </button>
              <button type="button" onClick={copyReport} disabled={!fullReport} className="btn btn-ghost btn-sm">
                {copied ? 'Copied' : 'Copy'}
              </button>
              <button type="button" onClick={shareReport} disabled={!fullReport} className="btn btn-ghost btn-sm">
                Share
              </button>
              <a
                href="https://theofficialaicounsel.com"
                target="_blank"
                rel="noopener noreferrer"
                className="btn btn-ghost btn-sm"
              >
                Send to AI Counsel
              </a>
            </div>
          </div>
        ) : null}

        {auditId ? (
          <div className="mt-6 flex flex-wrap items-center gap-4 font-mono text-[0.74rem] text-muted">
            <span>audit {auditId}</span>
            <a
              href={`${WORKER_BASE}/v1/audit/${encodeURIComponent(auditId)}`}
              target="_blank"
              rel="noopener noreferrer"
              className="text-primary"
            >
              permalink
            </a>
          </div>
        ) : null}

        <p className="mt-10 max-w-[62ch] text-[0.88rem] text-muted">
          Not legal advice. The Truth Engine shows its working so a human can check it; accountability stays with the
          person who acts on it.
        </p>
      </div>
    </main>
  );
}
