import json
import logging
import os
from pathlib import Path
from typing import Annotated, Literal

import firebase_admin
from fastapi import Depends, Header, HTTPException, status
from firebase_admin import auth, credentials, firestore

from .config import get_settings

logger = logging.getLogger(__name__)


def initialize_firebase() -> bool:
    if firebase_admin._apps:
        return True

    settings = get_settings()
    try:
        if settings.firebase_credentials_json:
            service_account = json.loads(settings.firebase_credentials_json)
            if not isinstance(service_account, dict):
                raise ValueError("Firebase credential JSON must be an object")
            credential = credentials.Certificate(service_account)
        elif settings.google_application_credentials:
            credential_path = Path(
                os.path.expandvars(settings.google_application_credentials)
            ).expanduser()
            if not credential_path.is_file():
                logger.warning(
                    "Firebase credential file is unavailable; Firebase features are disabled"
                )
                return False
            credential = credentials.Certificate(str(credential_path))
        else:
            logger.warning(
                "Firebase credentials are not configured; Firebase features are disabled"
            )
            return False

        firebase_admin.initialize_app(
            credential,
            {"projectId": settings.firebase_project_id},
        )
        return True
    except (FileNotFoundError, json.JSONDecodeError, ValueError, OSError) as exc:
        logger.warning(
            "Firebase credentials are invalid; Firebase features are disabled (%s)",
            type(exc).__name__,
        )
        return False
    except Exception as exc:
        logger.warning(
            "Firebase initialization failed; Firebase features are disabled (%s)",
            type(exc).__name__,
        )
        return False


def database():
    if not initialize_firebase():
        raise RuntimeError("Firebase is unavailable")
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
