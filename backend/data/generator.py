"""
Synthetic data generator for Multi-Stage Compressor sensor data.
Generates realistic operating data with NORMAL, PRE_ANOMALY, and ANOMALY scenarios.
"""

import numpy as np
import pandas as pd
from datetime import datetime, timedelta
import os

# Sensor normal ranges
SENSOR_CONFIG = {
    "suction_pressure":      {"mean": 1.0,   "std": 0.03,  "unit": "bar"},
    "discharge_pressure":    {"mean": 8.75,  "std": 0.2,   "unit": "bar"},
    "suction_temperature":   {"mean": 30.0,  "std": 1.5,   "unit": "C"},
    "discharge_temperature": {"mean": 95.0,  "std": 4.0,   "unit": "C"},
    "vibration_x":           {"mean": 2.25,  "std": 0.3,   "unit": "mm/s"},
    "vibration_y":           {"mean": 2.25,  "std": 0.3,   "unit": "mm/s"},
    "bearing_temperature":   {"mean": 55.0,  "std": 2.5,   "unit": "C"},
    "motor_current":         {"mean": 50.0,  "std": 1.5,   "unit": "A"},
    "flow_rate":             {"mean": 1000.0,"std": 30.0,  "unit": "m3/h"},
    "oil_pressure":          {"mean": 3.25,  "std": 0.2,   "unit": "bar"},
}

FEATURES = list(SENSOR_CONFIG.keys())
N_TOTAL = 50_000
START_TIME = datetime(2024, 1, 1, 0, 0, 0)


def generate_normal_segment(n: int, rng: np.random.Generator) -> pd.DataFrame:
    data = {}
    for sensor, cfg in SENSOR_CONFIG.items():
        # Add slow sinusoidal drift to simulate load changes
        t = np.linspace(0, 4 * np.pi, n)
        drift = cfg["std"] * 0.3 * np.sin(t + rng.uniform(0, 2 * np.pi))
        noise = rng.normal(0, cfg["std"], n)
        data[sensor] = cfg["mean"] + drift + noise
    df = pd.DataFrame(data)
    df["label"] = 0
    df["event_type"] = "NORMAL"
    return df


def generate_pre_anomaly_segment(n: int, rng: np.random.Generator, anomaly_type: str) -> pd.DataFrame:
    """Gradual degradation over the segment (simulates ~24 days of progressive wear)."""
    data = {}
    progress = np.linspace(0, 1, n)  # 0 = start of degradation, 1 = near-anomaly

    for sensor, cfg in SENSOR_CONFIG.items():
        noise = rng.normal(0, cfg["std"], n)
        base = cfg["mean"] + noise
        data[sensor] = base

    if anomaly_type == "bearing_degradation":
        # Vibration and bearing temperature gradually increase
        data["vibration_x"] += progress * 2.5 * rng.uniform(0.8, 1.2)
        data["vibration_y"] += progress * 2.0 * rng.uniform(0.8, 1.2)
        data["bearing_temperature"] += progress * 20.0 * rng.uniform(0.8, 1.2)

    elif anomaly_type == "valve_issue":
        # Pressure ratio anomaly + discharge temp rise
        data["discharge_pressure"] -= progress * 1.5 * rng.uniform(0.7, 1.3)
        data["discharge_temperature"] += progress * 25.0 * rng.uniform(0.8, 1.2)

    elif anomaly_type == "fouling":
        # Flow rate decreases, motor current increases
        data["flow_rate"] -= progress * 200.0 * rng.uniform(0.8, 1.2)
        data["motor_current"] += progress * 8.0 * rng.uniform(0.8, 1.2)
        data["discharge_pressure"] += progress * 0.5

    elif anomaly_type == "seal_leak":
        # Suction pressure drops, flow rate decreases
        data["suction_pressure"] -= progress * 0.25 * rng.uniform(0.8, 1.2)
        data["flow_rate"] -= progress * 150.0 * rng.uniform(0.8, 1.2)

    df = pd.DataFrame(data)
    df["label"] = 0  # Pre-anomaly still labeled 0 (not yet tripped)
    df["event_type"] = "PRE_ANOMALY"
    return df


def generate_anomaly_segment(n: int, rng: np.random.Generator, anomaly_type: str) -> pd.DataFrame:
    """Clear anomalous operating conditions."""
    data = {}

    for sensor, cfg in SENSOR_CONFIG.items():
        noise = rng.normal(0, cfg["std"], n)
        data[sensor] = cfg["mean"] + noise

    if anomaly_type == "bearing_degradation":
        data["vibration_x"] += rng.uniform(3.0, 5.0, n)
        data["vibration_y"] += rng.uniform(3.0, 5.0, n)
        data["bearing_temperature"] += rng.uniform(25.0, 40.0, n)

    elif anomaly_type == "valve_issue":
        data["discharge_pressure"] -= rng.uniform(1.5, 2.5, n)
        data["discharge_temperature"] += rng.uniform(30.0, 50.0, n)
        data["suction_pressure"] += rng.uniform(0.05, 0.15, n)

    elif anomaly_type == "fouling":
        data["flow_rate"] -= rng.uniform(250.0, 400.0, n)
        data["motor_current"] += rng.uniform(10.0, 18.0, n)
        data["discharge_pressure"] += rng.uniform(0.5, 1.0, n)
        data["discharge_temperature"] += rng.uniform(15.0, 25.0, n)

    elif anomaly_type == "seal_leak":
        data["suction_pressure"] -= rng.uniform(0.3, 0.5, n)
        data["flow_rate"] -= rng.uniform(200.0, 350.0, n)
        data["motor_current"] += rng.uniform(3.0, 8.0, n)

    elif anomaly_type == "overload":
        data["motor_current"] += rng.uniform(15.0, 25.0, n)
        data["discharge_temperature"] += rng.uniform(30.0, 60.0, n)
        data["discharge_pressure"] += rng.uniform(1.0, 2.0, n)

    # Random spikes on top of sustained anomaly
    spike_idx = rng.integers(0, n, size=max(1, n // 20))
    data["vibration_x"][spike_idx] *= rng.uniform(1.5, 2.5)
    data["motor_current"][spike_idx] *= rng.uniform(1.2, 1.8)

    df = pd.DataFrame(data)
    df["label"] = 1
    df["event_type"] = "ANOMALY"
    return df


def generate_dataset(n_total: int = N_TOTAL, seed: int = 42) -> pd.DataFrame:
    rng = np.random.default_rng(seed)
    anomaly_types = ["bearing_degradation", "valve_issue", "fouling", "seal_leak", "overload"]

    # Distribution: 70% NORMAL, 20% PRE_ANOMALY, 10% ANOMALY
    n_normal = int(n_total * 0.70)
    n_pre = int(n_total * 0.20)
    n_anom = n_total - n_normal - n_pre

    segments = []

    # Build interleaved segments to simulate realistic timeline
    # Normal blocks
    normal_sizes = [int(n_normal * f) for f in [0.20, 0.15, 0.15, 0.10, 0.10, 0.10, 0.10]]
    normal_sizes.append(n_normal - sum(normal_sizes))

    # Pre-anomaly blocks (one per anomaly occurrence)
    n_events = 8
    pre_sizes = [n_pre // n_events] * n_events
    pre_sizes[-1] += n_pre - sum(pre_sizes)

    anom_sizes = [n_anom // n_events] * n_events
    anom_sizes[-1] += n_anom - sum(anom_sizes)

    event_idx = 0
    for i, norm_size in enumerate(normal_sizes):
        seg = generate_normal_segment(norm_size, rng)
        segments.append(seg)

        if event_idx < n_events:
            atype = anomaly_types[event_idx % len(anomaly_types)]
            pre_seg = generate_pre_anomaly_segment(pre_sizes[event_idx], rng, atype)
            segments.append(pre_seg)
            anom_seg = generate_anomaly_segment(anom_sizes[event_idx], rng, atype)
            segments.append(anom_seg)
            event_idx += 1

    df = pd.concat(segments, ignore_index=True)
    df = df.iloc[:n_total].reset_index(drop=True)

    # Add timestamps
    timestamps = [START_TIME + timedelta(minutes=i) for i in range(len(df))]
    df.insert(0, "timestamp", timestamps)

    # Clip to realistic ranges (no negative pressures, temperatures, etc.)
    df["suction_pressure"] = df["suction_pressure"].clip(0.3, 2.0)
    df["discharge_pressure"] = df["discharge_pressure"].clip(4.0, 14.0)
    df["suction_temperature"] = df["suction_temperature"].clip(15.0, 50.0)
    df["discharge_temperature"] = df["discharge_temperature"].clip(60.0, 180.0)
    df["vibration_x"] = df["vibration_x"].clip(0.1, 15.0)
    df["vibration_y"] = df["vibration_y"].clip(0.1, 15.0)
    df["bearing_temperature"] = df["bearing_temperature"].clip(30.0, 120.0)
    df["motor_current"] = df["motor_current"].clip(20.0, 90.0)
    df["flow_rate"] = df["flow_rate"].clip(300.0, 1600.0)
    df["oil_pressure"] = df["oil_pressure"].clip(0.5, 6.0)

    return df


def main():
    print("Generating synthetic compressor dataset...")
    df = generate_dataset(N_TOTAL)

    out_path = os.path.join(os.path.dirname(__file__), "sample_data.csv")
    df.to_csv(out_path, index=False)

    print(f"Dataset saved to: {out_path}")
    print(f"Total rows: {len(df):,}")
    print(f"Date range: {df['timestamp'].iloc[0]} to {df['timestamp'].iloc[-1]}")
    print(f"Label distribution:\n{df['label'].value_counts()}")
    print(f"Event types:\n{df['event_type'].value_counts()}")
    print(f"Anomaly rate: {df['label'].mean():.1%}")


if __name__ == "__main__":
    main()
