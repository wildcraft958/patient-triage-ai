import { LogOut, PanelLeft } from 'lucide-react'
import { Link } from 'react-router-dom'
import { VIEWS } from './views'
import { useSession } from '../auth/sessionContext'
import { Initials } from './ui'


function Badge({ count, tone }) {
  if (!count) return null
  return (
    <span className={`ml-auto text-[10px] font-bold rounded-full px-1.5 py-px tabular-nums
                      ${tone === 'alert' ? 'bg-esi-2 text-white' : 'bg-rail-3 text-slate-200'}`}>
      {count}
    </span>
  )
}

export default function Sidebar({ view, onView, counts, collapsed, onCollapse }) {
  const { user, role, signOut } = useSession()
  const wide = !collapsed

  return (
    <nav aria-label="Console sections"
         className={`bg-rail text-slate-300 flex flex-col shrink-0 transition-[width]
                     duration-150 ${wide ? 'w-[220px]' : 'w-[64px]'}`}>
      <Link to="/" title="PatientTriage.ai"
            className="flex items-center gap-2.5 h-12 px-4 border-b border-rail-2 shrink-0">
        <span className="w-7 h-7 shrink-0 rounded-sm bg-brand grid place-items-center
                         text-[11px] font-black text-white tracking-tight">PT</span>
        {wide && (
          <span className="text-[13px] font-bold text-white tracking-tight truncate">
            PatientTriage<span className="text-brand">.ai</span>
          </span>
        )}
      </Link>

      <ul className="flex-1 py-3 space-y-0.5 overflow-y-auto">
        {VIEWS.map(({ id, label, icon: Icon }) => {
          const on = view === id
          return (
            <li key={id}>
              <button onClick={() => onView(id)} title={label}
                      aria-current={on ? 'page' : undefined}
                      className={`w-full flex items-center gap-3 px-4 py-2 text-[12.5px]
                                  font-medium border-l-[3px] cursor-pointer transition-colors
                                  ${on ? 'border-brand bg-rail-2 text-white'
                                       : 'border-transparent hover:bg-rail-2 hover:text-white'}`}>
                <Icon size={17} className="shrink-0" aria-hidden="true" />
                {wide && <span className="truncate">{label}</span>}
                {wide && <Badge count={counts[id]} tone={counts[`${id}Tone`]} />}
              </button>
            </li>
          )
        })}
      </ul>

      <div className="border-t border-rail-2 p-3 shrink-0">
        <button onClick={onCollapse} title={wide ? 'Collapse' : 'Expand'}
                className="flex items-center gap-3 w-full px-1 py-1.5 text-[11px]
                           hover:text-white cursor-pointer">
          <PanelLeft size={16} className={`shrink-0 ${wide ? '' : 'rotate-180'}`}
                     aria-hidden="true" />
          {wide && <span>Collapse</span>}
        </button>

        {user && (
          <div className={`mt-2 pt-3 border-t border-rail-2 flex items-center gap-2.5
                           ${wide ? '' : 'justify-center'}`}>
            <Initials name={user.name} size="sm" />
            {wide && (
              <div className="min-w-0 flex-1">
                <p className="text-[12px] font-semibold text-white truncate">{user.name}</p>
                <p className="text-[10px] text-slate-400 truncate">
                  <span className="tabular-nums">{user.badge_id}</span> · {role.title}
                </p>
              </div>
            )}
            {wide && (
              <button onClick={signOut} title="Sign out"
                      className="text-slate-400 hover:text-white cursor-pointer shrink-0">
                <LogOut size={15} aria-hidden="true" />
              </button>
            )}
          </div>
        )}
      </div>
    </nav>
  )
}
