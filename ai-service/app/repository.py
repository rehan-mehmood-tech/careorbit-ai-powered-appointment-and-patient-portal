from datetime import UTC, datetime
from google.cloud.firestore_v1.base_query import FieldFilter
from .auth import database
from .config import get_settings

COLLECTION = "aiIntakes"
def _now(): return datetime.now(UTC)
def _serialize(snapshot):
    data = snapshot.to_dict() or {}; data["intake_id"] = snapshot.id; return data

def get_patient_intake(intake_id: str, patient_id: str):
    snap = database().collection(COLLECTION).document(intake_id).get()
    return _serialize(snap) if snap.exists and (snap.to_dict() or {}).get("patient_id") == patient_id else None

def save_draft(intake_id, patient_id, session_id, appointment_id, state):
    ref = database().collection(COLLECTION).document(intake_id); existing = ref.get().to_dict() or {}
    extracted = state.get("extracted", {}); now = _now()
    payload = {**{k:v for k,v in extracted.items() if k != "ready_for_confirmation"}, "patient_id":patient_id, "session_id":session_id,
      "appointment_id":appointment_id, "authorized_doctor_id":existing.get("authorized_doctor_id"), "consent_at":existing.get("consent_at") or now,
      "sharing_consent_at":existing.get("sharing_consent_at"), "potential_urgent_concern":bool(state.get("urgent")),
      "urgent_supporting_statements":state.get("urgent_supporting_statements", []), "status":"urgent" if state.get("urgent") else ("awaiting_patient_confirmation" if extracted.get("ready_for_confirmation") else "draft"),
      "language":state.get("language","en"), "model_version":get_settings().groq_model, "prompt_version":get_settings().prompt_version,
      "doctor_review_status":"unreviewed", "reviewer_id":existing.get("reviewer_id"), "reviewed_at":existing.get("reviewed_at"),
      "created_at":existing.get("created_at") or now, "updated_at":now}
    ref.set(payload, merge=True); return {**payload,"intake_id":intake_id}

def confirm_intake(intake_id, patient_id, appointment_id, share):
    intake = get_patient_intake(intake_id, patient_id)
    if not intake: return None
    doctor_id=None; chosen=appointment_id or intake.get("appointment_id")
    if share:
      if not chosen: raise ValueError("Choose an appointment before sharing")
      snap=database().collection("appointments").document(chosen).get(); values=snap.to_dict() or {}
      if not snap.exists or values.get("patientId") != patient_id: raise PermissionError("Appointment is not available")
      doctor_id=values.get("doctorId")
      if not doctor_id: raise ValueError("Appointment has no assigned doctor")
    now=_now(); update={"status":"submitted","patient_confirmed_summary":intake.get("patient_summary") or intake.get("chief_concern"),"appointment_id":chosen,"authorized_doctor_id":doctor_id,"sharing_consent_at":now if share else None,"updated_at":now}
    database().collection(COLLECTION).document(intake_id).update(update); return {**intake,**update}

def list_doctor_intakes(doctor_id):
    query=database().collection(COLLECTION).where(filter=FieldFilter("authorized_doctor_id","==",doctor_id)).limit(50)
    return [_serialize(d) for d in query.stream() if (d.to_dict() or {}).get("status") in {"submitted","reviewed"}]

def review_intake(intake_id, doctor_id, note):
    ref=database().collection(COLLECTION).document(intake_id); snap=ref.get(); data=snap.to_dict() or {}
    if not snap.exists or data.get("authorized_doctor_id") != doctor_id or data.get("status") not in {"submitted","reviewed"}: return None
    now=_now(); update={"status":"reviewed","doctor_review_status":"reviewed","reviewer_id":doctor_id,"reviewed_at":now,"doctor_review_note":note,"updated_at":now}
    ref.update(update); return {**data,**update,"intake_id":intake_id}
