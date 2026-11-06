import { useEffect, useRef, useState } from 'react';
import ReactMarkdown from 'react-markdown';
import Reveal from '../components/Reveal';
import { WORKER_BASE } from '../config';
import { runAudit, storeAudit, fetchAudit, AuditHttpError } from '../lib/truthEngine';
import { isDictationSupported, startDictation, isSpeechSupported, speakText, stopSpeech } from '../lib/voice';

// The line the old front end sent as the first message. The Worker uses a
// supplied `messages` array verbatim, so this is what shapes the audit.
const SYSTEM_PROMPT =
  `You are the **AI-N Truth Engine**, an analytical instrument dedicated to legal analysis, objectivity, and transparency, operating under the AI-Nspired Foundation's methodology. Your purpose is to provide expert-level scrutiny of evidence and methodology, democratizing access to justice.

**ADHERE STRICTLY TO FIVE CORE PRINCIPLES:**

1.  **Uphold Strict Objectivity (Neutrality):** Base analysis **solely on provided evidence**. Never speculate, offer personal opinion, or be swayed by narrative. If evidence is insufficient, state the exact requirement to proceed.
2.  **Prioritize Methodological Scrutiny (Audit):** **Primary function is process audit**, not conclusion review. Relentlessly question the "how": data source reliability, reasoning soundness, and consistency with established field standards.
3.  **Practice Radical Transparency (Show Work):** Structure responses with clear headings and bullet points. **Bold key terms**. Provide a transparent, step-by-step chain of logic, explicitly citing evidence for every conclusion.
4.  **Acknowledge All Limitations (Integrity):** State your non-professional status (AI, not a licensed expert) and clearly specify how any low-quality/incomplete data impacts the **confidence level** of the analysis.
5.  **Deliver Actionable Intelligence (Synthesis):** Conclude every analysis with a **concise summary** of primary strengths and weaknesses, framed as potential **next steps, strategic advantages, or key questions for cross-examination**.

Maintain a **rigorous, logical, and direct tone**. Be brief but ensure sufficient detail for clear understanding.`;

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

// The phrase in flight, shown while it is still being corrected by the engine.
function Heard({ text }) {
  return (
    <p className="mb-2 flex items-start gap-2 rounded-base border border-primary/30 bg-primary/[0.05] px-3 py-2 text-[0.84rem] leading-snug text-muted">
      <span className="mt-[3px] block h-1.5 w-1.5 shrink-0 animate-pulse rounded-full bg-primary" />
      <span>{text}</span>
    </p>
  );
}

function PaperclipIcon() {
  return (
    <svg
      aria-hidden="true"
      viewBox="0 0 24 24"
      className="h-3.5 w-3.5"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d="M20.5 11.5 12 20a5.25 5.25 0 0 1-7.42-7.42l8.13-8.13a3.5 3.5 0 0 1 4.95 4.95l-8.13 8.13a1.75 1.75 0 0 1-2.47-2.47l7.42-7.42" />
    </svg>
  );
}

function MicIcon() {
  return (
    <svg
      aria-hidden="true"
      viewBox="0 0 24 24"
      className="h-3.5 w-3.5"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <rect x="9" y="2.5" width="6" height="11" rx="3" />
      <path d="M5.5 11a6.5 6.5 0 0 0 13 0" />
      <path d="M12 17.5V21" />
    </svg>
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
  const dictationRef = useRef(null);
  const dictationSeq = useRef(0);
  const speakingRef = useRef(null);

  const [listening, setListening] = useState(null); // 'notes' | 'followup' | null
  const [interim, setInterim] = useState('');
  const [speaking, setSpeaking] = useState(false);
  const [recall, setRecall] = useState('');
  const [recalling, setRecalling] = useState(false);

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

  // Leaving the page must not leave the microphone open or the phone talking to
  // an empty room.
  useEffect(
    () => () => {
      dictationSeq.current += 1;
      if (dictationRef.current) dictationRef.current.stop();
      if (speakingRef.current) speakingRef.current.stop();
      stopSpeech();
    },
    []
  );

  function stopDictation() {
    // Bumping the sequence makes every pending callback from the old session
    // inert, so a late result cannot land in a box the person has moved on from.
    dictationSeq.current += 1;
    if (dictationRef.current) {
      dictationRef.current.stop();
      dictationRef.current = null;
    }
    setListening(null);
    setInterim('');
  }

  function appendSpoken(target, text) {
    const clean = text.replace(/\s+/g, ' ').trim();
    if (!clean) return;
    const join = (prev) => (prev && !/\s$/.test(prev) ? `${prev} ${clean}` : `${prev || ''}${clean}`);
    if (target === 'followup') setFollowup(join);
    else setNotes(join);
  }

  function toggleDictation(target) {
    if (listening === target) {
      stopDictation();
      return;
    }
    stopDictation();

    if (!isDictationSupported()) {
      setError({ message: 'This browser cannot dictate. Type or paste instead, or open the page in Chrome or Safari.' });
      return;
    }

    setError(null);
    const seq = (dictationSeq.current += 1);
    const stillMine = () => seq === dictationSeq.current;

    try {
      dictationRef.current = startDictation({
        onFinal: (text) => {
          if (stillMine()) appendSpoken(target, text);
        },
        onInterim: (text) => {
          if (stillMine()) setInterim(text);
        },
        onError: (code) => {
          if (!stillMine()) return;
          setError({
            message:
              code === 'not-allowed' || code === 'service-not-allowed'
                ? 'Microphone access was refused. Allow it for this site in the browser settings, then tap Dictate again.'
                : code === 'audio-capture'
                  ? 'No microphone was found on this device.'
                  : code === 'network'
                    ? 'Dictation needs a connection to the browser’s speech service.'
                    : `Dictation stopped: ${code}.`,
          });
        },
        onEnd: () => {
          if (!stillMine()) return;
          dictationRef.current = null;
          setListening(null);
          setInterim('');
        },
      });
      setListening(target);
      setInterim('');
    } catch (e) {
      setError({ message: (e && e.message) || 'Dictation could not start.' });
    }
  }

  function stopReadAloud() {
    if (speakingRef.current) {
      speakingRef.current.stop();
      speakingRef.current = null;
    }
    stopSpeech();
    setSpeaking(false);
  }

  function toggleReadAloud() {
    if (speaking) {
      stopReadAloud();
      return;
    }
    if (!fullReport) return;
    if (!isSpeechSupported()) {
      setError({ message: 'This browser cannot read text aloud.' });
      return;
    }

    setError(null);
    try {
      speakingRef.current = speakText(fullReport, {
        onEnd: () => {
          speakingRef.current = null;
          setSpeaking(false);
        },
        onError: () => {
          speakingRef.current = null;
          setSpeaking(false);
          setError({ message: 'Reading aloud stopped unexpectedly.' });
        },
      });
      setSpeaking(true);
    } catch (e) {
      setError({ message: (e && e.message) || 'Reading aloud could not start.' });
    }
  }

  // A link from somewhere else (/engine?audit=<id>) brings that audit back up.
  const linkedLoaded = useRef(false);
  useEffect(() => {
    if (linkedLoaded.current) return;
    linkedLoaded.current = true;

    const wanted = new URLSearchParams(window.location.search).get('audit');
    if (!wanted) return;

    // Drop the query so a reload does not fetch it a second time.
    if (window.history && window.history.replaceState) window.history.replaceState(null, '', '/engine');
    loadAudit(wanted);
  }, []);

  // Pull a stored audit back up from its id, its permalink, or a /a/ page link.
  async function loadAudit(input) {
    const raw = String(input || '').trim();
    if (!raw || recalling) return;

    const id = raw.split('?')[0].replace(/\/+$/, '').split('/').pop();
    if (!id) return;

    setRecalling(true);
    setError(null);
    setStatus({ text: `Looking up ${id}`, busy: true });

    try {
      const audit = await fetchAudit({ base: WORKER_BASE, id });
      stopDictation();
      stopReadAloud();
      setThread(audit.messages.filter((m) => m.role !== 'system'));
      messagesRef.current = audit.messages;
      auditIdRef.current = audit.auditId;
      setAuditId(audit.auditId);
      setStreaming('');
      setThinking('');
      setRestored(false);
      setRecall('');
      setStatus({ text: `Loaded audit ${audit.auditId}` });
    } catch (e) {
      const message =
        e instanceof AuditHttpError ? e.message : (e && e.message) || 'That audit could not be loaded.';
      setError({ message });
      setStatus({ text: message, warn: true });
    } finally {
      setRecalling(false);
    }
  }

  async function onPickFiles(ev) {
    const files = Array.from(ev.target.files || []);
    if (!files.length) return;

    setRestored(false);
    setError(null);
    setStatus({ text: `Reading ${files.length} file${files.length === 1 ? '' : 's'}`, busy: true });

    for (const file of files) {
      try {
        const { readFileToText } = await import('../lib/files');
        const { text, pages, note } = await readFileToText(file);
        // Same shape the old front end appended into the box.
        setNotes((prev) => `${prev}\n\n--- ${file.name} ---\n${text}`.trimStart());
        const detail = pages ? `${pages} page${pages === 1 ? '' : 's'}` : note;
        setStatus({ text: `Added ${file.name}${detail ? ` (${detail})` : ''}` });
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

    // Neither the microphone nor the speaker belongs in the middle of an audit:
    // anything dictated now would land in a box that is about to be cleared.
    stopDictation();
    stopReadAloud();

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
    stopDictation();
    stopReadAloud();
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
            <span className="text-[0.8rem] text-muted">PDF, DOCX, TXT — or any file, with the paperclip below</span>
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

          <div className="mt-3 flex flex-wrap items-center gap-2 rounded-base border border-line bg-bg px-3 py-2">
            <label className="eyebrow whitespace-nowrap" htmlFor="audit-recall">
              Recall
            </label>
            <input
              id="audit-recall"
              value={recall}
              onChange={(e) => setRecall(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') loadAudit(recall);
              }}
              placeholder="audit id or link"
              disabled={busy || recalling}
              autoComplete="off"
              autoCapitalize="off"
              spellCheck={false}
              className="min-w-0 flex-1 bg-transparent font-mono text-[0.84rem] text-ink outline-none placeholder:text-muted"
            />
            <button
              type="button"
              onClick={() => loadAudit(recall)}
              disabled={busy || recalling || !recall.trim()}
              className="tool-btn"
            >
              {recalling ? 'Loading' : 'Load'}
            </button>
          </div>

          <div className="mt-4">
            <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
              <label className="eyebrow block" htmlFor="audit-input">
                Docket text
              </label>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => fileRef.current && fileRef.current.click()}
                  disabled={busy}
                  className="tool-btn"
                  title="Attach any file"
                >
                  <PaperclipIcon />
                  Attach
                </button>
                <button
                  type="button"
                  onClick={() => toggleDictation('notes')}
                  disabled={busy}
                  aria-pressed={listening === 'notes'}
                  title={listening === 'notes' ? 'Stop dictating' : 'Dictate instead of typing'}
                  className={`tool-btn ${listening === 'notes' ? 'tool-btn-on' : ''}`}
                >
                  <MicIcon />
                  {listening === 'notes' ? 'Listening' : 'Dictate'}
                </button>
              </div>
            </div>

            {listening === 'notes' && interim ? <Heard text={interim} /> : null}

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
            <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
              <span className="eyebrow">Follow-up</span>
              <button
                type="button"
                onClick={() => toggleDictation('followup')}
                disabled={busy}
                aria-pressed={listening === 'followup'}
                className={`tool-btn ${listening === 'followup' ? 'tool-btn-on' : ''}`}
              >
                <MicIcon />
                {listening === 'followup' ? 'Listening' : 'Dictate'}
              </button>
            </div>

            {listening === 'followup' && interim ? <Heard text={interim} /> : null}

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
              <button
                type="button"
                onClick={toggleReadAloud}
                disabled={!fullReport}
                aria-pressed={speaking}
                className="btn btn-ghost btn-sm"
              >
                {speaking ? 'Stop reading' : 'Read aloud'}
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
            <a href={`/a/${encodeURIComponent(auditId)}`} className="text-primary">
              page
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
