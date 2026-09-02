const BASE = '/api'

async function request(path, options = {}) {
  const res = await fetch(`${BASE}${path}`, {
    headers: { 'Content-Type': 'application/json' },
    ...options,
  })
  if (!res.ok) {
    const body = await res.json().catch(() => ({}))
    throw new Error(body.detail ? JSON.stringify(body.detail) : res.statusText)
  }
  return res.json()
}

// Record IDs are operator-editable at intake, so an id containing ? # or /
// would otherwise silently produce a different request than the one intended.
const ref = (id) => encodeURIComponent(id)

export const addPatient = (body) =>
  request('/patients', { method: 'POST', body: JSON.stringify(body) })
export const getQueue = () => request('/queue')
export const getPatient = (id) => request(`/patients/${ref(id)}`)
export const getAudit = (id) => request(`/patients/${ref(id)}/audit`)
export const getSimilar = (id, limit = 5) =>
  request(`/search/similar/${ref(id)}?limit=${limit}`)
export const getRecentAudit = () => request('/audit')
export const searchAudit = (filters) =>
  request(`/search/audit?${new URLSearchParams(filters)}`)
export const getMetrics = () => request('/metrics')

export const loadScenario = (body) =>
  request('/scenario/load', { method: 'POST', body: JSON.stringify(body) })
export const stepScenario = () => request('/scenario/step', { method: 'POST' })
export const advanceClock = (minutes) =>
  request('/clock/advance', { method: 'POST', body: JSON.stringify({ minutes }) })
export const setSurge = (forced) =>
  request('/surge', { method: 'POST', body: JSON.stringify({ forced }) })

export const acceptPatient = (id, clinician_id) =>
  request(`/patients/${ref(id)}/accept`, {
    method: 'POST',
    body: JSON.stringify({ clinician_id }),
  })
export const overridePatient = (id, body) =>
  request(`/patients/${ref(id)}/override`, { method: 'POST', body: JSON.stringify(body) })
export const reassessPatient = (id, clinician_id) =>
  request(`/patients/${ref(id)}/reassess`, {
    method: 'POST',
    body: JSON.stringify({ clinician_id }),
  })
export const acknowledgeAlert = (id, clinician_id) =>
  request(`/patients/${ref(id)}/acknowledge`, {
    method: 'POST',
    body: JSON.stringify({ clinician_id }),
  })
export const getBenchmark = () => request('/benchmark')
export const getRegistry = () => request('/system/registry')
export const getProfile = () => request('/profile')
// The endpoint takes the vitals object as the body; the observation channel
// and the badge that took the reading are query parameters. The channel says
// how the reading arrived, the badge says who took it, and a staff spot-check
// owes the audit trail both.
export const recordVitals = (id, vitals, clinician_id) =>
  request(`/patients/${ref(id)}/vitals?source=nurse`
          + `&clinician_id=${encodeURIComponent(clinician_id)}`, {
    method: 'POST',
    body: JSON.stringify(vitals),
  })
