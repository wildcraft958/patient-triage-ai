"""Curated patient set must cover every case the Round 2 brief mandates,
and all data must be physiologically plausible."""

import pytest

from app.data_io import DATA_DIR, load_curated_patients, load_esi_eval_cases


@pytest.fixture(scope="module")
def patients():
    return load_curated_patients()


def test_at_least_20_records(patients):
    assert len(patients) >= 20


def test_mandated_case_coverage(patients):
    tags = [t for p in patients for t in p.tags]
    assert tags.count("pediatric") >= 2
    assert tags.count("geriatric") >= 2
    assert tags.count("ambiguous") >= 1
    assert tags.count("zero_history") >= 1
    assert tags.count("deteriorator") >= 1
    # adversarial presentations (under-reporting, atypical, vague) per the
    # ResidencyRL adversarial-simulator pattern
    assert sum(1 for t in tags if t.startswith("adversarial")) >= 3


def test_underreporter_is_caught_by_the_vitals_gate(patients):
    from app.engine.esi_rules import score
    p = next(p for p in patients if "adversarial_underreport" in p.tags)
    assert p.vitals.pain is not None and p.vitals.pain <= 3  # says it is nothing
    assert score(p).esi <= 2  # deranged vitals overrule the minimized story


def test_roughly_half_have_history(patients):
    frac = sum(p.has_history for p in patients) / len(patients)
    assert 0.35 <= frac <= 0.65


def test_zero_history_patients_carry_no_records(patients):
    for p in patients:
        if "zero_history" in p.tags:
            assert not p.has_history
            assert not p.medications and not p.conditions


def test_deteriorator_worsens_across_rechecks(patients):
    det = next(p for p in patients if "deteriorator" in p.tags)
    assert len(det.vitals_rechecks) >= 2
    hrs = [det.vitals.hr] + [r.vitals.hr for r in det.vitals_rechecks]
    assert hrs == sorted(hrs) and hrs[-1] > hrs[0]


def test_vitals_physiologically_plausible(patients):
    def check(v):
        if v.hr is not None:
            assert 30 <= v.hr <= 220
        if v.rr is not None:
            assert 4 <= v.rr <= 70
        if v.spo2 is not None:
            assert 50 <= v.spo2 <= 100
        if v.temp_c is not None:
            assert 30 <= v.temp_c <= 43
        if v.sbp is not None:
            assert 50 <= v.sbp <= 260
        if v.pain is not None:
            assert 0 <= v.pain <= 10

    for p in patients:
        check(p.vitals)
        for r in p.vitals_rechecks:
            check(r.vitals)


@pytest.mark.skipif(not (DATA_DIR / "esi_eval").exists(),
                    reason="run scripts/fetch_data.py first")
def test_esi_eval_cases_load():
    cases = load_esi_eval_cases()
    assert len(cases) >= 200
    assert all(1 <= c["category"] <= 5 for c in cases)
    with_vitals = [c for c in cases if c["vitals"] is not None]
    assert len(with_vitals) > 100


def test_every_curated_patient_has_a_distinct_display_name(patients):
    """The board is read by name; the record ID stays alongside it for the
    audit trail. Duplicates would make two patients indistinguishable at a
    glance, which is the failure the name is there to prevent."""
    names = [p.display_name for p in patients]
    assert all(n and n.strip() for n in names)
    assert len(set(names)) == len(names)
