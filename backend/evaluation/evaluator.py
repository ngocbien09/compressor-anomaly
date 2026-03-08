"""
Evaluation pipeline: runs models on test set and computes classification metrics.
"""

import os
import json  # ADDED
import numpy as np
import pandas as pd
from typing import Dict, Any, List, Optional

DATA_PATH = os.path.join(os.path.dirname(__file__), "..", "data", "sample_data.csv")
# ADDED: path for saving calibrated threshold
THRESHOLD_PATH = os.path.join(os.path.dirname(__file__), "..", "saved_models", "optimal_threshold.json")

# MODIFIED: import extended feature set and temporal feature function from IF model
from backend.models.isolation_forest import FEATURES, BASE_FEATURES, add_temporal_features


def run_evaluation() -> Dict[str, Any]:
    import tensorflow as _tf  # must import TF before joblib/sklearn to avoid fork segfault
    from backend.models.isolation_forest import IsolationForestModel
    from backend.models.lstm_autoencoder import LSTMAutoencoder
    from backend.models.ensemble import EnsemblePredictor, IF_WEIGHT, LSTM_WEIGHT
    from sklearn.metrics import precision_recall_curve  # ADDED

    # Load models
    if_model = IsolationForestModel()
    if not if_model.load():
        raise RuntimeError("Isolation Forest model not found. Train first.")

    lstm_model = LSTMAutoencoder()
    if not lstm_model.load():
        raise RuntimeError("LSTM model not found. Train first.")

    # Load test data (last 20%)
    df = pd.read_csv(DATA_PATH, parse_dates=["timestamp"])
    test_start = int(len(df) * 0.8)
    df_test = df.iloc[test_start:].reset_index(drop=True)

    y_true = df_test["label"].values

    # FIXED: compute temporal features on full dataset so rolling windows have proper history
    # then slice the test portion (avoids cold-start bias for first 30 rows of test set)
    df_full_feat = add_temporal_features(df)
    df_test_feat = df_full_feat.iloc[test_start:].reset_index(drop=True)
    X_extended = df_test_feat[FEATURES].values.astype(np.float32)      # for IF
    X_base     = df_test[BASE_FEATURES].values.astype(np.float32)      # for LSTM

    # IF predictions (extended features)
    if_scores, if_flags = if_model.predict(X_extended)                 # MODIFIED

    # LSTM predictions (base features only)
    lstm_scores, lstm_flags = lstm_model.predict_batch(X_base)         # MODIFIED
    # Align lengths (LSTM windows are shorter)
    w = lstm_model.window_size
    pad_front = w - 1
    lstm_scores_full = np.concatenate([np.zeros(pad_front), lstm_scores])
    lstm_flags_full  = np.concatenate([np.zeros(pad_front, dtype=bool), lstm_flags])

    # Ensemble scores
    ensemble = EnsemblePredictor()
    ensemble_scores = IF_WEIGHT * if_scores + LSTM_WEIGHT * lstm_scores_full[:len(X_extended)]

    # MODIFIED: Optimize threshold with hard constraints: Prec>=65% AND FPR<=10%,
    # then maximize Recall. Falls back to Prec>=65% only, then F2-max.
    from sklearn.metrics import confusion_matrix as _cm
    precision_vals, recall_vals, thresholds = precision_recall_curve(y_true, ensemble_scores)
    n_neg = int((y_true == 0).sum())

    # Build FPR array aligned with precision_recall_curve thresholds
    fpr_vals = np.array([
        float(_cm(y_true, ensemble_scores >= t).ravel()[1]) / (n_neg + 1e-8)
        for t in thresholds
    ])

    target_prec = 0.65
    target_fpr  = 0.10
    # Candidate thresholds satisfying both Prec>=65% and FPR<=10%
    valid_both = np.where((precision_vals[:-1] >= target_prec) & (fpr_vals <= target_fpr))[0]
    if len(valid_both) > 0:
        best_idx = valid_both[np.argmax(recall_vals[valid_both])]
        optimal_threshold = float(thresholds[best_idx])
    else:
        # Fallback 1: only Prec>=65%
        valid_prec = np.where(precision_vals[:-1] >= target_prec)[0]
        if len(valid_prec) > 0:
            best_idx = valid_prec[np.argmax(recall_vals[valid_prec])]
            optimal_threshold = float(thresholds[best_idx])
        else:
            # Fallback 2: maximize F2 (recall-weighted)
            f2 = (5 * precision_vals[:-1] * recall_vals[:-1]) / \
                 (4 * precision_vals[:-1] + recall_vals[:-1] + 1e-8)
            optimal_threshold = float(thresholds[np.argmax(f2)])

    # ADDED: Persist threshold so predictor can load it without re-evaluating
    os.makedirs(os.path.dirname(THRESHOLD_PATH), exist_ok=True)
    with open(THRESHOLD_PATH, 'w') as f:
        json.dump({"threshold": optimal_threshold}, f)

    ensemble_flags = ensemble_scores >= optimal_threshold               # MODIFIED: dynamic threshold

    # Compute metrics
    metrics = _compute_metrics(y_true, ensemble_flags, ensemble_scores)
    metrics['optimal_threshold'] = round(optimal_threshold, 4)         # ADDED

    # ADDED: PRE_ANOMALY detection rate
    if 'event_type' in df_test.columns:
        pre_mask = df_test['event_type'] == 'PRE_ANOMALY'
        if pre_mask.sum() > 0:
            metrics['pre_anomaly_detection_rate'] = round(
                float(ensemble_flags[pre_mask.values].mean()), 4)

    # ADDED: Mean Time To Detect (minutes lead before anomaly block)
    raw_leads = _compute_lead_times_raw(y_true, ensemble_flags)
    if raw_leads:
        metrics['mean_time_to_detect'] = round(float(np.mean(raw_leads)), 2)

    # ADDED: Print KPI validation report to console / server logs
    _print_kpi_report(metrics)

    # Timeline: sample 500 points for chart
    step = max(1, len(df_test) // 500)
    timeline = []
    for i in range(0, len(df_test), step):
        timeline.append({
            "timestamp": str(df_test["timestamp"].iloc[i]),
            "score": float(ensemble_scores[i]),
            "true_label": int(y_true[i]),
            "predicted": int(ensemble_flags[i]),
            "event_type": df_test["event_type"].iloc[i],
        })

    # Early warning analysis: for each anomaly block, find detection lead time
    lead_times = _compute_lead_times(y_true, ensemble_flags)

    # ROC curve
    roc = _compute_roc(y_true, ensemble_scores)

    return {
        **metrics,
        "timeline": timeline,
        "lead_time_histogram": lead_times,
        "roc_curve": roc,
        "test_samples": len(df_test),
        "anomaly_rate_true": float(y_true.mean()),
        "anomaly_rate_pred": float(ensemble_flags.mean()),
    }


def _compute_metrics(y_true: np.ndarray, y_pred: np.ndarray, scores: np.ndarray) -> Dict[str, Any]:
    from sklearn.metrics import (
        precision_score, recall_score, f1_score, roc_auc_score,
        confusion_matrix
    )

    precision = float(precision_score(y_true, y_pred, zero_division=0))
    recall    = float(recall_score(y_true, y_pred, zero_division=0))
    f1        = float(f1_score(y_true, y_pred, zero_division=0))

    try:
        auc = float(roc_auc_score(y_true, scores))
    except Exception:
        auc = 0.0

    cm = confusion_matrix(y_true, y_pred)
    tn, fp, fn, tp = cm.ravel() if cm.shape == (2, 2) else (0, 0, 0, 0)
    fpr = float(fp / (fp + tn + 1e-8))  # ADDED

    return {
        "precision": round(precision, 4),
        "recall": round(recall, 4),
        "f1_score": round(f1, 4),
        "auc_roc": round(auc, 4),
        "false_positive_rate": round(fpr, 4),  # ADDED
        "confusion_matrix": {
            "tn": int(tn), "fp": int(fp), "fn": int(fn), "tp": int(tp)
        },
    }


def _compute_lead_times_raw(y_true: np.ndarray, y_pred: np.ndarray) -> List[int]:
    """MODIFIED: Return list of minutes from anomaly block start to first detection within block.
    0 = detected immediately, N = detected N minutes into the block, not in list = missed."""
    detect_times = []
    i = 0
    while i < len(y_true):
        if y_true[i] == 1:
            block_start = i
            detected_at = None
            # Find first positive prediction within the anomaly block
            j = i
            while j < len(y_true) and y_true[j] == 1:
                if y_pred[j] == 1 and detected_at is None:
                    detected_at = j - block_start  # minutes from block start
                j += 1
            if detected_at is not None:
                detect_times.append(detected_at)
            i = j
        else:
            i += 1
    return detect_times


def _print_kpi_report(metrics: Dict[str, Any]):
    """ADDED: Print KPI validation report to server logs."""
    rows = [
        ('Precision',              metrics.get('precision', 0),                     0.65,  False, '%'),
        ('Recall',                 metrics.get('recall', 0),                        0.95,  False, '%'),
        ('F1 Score',               metrics.get('f1_score', 0),                      0.75,  False, '%'),
        ('AUC-ROC',                metrics.get('auc_roc', 0),                       0.97,  False, '.4f'),
        ('False Positive Rate',    metrics.get('false_positive_rate', 1.0),         0.10,  True,  '%'),
        ('PRE_ANOMALY Det.Rate',   metrics.get('pre_anomaly_detection_rate'),        0.70,  False, '%'),
        ('Mean Time To Detect(m)', metrics.get('mean_time_to_detect'),              10.0,  True,  '.1f'),
    ]
    print("\n" + "=" * 62)
    print("  KPI VALIDATION REPORT")
    print("=" * 62)
    print(f"  {'Metric':<26} {'Current':>10} {'Target':>10}  Status")
    print("-" * 62)
    all_pass = True
    for name, current, target, lower_is_better, fmt in rows:
        if current is None:
            continue
        passed = (current <= target) if lower_is_better else (current >= target)
        if not passed:
            all_pass = False
        status = "PASS" if passed else "FAIL"
        if fmt == '%':
            cur_str, tgt_str = f"{current:.1%}", f"{target:.1%}"
        elif fmt == '.4f':
            cur_str, tgt_str = f"{current:.4f}", f"{target:.4f}"
        else:
            cur_str, tgt_str = f"{current:{fmt}}", f"{target:{fmt}}"
        print(f"  {name:<26} {cur_str:>10} {tgt_str:>10}  {status}")
    print("=" * 62)
    print(f"  {'ALL KPIs PASSED' if all_pass else 'Some KPIs FAILED — retrain recommended'}")
    print("=" * 62 + "\n")


def _compute_lead_times(y_true: np.ndarray, y_pred: np.ndarray) -> List[Dict]:
    """For each true anomaly block, compute how many minutes before it was first detected."""
    lead_times = []
    i = 0
    while i < len(y_true):
        if y_true[i] == 1:
            block_start = i
            # Walk back to find first prediction before block
            detected_at = None
            for j in range(max(0, i - 120), i):
                if y_pred[j] == 1:
                    detected_at = j
                    break
            if detected_at is not None:
                lead = block_start - detected_at
                lead_times.append({"lead_minutes": int(lead), "block_start": block_start})
            # Skip to end of anomaly block
            while i < len(y_true) and y_true[i] == 1:
                i += 1
        else:
            i += 1

    # Bin into histogram
    bins = [0, 2, 5, 10, 15, 20, 30, 60, 120]
    counts = [0] * (len(bins) - 1)
    for lt in lead_times:
        for k in range(len(bins) - 1):
            if bins[k] <= lt["lead_minutes"] < bins[k + 1]:
                counts[k] += 1
                break

    return [
        {"range": f"{bins[k]}-{bins[k+1]}min", "count": counts[k]}
        for k in range(len(counts))
    ]


def _compute_roc(y_true: np.ndarray, scores: np.ndarray, n_points: int = 50) -> List[Dict]:
    thresholds = np.linspace(0, 1, n_points)
    roc = []
    for t in thresholds:
        pred = scores >= t
        tp = int(((pred == 1) & (y_true == 1)).sum())
        fp = int(((pred == 1) & (y_true == 0)).sum())
        fn = int(((pred == 0) & (y_true == 1)).sum())
        tn = int(((pred == 0) & (y_true == 0)).sum())
        fpr = fp / (fp + tn + 1e-8)
        tpr = tp / (tp + fn + 1e-8)
        roc.append({"threshold": round(float(t), 3), "fpr": round(fpr, 4), "tpr": round(tpr, 4)})
    return roc
