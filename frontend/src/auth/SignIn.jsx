import { useState } from 'react'
import { Link } from 'react-router-dom'
import { Activity, ChevronRight, Eye, ShieldCheck } from 'lucide-react'
import { Btn } from '../console/ui'
import { DIRECTORY, ROLES } from './roles'
import { useSession } from './sessionContext'

const ORDER = ['nurse', 'ma', 'admin']

const PROOF = [
  [ShieldCheck, 'Nothing identifying leaves the building',
   'Names, contact details and locations are removed before any model reads a word.'],
  [Eye, 'The waiting room is watched, not just the front desk',
   'Every waiting patient carries a live acuity belief that drifts as they wait.'],
  [Activity, 'Every decision is on the record',
   'Both reasoning chains, the level, who changed it and why, written as it happens.'],
]

export default function SignIn() {
  const { signIn } = useSession()
  const [role, setRole] = useState('nurse')
  const [badge, setBadge] = useState(DIRECTORY.nurse.badge_id)

  const pick = (next) => { setRole(next); setBadge(DIRECTORY[next].badge_id) }

  return (
    <div className="min-h-screen grid lg:grid-cols-[1.05fr_1fr] bg-app">
      <aside className="bg-rail text-white px-8 py-10 lg:px-14 lg:py-16 flex flex-col">
        <Link to="/" className="inline-flex items-center gap-2.5 w-fit">
          <span className="w-8 h-8 rounded-sm bg-brand grid place-items-center
                           text-sm font-black tracking-tight">PT</span>
          <span className="text-base font-bold tracking-tight">
            PatientTriage<span className="text-brand">.ai</span>
          </span>
        </Link>

        <div className="mt-14 lg:mt-20 max-w-lg">
          <p className="text-[11px] font-bold uppercase tracking-[0.18em] text-brand">
            Emergency department
          </p>
          <h1 className="mt-3 text-3xl lg:text-[2.6rem] font-bold leading-[1.12] tracking-tight">
            Triage that doesn't stop at the front desk.
          </h1>
          <p className="mt-4 text-sm leading-relaxed text-slate-300">
            Two independent engines score every arrival. Every waiting patient
            stays under watch. You stay in command of the decision.
          </p>

          <ul className="mt-10 space-y-6">
            {PROOF.map(([Icon, title, body]) => (
              <li key={title} className="flex gap-3.5">
                <Icon size={17} className="text-brand shrink-0 mt-0.5" aria-hidden="true" />
                <div>
                  <p className="text-sm font-semibold">{title}</p>
                  <p className="text-xs text-slate-400 leading-relaxed mt-1">{body}</p>
                </div>
              </li>
            ))}
          </ul>
        </div>

        <p className="mt-auto pt-12 text-[11px] text-slate-500 leading-relaxed max-w-lg">
          The system recommends. The clinician decides.
        </p>
      </aside>

      <main className="flex items-center justify-center px-6 py-12">
        <div className="w-full max-w-sm">
          <h2 className="text-xl font-bold tracking-tight text-ink">Sign in to your shift</h2>
          <p className="mt-1.5 text-xs text-ink-2 leading-relaxed">
            Your badge signs every decision you make on the board.
          </p>

          <fieldset className="mt-7">
            <legend className="text-[11px] font-bold uppercase tracking-[0.12em] text-ink-2">
              Role
            </legend>
            <div className="mt-2.5 space-y-2">
              {ORDER.map((key) => {
                const r = ROLES[key]
                const on = role === key
                return (
                  <button key={key} type="button" onClick={() => pick(key)}
                          aria-pressed={on}
                          className={`w-full text-left rounded-md border px-3.5 py-2.5
                                      transition-colors cursor-pointer
                                      ${on ? 'border-brand bg-brand-tint'
                                           : 'border-line bg-card hover:border-line-2'}`}>
                    <span className={`block text-xs font-bold
                                      ${on ? 'text-brand-ink' : 'text-ink'}`}>
                      {r.title}
                    </span>
                    <span className="block text-[11px] text-ink-2 leading-snug mt-0.5">
                      {r.blurb}
                    </span>
                  </button>
                )
              })}
            </div>
          </fieldset>

          <label className="block mt-5">
            <span className="text-[11px] font-bold uppercase tracking-[0.12em] text-ink-2">
              Badge ID
            </span>
            <input value={badge} onChange={(e) => setBadge(e.target.value)}
                   className="mt-1.5 w-full rounded-sm border border-line bg-card px-3 py-2
                              text-sm tabular-nums focus:border-brand focus:outline-none" />
          </label>

          <label className="block mt-3.5">
            <span className="text-[11px] font-bold uppercase tracking-[0.12em] text-ink-2">
              PIN
            </span>
            <input type="password" defaultValue="4821" readOnly
                   className="mt-1.5 w-full rounded-sm border border-line bg-app px-3 py-2
                              text-sm tracking-[0.3em] text-ink-2" />
          </label>

          <Btn variant="primary" size="lg" className="w-full mt-6"
               onClick={() => signIn(role, { badge_id: badge.trim() || DIRECTORY[role].badge_id })}>
            Start shift <ChevronRight size={15} aria-hidden="true" />
          </Btn>

          <Btn variant="outline" size="lg" className="w-full mt-2.5"
               onClick={() => signIn(role, { badge_id: badge.trim() || DIRECTORY[role].badge_id })}>
            Continue with hospital directory
          </Btn>

          <p className="mt-6 text-[11px] leading-relaxed text-ink-3 border-t border-line pt-4">
            Demonstration identity layer. A deployment binds this to the hospital
            directory over SAML or OIDC; here it only chooses which permissions
            the board grants you.
          </p>
        </div>
      </main>
    </div>
  )
}
