"""
ai_investigator/models.py — Pydantic models for investigator output (Phase 9.4)
"""
from typing import List, Dict, Any, Optional
from pydantic import BaseModel, Field

class InvestigatorFinding(BaseModel):
    finding: str
    evidence_ids: List[str] = Field(default_factory=list)
    severity: str = "MEDIUM"

class InvestigatorEvidence(BaseModel):
    id: str
    description: str = ""
    category: str = ""
    severity: str = "MEDIUM"

class InvestigatorOutput(BaseModel):
    summary: str
    risk_explanation: str
    key_findings: List[InvestigatorFinding] = Field(default_factory=list)
    evidence: List[InvestigatorEvidence] = Field(default_factory=list)
    recommended_action: str
    confidence: float = Field(ge=0, le=1)
    investigator_version: str = "ai-investigator-v1"
    # Phase 19 — grounded intel fields (optional, backward-compatible).
    # Always derived deterministically from supplied RiskEngine evidence,
    # never invented by the model (see investigator._build_intel_fields).
    attack_scenario: Optional[str] = None
    affected_factors: List[str] = Field(default_factory=list)
    recommended_actions: List[str] = Field(default_factory=list)

    class Config:
        extra = "ignore"
