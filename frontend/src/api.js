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

export const addPatient = (body) =>
  request('/patients', { method: 'POST', body: JSON.stringify(body) })
export const getQueue = () => request('/queue')
export const getPatient = (id) => request(`/patients/${id}`)
export const getAudit = (id) => request(`/patients/${id}/audit`)
export const getRecentAudit = () => request('/audit')
export const getMetrics = () => request('/metrics')

export const loadScenario = (body) =>
  request('/scenario/load', { method: 'POST', body: JSON.stringify(body) })
export const stepScenario = () => request('/scenario/step', { method: 'POST' })
export const advanceClock = (minutes) =>
  request('/clock/advance', { method: 'POST', body: JSON.stringify({ minutes }) })
export const setSurge = (forced) =>
  request('/surge', { method: 'POST', body: JSON.stringify({ forced }) })

export const acceptPatient = (id, clinician_id) =>
  request(`/patients/${id}/accept`, {
    method: 'POST',
    body: JSON.stringify({ clinician_id }),
  })
export const overridePatient = (id, body) =>
  request(`/patients/${id}/override`, { method: 'POST', body: JSON.stringify(body) })
export const reassessPatient = (id, clinician_id) =>
  request(`/patients/${id}/reassess`, {
    method: 'POST',
    body: JSON.stringify({ clinician_id }),
  })
export const acknowledgeAlert = (id, clinician_id) =>
  request(`/patients/${id}/acknowledge`, {
    method: 'POST',
    body: JSON.stringify({ clinician_id }),
  })
export const getBenchmark = () => request('/benchmark')
export const getRegistry = () => request('/system/registry')
export const getProfile = () => request('/profile')
// the endpoint takes the vitals object as the body and the observation
// channel as a query parameter
export const recordVitals = (id, vitals) =>
  request(`/patients/${id}/vitals?source=nurse`, {
    method: 'POST',
    body: JSON.stringify(vitals),
  })
