# CareOrbit AI intake service

Development-only FastAPI service for bilingual English/Urdu intake collection. It uses Firebase ID tokens and Firestore authorization; it never diagnoses or prescribes.

1. Copy `.env.example` to `.env` and set `GROQ_API_KEY`.
2. Configure Firebase Application Default Credentials (`GOOGLE_APPLICATION_CREDENTIALS`).
3. Install: `python -m pip install -e .`
4. Run: `uvicorn app.main:app --reload --port 8000`
5. Optional idempotent seed: `python scripts/seed_demo.py`. Add `--reset-passwords` only when intentionally resetting existing demo passwords.

Only synthetic development information is approved for Groq processing. Do not enter real patient information until a production privacy, security, and vendor review is complete.
