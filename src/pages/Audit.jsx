import { useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import ReactMarkdown from 'react-markdown';
import Reveal from '../components/Reveal';
import { WORKER_BASE } from '../config';
import { fetchAudit, AuditHttpError } from '../lib/truthEngine';

// One audit, on its own address: a small page that can be sent to someone.
// Read-only — the engine page is where an audit is continued.
export default function Audit() {
  const { id } = useParams();
  const [audit, setAudit] = useState(null);
  const [error, setError] = useState(null);
  const [loading, setLoading] = useState(true);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    let live = true;
    setLoading(true);
    setError(null);

    fetchAudit({ base: WORKER_BASE, id })
      .then((found) => {
        if (live) setAudit(found);
      })
      .catch((e) => {
        if (!live) return;
        setError({
          message:
            e instanceof AuditHttpError
              ? e.message
              : (e && e.message) || 'That audit could not be loaded.',
        });
      })
      .finally(() => {
        if (live) setLoading(false);
      });

    return () => {
      live = false;
    };
  }, [id]);

  const turns = audit ? audit.messages.filter((m) => m.role !== 'system') : [];
  const report = turns
    .filter((m) => m.role === 'assistant')
    .map((m) => m.content)
    .join('\n\n---\n\n');

  async function copyReport() {
    try {
      await navigator.clipboard.writeText(report);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch (e) {
      /* the phone refused the clipboard; select by hand */
    }
  }

  return (
    <main className="py-12 pb-20">
      <div className="shell max-w-[820px]">
        <Reveal y={16} className="mb-7">
          <span className="eyebrow">Truth Engine audit</span>
          <h1 className="mt-2.5 text-[clamp(1.7rem,3.2vw,2.4rem)] font-semibold">Docket audit</h1>
          <p className="mt-2 font-mono text-[0.74rem] text-muted">audit {id}</p>
        </Reveal>

        {loading ? (
          <p className="font-mono text-[0.78rem] uppercase tracking-[0.06em] text-muted">Loading…</p>
        ) : null}

        {error ? (
          <div className="rounded-base border border-danger/40 bg-danger/[0.06] px-4 py-3 text-[0.9rem] text-danger">
            {error.message}
          </div>
        ) : null}

        {audit ? (
          <>
            {turns.map((msg, i) =>
              msg.role === 'user' ? (
                <div key={i} className="mb-6 border-b border-line pb-6">
                  <div className="mb-2 font-mono text-[0.7rem] uppercase tracking-[0.14em] text-muted">Docket</div>
                  <div className="whitespace-pre-wrap text-[0.92rem] text-muted">{msg.content}</div>
                </div>
              ) : (
                <div key={i} className="mb-6 border-b border-line pb-6 last:border-b-0">
                  <div className="mb-2 font-mono text-[0.7rem] uppercase tracking-[0.14em] text-muted">
                    Truth Engine
                  </div>
                  <div className="report">
                    <ReactMarkdown>{msg.content}</ReactMarkdown>
                  </div>
                </div>
              )
            )}

            <div className="mt-8 flex flex-wrap items-center gap-2">
              <Link to={`/engine?audit=${encodeURIComponent(audit.auditId)}`} className="btn btn-primary btn-sm">
                Continue this audit
              </Link>
              <button type="button" onClick={copyReport} disabled={!report} className="btn btn-ghost btn-sm">
                {copied ? 'Copied' : 'Copy'}
              </button>
              <a
                href={`${WORKER_BASE}/v1/audit/${encodeURIComponent(audit.auditId)}`}
                target="_blank"
                rel="noopener noreferrer"
                className="btn btn-ghost btn-sm"
              >
                Raw record
              </a>
            </div>
          </>
        ) : null}

        {!audit && !loading ? (
          <div className="mt-6">
            <Link to="/engine" className="btn btn-ghost btn-sm">
              Back to the engine
            </Link>
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
