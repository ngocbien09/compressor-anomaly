"""
SQLite database models and CRUD operations using SQLAlchemy.
"""

import json
from datetime import datetime
from typing import Optional, List, Dict, Any

from sqlalchemy import (
    create_engine, Column, Integer, Float, String, Boolean,
    DateTime, Text, ForeignKey, event
)
from sqlalchemy.orm import declarative_base, sessionmaker, Session, relationship
from sqlalchemy.pool import StaticPool

DATABASE_URL = "sqlite:///./backend/compressor.db"

engine = create_engine(
    DATABASE_URL,
    connect_args={"check_same_thread": False},
    poolclass=StaticPool,
)

SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)
Base = declarative_base()


# ─── Models ───────────────────────────────────────────────────────────────────

class Prediction(Base):
    __tablename__ = "predictions"

    id = Column(Integer, primary_key=True, index=True)
    timestamp = Column(DateTime, nullable=False)
    sensor_values = Column(Text, nullable=False)   # JSON
    anomaly_score = Column(Float, nullable=False)
    if_score = Column(Float, nullable=True)
    lstm_error = Column(Float, nullable=True)
    is_anomaly = Column(Boolean, nullable=False)
    severity = Column(String(10), nullable=False)  # NORMAL, LOW, MEDIUM, HIGH
    created_at = Column(DateTime, default=datetime.utcnow)

    analyses = relationship("AgentAnalysis", back_populates="prediction")


class AgentAnalysis(Base):
    __tablename__ = "agent_analyses"

    id = Column(Integer, primary_key=True, index=True)
    prediction_id = Column(Integer, ForeignKey("predictions.id"), nullable=True)
    root_cause = Column(String(200), nullable=True)
    confidence = Column(String(10), nullable=True)   # High, Medium, Low
    recommendations = Column(Text, nullable=True)    # JSON list
    affected_sensors = Column(Text, nullable=True)   # JSON dict
    time_to_critical = Column(String(100), nullable=True)
    raw_response = Column(Text, nullable=True)
    created_at = Column(DateTime, default=datetime.utcnow)

    prediction = relationship("Prediction", back_populates="analyses")


class TrainingRun(Base):
    __tablename__ = "training_runs"

    id = Column(Integer, primary_key=True, index=True)
    started_at = Column(DateTime, default=datetime.utcnow)
    completed_at = Column(DateTime, nullable=True)
    status = Column(String(20), default="pending")  # pending, running, completed, failed
    metrics = Column(Text, nullable=True)            # JSON
    model_path = Column(String(300), nullable=True)


# ─── Init ─────────────────────────────────────────────────────────────────────

def init_db():
    Base.metadata.create_all(bind=engine)


def get_db():
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()


# ─── CRUD helpers ─────────────────────────────────────────────────────────────

def create_prediction(db: Session, data: Dict[str, Any]) -> Prediction:
    pred = Prediction(
        timestamp=data["timestamp"],
        sensor_values=json.dumps(data["sensor_values"]),
        anomaly_score=data["anomaly_score"],
        if_score=data.get("if_score"),
        lstm_error=data.get("lstm_error"),
        is_anomaly=data["is_anomaly"],
        severity=data["severity"],
    )
    db.add(pred)
    db.commit()
    db.refresh(pred)
    return pred


def create_agent_analysis(db: Session, data: Dict[str, Any]) -> AgentAnalysis:
    analysis = AgentAnalysis(
        prediction_id=data.get("prediction_id"),
        root_cause=data.get("root_cause"),
        confidence=data.get("confidence"),
        recommendations=json.dumps(data.get("recommendations", [])),
        affected_sensors=json.dumps(data.get("affected_sensors", {})),
        time_to_critical=data.get("time_to_critical"),
        raw_response=data.get("raw_response"),
    )
    db.add(analysis)
    db.commit()
    db.refresh(analysis)
    return analysis


def get_recent_predictions(db: Session, limit: int = 100) -> List[Prediction]:
    return (
        db.query(Prediction)
        .order_by(Prediction.created_at.desc())
        .limit(limit)
        .all()
    )


def get_recent_analyses(db: Session, limit: int = 20) -> List[AgentAnalysis]:
    return (
        db.query(AgentAnalysis)
        .order_by(AgentAnalysis.created_at.desc())
        .limit(limit)
        .all()
    )


def create_training_run(db: Session) -> TrainingRun:
    run = TrainingRun(status="pending")
    db.add(run)
    db.commit()
    db.refresh(run)
    return run


def update_training_run(db: Session, run_id: int, data: Dict[str, Any]) -> Optional[TrainingRun]:
    run = db.query(TrainingRun).filter(TrainingRun.id == run_id).first()
    if not run:
        return None
    for key, val in data.items():
        if key == "metrics":
            setattr(run, key, json.dumps(val))
        else:
            setattr(run, key, val)
    db.commit()
    db.refresh(run)
    return run


def get_latest_training_run(db: Session) -> Optional[TrainingRun]:
    return (
        db.query(TrainingRun)
        .order_by(TrainingRun.id.desc())
        .first()
    )
