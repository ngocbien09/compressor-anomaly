"""
Ensemble combiner: merges Isolation Forest and LSTM Autoencoder scores.
"""

import os
import json  # ADDED
from typing import Dict, Any, Optional, Tuple
import numpy as np

# MODIFIED: RF (via IsolationForestModel) outperforms LSTM (AUC 0.9726 vs 0.9548);
# use RF as primary signal. LSTM still contributes a small smoothing weight.
IF_WEIGHT = 0.85
LSTM_WEIGHT = 0.15

# ADDED: path for calibrated threshold saved by evaluator
_THRESHOLD_PATH = os.path.join(os.path.dirname(__file__), "..", "saved_models", "optimal_threshold.json")
_DEFAULT_THRESHOLD = 0.30


def _load_optimal_threshold() -> float:
    """ADDED: Load calibrated decision threshold; falls back to 0.30 if not yet evaluated."""
    try:
        with open(_THRESHOLD_PATH) as f:
            return float(json.load(f)["threshold"])
    except Exception:
        return _DEFAULT_THRESHOLD


def compute_severity(score: float) -> str:
    # MODIFIED: use calibrated threshold as the NORMAL/anomaly boundary
    threshold = _load_optimal_threshold()
    if score < threshold:
        return "NORMAL"
    # Map [threshold, 1.0] → LOW / MEDIUM / HIGH in equal thirds
    remaining = max(1.0 - threshold, 1e-8)
    relative = (score - threshold) / remaining
    if relative < 0.33:
        return "LOW"
    elif relative < 0.67:
        return "MEDIUM"
    return "HIGH"


def compute_confidence(if_score: float, lstm_score: float, is_anom_if: bool, is_anom_lstm: bool) -> float:
    """Agreement between models → higher confidence."""
    if is_anom_if == is_anom_lstm:
        # Both agree → high confidence
        base = 0.75
    else:
        base = 0.40

    # Boost confidence when scores are far from the decision boundary
    avg_score = (if_score + lstm_score) / 2
    distance = abs(avg_score - 0.5)
    confidence = min(base + distance * 0.5, 1.0)
    return round(confidence, 3)


class EnsemblePredictor:
    """Combines IF and LSTM predictions into a unified anomaly decision."""

    def predict(
        self,
        if_score: float,
        lstm_score: float,
        is_anom_if: bool,
        is_anom_lstm: bool,
    ) -> Dict[str, Any]:
        # Weighted ensemble score
        ensemble_score = IF_WEIGHT * if_score + LSTM_WEIGHT * lstm_score
        ensemble_score = float(np.clip(ensemble_score, 0.0, 1.0))

        severity = compute_severity(ensemble_score)
        is_anomaly = severity != "NORMAL"
        confidence = compute_confidence(if_score, lstm_score, is_anom_if, is_anom_lstm)

        return {
            "anomaly_score": ensemble_score,
            "severity": severity,
            "is_anomaly": is_anomaly,
            "confidence": confidence,
            "if_score": float(if_score),
            "lstm_score": float(lstm_score),
            "if_flag": bool(is_anom_if),
            "lstm_flag": bool(is_anom_lstm),
        }

    def predict_from_single(
        self,
        if_result: Dict[str, Any],
        lstm_result: Optional[Dict[str, Any]] = None,
    ) -> Dict[str, Any]:
        if_score = if_result.get("if_score", 0.0)
        is_anom_if = if_result.get("is_anomaly", False)

        if lstm_result is not None:
            lstm_score = lstm_result.get("lstm_score", 0.0)
            is_anom_lstm = lstm_result.get("is_anomaly", False)
        else:
            # Fallback: use IF result only
            lstm_score = if_score
            is_anom_lstm = is_anom_if

        return self.predict(if_score, lstm_score, is_anom_if, is_anom_lstm)
