from app.agent.fuse import FusedResult, LLMResult
from app.models import PatientIntake, RulesResult, Vitals
from app.safety.pipeline import BiasMonitor, check


def intake(**kw) -> PatientIntake:
    defaults = dict(patient_id="S1", age_years=45, chief_complaint="pain",
                    complaint_category="abdominal_pain",
                    vitals=Vitals(hr=88, rr=16, spo2=98, temp_c=37.0, sbp=120))
    defaults.update(kw)
    return PatientIntake(**defaults)


def fused_of(esi: int, rules_esi: int) -> FusedResult:
    return FusedResult(
        esi=esi, route="Acute", confidence="high", paths_agree=True,
        clinician_flag=False,
        rules=RulesResult(esi=rules_esi, reasons=["r"], red_flags=["possible ACS"]),
        llm=LLMResult(esi=esi, confidence=0.9, reasoning=["l"]),
    )


def test_grounding_violation_corrected_to_rules_floor():
    # hand-built violation: fused less acute than the deterministic floor
    corrected, report = check(intake(), fused_of(esi=4, rules_esi=2))
    assert corrected.esi == 2
    assert report.grounded is False
    assert any("Grounding correction" in n for n in corrected.notes)


def test_clean_result_passes_all_layers():
    fused, report = check(intake(), fused_of(esi=2, rules_esi=2))
    assert fused.esi == 2
    assert report.grounded and report.input_complete
    assert report.red_flags == ["possible ACS"]


def test_missing_vitals_reported():
    _, report = check(intake(vitals=Vitals(hr=90)), fused_of(esi=2, rules_esi=2))
    assert report.input_complete is False
    assert set(report.missing_fields) == {"rr", "spo2", "temp_c", "sbp"}


def test_bias_monitor_tracks_bands():
    monitor = BiasMonitor()
    monitor.record(intake(age_years=75), esi=2)
    monitor.record(intake(age_years=75), esi=3)
    monitor.record(intake(age_years=30), esi=4)
    snap = monitor.snapshot()
    assert snap["geriatric"]["n"] == 2
    assert snap["geriatric"]["mean_esi"] == 2.5
    assert snap["geriatric"]["high_acuity_pct"] == 50.0
    assert snap["adult"]["n"] == 1


def test_bias_alert_fires_on_sustained_band_skew():
    monitor = BiasMonitor()
    for _ in range(20):
        monitor.record(intake(age_years=75), esi=2)
        monitor.record(intake(age_years=30), esi=4)
    assert any(a.startswith("geriatric") for a in monitor.alerts())


def test_no_bias_alert_below_minimum_sample():
    monitor = BiasMonitor()
    for _ in range(5):
        monitor.record(intake(age_years=75), esi=2)
        monitor.record(intake(age_years=30), esi=4)
    assert monitor.alerts() == []
