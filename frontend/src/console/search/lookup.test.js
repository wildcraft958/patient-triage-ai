import { describe, expect, it } from 'vitest'
import { rank } from './lookup'

// The board is the only source of truth here: lookup ranks rows the console
// already holds, so a result can never disagree with the row behind it.
const ROWS = [
  { patient_id: 'SIM-007', display_name: 'R. Castillo', esi: 2,
    chief_complaint: 'Abdominal pain with chills since this morning' },
  { patient_id: 'SIM-022', display_name: 'A. Weber', esi: 2,
    chief_complaint: 'Burning indigestion for 2 hours with nausea and sweating' },
  { patient_id: 'SIM-001', display_name: 'M. Chen', esi: 1,
    chief_complaint: 'Chest pain radiating to left arm for 45 minutes, sweating' },
  { patient_id: 'SIM-013', display_name: 'C. Duval', esi: 4,
    chief_complaint: 'Itchy raised rash on both arms for 2 days, no swelling' },
]

const ids = (q, rows = ROWS) => rank(rows, q).map((r) => r.row.patient_id)

describe('ranking a lookup', () => {
  it('finds a patient by the start of their name', () => {
    expect(ids('web')[0]).toBe('SIM-022')
  })

  it('finds a patient by record number, with or without the prefix', () => {
    expect(ids('SIM-013')[0]).toBe('SIM-013')
    expect(ids('013')[0]).toBe('SIM-013')
  })

  it('is not case sensitive', () => {
    expect(ids('CASTILLO')[0]).toBe('SIM-007')
  })

  // A nurse types what the patient said, not the patient's name. Complaint
  // text has to be searchable or the box is useless during a handover.
  it('finds a patient by words in their complaint', () => {
    expect(ids('chest pain')[0]).toBe('SIM-001')
  })

  // "b" hits Weber's name at position 5, and Castillo's complaint at
  // position 1. The closer match is the complaint, and it still has to lose:
  // a nurse typing into a patient box is aiming at a name.
  it('ranks a name match above a nearer complaint match', () => {
    expect(ids('b')[0]).toBe('SIM-022')
  })

  // Within the complaint tier, "both" starts a word and "Abdominal" only
  // contains one. Without this the box answers "rash" with the wrong patient.
  it('ranks a whole-word hit above a mid-word one', () => {
    expect(ids('b')).toEqual(['SIM-022', 'SIM-013', 'SIM-007'])
    expect(ids('rash')).toEqual(['SIM-013'])
  })

  it('returns nothing for a query that matches nothing', () => {
    expect(ids('zzzz')).toEqual([])
  })

  it('returns nothing for an empty or blank query', () => {
    expect(ids('')).toEqual([])
    expect(ids('   ')).toEqual([])
  })

  // The palette renders these, so it needs to know which field to highlight
  // rather than guessing and highlighting the wrong half of the row.
  it('reports which field matched', () => {
    expect(rank(ROWS, 'weber')[0].field).toBe('display_name')
    expect(rank(ROWS, 'chest')[0].field).toBe('chief_complaint')
    expect(rank(ROWS, 'SIM-007')[0].field).toBe('patient_id')
  })

  it('caps how many results it returns', () => {
    const many = Array.from({ length: 40 }, (_, i) => ({
      patient_id: `SIM-${i}`, display_name: `P. Test${i}`, chief_complaint: 'pain',
    }))
    expect(rank(many, 'pain').length).toBeLessThanOrEqual(8)
  })

  it('tolerates rows with missing fields rather than throwing', () => {
    expect(() => rank([{ patient_id: 'X' }, {}], 'x')).not.toThrow()
    expect(ids('x', [{ patient_id: 'SIM-X' }, {}])).toEqual(['SIM-X'])
  })
})
