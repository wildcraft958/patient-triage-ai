import { useState } from 'react'
import { useDialog } from './useDialog'
import { ChevronDown, X } from 'lucide-react'
import * as api from '../api'
import { useSession } from '../auth/sessionContext'
import { RESTRICTED } from '../auth/roles'
import Splitter from './Splitter'
import { BeliefPeak, Btn, EsiBadge, Initials, Pill, VitalGauge, VitalTrend } from './ui'
import { VITAL_DEFS, VITAL_RANGE, alertLabel, fmt, fmtAge, outcomeLabel } from './format'

const AUDIT_SUMMARY = {
  triage: (p) => `ESI-${p.esi} · ${p.confidence} confidence · ${p.paths_agree ? 'paths agree' : 'paths disagree'}`,
  alert: (p) => `${alertLabel(p.kind)}: ${(p.reasons || []).join('; ')}`,
  alert_ack: (p) => `${alertLabel(p.kind)}, acknowledged by ${p.clinician_id}`,
  reassessment: (p) => `ESI-${p.previous_esi} re-triaged to ESI-${p.new_esi}`
                       + ` (${alertLabel(p.trigger).toLowerCase()})`,
  reassessment_check: (p) => `bedside check by ${p.clinician_id} after ${p.waited_min} min unassessed`,
  override: (p) => `ESI-${p.original_esi} to ESI-${p.new_esi} by ${p.clinician_id}: "${p.reason}"`,
  override_safety_flag: (p) => `high-risk downgrade acknowledged by ${p.clinician_id}`,
  reward: (p) => `reward ${p.reward} (${p.under_triage ? 'under-triage signal' : 'over-triage'})`,
  acceptance: (p) => `accepted ESI-${p.esi} by ${p.clinician_id} · reward +${p.reward}`,
  surge_enrichment: (p) => `deferred reasoning: ${p.outcome
    ? outcomeLabel(p.outcome) : `ESI-${p.previous_esi} to ESI-${p.new_esi}`}`,
}

function Section({ title, children, right }) {
  return (
    <section className="px-4 py-3.5 border-t border-line">
      <div className="flex items-center justify-between gap-2 mb-2.5">
        <h3 className="text-[10px] font-bold uppercase tracking-[0.12em] text-ink-3">
          {title}
        </h3>
        {right}
      </div>
      {children}
    </section>
  )
}

// A short staggered reveal, done in CSS so it costs no render and stops
// entirely under reduced motion. The panel reads as freshly reasoned without
// making anyone wait to read it.
// `cap` trims the visible points without hiding any: the rest are one click
// away and the full chain is still what the audit log stores. Path A argues in
// short clauses and needs no cap; Path B argues in paragraphs, and showing all
// of them pushed the vitals off the bottom of the panel.
function Chain({ items, cap }) {
  const [all, setAll] = useState(false)
  const capped = cap && !all && items.length > cap
  const shown = capped ? items.slice(0, cap) : items

  return (
    <>
      <ul className="space-y-1 text-[11px] leading-relaxed text-ink-2 list-disc pl-3.5">
        {shown.map((r, i) => (
          <li key={i} className="motion-safe:animate-[fade_.22s_ease-out_both]"
              style={{ animationDelay: `${i * 55}ms` }}>
            {r}
          </li>
        ))}
      </ul>
      {capped && (
        <button onClick={() => setAll(true)}
                className="mt-1.5 text-[10.5px] font-semibold text-brand-ink cursor-pointer
                           rounded-sm focus-visible:outline-2 focus-visible:outline-brand
                           focus-visible:outline-offset-2 hover:underline">
          Show all {items.length} points
        </button>
      )}
    </>
  )
}

// The two chains, side by side, with the one the system followed marked.
// A nurse asked to trust a recommendation is owed the disagreement.
function Paths({ fused, surge }) {
  const followed = (esi) => esi === fused.esi

  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5 items-start">
      <div className={`rounded-md border p-2.5 ${followed(fused.rules.esi)
                       ? 'border-ok-line bg-ok-bg/40' : 'border-line bg-card'}`}>
        <div className="flex items-center justify-between gap-2 mb-1.5">
          <h4 className="text-[10px] font-bold uppercase tracking-wide text-ink-3">
            Path A · rules
          </h4>
          {followed(fused.rules.esi) && <Pill tone="ok">Followed</Pill>}
        </div>
        <p className="text-xs font-bold text-ink mb-1.5">ESI-{fused.rules.esi}</p>
        <Chain items={fused.rules.reasons} />
      </div>

      {fused.llm ? (
        <div className={`rounded-md border p-2.5 ${followed(fused.llm.esi)
                         ? 'border-ok-line bg-ok-bg/40' : 'border-line bg-card'}`}>
          <div className="flex items-center justify-between gap-2 mb-1.5">
            <h4 className="text-[10px] font-bold uppercase tracking-wide text-ink-3">
              Path B · reasoning
            </h4>
            {followed(fused.llm.esi) && <Pill tone="ok">Followed</Pill>}
          </div>
          <p className="text-xs font-bold text-ink mb-1.5">
            ESI-{fused.llm.esi}
            <span className="ml-1.5 font-normal text-[10px] text-ink-3">
              self-rated {(fused.llm.confidence * 100).toFixed(0)}%
            </span>
          </p>
          <Chain items={fused.llm.reasoning} cap={3} />
        </div>
      ) : (
        <div className="rounded-md border border-line bg-app p-2.5">
          <h4 className="text-[10px] font-bold uppercase tracking-wide text-ink-3 mb-1.5">
            Path B · reasoning
          </h4>
          <p className="text-xs font-bold text-ink-2 mb-1.5">
            {surge ? 'Queued' : 'Did not return'}
          </p>
          <p className="text-[11px] leading-relaxed text-ink-2">
            {surge
              ? 'Surge fast path: the deterministic engine carries this triage on its own and the reasoning pass is queued, not dropped.'
              : 'The reasoning path did not return, so the deterministic engine carries this triage alone. That is the designed fail-safe, and it is why Path A never depends on the model.'}
          </p>
        </div>
      )}
    </div>
  )
}

function Vitals({ history, limits }) {
  if (!history?.length) return null
  const baseline = history[0].vitals
  const latest = history[history.length - 1].vitals
  return (
    <>
      <div className="grid grid-cols-3 gap-1.5">
        {VITAL_DEFS.map(({ key, label, unit, worseIfUp }) => {
          const now = latest[key]
          if (now == null) return null
          const base = baseline[key]
          const delta = base != null ? now - base : 0
          const worse = (worseIfUp ? delta > 0 : delta < 0) && Math.abs(delta) >= 1
          return (
            <div key={key} className={`rounded-sm border px-2 py-1.5
                            ${worse ? 'border-alert-line bg-alert-bg' : 'border-line bg-card'}`}>
              <div className="flex items-center justify-between gap-1">
                <p className="text-[9px] font-bold uppercase tracking-wide text-ink-3">{label}</p>
                <VitalTrend from={base} to={now} worseIfUp={worseIfUp} />
              </div>
              <span className={`block text-sm font-bold tabular-nums
                                ${worse ? 'text-alert-ink' : 'text-ink'}`}>
                {Number(now).toFixed(key === 'temp_c' ? 1 : 0)}{unit}
              </span>
              <VitalGauge value={now} range={VITAL_RANGE[key]} limit={limits?.[key]} />
            </div>
          )
        })}
      </div>
      <p className="mt-2 text-[11px] text-ink-3">
        {history.length > 1 ? `${history.length} readings since triage`
                            : 'Single reading at triage'}
        {limits && '. The tick on each bar is the limit for this patient\u2019s age band.'}
      </p>
    </>
  )
}

function BeliefStrip({ belief }) {
  if (!belief || belief.length !== 5) return null
  return (
    <div className="flex items-end gap-1.5">
      {belief.map((p, i) => (
        <div key={i} className="flex flex-col items-center gap-1 flex-1"
             title={`P(true acuity is ESI-${i + 1}) = ${(p * 100).toFixed(0)}%`}>
          <span className="text-[9px] text-ink-3 tabular-nums">{(p * 100).toFixed(0)}</span>
          <i className="w-full rounded-t-sm bg-brand block"
             style={{ height: `${Math.max(2, p * 38)}px` }} />
          <span className="text-[9px] text-ink-3">{i + 1}</span>
        </div>
      ))}
    </div>
  )
}

function AuditTrail({ patientId }) {
  const [open, setOpen] = useState(false)
  const [events, setEvents] = useState(null)

  const toggle = async () => {
    if (!open && events === null) {
      const r = await api.getAudit(patientId).catch(() => ({ events: [] }))
      setEvents(r.events)
    }
    setOpen(!open)
  }

  return (
    <>
      <button onClick={toggle}
              className="flex items-center gap-1 text-[11px] font-semibold text-brand-ink
                         cursor-pointer hover:underline">
        <ChevronDown size={13} className={open ? '' : '-rotate-90'} aria-hidden="true" />
        {open ? 'Hide audit trail' : 'Audit trail'}
      </button>
      {open && events && (
        <div className="mt-2 space-y-1">
          {events.map((e, i) => (
            <div key={e.id ?? i} className="flex gap-2 text-[10.5px] py-1 border-b border-line last:border-0">
              <span className="text-ink-3 tabular-nums w-11 shrink-0">t={fmt(e.sim_min)}</span>
              <span className="font-bold uppercase tracking-wide text-brand-ink w-[92px] shrink-0
                               text-[9.5px] pt-px">
                {e.event_type.replace(/_/g, ' ')}
              </span>
              <span className="text-ink-2 flex-1">
                {(AUDIT_SUMMARY[e.event_type] ?? ((p) => JSON.stringify(p).slice(0, 80)))(e.payload)}
              </span>
            </div>
          ))}
        </div>
      )}
    </>
  )
}

// The panel itself, independent of whether the record has arrived. Keeping it
// mounted across a change of patient means the entrance animation plays when
// the drawer opens rather than replaying on every click.
function Shell({ dialog, width, minWidth, maxWidth, onResize, onClose, children }) {
  return (
    <>
      <div className="fixed inset-0 bg-ink/25 z-40" onClick={onClose} aria-hidden="true" />
      <aside role="dialog" aria-modal="true" aria-label="Triage recommendation"
             ref={dialog} tabIndex={-1} style={{ width }}
             className="fixed right-0 top-0 bottom-0 max-w-full bg-card z-50 flex
                        border-l border-line shadow-lg
                        motion-safe:animate-[drawer_.16s_ease-out]">
        <Splitter value={width} min={minWidth} max={maxWidth} side="right"
                  label="Patient record width" onChange={onResize} />
        <div className="flex-1 min-w-0 overflow-y-auto">{children}</div>
      </aside>
    </>
  )
}

const Bar = ({ w }) => (
  <div className={`h-2.5 ${w} rounded-sm bg-app motion-safe:animate-pulse`}
       aria-hidden="true" />
)

export default function PatientDrawer({ detail, feedback, busy, onClose, width,
                                        minWidth, maxWidth, onResize,
                                        onAccept, onOverride, onReassess, onVitals }) {
  const { can } = useSession()
  const dialog = useDialog(onClose)
  const shell = { dialog, width, minWidth, maxWidth, onResize, onClose }

  // No record yet for the selected patient. The panel shows nothing rather
  // than the last patient's record, and offers no decision control, because
  // every one of them submits the record's own patient ID.
  if (!detail) {
    return (
      <Shell {...shell}>
        <header className="sticky top-0 bg-card border-b border-line px-4 py-3 z-10">
          <div className="flex items-start gap-3">
            <div className="size-9 rounded-full bg-app motion-safe:animate-pulse shrink-0"
                 aria-hidden="true" />
            <div className="min-w-0 flex-1 space-y-2 pt-1"><Bar w="w-32" /><Bar w="w-44" /></div>
            <button onClick={onClose} aria-label="Close"
                    className="p-1 rounded-sm text-ink-3 hover:bg-app cursor-pointer">
              <X size={17} aria-hidden="true" />
            </button>
          </div>
        </header>
        <p role="status" className="px-4 py-3 text-[11.5px] text-ink-3">
          Opening the record.
        </p>
      </Shell>
    )
  }

  const { intake, fused, status, waited_min, in_ed_min, vitals_history, decided_by } = detail
  const inTreatment = status === 'in_treatment'
  // A disagreement needs two paths. fuse() never writes this note without an
  // llm result, and the banner should not be able to render one either.
  const disagreement = fused.llm
    && fused.notes.find((n) => n.startsWith('Paths disagree'))
  // The fusion verdict has the banner and the pill; it is never also a note,
  // whether or not the banner is the thing rendering it.
  const notes = fused.notes.filter(
    (n) => !n.startsWith('Paths disagree') && n !== 'Paths agree')

  return (
    <Shell {...shell}>
        <header className="sticky top-0 bg-card border-b border-line px-4 py-3 z-10">
          <div className="flex items-start gap-3">
            <Initials name={intake.display_name} id={intake.patient_id} />
            <div className="min-w-0 flex-1">
              <p className="text-[15px] font-bold text-ink truncate">
                {intake.display_name ?? intake.patient_id}
              </p>
              <p className="text-[11px] text-ink-3 tabular-nums">
                {fmtAge(intake.age_years, intake.age_months)} · record {intake.patient_id}
                {' · '}AVPU {intake.responsiveness}
              </p>
            </div>
            <button onClick={onClose} aria-label="Close"
                    className="p-1 rounded-sm text-ink-3 hover:bg-app cursor-pointer">
              <X size={17} aria-hidden="true" />
            </button>
          </div>

          <div className="flex items-center gap-2 flex-wrap mt-3">
            <EsiBadge esi={fused.esi} size="lg" />
            <span className="text-xs font-semibold text-ink">{fused.route}</span>
            <BeliefPeak peak={detail.belief && {
              esi: detail.belief.indexOf(Math.max(...detail.belief)) + 1,
              p: Math.max(...detail.belief),
            }} assigned={fused.esi} pathsAgree={fused.paths_agree} confidence={fused.confidence} />
            {/* Three states, not two: agreed, disagreed, and only one path
                ran. The last is not a disagreement. */}
            <Pill tone={!fused.llm ? 'neutral' : fused.paths_agree ? 'ok' : 'warn'}>
              {!fused.llm ? 'Path A only'
                : fused.paths_agree ? 'Paths agree' : 'Paths disagree'}
            </Pill>
            {fused.clinician_flag && <Pill tone="alert">Review</Pill>}
            {detail.icd10 && <Pill tone="neutral">ICD-10 {detail.icd10.code}</Pill>}
          </div>

          <p className="mt-2.5 text-[13px] leading-relaxed text-ink">{intake.chief_complaint}</p>
          <p className="mt-1 text-[11px] text-ink-2 leading-relaxed">
            {intake.has_history
              ? `On file: ${[...intake.conditions, ...intake.medications].join(', ') || 'record exists'}`
              : 'No prior record (first visit)'}
          </p>
          <p className="mt-1 text-[11px] text-ink-3 tabular-nums">
            {inTreatment ? 'In care' : `${Math.round(waited_min)} min since assessment`}
            {' · '}{Math.round(in_ed_min)} min in the department
          </p>
        </header>

        {disagreement && (
          <p className="mx-4 mt-3 rounded-md border border-warn-line border-l-4 bg-warn-bg
                        px-3 py-2 text-[11.5px] leading-relaxed text-warn-ink">
            {disagreement}
          </p>
        )}

        <Section title="How this level was reached">
            <Paths fused={fused} surge={detail.pipeline?.surge_path} />
          </Section>

        {notes.length > 0 && (
          <Section title="Notes">
            <ul className="space-y-1 text-[11px] leading-relaxed text-ink-2">
              {notes.map((n, i) => <li key={i}>{n}</li>)}
            </ul>
          </Section>
        )}

        <Section title="Vitals"
                 right={can.vitals && !inTreatment && (
                   <Btn size="sm" disabled={busy}
                        onClick={() => onVitals(intake.patient_id)}>Record vitals</Btn>
                 )}>
          <Vitals history={vitals_history} limits={detail.vital_limits} />
        </Section>

        <Section title="How likely each level is">
          <BeliefStrip belief={detail.belief} />
        </Section>

        {decided_by && (
          <p className="mx-4 mt-3 rounded-md bg-brand-tint px-3 py-2 text-[11.5px]
                        leading-relaxed text-brand-ink">
            Level set by <b>{decided_by}</b>. Automated paths may advise from here,
            but they will not change it.
          </p>
        )}

        {!inTreatment && (
          <Section title="Decision">
            <div className="flex flex-wrap gap-2">
              <Btn variant="primary" disabled={busy || !can.accept}
                   title={can.accept ? undefined : RESTRICTED}
                   onClick={() => onAccept(intake.patient_id)}>
                Accept ESI-{fused.esi}
              </Btn>
              <Btn disabled={busy || !can.override}
                   title={can.override ? undefined : RESTRICTED}
                   onClick={onOverride}>
                Override level
              </Btn>
              <Btn disabled={busy || !can.reassess}
                   onClick={() => onReassess(intake.patient_id)}>
                Reassess now
              </Btn>
            </div>
            {!can.accept && (
              <p className="mt-2 text-[11px] text-ink-3">
                {RESTRICTED} to change or confirm an acuity level.
              </p>
            )}
            {feedback && (
              <p className="mt-2.5 rounded-md bg-app px-3 py-2 text-[11.5px]
                            leading-relaxed text-ink-2">{feedback}</p>
            )}
          </Section>
        )}

          <Section title="Record">
            <AuditTrail key={intake.patient_id} patientId={intake.patient_id} />
          </Section>
    </Shell>
  )
}
