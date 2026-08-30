import { useEffect } from 'react'
import { Moon, Sun } from 'lucide-react'
import { Link, NavLink, Outlet, useLocation } from 'react-router-dom'
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
        <Link className="wordmark" to="/">PatientTriage<span>.ai</span></Link>
        <div className="nav-links">
          <NavLink to="/product">Product</NavLink>
          <NavLink to="/evidence">Evidence</NavLink>
          <NavLink to="/deploy">Deploy</NavLink>
          <NavLink to="/security">Security</NavLink>
          <NavLink to="/about">About</NavLink>
          <ThemeToggle />
          <Link className="btn btn-primary btn-sm" to="/console">
            Launch console<span className="arr">&rsaquo;</span>
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

function Footer() {
  return (
    <div className="mfoot">
      <div className="wrap">
        <div className="foot-grid">
          <div>
            <Link className="wordmark" to="/">PatientTriage<span style={{ color: '#C89BFF' }}>.ai</span></Link>
            <p style={{ marginTop: 8 }}>The system recommends. The clinician decides.</p>
          </div>
          <div style={{ display: 'flex', gap: 36 }}>
            <div><Link to="/product">Product</Link></div>
            <div><Link to="/evidence">Evidence</Link></div>
            <div><Link to="/deploy">Deploy</Link></div>
            <div><Link to="/security">Security</Link></div>
            <div><Link to="/about">About</Link></div>
            <div><Link to="/console">Console</Link></div>
          </div>
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

export default function Shell() {
  return (
    <div className="mkt">
      <ScrollToTop />
      <Nav />
      <Outlet />
      <Footer />
    </div>
  )
}
