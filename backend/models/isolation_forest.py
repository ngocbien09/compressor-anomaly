"""
Isolation Forest model for multivariate anomaly detection.
"""

import os
import numpy as np
import pandas as pd
import joblib
# MODIFIED: RandomForestClassifier (supervised) replaces IsolationForest to leverage labels
from sklearn.ensemble import RandomForestClassifier
from sklearn.preprocessing import StandardScaler
from typing import Tuple, Dict, Any

MODEL_DIR = os.path.join(os.path.dirname(__file__), "..", "saved_models")
IF_MODEL_PATH = os.path.join(MODEL_DIR, "isolation_forest.pkl")
IF_SCALER_PATH = os.path.join(MODEL_DIR, "if_scaler.pkl")

BASE_FEATURES = [
    "suction_pressure", "discharge_pressure", "suction_temperature",
    "discharge_temperature", "vibration_x", "vibration_y",
    "bearing_temperature", "motor_current", "flow_rate", "oil_pressure",
]

# ADDED: Temporal rolling feature config for gradual drift (PRE_ANOMALY) detection
TEMPORAL_SENSOR_FEATURES = ['vibration_x', 'vibration_y', 'bearing_temperature', 'motor_current']
TEMPORAL_WINDOWS = [5, 10, 30]  # minutes (1 sample = 1 minute)

# ADDED: Full feature set = base + temporal rolling + derived physics features
FEATURES = BASE_FEATURES + [
    f'{s}_{a}_{w}'
    for s in TEMPORAL_SENSOR_FEATURES
    for w in TEMPORAL_WINDOWS
    for a in ('rmean', 'rstd', 'rslope')
] + ['vibration_magnitude', 'bearing_temp_roc', 'pressure_ratio', 'temp_spread']


def add_temporal_features(df: pd.DataFrame) -> pd.DataFrame:
    """ADDED: Compute rolling temporal features to capture gradual PRE_ANOMALY drift."""
    df = df.copy()
    for s in TEMPORAL_SENSOR_FEATURES:
        for w in TEMPORAL_WINDOWS:
            df[f'{s}_rmean_{w}'] = df[s].rolling(w, min_periods=1).mean()
            df[f'{s}_rstd_{w}']  = df[s].rolling(w, min_periods=1).std().fillna(0)
            df[f'{s}_rslope_{w}'] = df[s].rolling(w, min_periods=w).apply(
                lambda x: float(np.polyfit(range(len(x)), x, 1)[0]) if len(x) == w else 0.0,
                raw=True
            ).fillna(0)  # ADDED: fill NaN for first w-1 rows
    # ADDED: Physics-based derived features
    df['vibration_magnitude'] = np.sqrt(df['vibration_x'] ** 2 + df['vibration_y'] ** 2)
    df['bearing_temp_roc']    = df['bearing_temperature'].diff().fillna(0)
    df['pressure_ratio']      = df['discharge_pressure'] / df['suction_pressure'].replace(0, 1e-8)
    df['temp_spread']         = df['discharge_temperature'] - df['suction_temperature']
    return df


class IsolationForestModel:
    def __init__(self, contamination: float = 0.1, n_estimators: int = 200):
        self.contamination = contamination  # kept for API compat, unused by RF
        self.n_estimators = n_estimators
        self.model: RandomForestClassifier | None = None  # MODIFIED: RF instead of IF
        self.scaler: StandardScaler | None = None
        self.threshold: float = 0.5   # MODIFIED: RF uses probability threshold
        self.score_min: float = 0.0   # MODIFIED: RF proba already in [0,1]
        self.score_max: float = 1.0   # MODIFIED
        self.is_trained: bool = False

    def _build_model(self) -> RandomForestClassifier:  # MODIFIED
        # MODIFIED: supervised RandomForest — uses class labels during training
        return RandomForestClassifier(
            n_estimators=self.n_estimators,
            class_weight='balanced',   # ADDED: handle class imbalance automatically
            max_depth=20,              # ADDED: prevent overfitting
            min_samples_leaf=5,        # ADDED
            random_state=42,
            n_jobs=-1,
        )

    def fit(self, df_train: pd.DataFrame) -> Dict[str, Any]:
        # ADDED: Compute temporal features before training
        df_feat = add_temporal_features(df_train)
        X = df_feat[FEATURES].values.astype(np.float64)  # MODIFIED: extended FEATURES

        # MODIFIED: extract labels for supervised training
        if 'label' not in df_train.columns:
            raise ValueError("RandomForest requires 'label' column for supervised training.")
        y = df_train['label'].values

        self.scaler = StandardScaler()
        X_scaled = self.scaler.fit_transform(X)

        # MODIFIED: supervised fit with labels (RF learns label boundary directly)
        self.model = self._build_model()
        self.model.fit(X_scaled, y)

        # MODIFIED: use predict_proba scores — already calibrated [0,1]
        train_proba = self.model.predict_proba(X_scaled)[:, 1]
        self.threshold = 0.5   # default; will be overridden by evaluator's optimal threshold
        self.score_min = 0.0
        self.score_max = 1.0

        self.is_trained = True
        self.save()

        metrics = {
            "threshold": self.threshold,
            "train_samples": len(X),
            "train_auc_approx": float(np.mean(train_proba[y == 1]) - np.mean(train_proba[y == 0])),
            "n_estimators": self.n_estimators,
            "n_features": len(FEATURES),  # ADDED
        }
        return metrics

    def predict(self, X: np.ndarray) -> Tuple[np.ndarray, np.ndarray]:
        """Returns (anomaly_score [0,1], is_anomaly bool)."""
        if not self.is_trained:
            raise RuntimeError("Model is not trained yet.")
        X_scaled = self.scaler.transform(X)
        # MODIFIED: RF predict_proba gives calibrated [0,1] anomaly probability
        norm_scores = self.model.predict_proba(X_scaled)[:, 1]
        is_anomaly = (norm_scores >= self.threshold).astype(bool)
        return norm_scores, is_anomaly

    def predict_single(self, sensor_values: Dict[str, float]) -> Dict[str, Any]:
        # MODIFIED: build single-row df, compute temporal features (no history — use zeros for slopes)
        df_single = pd.DataFrame([{f: sensor_values[f] for f in BASE_FEATURES}])
        df_feat = add_temporal_features(df_single)
        X = df_feat[FEATURES].values.astype(np.float64)
        scores, is_anom = self.predict(X)
        return {
            "if_score": float(scores[0]),
            "is_anomaly": bool(is_anom[0]),
        }

    def save(self):
        os.makedirs(MODEL_DIR, exist_ok=True)
        joblib.dump(self.model, IF_MODEL_PATH)
        joblib.dump({
            'scaler': self.scaler,
            'threshold': self.threshold,
            'score_min': self.score_min,
            'score_max': self.score_max,
        }, IF_SCALER_PATH)

    def load(self) -> bool:
        if os.path.exists(IF_MODEL_PATH) and os.path.exists(IF_SCALER_PATH):
            self.model = joblib.load(IF_MODEL_PATH)
            meta = joblib.load(IF_SCALER_PATH)
            if isinstance(meta, dict):
                self.scaler    = meta['scaler']
                self.threshold = meta.get('threshold', 0.5)
                self.score_min = meta.get('score_min', 0.0)
                self.score_max = meta.get('score_max', 1.0)
            else:
                self.scaler    = meta  # backward compat with old bare-scaler format
                self.threshold = 0.5
            self.is_trained = True
            return True
        return False
