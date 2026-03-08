"""Run evaluation directly without FastAPI server."""
import sys, os
os.environ['TF_CPP_MIN_LOG_LEVEL'] = '3'
os.environ['CUDA_VISIBLE_DEVICES'] = '-1'
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

# Must import TF before joblib/sklearn to prevent fork segfault on Windows
import tensorflow as _tf_init  # noqa: F401

print("=== Direct Evaluation (no server) ===\n")

from backend.evaluation.evaluator import run_evaluation
result = run_evaluation()

keys = ['precision','recall','f1_score','auc_roc','false_positive_rate',
        'optimal_threshold','pre_anomaly_detection_rate','mean_time_to_detect',
        'test_samples','anomaly_rate_true','anomaly_rate_pred']

print("\n=== KEY METRICS ===")
for k in keys:
    v = result.get(k)
    if v is not None:
        print(f"  {k}: {v}")
    else:
        print(f"  {k}: MISSING")

cm = result.get('confusion_matrix', {})
print(f"\n  confusion_matrix: {cm}")

thresh_path = os.path.join("backend", "saved_models", "optimal_threshold.json")
if os.path.exists(thresh_path):
    import json
    with open(thresh_path) as f:
        print(f"  optimal_threshold.json saved: {json.load(f)}")
