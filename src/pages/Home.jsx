import { Link } from 'react-router-dom';
import Reveal from '../components/Reveal';

const LEDGER = [
  { term: 'Source', desc: 'Verified source material and citations', state: 'Documented' },
  { term: 'Claim', desc: 'Extracted claim and key assertions', state: 'Identified' },
  { term: 'Conflict', desc: 'Contradictory information detected', state: 'Requires review', warn: true },
  { term: 'Expert review', desc: 'Human expert analysis and validation', state: 'Human accountable' },
  { term: 'Next question', desc: 'Open questions and areas for further research', state: 'Queued' },
];

const ECOSYSTEM = [
  { title: 'Truth Engine', body: 'Makes reasoning visible, testable and editable by experts.', to: '/engine', more: 'Open the engine' },
  { title: 'EITL', body: 'An Expert-in-the-Loop governance framework that keeps humans accountable where AI decisions matter.' },
  { title: 'The Official AI Counsel', body: 'Applied legal-risk clarity for founders and operators.' },
  { title: 'The Official AI University', body: 'A practical path for human-AI collaboration.' },
  { title: 'The Speakeasy', body: 'A private, vetted network for people building real systems, not hype.' },
];

const STEPS = [
  { num: '01', title: 'Pull from real sources', body: 'Retrieval starts from material that can be pointed at, not from a recollection.' },
  { num: '02', title: 'Cross-reference claims and surface contradictions', body: 'Each assertion is checked against the others so disagreement is visible rather than smoothed over.' },
  { num: '03', title: 'Return layered, confidence-rated answers backed by receipts', body: 'Every answer carries its citations, so it can be tested before anyone acts on it.' },
];

const PRINCIPLES = [
  { title: 'Pragmatic', body: 'Clarity that can be used.' },
  { title: 'Personal', body: 'Human expertise remains accountable.' },
  { title: 'Private', body: 'Zero-knowledge. You own your data. We do not sell your data.' },
];

const INBOXES = [
  { title: 'Founders and operators', body: 'You are facing a legal-risk decision and want the reasoning traced before you act.' },
  { title: 'Expert review', body: 'You are a practitioner and want to sit in the loop on how answers are validated.' },
  { title: 'Everything else', body: 'Press, partnerships, or a question that does not fit the other two.' },
];

export default function Home() {
  return (
    <>
      <section className="border-b border-line py-[72px] pb-14">
        <div className="shell">
          <Reveal y={12} amount={0.15}>
            <div className="rounded-base border border-l-4 border-line border-l-primary bg-surface p-5">
              <div className="flex items-start gap-3.5">
                <svg
                  viewBox="0 0 24 24"
                  aria-hidden="true"
                  className="mt-0.5 h-6 w-6 shrink-0 text-primary"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="1.6"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                >
                  <path d="M13 3H7a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h5" />
                  <path d="M13 3l5 5v3" />
                  <path d="M13 3v5h5" />
                  <circle cx="16.5" cy="16.5" r="2.5" />
                  <path d="m18.4 18.4 2.1 2.1" />
                </svg>
                <div>
                  <p className="text-[1.15rem] font-semibold leading-snug">Looking for the Truth Engine?</p>
                  <p className="mt-1 text-[0.95rem] text-muted">
                    This is where it used to be. You can find it here now.
                  </p>
                </div>
              </div>
              <Link to="/engine" className="btn btn-primary mt-4 w-full">
                Go to the Truth Engine <span aria-hidden="true">&rarr;</span>
              </Link>
            </div>
          </Reveal>
        </div>

        <div className="shell mt-12 grid items-end gap-12 lg:grid-cols-[1.35fr_0.65fr] max-lg:gap-8 max-lg:mt-10">
          <div>
            <Reveal y={14}>
              <span className="mb-[22px] inline-flex items-center gap-2 rounded-full border border-primary/30 bg-primary/[0.06] px-3 py-1.5 font-mono text-[0.7rem] uppercase tracking-[0.12em] text-primary">
                <i className="block h-1.5 w-1.5 rounded-full bg-primary" />
                EITL Governance Framework &middot; Active
              </span>
            </Reveal>
            <Reveal as="h1" delay={0.05} className="text-[clamp(2.2rem,5.2vw,3.9rem)] font-semibold">
              Human-guided AI systems for founders and operators facing legal risk.
            </Reveal>
            <Reveal as="p" delay={0.12} className="mt-[22px] max-w-[46ch] text-[1.08rem] text-muted">
              Make reasoning visible, testable and editable by experts before uncertainty becomes action.
            </Reveal>
            <Reveal delay={0.18} className="mt-[30px] flex flex-wrap gap-3">
              <a className="btn btn-primary" href="#contact">
                Send a message
              </a>
              <Link className="btn btn-ghost" to="/engine">
                Audit a docket free
              </Link>
            </Reveal>
          </div>

          <Reveal delay={0.1} amount={0.2} className="overflow-hidden rounded-base border border-line bg-surface">
            <div className="flex justify-between border-b border-line px-4 py-2.5 font-mono text-[0.7rem] uppercase tracking-[0.14em] text-muted">
              <span>Evidence Ledger</span>
              <span>Status</span>
            </div>
            {LEDGER.map((row, i) => (
              <Reveal
                key={row.term}
                delay={0.22 + i * 0.06}
                y={12}
                amount={0.2}
                className="flex justify-between gap-4 border-b border-line px-4 py-[13px] last:border-b-0"
              >
                <span>
                  <span className="font-medium">{row.term}</span>
                  <br />
                  <span className="text-[0.86rem] text-muted">{row.desc}</span>
                </span>
                <span
                  className={`whitespace-nowrap pt-[3px] font-mono text-[0.68rem] uppercase tracking-[0.08em] ${
                    row.warn ? 'text-accent' : 'text-primary'
                  }`}
                >
                  {row.state}
                </span>
              </Reveal>
            ))}
          </Reveal>
        </div>
      </section>

      <section id="ecosystem" className="border-b border-line py-16">
        <div className="shell">
          <Reveal className="mb-[34px] max-w-[60ch]">
            <span className="eyebrow">The ecosystem</span>
            <h2 className="mt-3 text-[clamp(1.6rem,3.2vw,2.4rem)] font-semibold">The complete Truth Engine ecosystem</h2>
            <p className="mt-3.5 text-muted">
              One methodology, one governance framework and three places to apply it. Each part feeds the next.
            </p>
          </Reveal>

          <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
            {ECOSYSTEM.map((card, i) => (
              <Reveal key={card.title} delay={i * 0.07} amount={0.25} className="card">
                <h3 className="text-[1.15rem] font-semibold">{card.title}</h3>
                <p className="text-[0.92rem] text-muted">{card.body}</p>
                {card.more ? (
                  <span className="mt-auto pt-2.5 font-mono text-[0.72rem] uppercase tracking-[0.1em] text-primary">
                    <Link to={card.to}>{card.more}</Link>
                  </span>
                ) : null}
              </Reveal>
            ))}
          </div>
        </div>
      </section>

      <section className="border-b border-line py-16">
        <div className="shell">
          <Reveal className="mb-[34px] max-w-[60ch]">
            <h2 className="text-[clamp(1.6rem,3.2vw,2.4rem)] font-semibold">How clarity is built</h2>
            <p className="mt-3.5 text-muted">Expert review stays in the loop.</p>
          </Reveal>

          <div className="grid gap-7 md:grid-cols-3">
            {STEPS.map((step, i) => (
              <Reveal key={step.num} delay={i * 0.08} amount={0.25}>
                <span className="font-mono text-[0.75rem] tracking-[0.14em] text-accent">{step.num}</span>
                <h3 className="my-2 text-[1.15rem] font-semibold">{step.title}</h3>
                <p className="text-[0.94rem] text-muted">{step.body}</p>
              </Reveal>
            ))}
          </div>
        </div>
      </section>

      <section className="border-b border-line py-16">
        <div className="shell">
          <Reveal className="mb-[34px]">
            <h2 className="text-[clamp(1.6rem,3.2vw,2.4rem)] font-semibold">Our principles</h2>
          </Reveal>
          <div className="grid gap-4 md:grid-cols-3">
            {PRINCIPLES.map((p, i) => (
              <Reveal key={p.title} delay={i * 0.08} amount={0.3} className="border-t-2 border-primary pt-4">
                <h3 className="text-[1.15rem] font-semibold">{p.title}</h3>
                <p className="mt-1.5 text-[0.92rem] text-muted">{p.body}</p>
              </Reveal>
            ))}
          </div>
        </div>
      </section>

      <section id="contact" className="border-b border-line py-16">
        <div className="shell">
          <Reveal className="mb-[34px] max-w-[60ch]">
            <h2 className="text-[clamp(1.6rem,3.2vw,2.4rem)] font-semibold">
              Put the right context in front of the right inbox
            </h2>
            <p className="mt-3.5 text-muted">
              Pick the inbox that fits. The Contact form opens with it already chosen. We triage daily.
            </p>
          </Reveal>
          <div className="grid gap-4 md:grid-cols-3">
            {INBOXES.map((box, i) => (
              <Reveal key={box.title} delay={i * 0.07} amount={0.25} className="card">
                <h3 className="text-[1.15rem] font-semibold">{box.title}</h3>
                <p className="text-[0.92rem] text-muted">{box.body}</p>
              </Reveal>
            ))}
          </div>
        </div>
      </section>
    </>
  );
}
