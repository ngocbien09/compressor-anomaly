"""
Real-time prediction module: loads trained models and serves predictions.
"""

import os
import time
import numpy as np
import pandas as pd
from datetime import datetime
from typing import Dict, Any, Optional, Generator
from collections import deque

# MODIFIED: import feature definitions from IF model to stay in sync
from backend.models.isolation_forest import (
    BASE_FEATURES, FEATURES, TEMPORAL_SENSOR_FEATURES, TEMPORAL_WINDOWS,
)

SENSOR_BASELINES = {
    "suction_pressure": 1.0,
    "discharge_pressure": 8.75,
    "suction_temperature": 30.0,
    "discharge_temperature": 95.0,
    "vibration_x": 2.25,
    "vibration_y": 2.25,
    "bearing_temperature": 55.0,
    "motor_current": 50.0,
    "flow_rate": 1000.0,
    "oil_pressure": 3.25,
}


class RealtimePredictor:
    """Singleton predictor that wraps both models for real-time inference."""

    def __init__(self):
        self.if_model = None
        self.lstm_model = None
        self.ensemble = None
        self._window_buffer: deque = deque(maxlen=60)  # rolling 60-min window (BASE_FEATURES only)
        self._loaded = False

    def load_models(self) -> bool:
        from backend.models.isolation_forest import IsolationForestModel
        from backend.models.lstm_autoencoder import LSTMAutoencoder
        from backend.models.ensemble import EnsemblePredictor

        self.if_model = IsolationForestModel()
        self.lstm_model = LSTMAutoencoder()
        self.ensemble = EnsemblePredictor()

        if_ok = self.if_model.load()
        lstm_ok = self.lstm_model.load()
        self._loaded = if_ok and lstm_ok
        return self._loaded

    @property
    def is_ready(self) -> bool:
        return self._loaded

    def _compute_if_features(self, sensor_values: Dict[str, float]) -> np.ndarray:
        """ADDED: Build extended temporal feature vector from rolling buffer + current point."""
        # Combine buffer history with current reading (base features only)
        buf = list(self._window_buffer) + [[sensor_values[f] for f in BASE_FEATURES]]
        df_buf = pd.DataFrame(buf, columns=BASE_FEATURES)
        # Compute rolling temporal features
        for s in TEMPORAL_SENSOR_FEATURES:
            for w in TEMPORAL_WINDOWS:
                df_buf[f'{s}_rmean_{w}'] = df_buf[s].rolling(w, min_periods=1).mean()
                df_buf[f'{s}_rstd_{w}']  = df_buf[s].rolling(w, min_periods=1).std().fillna(0)
                df_buf[f'{s}_rslope_{w}'] = df_buf[s].rolling(w, min_periods=w).apply(
                    lambda x: float(np.polyfit(range(len(x)), x, 1)[0]) if len(x) == w else 0.0,
                    raw=True
                ).fillna(0)  # ADDED: fill NaN for first w-1 rows
        df_buf['vibration_magnitude'] = np.sqrt(df_buf['vibration_x'] ** 2 + df_buf['vibration_y'] ** 2)
        df_buf['bearing_temp_roc']    = df_buf['bearing_temperature'].diff().fillna(0)
        df_buf['pressure_ratio']      = df_buf['discharge_pressure'] / df_buf['suction_pressure'].replace(0, 1e-8)
        df_buf['temp_spread']         = df_buf['discharge_temperature'] - df_buf['suction_temperature']
        return df_buf[FEATURES].iloc[-1:].values.astype(np.float32)

    def predict_single(self, sensor_values: Dict[str, float]) -> Dict[str, Any]:
        """Predict anomaly for a single sensor reading."""
        if not self._loaded:
            return self._not_ready_response(sensor_values)

        # ADDED: compute extended temporal features from rolling buffer for IF
        X_if = self._compute_if_features(sensor_values)

        # IF prediction (extended features)
        if_scores, if_flags = self.if_model.predict(X_if)            # MODIFIED
        if_score = float(if_scores[0])
        is_anom_if = bool(if_flags[0])

        # Update rolling window for LSTM (base features only)
        self._window_buffer.append([sensor_values[f] for f in BASE_FEATURES])  # MODIFIED
        lstm_score = 0.0
        is_anom_lstm = False

        if len(self._window_buffer) == 60:
            window_arr = np.array(list(self._window_buffer), dtype=np.float32)
            lstm_score, is_anom_lstm = self.lstm_model.predict_window(window_arr)

        # Ensemble
        result = self.ensemble.predict(if_score, lstm_score, is_anom_if, is_anom_lstm)

        # Compute sensor deviations
        affected_sensors = {}
        for sensor, value in sensor_values.items():
            baseline = SENSOR_BASELINES.get(sensor, value)
            dev_pct = abs(value - baseline) / (abs(baseline) + 1e-8) * 100
            if dev_pct > 5:
                affected_sensors[sensor] = {
                    "current": round(value, 3),
                    "baseline": baseline,
                    "deviation_pct": round(dev_pct, 1),
                }

        return {
            "timestamp": datetime.utcnow().isoformat(),
            **result,
            "lstm_error": lstm_score,
            "affected_sensors": affected_sensors,
            "sensor_values": sensor_values,
        }

    def _not_ready_response(self, sensor_values: Dict[str, float]) -> Dict[str, Any]:
        return {
            "timestamp": datetime.utcnow().isoformat(),
            "anomaly_score": 0.0,
            "severity": "NORMAL",
            "is_anomaly": False,
            "confidence": 0.0,
            "if_score": 0.0,
            "lstm_score": 0.0,
            "lstm_error": 0.0,
            "if_flag": False,
            "lstm_flag": False,
            "affected_sensors": {},
            "sensor_values": sensor_values,
            "warning": "Models not trained yet.",
        }

    def simulate_stream(self, data_path: str) -> Generator[Dict[str, Any], None, None]:
        """Stream predictions from sample_data.csv in real-time simulation."""
        df = pd.read_csv(data_path, parse_dates=["timestamp"])
        # Start from a random position to get interesting data
        start_idx = max(0, int(len(df) * 0.5))

        for i in range(start_idx, min(start_idx + 3600, len(df))):
            row = df.iloc[i]
            sensor_values = {f: float(row[f]) for f in BASE_FEATURES}  # MODIFIED: base features only
            result = self.predict_single(sensor_values)
            result["true_label"] = int(row.get("label", 0))
            result["event_type"] = str(row.get("event_type", "NORMAL"))
            yield result


# Global singleton
_predictor: Optional[RealtimePredictor] = None


def get_predictor() -> RealtimePredictor:
    global _predictor
    if _predictor is None:
        _predictor = RealtimePredictor()
        _predictor.load_models()
    return _predictor
