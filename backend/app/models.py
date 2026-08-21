from pydantic import BaseModel, Field


class Vitals(BaseModel):
    hr: float | None = None      # heart rate, bpm
    rr: float | None = None      # respiratory rate, breaths/min
    spo2: float | None = None    # oxygen saturation, %
    temp_c: float | None = None  # temperature, Celsius
    sbp: float | None = None     # systolic blood pressure, mmHg
    pain: int | None = None      # self-reported, 0-10


class PatientIntake(BaseModel):
    patient_id: str
    age_years: int
    # For infants: age in months overrides age_years for threshold banding
    age_months: float | None = None
    chief_complaint: str
    complaint_category: str = "other"
    vitals: Vitals = Field(default_factory=Vitals)
    responsiveness: str = "alert"  # AVPU: alert | verbal | pain | unresponsive
    has_history: bool = False
    medications: list[str] = Field(default_factory=list)
    conditions: list[str] = Field(default_factory=list)
    allergies: list[str] = Field(default_factory=list)


class VitalsRecheck(BaseModel):
    offset_min: float
    vitals: Vitals


class SimPatient(PatientIntake):
    """A curated simulated patient: intake plus replay/scenario metadata."""

    arrival_offset_min: float = 0
    vitals_rechecks: list[VitalsRecheck] = Field(default_factory=list)
    tags: list[str] = Field(default_factory=list)
    expected_esi: int | None = None


class RulesResult(BaseModel):
    esi: int
    reasons: list[str]
    red_flags: list[str] = Field(default_factory=list)
    danger_zone_vitals: bool = False
    resources_estimate: int = 0
