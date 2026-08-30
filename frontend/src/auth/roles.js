// Who is signed in changes what the console lets them do, not only what it
// says. The audit trail carries the badge ID of whoever acted, so these
// three roles are the difference between a demo and a workstation.

export const ROLES = {
  nurse: {
    id: 'nurse',
    title: 'Triage nurse',
    blurb: 'Scores arrivals, overrides levels, works the waiting room',
    can: { accept: true, override: true, reassess: true, acknowledge: true,
           vitals: true, intake: true, settings: true },
  },
  ma: {
    id: 'ma',
    title: 'Medical assistant',
    blurb: 'Records vitals and answers alerts; acuity changes need RN sign-off',
    can: { accept: false, override: false, reassess: true, acknowledge: true,
           vitals: true, intake: true, settings: false },
  },
  admin: {
    id: 'admin',
    title: 'Clinical administrator',
    blurb: 'Reads the board, owns the evidence: audit, bias, configuration',
    can: { accept: false, override: false, reassess: false, acknowledge: false,
           vitals: false, intake: false, settings: true },
  },
}

// Demonstration identities. A production deployment binds this to the
// hospital directory; nothing here validates anything.
export const DIRECTORY = {
  nurse: { badge_id: 'RN-07', name: 'S. Marsh' },
  ma: { badge_id: 'MA-14', name: 'J. Okonkwo' },
  admin: { badge_id: 'ADM-02', name: 'P. Raghavan' },
}

export const RESTRICTED = 'Requires RN sign-off'
