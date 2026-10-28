import { Link, NavLink, useLocation } from 'react-router-dom';

export function Nav() {
  const { pathname } = useLocation();
  const links = [
    { to: '/engine', label: 'Truth Engine' },
    { to: '/#ecosystem', label: 'EITL', hideSm: true },
    { to: '/#contact', label: 'Contact', hideSm: true },
  ];

  return (
    <header className="sticky top-0 z-20 border-b border-line bg-bg/90 backdrop-blur">
      <div className="shell flex min-h-[64px] items-center gap-6">
        <Link to="/" className="whitespace-nowrap font-mono text-[0.78rem] font-semibold tracking-[0.14em]">
          AI-NSPIRED<span className="text-primary">.</span>COM
        </Link>
        <nav className="ml-auto flex items-center gap-[22px] text-[0.92rem] max-sm:gap-3.5 max-sm:text-[0.84rem]">
          {links.map((l) =>
            l.to.startsWith('/#') ? (
              <a
                key={l.label}
                href={l.to}
                className={`text-muted hover:text-ink max-sm:hidden ${l.hideSm ? '' : ''}`}
              >
                {l.label}
              </a>
            ) : (
              <NavLink
                key={l.label}
                to={l.to}
                className={({ isActive }) =>
                  isActive ? 'text-ink no-underline' : 'text-muted hover:text-ink'
                }
              >
                {l.label}
              </NavLink>
            )
          )}
          <Link to="/engine" className="btn btn-primary btn-sm">
            Audit a docket free
          </Link>
        </nav>
      </div>
    </header>
  );
}

export function Footer() {
  return (
    <footer className="py-10 pb-14 text-[0.86rem] text-muted">
      <div className="shell flex flex-wrap justify-between gap-5">
        <span>&copy; AI-NSPIRED.COM</span>
        <span>Not legal advice.</span>
      </div>
    </footer>
  );
}
