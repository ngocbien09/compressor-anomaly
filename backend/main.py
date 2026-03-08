"""
CompressorGuard AI - FastAPI Backend
Main entry point with all REST API routes.
"""

import os
import sys
import json
import asyncio
from datetime import datetime
from typing import Any, Dict, List, Optional

# Ensure project root is on path
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

# Load .env from project root
_env_path = os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), ".env")
if os.path.exists(_env_path):
    with open(_env_path) as _f:
        for _line in _f:
            if "=" in _line and not _line.startswith("#"):
                _k, _v = _line.strip().split("=", 1)
                os.environ.setdefault(_k.strip(), _v.strip())

from fastapi import FastAPI, BackgroundTasks, Depends, HTTPException, UploadFile, File
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import StreamingResponse, JSONResponse
from pydantic import BaseModel
import pandas as pd
import numpy as np

from backend.database.db import init_db, get_db, create_prediction, create_agent_analysis
from backend.database.db import get_recent_predictions, get_recent_analyses
from backend.database.db import create_training_run, update_training_run, get_latest_training_run
from backend.deployment.predictor import get_predictor

# ─── App setup ────────────────────────────────────────────────────────────────

app = FastAPI(
    title="CompressorGuard AI",
    description="Anomaly Detection API for Multi-Stage Compressor",
    version="1.0.0",
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=[
        "http://localhost:3000", "http://127.0.0.1:3000",
        "http://localhost:3001", "http://127.0.0.1:3001",
        "http://localhost:3002", "http://127.0.0.1:3002",
    ],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Global training state
_training_state: Dict[str, Any] = {
    "status": "idle",
    "progress": 0,
    "message": "Not started",
    "metrics": {},
}

DATA_PATH = os.path.join(os.path.dirname(__file__), "data", "sample_data.csv")

# ─── Startup ──────────────────────────────────────────────────────────────────

@app.on_event("startup")
def startup_event():
    init_db()
    predictor = get_predictor()
    if predictor.is_ready:
        print("[API] Models loaded successfully.")
    else:
        print("[API] No trained models found. Train first via /api/train/start.")


# ─── Health ───────────────────────────────────────────────────────────────────

@app.get("/api/health")
def health():
    predictor = get_predictor()
    return {
        "status": "ok",
        "models_ready": predictor.is_ready,
        "timestamp": datetime.utcnow().isoformat(),
        "api_key_set": bool(os.environ.get("ANTHROPIC_API_KEY")),
    }


# ─── Data Endpoints ───────────────────────────────────────────────────────────

@app.get("/api/data/sample")
def get_sample_data():
    if not os.path.exists(DATA_PATH):
        raise HTTPException(status_code=404, detail="Sample data not found. Generate it first.")
    df = pd.read_csv(DATA_PATH, nrows=500, parse_dates=["timestamp"])
    return {"data": df.to_dict(orient="records"), "total": len(df)}


@app.get("/api/data/stats")
def get_data_stats():
    if not os.path.exists(DATA_PATH):
        raise HTTPException(status_code=404, detail="Sample data not found.")
    df = pd.read_csv(DATA_PATH, parse_dates=["timestamp"])
    return {
        "total_rows": len(df),
        "date_start": str(df["timestamp"].min()),
        "date_end": str(df["timestamp"].max()),
        "anomaly_count": int(df["label"].sum()),
        "anomaly_rate": round(float(df["label"].mean()), 4),
        "normal_count": int((df["label"] == 0).sum()),
        "event_types": df["event_type"].value_counts().to_dict(),
        "features": [c for c in df.columns if c not in ("timestamp", "label", "event_type")],
        "feature_stats": {
            col: {
                "mean": round(float(df[col].mean()), 3),
                "std": round(float(df[col].std()), 3),
                "min": round(float(df[col].min()), 3),
                "max": round(float(df[col].max()), 3),
            }
            for col in df.columns
            if col not in ("timestamp", "label", "event_type")
        },
    }


@app.post("/api/data/generate")
def generate_data():
    """Trigger synthetic data generation."""
    from backend.data.generator import generate_dataset
    df = generate_dataset(50_000)
    df.to_csv(DATA_PATH, index=False)
    return {
        "success": True,
        "rows": len(df),
        "path": DATA_PATH,
        "message": f"Generated {len(df):,} rows of synthetic compressor data.",
    }


@app.post("/api/data/upload")
async def upload_data(file: UploadFile = File(...)):
    content = await file.read()
    import io
    df = pd.read_csv(io.BytesIO(content))
    required = ["timestamp", "suction_pressure", "discharge_pressure"]
    missing = [c for c in required if c not in df.columns]
    if missing:
        raise HTTPException(status_code=400, detail=f"Missing required columns: {missing}")
    df.to_csv(DATA_PATH, index=False)
    return {"success": True, "rows": len(df), "columns": list(df.columns)}


# ─── Training Endpoints ────────────────────────────────────────────────────────

def _run_training_background(run_id: int):
    from backend.training.trainer import TrainingPipeline
    from backend.database.db import SessionLocal

    db = SessionLocal()
    try:
        update_training_run(db, run_id, {"status": "running"})

        def progress_cb(msg: str, pct: int):
            global _training_state
            _training_state["message"] = msg
            _training_state["progress"] = pct

        pipeline = TrainingPipeline(progress_callback=progress_cb)
        result = pipeline.run()

        global _training_state
        _training_state["status"] = result.get("status", "completed")
        _training_state["metrics"] = result

        update_training_run(db, run_id, {
            "status": result.get("status", "completed"),
            "completed_at": datetime.utcnow(),
            "metrics": result,
            "model_path": os.path.join(os.path.dirname(__file__), "saved_models"),
        })

        # Reload predictor models
        get_predictor().load_models()

    except Exception as e:
        _training_state["status"] = "failed"
        _training_state["message"] = str(e)
        update_training_run(db, run_id, {"status": "failed"})
    finally:
        db.close()


@app.post("/api/train/start")
def start_training(background_tasks: BackgroundTasks, db=Depends(get_db)):
    global _training_state
    if _training_state["status"] == "running":
        raise HTTPException(status_code=409, detail="Training already in progress.")

    if not os.path.exists(DATA_PATH):
        raise HTTPException(status_code=400, detail="Dataset not found. Generate data first.")

    run = create_training_run(db)
    _training_state = {"status": "running", "progress": 0, "message": "Starting...", "metrics": {}}

    background_tasks.add_task(_run_training_background, run.id)
    return {"message": "Training started.", "run_id": run.id}


@app.get("/api/train/status")
def get_training_status():
    return _training_state


@app.get("/api/train/results")
def get_training_results(db=Depends(get_db)):
    run = get_latest_training_run(db)
    if not run:
        raise HTTPException(status_code=404, detail="No training runs found.")
    metrics = json.loads(run.metrics) if run.metrics else {}
    return {
        "run_id": run.id,
        "status": run.status,
        "started_at": str(run.started_at),
        "completed_at": str(run.completed_at) if run.completed_at else None,
        "metrics": metrics,
    }


# ─── Evaluation Endpoints ─────────────────────────────────────────────────────

_eval_cache: Optional[Dict] = None


@app.post("/api/evaluate/run")
def run_evaluation():
    from backend.evaluation.evaluator import run_evaluation as _run_eval
    global _eval_cache
    try:
        result = _run_eval()
        _eval_cache = result
        return result
    except RuntimeError as e:
        raise HTTPException(status_code=400, detail=str(e))
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"{type(e).__name__}: {e}")


@app.get("/api/evaluate/metrics")
def get_eval_metrics():
    if _eval_cache is None:
        raise HTTPException(status_code=404, detail="No evaluation results. Run /api/evaluate/run first.")
    return {k: v for k, v in _eval_cache.items() if k not in ("timeline", "roc_curve", "lead_time_histogram")}


@app.get("/api/evaluate/confusion")
def get_confusion_matrix():
    if _eval_cache is None:
        raise HTTPException(status_code=404, detail="Run evaluation first.")
    return _eval_cache.get("confusion_matrix", {})


@app.get("/api/evaluate/timeline")
def get_eval_timeline():
    if _eval_cache is None:
        raise HTTPException(status_code=404, detail="Run evaluation first.")
    return {
        "timeline": _eval_cache.get("timeline", []),
        "lead_time_histogram": _eval_cache.get("lead_time_histogram", []),
        "roc_curve": _eval_cache.get("roc_curve", []),
    }


# ─── Prediction Endpoints ─────────────────────────────────────────────────────

class SensorReading(BaseModel):
    suction_pressure: float
    discharge_pressure: float
    suction_temperature: float
    discharge_temperature: float
    vibration_x: float
    vibration_y: float
    bearing_temperature: float
    motor_current: float
    flow_rate: float
    oil_pressure: float


@app.post("/api/predict/single")
def predict_single(reading: SensorReading, db=Depends(get_db)):
    predictor = get_predictor()
    sensor_values = reading.model_dump()
    result = predictor.predict_single(sensor_values)

    # Persist prediction
    pred = create_prediction(db, {
        "timestamp": datetime.utcnow(),
        "sensor_values": sensor_values,
        "anomaly_score": result["anomaly_score"],
        "if_score": result.get("if_score"),
        "lstm_error": result.get("lstm_error"),
        "is_anomaly": result["is_anomaly"],
        "severity": result["severity"],
    })
    result["prediction_id"] = pred.id
    return result


@app.post("/api/predict/batch")
async def predict_batch(file: UploadFile = File(...), db=Depends(get_db)):
    content = await file.read()
    import io
    df = pd.read_csv(io.BytesIO(content))
    predictor = get_predictor()

    FEATURES = [
        "suction_pressure", "discharge_pressure", "suction_temperature",
        "discharge_temperature", "vibration_x", "vibration_y",
        "bearing_temperature", "motor_current", "flow_rate", "oil_pressure",
    ]
    missing = [f for f in FEATURES if f not in df.columns]
    if missing:
        raise HTTPException(400, f"Missing features: {missing}")

    results = []
    for _, row in df.iterrows():
        sensor_values = {f: float(row[f]) for f in FEATURES}
        r = predictor.predict_single(sensor_values)
        results.append(r)

    return {"results": results, "count": len(results)}


@app.get("/api/predict/stream")
async def stream_predictions():
    """Server-Sent Events stream: Normal operation → gradual fault → full anomaly."""
    import random, math
    predictor = get_predictor()

    # ── Sensor baselines (healthy compressor) ─────────────────────────────────
    BASELINES = {
        "suction_pressure": 1.0,    "discharge_pressure": 8.75,
        "suction_temperature": 30.0, "discharge_temperature": 95.0,
        "vibration_x": 2.25,        "vibration_y": 2.25,
        "bearing_temperature": 55.0, "motor_current": 50.0,
        "flow_rate": 1000.0,        "oil_pressure": 3.25,
    }
    NOISE = {
        "suction_pressure": 0.02,   "discharge_pressure": 0.05,
        "suction_temperature": 0.3,  "discharge_temperature": 0.5,
        "vibration_x": 0.08,        "vibration_y": 0.08,
        "bearing_temperature": 0.3,  "motor_current": 0.4,
        "flow_rate": 5.0,           "oil_pressure": 0.03,
    }

    # ── Fault scenario: bearing wear leading to failure ───────────────────────
    # Each phase: (phase_name, n_steps, {sensor: total_delta_by_end_of_phase})
    SCENARIO = [
        ("NORMAL",      60,  {}),                             # 30 s normal
        ("PRE_ANOMALY", 100, {                                # 50 s gradual drift
            "vibration_x": 2.5,  "vibration_y": 2.0,
            "bearing_temperature": 18.0, "motor_current": 5.0,
            "discharge_temperature": 8.0,
        }),
        ("ANOMALY",     80, {                                 # 40 s critical fault
            "vibration_x": 6.5,  "vibration_y": 5.5,
            "bearing_temperature": 40.0, "motor_current": 18.0,
            "discharge_temperature": 22.0,
            "oil_pressure": -1.1, "flow_rate": -180.0,
            "discharge_pressure": -1.5,
        }),
    ]

    async def event_generator():
        step = 0
        cumulative_deltas = {s: 0.0 for s in BASELINES}

        for phase_name, n_steps, target_deltas in SCENARIO:
            for i in range(n_steps):
                progress = i / max(n_steps - 1, 1)          # 0 → 1 within phase

                sensor_values = {}
                for sensor, base in BASELINES.items():
                    phase_delta = target_deltas.get(sensor, 0.0) * progress
                    total = cumulative_deltas[sensor] + phase_delta
                    noise = random.gauss(0, NOISE[sensor])
                    sensor_values[sensor] = round(base + total + noise, 4)

                result = predictor.predict_single(sensor_values)
                result["phase"]          = phase_name
                result["phase_step"]     = i
                result["phase_total"]    = n_steps
                result["phase_progress"] = round(progress, 3)
                result["true_label"]     = 0 if phase_name == "NORMAL" else 1
                result["event_type"]     = phase_name
                result["step"]           = step

                yield f"data: {json.dumps(result)}\n\n"
                await asyncio.sleep(0.5)
                step += 1

            # Carry forward deltas from this phase into the next
            for sensor, delta in target_deltas.items():
                cumulative_deltas[sensor] += delta

        yield f"data: {json.dumps({'done': True})}\n\n"

    return StreamingResponse(event_generator(), media_type="text/event-stream")


# ─── Agent Endpoints ──────────────────────────────────────────────────────────

class AnomalyAnalysisRequest(BaseModel):
    prediction_id: Optional[int] = None
    anomaly_timestamp: Optional[str] = None
    severity: str = "MEDIUM"
    affected_sensors: Dict[str, Any] = {}
    anomaly_score: float = 0.5
    if_score: float = 0.5
    lstm_reconstruction_error: float = 0.01
    recent_trend: str = "Gradual increase over last 60 minutes"
    previous_anomalies_24h: int = 0


@app.post("/api/agent/analyze")
def agent_analyze(request: AnomalyAnalysisRequest, db=Depends(get_db)):
    from backend.agent.analyzer import analyze_anomaly

    anomaly_data = {
        "anomaly_timestamp": request.anomaly_timestamp or datetime.utcnow().isoformat(),
        "severity": request.severity,
        "affected_sensors": request.affected_sensors,
        "anomaly_score": request.anomaly_score,
        "if_score": request.if_score,
        "lstm_reconstruction_error": request.lstm_reconstruction_error,
        "recent_trend": request.recent_trend,
        "previous_anomalies_24h": request.previous_anomalies_24h,
    }

    analysis = analyze_anomaly(anomaly_data)

    # Persist to DB
    db_analysis = create_agent_analysis(db, {
        "prediction_id": request.prediction_id,
        "root_cause": analysis.get("root_cause"),
        "confidence": analysis.get("confidence"),
        "recommendations": analysis.get("recommended_actions", []),
        "affected_sensors": request.affected_sensors,
        "time_to_critical": analysis.get("time_to_critical"),
        "raw_response": analysis.get("raw_response", json.dumps(analysis)),
    })

    return {**analysis, "analysis_id": db_analysis.id}


@app.get("/api/agent/stream")
async def agent_stream(
    severity: str = "MEDIUM",
    anomaly_score: float = 0.6,
    if_score: float = 0.55,
    lstm_error: float = 0.015,
    previous_anomalies_24h: int = 0,
    recent_trend: str = "Gradual increase over last 60 minutes",
    sensors: str = "{}",
):
    """SSE endpoint: streams Claude analysis token by token."""
    from backend.agent.analyzer import stream_analyze_anomaly

    try:
        affected_sensors = json.loads(sensors)
    except Exception:
        affected_sensors = {}

    anomaly_data = {
        "anomaly_timestamp": datetime.utcnow().isoformat(),
        "severity": severity,
        "anomaly_score": anomaly_score,
        "if_score": if_score,
        "lstm_reconstruction_error": lstm_error,
        "affected_sensors": affected_sensors,
        "previous_anomalies_24h": previous_anomalies_24h,
        "recent_trend": recent_trend,
    }

    async def event_gen():
        import asyncio
        for chunk in stream_analyze_anomaly(anomaly_data):
            yield f"data: {json.dumps({'chunk': chunk})}\n\n"
            await asyncio.sleep(0)   # yield control to event loop

    return StreamingResponse(event_gen(), media_type="text/event-stream",
                             headers={"Cache-Control": "no-cache", "X-Accel-Buffering": "no"})


class ChatRequest(BaseModel):
    messages: List[Dict[str, Any]]
    anomaly_context: Dict[str, Any] = {}


@app.post("/api/agent/chat")
async def agent_chat(request: ChatRequest):
    """SSE endpoint: streams a chat reply token by token."""
    from backend.agent.analyzer import stream_chat

    async def event_gen():
        import asyncio
        for chunk in stream_chat(request.messages, request.anomaly_context):
            yield f"data: {json.dumps({'chunk': chunk})}\n\n"
            await asyncio.sleep(0)

    return StreamingResponse(event_gen(), media_type="text/event-stream",
                             headers={"Cache-Control": "no-cache", "X-Accel-Buffering": "no"})


@app.get("/api/agent/history")
def get_agent_history(db=Depends(get_db)):
    analyses = get_recent_analyses(db, limit=20)
    result = []
    for a in analyses:
        result.append({
            "id": a.id,
            "prediction_id": a.prediction_id,
            "root_cause": a.root_cause,
            "confidence": a.confidence,
            "recommendations": json.loads(a.recommendations) if a.recommendations else [],
            "affected_sensors": json.loads(a.affected_sensors) if a.affected_sensors else {},
            "time_to_critical": a.time_to_critical,
            "created_at": str(a.created_at),
        })
    return {"analyses": result, "count": len(result)}


@app.get("/api/predictions/recent")
def get_recent_preds(db=Depends(get_db)):
    preds = get_recent_predictions(db, limit=50)
    result = []
    for p in preds:
        result.append({
            "id": p.id,
            "timestamp": str(p.timestamp),
            "anomaly_score": p.anomaly_score,
            "if_score": p.if_score,
            "lstm_error": p.lstm_error,
            "is_anomaly": p.is_anomaly,
            "severity": p.severity,
            "sensor_values": json.loads(p.sensor_values) if p.sensor_values else {},
            "created_at": str(p.created_at),
        })
    return {"predictions": result, "count": len(result)}


if __name__ == "__main__":
    import uvicorn
    uvicorn.run("main:app", host="0.0.0.0", port=8000, reload=True)
