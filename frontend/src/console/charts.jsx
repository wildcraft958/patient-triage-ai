import {
  Bar, BarChart, CartesianGrid, Cell, ResponsiveContainer, Tooltip, XAxis, YAxis,
} from 'recharts'

const AXIS = { fontSize: 10, fill: 'var(--color-ink-3)' }

const TIP = {
  contentStyle: {
    background: 'var(--color-card)', border: '1px solid var(--color-line)',
    borderRadius: 6, fontSize: 11, padding: '6px 9px',
  },
  labelStyle: { color: 'var(--color-ink)', fontWeight: 700 },
  cursor: { fill: 'var(--color-app)' },
}

// Mean assigned acuity per age band. A band drifting away from the others is
// what a silent age bias would look like, which is the reason this is a chart
// and not a row of numbers: drift is a shape.
export function BiasChart({ bands }) {
  const data = bands.map(([band, s]) => ({
    band, mean: Number(s.mean_esi), n: s.n,
  }))
  return (
    <ResponsiveContainer width="100%" height={190}>
      <BarChart data={data} margin={{ top: 4, right: 4, left: -22, bottom: 0 }}>
        <CartesianGrid strokeDasharray="2 3" stroke="var(--color-line)" vertical={false} />
        <XAxis dataKey="band" tick={AXIS} axisLine={false} tickLine={false} />
        <YAxis domain={[1, 5]} ticks={[1, 2, 3, 4, 5]} reversed tick={AXIS}
               axisLine={false} tickLine={false} />
        <Tooltip {...TIP} formatter={(v, _n, p) => [`ESI ${v} (n=${p.payload.n})`, 'Mean acuity']} />
        <Bar dataKey="mean" radius={[3, 3, 0, 0]} maxBarSize={54}
             fill="var(--color-brand)" />
      </BarChart>
    </ResponsiveContainer>
  )
}

const ESI_FILL = ['var(--color-esi-1)', 'var(--color-esi-2)', 'var(--color-esi-3)',
                  'var(--color-esi-4)', 'var(--color-esi-5)']

// How the shift actually distributed across the acuity scale.
export function AcuityChart({ counts }) {
  const data = [1, 2, 3, 4, 5].map((esi) => ({ esi: `ESI-${esi}`, n: counts[esi] ?? 0 }))
  return (
    <ResponsiveContainer width="100%" height={190}>
      <BarChart data={data} margin={{ top: 4, right: 4, left: -22, bottom: 0 }}>
        <CartesianGrid strokeDasharray="2 3" stroke="var(--color-line)" vertical={false} />
        <XAxis dataKey="esi" tick={AXIS} axisLine={false} tickLine={false} />
        <YAxis allowDecimals={false} tick={AXIS} axisLine={false} tickLine={false} />
        <Tooltip {...TIP} formatter={(v) => [`${v} patients`, 'Assigned']} />
        <Bar dataKey="n" radius={[3, 3, 0, 0]} maxBarSize={54}>
          {data.map((_, i) => <Cell key={i} fill={ESI_FILL[i]} />)}
        </Bar>
      </BarChart>
    </ResponsiveContainer>
  )
}
