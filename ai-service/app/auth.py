from typing import Annotated, Literal

import firebase_admin
from fastapi import Depends, Header, HTTPException, status
from firebase_admin import auth, credentials, firestore

from .config import get_settings


def initialize_firebase() -> None:
    if firebase_admin._apps:
        return
    settings = get_settings()
    try:
        firebase_admin.initialize_app(options={"projectId": settings.firebase_project_id})
    except Exception:
        firebase_admin.initialize_app(credentials.ApplicationDefault(), {"projectId": settings.firebase_project_id})


def database():
    initialize_firebase()
    return firestore.client()


class CurrentUser:
    def __init__(self, uid: str, role: Literal["patient", "doctor", "admin"], email: str | None):
        self.uid = uid
        self.role = role
        self.email = email


async def current_user(authorization: Annotated[str | None, Header()] = None) -> CurrentUser:
    if not authorization or not authorization.startswith("Bearer "):
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Authentication required")
    try:
        decoded = auth.verify_id_token(authorization[7:], check_revoked=True)
        uid = decoded["uid"]
        profile = database().collection("users").document(uid).get()
        if not profile.exists:
            raise ValueError("profile missing")
        data = profile.to_dict() or {}
        role = data.get("role")
        if role not in {"patient", "doctor", "admin"} or data.get("status") == "suspended":
            raise ValueError("account unavailable")
        return CurrentUser(uid, role, decoded.get("email"))
    except HTTPException:
        raise
    except Exception as exc:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid or expired session") from exc


CurrentUserDep = Annotated[CurrentUser, Depends(current_user)]
