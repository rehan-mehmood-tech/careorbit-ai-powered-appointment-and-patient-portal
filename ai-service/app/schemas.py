from datetime import datetime
from typing import Literal

from pydantic import BaseModel, Field


IntakeStatus = Literal["draft", "awaiting_patient_confirmation", "submitted", "reviewed", "urgent"]


class IntakeMessageRequest(BaseModel):
    session_id: str = Field(min_length=8, max_length=128, pattern=r"^[A-Za-z0-9_-]+$")
    message: str = Field(min_length=1, max_length=3000)
    appointment_id: str | None = Field(default=None, max_length=128)


class IntakeSummary(BaseModel):
    intake_id: str
    patient_id: str
    session_id: str
    appointment_id: str | None = None
    authorized_doctor_id: str | None = None
    consent_at: datetime | None = None
    sharing_consent_at: datetime | None = None
    chief_concern: str | None = None
    symptoms: list[str] = Field(default_factory=list)
    onset_duration_severity: str | None = None
    associated_symptoms: list[str] = Field(default_factory=list)
    relevant_history: list[str] = Field(default_factory=list)
    medications: list[str] = Field(default_factory=list)
    allergies: list[str] = Field(default_factory=list)
    unknown_or_skipped: list[str] = Field(default_factory=list)
    potential_urgent_concern: bool = False
    urgent_supporting_statements: list[str] = Field(default_factory=list)
    questions_for_doctor: list[str] = Field(default_factory=list)
    patient_confirmed_summary: str | None = None
    status: IntakeStatus = "draft"
    language: Literal["en", "ur"] = "en"
    model_version: str
    prompt_version: str
    doctor_review_status: Literal["unreviewed", "reviewed"] = "unreviewed"
    reviewer_id: str | None = None
    reviewed_at: datetime | None = None
    created_at: datetime
    updated_at: datetime


class IntakeMessageResponse(BaseModel):
    session_id: str
    message: str
    intake: IntakeSummary
    requires_confirmation: bool
    urgent: bool


class ConfirmRequest(BaseModel):
    appointment_id: str | None = Field(default=None, max_length=128)
    share_with_doctor: bool = False


class ReviewRequest(BaseModel):
    note: str = Field(default="", max_length=2000)
