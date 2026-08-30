import { useEffect, useState } from 'react'
import { ChevronDown, Lock, Send } from 'lucide-react'
import * as api from '../api'
import { Card, CardHead, Empty, Pill } from './ui'

const KIND_TONE = {
  deterministic: 'ok',
  learned: 'brand',
  'language model': 'info',
  policy: 'neutral',
}

const FILTERS = [
  ['all', 'All'],
  ['language model', 'Language model'],
  ['learned', 'Learned'],
  ['deterministic', 'Deterministic'],
  ['policy', 'Policy'],
]

// The four LangGraph nodes are a real count, not a slogan: redact, rules,
// llm, fuse, each wrapped and timed.
const GRAPH_NODES = 4

function Stat({ label, value, tone }) {
  return (
    <div className="bg-card px-4 py-3.5">
      <p className="text-[10px] font-bold uppercase tracking-[0.1em] text-ink-3">{label}</p>
      <p className={`text-2xl font-bold tabular-nums tracking-tight mt-0.5
                     ${tone === 'brand' ? 'text-brand-ink' : 'text-ink'}`}>{value}</p>
    </div>
  )
}

function Component({ c }) {
  const [open, setOpen] = useState(false)
  return (
    <article className="border border-line rounded-md bg-card">
      <button onClick={() => setOpen(!open)} aria-expanded={open}
              aria-label={`${open ? 'Hide' : 'Show'} details for ${c.name}`}
              className="w-full text-left px-4 py-3.5 cursor-pointer">
        <div className="flex items-start gap-3">
          <span className="w-10 h-10 shrink-0 rounded-md bg-brand-tint border border-brand-line
                           grid place-items-center text-[11px] font-black tracking-tight
                           text-brand-ink">
            {c.code}
          </span>
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-2 flex-wrap">
              <i className={`w-2 h-2 rounded-full shrink-0
                             ${c.status === 'active' ? 'bg-esi-5' : 'bg-esi-4'}`}
                 title={c.status} aria-hidden="true" />
              <h3 className="text-[13.5px] font-bold text-ink">{c.name}</h3>
              <Pill tone={KIND_TONE[c.kind] ?? 'neutral'}>{c.kind}</Pill>
              <Pill tone="neutral">{c.stage}</Pill>
              {c.egress && <Pill tone="warn">Leaves this machine</Pill>}
            </div>
            <p className="mt-1.5 text-[11px] font-mono text-brand-ink break-all">
              {c.implementation}
            </p>
            <p className="mt-1 text-[11.5px] leading-relaxed text-ink-2">{c.summary}</p>
          </div>
          <span className="flex items-center gap-3 text-[11px] text-ink-2 tabular-nums
                           shrink-0 pt-0.5">
            <span>{c.invocations} runs</span>
            {c.latency_ms > 0 && <span>{c.latency_ms.toFixed(1)} ms</span>}
            <ChevronDown size={14} className={open ? '' : '-rotate-90'} aria-hidden="true" />
          </span>
        </div>
      </button>

      {open && (
        <dl className="px-4 pb-3.5 pt-3 grid sm:grid-cols-3 gap-3 border-t border-line">
          {[['Decides', c.decides], ['Cannot', c.cannot], ['On failure', c.on_failure]]
            .map(([term, value]) => (
              <div key={term}>
                <dt className="text-[10px] font-bold uppercase tracking-[0.1em] text-ink-3 mb-1">
                  {term}
                </dt>
                <dd className="text-[11.5px] leading-relaxed text-ink-2">{value}</dd>
              </div>
            ))}
        </dl>
      )}
    </article>
  )
}

function Group({ inside, label, components }) {
  const Icon = inside ? Lock : Send
  if (!components.length) return null
  return (
    <Card>
      <CardHead title={
        <span className="flex items-center gap-1.5">
          <Icon size={12} aria-hidden="true" />{label}
        </span>
      } />
      <div className="p-3 space-y-2">
        {components.map((c) => <Component key={c.id} c={c} />)}
      </div>
    </Card>
  )
}

export default function Registry({ refreshKey }) {
  const [data, setData] = useState(null)
  const [filter, setFilter] = useState('all')

  useEffect(() => {
    api.getRegistry().then(setData).catch(() => {})
  }, [refreshKey])

  if (!data) return <Card><Empty>Loading the component registry.</Empty></Card>

  const all = data.components
  const shown = filter === 'all' ? all : all.filter((c) => c.kind === filter)
  const count = (kind) => all.filter((c) => c.kind === kind).length

  return (
    <div className="space-y-3">
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-px bg-line rounded-md overflow-hidden">
        <Stat label="Components" value={all.length} />
        <Stat label="Language model powered" value={count('language model')} tone="brand" />
        <Stat label="Deterministic" value={count('deterministic')} />
        <Stat label="LangGraph nodes" value={GRAPH_NODES} />
      </div>

      <Card>
        <div className="px-4 py-3.5">
          <h2 className="text-sm font-bold text-ink">What is running behind this board</h2>
          <p className="mt-1 text-[11.5px] leading-relaxed text-ink-2 max-w-3xl">
            Model identifiers and thresholds below are read from the running
            configuration, not restated, so this page cannot drift from the system
            it describes. The split is the privacy boundary, and exactly one
            component ever sends anything off this machine: the clinical reasoning
            path, which has only seen a de-identified copy.
          </p>
          <div className="flex flex-wrap gap-1.5 mt-3.5">
            {FILTERS.map(([key, label]) => {
              const on = filter === key
              const n = key === 'all' ? all.length : count(key)
              if (!n) return null
              return (
                <button key={key} onClick={() => setFilter(key)} aria-pressed={on}
                        className={`text-[11px] font-semibold rounded-full border px-3 py-1
                                    cursor-pointer transition-colors
                                    ${on ? 'bg-brand text-brand-fg border-brand'
                                         : 'bg-card text-ink-2 border-line hover:border-brand'}`}>
                  {label} <span className="tabular-nums opacity-70">{n}</span>
                </button>
              )
            })}
          </div>
        </div>
      </Card>

      <Group inside label={data.boundary.phi}
             components={shown.filter((c) => c.boundary === 'phi')} />
      <Group label={data.boundary.deidentified}
             components={shown.filter((c) => c.boundary === 'deidentified')} />
    </div>
  )
}
