"""
LSTM Autoencoder for temporal anomaly detection.
Detects gradual degradation patterns via reconstruction error.
"""

import os
import numpy as np
import pandas as pd
import joblib
from typing import Tuple, Dict, Any, Optional

os.environ.setdefault("TF_CPP_MIN_LOG_LEVEL", "3")

MODEL_DIR = os.path.join(os.path.dirname(__file__), "..", "saved_models")
LSTM_MODEL_PATH = os.path.join(MODEL_DIR, "lstm_autoencoder.keras")
LSTM_META_PATH = os.path.join(MODEL_DIR, "lstm_meta.pkl")

FEATURES = [
    "suction_pressure", "discharge_pressure", "suction_temperature",
    "discharge_temperature", "vibration_x", "vibration_y",
    "bearing_temperature", "motor_current", "flow_rate", "oil_pressure",
]

WINDOW_SIZE = 60
N_FEATURES = len(FEATURES)


def _build_model(window_size: int = WINDOW_SIZE, n_features: int = N_FEATURES):
    """Build LSTM Autoencoder architecture."""
    import tensorflow as tf
    from tensorflow import keras

    inputs = keras.Input(shape=(window_size, n_features))

    # Encoder
    x = keras.layers.LSTM(64, return_sequences=True)(inputs)
    x = keras.layers.LSTM(32, return_sequences=False)(x)
    encoded = keras.layers.Dense(16, activation="relu")(x)

    # Decoder
    x = keras.layers.RepeatVector(window_size)(encoded)
    x = keras.layers.LSTM(32, return_sequences=True)(x)
    x = keras.layers.LSTM(64, return_sequences=True)(x)
    decoded = keras.layers.TimeDistributed(keras.layers.Dense(n_features))(x)

    model = keras.Model(inputs, decoded)
    model.compile(optimizer="adam", loss="mse")
    return model


def create_windows(X: np.ndarray, window_size: int = WINDOW_SIZE) -> np.ndarray:
    """Slide a window over the time series."""
    n = len(X)
    windows = []
    for i in range(n - window_size + 1):
        windows.append(X[i : i + window_size])
    return np.array(windows)


class LSTMAutoencoder:
    def __init__(self, window_size: int = WINDOW_SIZE):
        self.window_size = window_size
        self.model = None
        self.scaler = None
        self.threshold: float = 0.0
        self.is_trained: bool = False
        self._history: Dict = {}

    def fit(
        self,
        df_train: pd.DataFrame,
        epochs: int = 30,
        batch_size: int = 128,
        validation_split: float = 0.1,
    ) -> Dict[str, Any]:
        from sklearn.preprocessing import MinMaxScaler

        # Use only normal data for autoencoder training
        normal_df = df_train[df_train["label"] == 0]
        X = normal_df[FEATURES].values.astype(np.float32)

        self.scaler = MinMaxScaler()
        X_scaled = self.scaler.fit_transform(X)

        X_windows = create_windows(X_scaled, self.window_size)
        print(f"[LSTM] Training on {len(X_windows)} windows, shape={X_windows.shape}")

        self.model = _build_model(self.window_size, N_FEATURES)
        history = self.model.fit(
            X_windows, X_windows,
            epochs=epochs,
            batch_size=batch_size,
            validation_split=validation_split,
            shuffle=True,
            verbose=1,
        )
        self._history = {
            "loss": history.history["loss"],
            "val_loss": history.history["val_loss"],
        }

        # Compute reconstruction error on training data to set threshold
        preds = self.model.predict(X_windows, verbose=0)
        errors = np.mean(np.square(X_windows - preds), axis=(1, 2))
        self.threshold = float(np.mean(errors) + 3 * np.std(errors))

        self.is_trained = True
        self.save()

        metrics = {
            "threshold": self.threshold,
            "train_windows": len(X_windows),
            "final_loss": float(self._history["loss"][-1]),
            "final_val_loss": float(self._history["val_loss"][-1]),
            "loss_curve": self._history["loss"],
            "val_loss_curve": self._history["val_loss"],
        }
        return metrics

    def predict_window(self, window: np.ndarray) -> Tuple[float, bool]:
        """window shape: (window_size, n_features)"""
        w_scaled = self.scaler.transform(window)
        w_input = w_scaled[np.newaxis, ...]  # (1, W, F)
        recon = self.model.predict(w_input, verbose=0)
        error = float(np.mean(np.square(w_input - recon)))
        is_anomaly = error > self.threshold
        # Normalize error to [0,1] using threshold as reference
        norm_error = min(error / (self.threshold * 2 + 1e-8), 1.0)
        return norm_error, is_anomaly

    def predict_batch(self, X: np.ndarray) -> Tuple[np.ndarray, np.ndarray]:
        """X shape: (N, n_features). Returns errors and anomaly flags per window."""
        X_scaled = self.scaler.transform(X)
        windows = create_windows(X_scaled, self.window_size)
        preds = self.model.predict(windows, verbose=0)
        errors = np.mean(np.square(windows - preds), axis=(1, 2))
        is_anomaly = errors > self.threshold
        norm_errors = np.minimum(errors / (self.threshold * 2 + 1e-8), 1.0)
        return norm_errors, is_anomaly

    def save(self):
        os.makedirs(MODEL_DIR, exist_ok=True)
        self.model.save(LSTM_MODEL_PATH)
        joblib.dump(
            {"scaler": self.scaler, "threshold": self.threshold, "window_size": self.window_size},
            LSTM_META_PATH,
        )

    def load(self) -> bool:
        import tensorflow as tf
        if os.path.exists(LSTM_MODEL_PATH) and os.path.exists(LSTM_META_PATH):
            self.model = tf.keras.models.load_model(LSTM_MODEL_PATH)
            meta = joblib.load(LSTM_META_PATH)
            self.scaler = meta["scaler"]
            self.threshold = meta["threshold"]
            self.window_size = meta.get("window_size", WINDOW_SIZE)
            self.is_trained = True
            return True
        return False
