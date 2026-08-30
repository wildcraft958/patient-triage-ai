import { House, LogOut, Moon, PanelLeft, Sun } from 'lucide-react'
import { useNavigate } from 'react-router-dom'
import { VIEWS } from './views'
import { useSession } from '../auth/sessionContext'
import { useTheme } from '../theme/themeContext'
import { Mark } from '../brand/Logo'
import { Initials } from './ui'

function Badge({ count, tone }) {
  if (!count) return null
  return (
    <span className={`ml-auto text-[10px] font-bold rounded-full px-1.5 py-px tabular-nums
                      ${tone === 'alert' ? 'bg-esi-2 text-esi-2-ink' : 'bg-rail-3 text-rail-ink'}`}>
      {count}
    </span>
  )
}

function IconButton({ icon: Icon, label, onClick }) {
  return (
    <button onClick={onClick} title={label} aria-label={label}
            className="p-1.5 rounded-sm text-rail-ink-2 hover:text-rail-fg hover:bg-rail-2
                       cursor-pointer shrink-0 focus-visible:outline-2
                       focus-visible:outline-brand focus-visible:outline-offset-1">
      <Icon size={15} aria-hidden="true" />
    </button>
  )
}

export default function Sidebar({ view, onView, counts, collapsed, onCollapse }) {
  const { user, role, signOut, can } = useSession()
  const { dark, toggle } = useTheme()
  const navigate = useNavigate()
  const wide = !collapsed

  return (
    <nav aria-label="Console sections"
         className="bg-rail text-rail-ink flex flex-col h-full min-w-0 overflow-hidden">
      {/* The lockup is not a link. Leaving a live shift is a deliberate act,
          not something that happens because a nurse aimed at the logo. */}
      <div className="flex items-center gap-2.5 h-12 px-3 border-b border-rail-2 shrink-0">
        <Mark size={28} />
        {wide && (
          <span className="text-[13px] font-bold text-rail-fg tracking-tight truncate">
            PatientTriage<span className="text-brand">.ai</span>
          </span>
        )}
        {wide && (
          <span className="ml-auto">
            <IconButton icon={PanelLeft} label="Collapse the navigation"
                        onClick={onCollapse} />
          </span>
        )}
      </div>

      {!wide && (
        <div className="flex justify-center pt-2 shrink-0">
          <IconButton icon={PanelLeft} label="Expand the navigation" onClick={onCollapse} />
        </div>
      )}

      <ul className="flex-1 py-3 space-y-0.5 overflow-y-auto overflow-x-hidden">
        {VIEWS.filter(({ id }) => id !== 'settings' || can.settings)
              .map(({ id, label, icon: Icon }) => {
          const on = view === id
          return (
            <li key={id}>
              <button onClick={() => onView(id)} title={label}
                      aria-current={on ? 'page' : undefined}
                      className={`w-full flex items-center gap-3 px-3.5 py-2 text-[12.5px]
                                  font-medium border-l-[3px] cursor-pointer transition-colors
                                  ${on ? 'border-brand bg-rail-2 text-rail-fg'
                                       : 'border-transparent hover:bg-rail-2 hover:text-rail-fg'}`}>
                <Icon size={17} className="shrink-0" aria-hidden="true" />
                {wide && <span className="truncate">{label}</span>}
                {wide && <Badge count={counts[id]} tone={counts[`${id}Tone`]} />}
              </button>
            </li>
          )
        })}
      </ul>

      <div className="border-t border-rail-2 p-2.5 shrink-0">
        {user && (
          <div className={`flex items-center gap-2.5 pb-2.5 mb-2 border-b border-rail-2
                           ${wide ? '' : 'justify-center'}`}>
            <Initials name={user.name} size="sm" />
            {wide && (
              <div className="min-w-0 flex-1">
                <p className="text-[12px] font-semibold text-rail-fg truncate">{user.name}</p>
                <p className="text-[10px] text-rail-ink-2 truncate">
                  <span className="tabular-nums">{user.badge_id}</span> · {role.title}
                </p>
              </div>
            )}
          </div>
        )}
        <div className={`flex items-center gap-1 ${wide ? '' : 'flex-col'}`}>
          <IconButton icon={House} label="Back to the product site"
                      onClick={() => navigate('/')} />
          <IconButton icon={dark ? Sun : Moon}
                      label={dark ? 'Switch to the light theme' : 'Switch to the dark theme'}
                      onClick={toggle} />
          {user && (
            <span className={wide ? 'ml-auto' : ''}>
              <IconButton icon={LogOut} label="Sign out" onClick={signOut} />
            </span>
          )}
        </div>
      </div>
    </nav>
  )
}
