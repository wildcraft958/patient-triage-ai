import { Link } from 'react-router-dom'

// Somewhere to land that is still the product. The router's own fallback is
// an unstyled stack trace, which is a poor thing to hand anyone who mistypes.
const ELSEWHERE = [
  ['/signin', 'The nurse console', 'The live board, and the demo shift'],
  ['/product', 'The product', 'What the system does, screen by screen'],
  ['/evidence', 'The evidence', 'Benchmarks, methodology and what they do not cover'],
]

export default function NotFound() {
  return (
    <>
      <header className="page-hero">
        <div className="wrap">
          <div className="eyebrow">404</div>
          <h1>That page isn't here.</h1>
          <p className="lede">
            The link may be old, or the address slightly off. Everything the
            site holds is one of these.
          </p>
        </div>
      </header>

      <section>
        <div className="wrap">
          <div className="phases">
            {ELSEWHERE.map(([to, title, body]) => (
              <Link key={to} className="phase-card" to={to}>
                <h3>{title}</h3>
                <p>{body}</p>
              </Link>
            ))}
          </div>
        </div>
      </section>
    </>
  )
}
