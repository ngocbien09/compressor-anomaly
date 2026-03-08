"""
Training pipeline: loads data, trains both models, saves artifacts.
"""

import os
import time
import json
import pandas as pd
import numpy as np
from datetime import datetime
from typing import Dict, Any, Callable, Optional

DATA_PATH = os.path.join(os.path.dirname(__file__), "..", "data", "sample_data.csv")

FEATURES = [
    "suction_pressure", "discharge_pressure", "suction_temperature",
    "discharge_temperature", "vibration_x", "vibration_y",
    "bearing_temperature", "motor_current", "flow_rate", "oil_pressure",
]


class TrainingPipeline:
    def __init__(self, progress_callback: Optional[Callable[[str, int], None]] = None):
        self.progress_callback = progress_callback
        self._status: str = "idle"
        self._progress: int = 0
        self._message: str = ""
        self._metrics: Dict[str, Any] = {}

    def _update(self, msg: str, pct: int):
        self._message = msg
        self._progress = pct
        if self.progress_callback:
            self.progress_callback(msg, pct)
        print(f"[Training {pct}%] {msg}")

    @property
    def status(self) -> Dict[str, Any]:
        return {
            "status": self._status,
            "progress": self._progress,
            "message": self._message,
            "metrics": self._metrics,
        }

    def run(self) -> Dict[str, Any]:
        from backend.models.isolation_forest import IsolationForestModel
        from backend.models.lstm_autoencoder import LSTMAutoencoder

        self._status = "running"
        start_time = time.time()
        result: Dict[str, Any] = {}

        try:
            # ── Step 1: Load data ────────────────────────────────────────
            self._update("Loading dataset...", 5)
            if not os.path.exists(DATA_PATH):
                raise FileNotFoundError(f"Dataset not found at {DATA_PATH}. Generate it first.")

            df = pd.read_csv(DATA_PATH, parse_dates=["timestamp"])
            self._update(f"Loaded {len(df):,} rows.", 10)

            # ── Step 2: Split train / test ───────────────────────────────
            train_size = int(len(df) * 0.8)
            df_train = df.iloc[:train_size].copy()
            df_test = df.iloc[train_size:].copy()

            # ── Step 3: Train Isolation Forest ───────────────────────────
            self._update("Training Isolation Forest...", 20)
            if_model = IsolationForestModel(contamination=0.1, n_estimators=200)
            if_metrics = if_model.fit(df_train)
            self._update("Isolation Forest trained.", 50)

            # ── Step 4: Train LSTM Autoencoder ───────────────────────────
            self._update("Training LSTM Autoencoder (this may take a few minutes)...", 55)
            lstm_model = LSTMAutoencoder(window_size=60)
            lstm_metrics = lstm_model.fit(
                df_train,
                epochs=15,
                batch_size=256,
                validation_split=0.1,
            )
            self._update("LSTM Autoencoder trained.", 90)

            # ── Step 5: Compile results ───────────────────────────────────
            elapsed = time.time() - start_time
            result = {
                "status": "completed",
                "training_time_s": round(elapsed, 1),
                "train_samples": len(df_train),
                "test_samples": len(df_test),
                "if_threshold": if_metrics["threshold"],
                "lstm_threshold": lstm_metrics["threshold"],
                "lstm_final_loss": lstm_metrics["final_loss"],
                "lstm_val_loss": lstm_metrics["final_val_loss"],
                "loss_curve": lstm_metrics.get("loss_curve", []),
                "val_loss_curve": lstm_metrics.get("val_loss_curve", []),
                "completed_at": datetime.utcnow().isoformat(),
            }
            self._metrics = result
            self._status = "completed"
            self._update("Training complete!", 100)

        except Exception as exc:
            self._status = "failed"
            self._message = f"Training failed: {exc}"
            result = {"status": "failed", "error": str(exc)}

        return result
