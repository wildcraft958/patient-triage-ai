import { useEffect } from 'react'
import { Moon, Sun } from 'lucide-react'
import { Link, NavLink, Outlet, useLocation } from 'react-router-dom'
import { Mark } from '../brand/Logo'
import { useTheme } from '../theme/themeContext'
import '../marketing.css'

function ScrollToTop() {
  const { pathname } = useLocation()
  useEffect(() => { window.scrollTo(0, 0) }, [pathname])
  return null
}

function ThemeToggle() {
  const { dark, toggle } = useTheme()
  const Icon = dark ? Sun : Moon
  return (
    <button onClick={toggle} className="theme-toggle"
            title={dark ? 'Switch to the light theme' : 'Switch to the dark theme'}
            aria-label={dark ? 'Switch to the light theme' : 'Switch to the dark theme'}>
      <Icon size={17} aria-hidden="true" />
    </button>
  )
}

function Nav() {
  return (
    <div className="mnav">
      <div className="wrap nav-inner">
        {/* Identity, not navigation. Home is a link in the row like every
            other destination, so nobody has to guess that the mark is one. */}
        <span className="wordmark"><Mark size={28} /><span className="wm-text">PatientTriage<span>.ai</span></span></span>
        {/* Four destinations, not five. "Deploy" was the one nobody could
            read off the word: it reached a page about where the model runs,
            and it sat next to four nouns describing the product. It is linked
            from the deployment section and from the footer, where a reader
            looking for it is already looking. */}
        <div className="nav-links">
          <NavLink to="/" end>Home</NavLink>
          <NavLink to="/product">Product</NavLink>
          <NavLink to="/evidence">Evidence</NavLink>
          <NavLink to="/security">Security</NavLink>
          <NavLink to="/about">About</NavLink>
          <ThemeToggle />
          <Link className="btn btn-primary btn-sm" to="/console">
            Launch the console<span className="arr">&rsaquo;</span>
          </Link>
        </div>
      </div>
    </div>
  )
}

export function CtaBand({ title, sub, showConsole = true }) {
  return (
    <section className="cta-band">
      <div className="wrap">
        <h2>{title}</h2>
        {sub && <p>{sub}</p>}
        <div className="hero-ctas">
          {showConsole && (
            <Link className="btn btn-invert" to="/console">
              Launch the console<span className="arr">&rsaquo;</span>
            </Link>
          )}
          <Link className="btn btn-outline btn-onDark" to="/about">About the team</Link>
        </div>
      </div>
    </section>
  )
}

const FOOTER = [
  ['The product', [['/', 'Home'], ['/product', 'What it does'], ['/console', 'The live console']]],
  ['The evidence', [['/evidence', 'Benchmarks and method'], ['/security', 'Security and governance']]],
  ['Running it', [['/deploy', 'Deployment models'], ['/about', 'About the team']]],
]

function Footer() {
  return (
    <div className="mfoot">
      <div className="wrap">
        <div className="foot-grid">
          <div>
            <span className="wordmark"><Mark size={26} /><span className="wm-text">PatientTriage<span>.ai</span></span></span>
            <p style={{ marginTop: 8 }}>The system recommends. The clinician decides.</p>
          </div>
          {/* Grouped and labelled, so every destination says what it is
              rather than sitting in a row of six bare nouns. */}
          <nav className="foot-cols" aria-label="Site">
            {FOOTER.map(([heading, links]) => (
              <div key={heading}>
                <p className="foot-head">{heading}</p>
                {links.map(([to, label]) => <Link key={to} to={to}>{label}</Link>)}
              </div>
            ))}
          </nav>
        </div>
        <div className="disclaimer">
          Built by Team NamoFans (IIT Kharagpur) for the Accenture Innovation Challenge 2026.
          PatientTriage.ai is a competition prototype, not a medical device, and must not be
          used for real clinical decision-making. Benchmark figures reference published
          academic baselines cited on the Evidence page.
        </div>
      </div>
    </div>
  )
}

// `children` is for the router's error element, which renders outside the
// outlet but should still arrive with the site's navigation around it.
export default function Shell({ children }) {
  return (
    <div className="mkt">
      <ScrollToTop />
      <Nav />
      {children ?? <Outlet />}
      <Footer />
    </div>
  )
}
