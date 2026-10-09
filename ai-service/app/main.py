import hashlib
from contextlib import asynccontextmanager
from pathlib import Path
from fastapi import FastAPI, HTTPException, Request
from fastapi.middleware.cors import CORSMiddleware
from langgraph.checkpoint.sqlite.aio import AsyncSqliteSaver
from slowapi import Limiter
from slowapi.middleware import SlowAPIMiddleware
from slowapi.util import get_remote_address
from .auth import CurrentUserDep, initialize_firebase
from .config import get_settings
from .graph import build_graph
from .repository import confirm_intake, get_patient_intake, list_doctor_intakes, review_intake, save_draft
from .schemas import ConfirmRequest, IntakeMessageRequest, IntakeMessageResponse, IntakeSummary, ReviewRequest

settings=get_settings(); limiter=Limiter(key_func=get_remote_address,default_limits=["120/minute"])
@asynccontextmanager
async def lifespan(app:FastAPI):
    initialize_firebase(); path=Path(settings.checkpoint_db); path.parent.mkdir(parents=True,exist_ok=True)
    async with AsyncSqliteSaver.from_conn_string(str(path)) as saver: app.state.graph=build_graph(saver); yield
app=FastAPI(title="CareOrbit AI Intake API",version="1.0.0",lifespan=lifespan)
app.state.limiter=limiter; app.add_middleware(SlowAPIMiddleware)
app.add_middleware(CORSMiddleware,allow_origins=settings.origins,allow_credentials=True,allow_methods=["GET","POST"],allow_headers=["Authorization","Content-Type"])
def require_role(user,role):
    if user.role!=role: raise HTTPException(403,f"{role.title()} access required")
@app.get("/health")
async def health(): return {"status":"ok","synthetic_data_only":True}
@app.post("/api/intakes/message",response_model=IntakeMessageResponse)
@limiter.limit("20/minute")
async def intake_message(request:Request,body:IntakeMessageRequest,user:CurrentUserDep):
    require_role(user,"patient"); intake_id=hashlib.sha256(f"{user.uid}:{body.session_id}".encode()).hexdigest()[:32]
    existing=get_patient_intake(intake_id,user.uid)
    if existing and existing.get("status") in {"submitted","reviewed"}: raise HTTPException(409,"This intake has already been submitted")
    config={"configurable":{"thread_id":f"{user.uid}:{body.session_id}"}}; prior=await request.app.state.graph.aget_state(config)
    transcript=list((prior.values or {}).get("transcript",[])); transcript.append({"role":"patient","content":body.message})
    try: result=await request.app.state.graph.ainvoke({"transcript":transcript},config=config)
    except Exception as exc: raise HTTPException(503,"The intake assistant is temporarily unavailable") from exc
    result["transcript"]=transcript+[{"role":"assistant","content":result["reply"]}]; await request.app.state.graph.aupdate_state(config,{"transcript":result["transcript"]})
    intake=save_draft(intake_id,user.uid,body.session_id,body.appointment_id,result)
    return IntakeMessageResponse(session_id=body.session_id,message=result["reply"],intake=IntakeSummary(**intake),requires_confirmation=intake["status"]=="awaiting_patient_confirmation",urgent=result.get("urgent",False))
@app.get("/api/intakes/{intake_id}",response_model=IntakeSummary)
async def read_intake(intake_id:str,user:CurrentUserDep):
    require_role(user,"patient"); intake=get_patient_intake(intake_id,user.uid)
    if not intake: raise HTTPException(404,"Intake not found")
    return intake
@app.post("/api/intakes/{intake_id}/confirm",response_model=IntakeSummary)
async def confirm(intake_id:str,body:ConfirmRequest,user:CurrentUserDep):
    require_role(user,"patient")
    try: intake=confirm_intake(intake_id,user.uid,body.appointment_id,body.share_with_doctor)
    except PermissionError as exc: raise HTTPException(403,str(exc)) from exc
    except ValueError as exc: raise HTTPException(400,str(exc)) from exc
    if not intake: raise HTTPException(404,"Intake not found")
    return intake
@app.get("/api/doctor/intakes",response_model=list[IntakeSummary])
async def doctor_intakes(user:CurrentUserDep): require_role(user,"doctor"); return list_doctor_intakes(user.uid)
@app.post("/api/doctor/intakes/{intake_id}/review",response_model=IntakeSummary)
async def doctor_review(intake_id:str,body:ReviewRequest,user:CurrentUserDep):
    require_role(user,"doctor"); intake=review_intake(intake_id,user.uid,body.note)
    if not intake: raise HTTPException(404,"Authorized intake not found")
    return intake
