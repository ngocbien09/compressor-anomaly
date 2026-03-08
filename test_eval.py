"""Standalone evaluator test — run with: backend/venv/Scripts/python test_eval.py"""
import sys, os
os.environ['TF_CPP_MIN_LOG_LEVEL'] = '3'
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

print("Importing isolation_forest...")
from backend.models.isolation_forest import (
    FEATURES, BASE_FEATURES, add_temporal_features, IsolationForestModel
)
print(f"  BASE_FEATURES: {len(BASE_FEATURES)}, FEATURES: {len(FEATURES)}")

print("Loading IF model...")
if_model = IsolationForestModel()
ok = if_model.load()
print(f"  Loaded: {ok}, scaler n_features_in_: {if_model.scaler.n_features_in_ if if_model.scaler else 'N/A'}")

print("\nRunning evaluation...")
from backend.evaluation.evaluator import run_evaluation
result = run_evaluation()

keys = ['precision','recall','f1_score','auc_roc','false_positive_rate',
        'optimal_threshold','pre_anomaly_detection_rate','mean_time_to_detect']
print("\n=== RESULTS ===")
for k in keys:
    v = result.get(k)
    print(f"  {k}: {v if v is not None else 'MISSING'}")
print(f"  test_samples: {result.get('test_samples')}")
print(f"  confusion_matrix: {result.get('confusion_matrix')}")

# Check threshold file
thresh_path = os.path.join("backend", "saved_models", "optimal_threshold.json")
if os.path.exists(thresh_path):
    import json
    with open(thresh_path) as f:
        print(f"\n  optimal_threshold.json: {json.load(f)}")
else:
    print("\n  optimal_threshold.json: NOT FOUND")
