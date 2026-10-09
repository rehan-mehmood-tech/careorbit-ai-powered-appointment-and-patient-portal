import re
from typing import TypedDict

from langchain_groq import ChatGroq
from langgraph.graph import END, START, StateGraph
from pydantic import BaseModel, Field

from .config import get_settings
from .prompt import SYSTEM_PROMPT

URGENT_PATTERN = re.compile(r"\b(chest pain|cannot breathe|can't breathe|severe bleeding|unconscious|stroke|suicid|overdose)\b|(سینے.*درد|سانس.*نہیں|شدید.*خون|بے ہوش|خودکشی)", re.IGNORECASE)

class Extraction(BaseModel):
    reply: str
    chief_concern: str | None = None
    symptoms: list[str] = Field(default_factory=list)
    onset_duration_severity: str | None = None
    associated_symptoms: list[str] = Field(default_factory=list)
    relevant_history: list[str] = Field(default_factory=list)
    medications: list[str] = Field(default_factory=list)
    allergies: list[str] = Field(default_factory=list)
    unknown_or_skipped: list[str] = Field(default_factory=list)
    questions_for_doctor: list[str] = Field(default_factory=list)
    patient_summary: str | None = None
    ready_for_confirmation: bool = False

class IntakeState(TypedDict, total=False):
    transcript: list[dict[str, str]]
    language: str
    reply: str
    extracted: dict
    urgent: bool
    urgent_supporting_statements: list[str]

def _language(text: str) -> str:
    return "ur" if re.search(r"[\u0600-\u06ff]", text) else "en"

def _urgent_node(state: IntakeState) -> IntakeState:
    latest = state["transcript"][-1]["content"]
    urgent = bool(URGENT_PATTERN.search(latest))
    return {"language": _language(latest), "urgent": urgent, "urgent_supporting_statements": [latest] if urgent else []}

async def _collect_node(state: IntakeState) -> IntakeState:
    settings = get_settings()
    if not settings.groq_api_key:
        raise RuntimeError("GROQ_API_KEY is not configured")
    model = ChatGroq(model=settings.groq_model, api_key=settings.groq_api_key, temperature=0, timeout=settings.request_timeout_seconds)
    structured = model.with_structured_output(Extraction)
    transcript = "\n".join(f"{m['role']}: {m['content']}" for m in state["transcript"][-16:])
    result = await structured.ainvoke([("system", SYSTEM_PROMPT), ("human", f"Language: {state['language']}\nConversation:\n{transcript}")])
    data = result.model_dump()
    return {"reply": data.pop("reply"), "extracted": data}

def _urgent_reply(state: IntakeState) -> IntakeState:
    message = ("آپ کی بات ممکنہ طور پر فوری طبی توجہ کی ضرورت ظاہر کرتی ہے۔ ابھی اپنی مقامی ایمرجنسی سروس سے رابطہ کریں یا قریب ترین ایمرجنسی شعبے میں جائیں۔ CareOrbit ہنگامی سروس نہیں ہے۔" if state["language"] == "ur" else "What you described may need urgent medical attention. Contact your local emergency service now or go to the nearest emergency department. CareOrbit is not an emergency service.")
    return {"reply": message, "extracted": {"ready_for_confirmation": False}}

def build_graph(checkpointer):
    graph = StateGraph(IntakeState)
    graph.add_node("screen", _urgent_node)
    graph.add_node("collect", _collect_node)
    graph.add_node("urgent_reply", _urgent_reply)
    graph.add_edge(START, "screen")
    graph.add_conditional_edges("screen", lambda s: "urgent_reply" if s["urgent"] else "collect")
    graph.add_edge("collect", END)
    graph.add_edge("urgent_reply", END)
    return graph.compile(checkpointer=checkpointer)

