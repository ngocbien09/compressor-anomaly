"""Retrain only the Isolation Forest with temporal features. ~2-3 min."""
import sys, os, time
os.environ['TF_CPP_MIN_LOG_LEVEL'] = '3'
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

import pandas as pd
from backend.models.isolation_forest import IsolationForestModel, FEATURES, BASE_FEATURES

DATA_PATH = os.path.join('backend', 'data', 'sample_data.csv')
print(f"Loading data from {DATA_PATH}...")
df = pd.read_csv(DATA_PATH, parse_dates=['timestamp'])
print(f"  Rows: {len(df):,} | Anomaly rate: {df['label'].mean():.1%}")

train_size = int(len(df) * 0.8)
df_train = df.iloc[:train_size].copy()
print(f"  Training on {len(df_train):,} rows with {len(FEATURES)} features (incl. temporal)")

t0 = time.time()
if_model = IsolationForestModel(contamination=0.1, n_estimators=200)
metrics = if_model.fit(df_train)
elapsed = time.time() - t0

print(f"\nIF training complete in {elapsed:.1f}s")
print(f"  n_features    : {metrics['n_features']}")
print(f"  threshold     : {metrics['threshold']:.6f}")
print(f"  train_auc_sep : {metrics.get('train_auc_approx', 'n/a'):.4f}")

# Verify saved model
m2 = IsolationForestModel()
m2.load()
print(f"\nVerify loaded model:")
print(f"  scaler n_features_in_: {m2.scaler.n_features_in_}")
print(f"  score_min: {m2.score_min:.4f}, score_max: {m2.score_max:.4f}")

print("\nIF model saved with temporal features. Ready for evaluation.")
