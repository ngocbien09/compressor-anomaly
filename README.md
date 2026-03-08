# CompressorGuard AI - Anomaly Detection System

Phát hiện bất thường trong hệ thống **Multi-Stage Compressor** sử dụng Ensemble ML (Isolation Forest + LSTM Autoencoder) và Agentic AI (Claude).

## Tech Stack

| Layer | Technology |
|-------|-----------|
| Backend | Python 3.10+, FastAPI, uvicorn |
| ML Models | scikit-learn (Isolation Forest), TensorFlow/Keras (LSTM Autoencoder) |
| Database | SQLite + SQLAlchemy |
| AI Agent | Anthropic Claude API (claude-sonnet-4-20250514) |
| Frontend | React 18 + Vite, Recharts, Tailwind CSS |

## Quick Start

### Option 1: PowerShell Script (Windows)

```powershell
# Từ thư mục gốc dự án:
.\start.ps1
```

Script sẽ tự động:
- Tạo Python venv và cài requirements
- Generate sample data nếu chưa có
- Khởi động backend (port 8000) và frontend (port 3000)
- Mở browser tại http://localhost:3000

### Option 2: Manual

**Backend:**
```bash
cd backend
python -m venv venv
venv\Scripts\activate        # Windows
pip install -r requirements.txt

# Generate sample data
python data/generator.py

# Start server (from project root)
cd ..
python -m uvicorn backend.main:app --reload --port 8000
```

**Frontend:**
```bash
cd frontend
npm install
npm run dev
```

## AI Agent Setup (Optional)

```powershell
$env:ANTHROPIC_API_KEY = "sk-ant-..."
```

Không có API key → App vẫn chạy bình thường với mock AI response.

## Workflow

1. **Training tab** → Generate Sample Data → Start Training
2. **Evaluation tab** → Run Evaluation → xem Precision/Recall/F1/AUC
3. **Live Monitor tab** → Start Simulation → real-time anomaly streaming
4. **Timeline tab** → xem lịch sử anomaly
5. **AI Agent tab** → Analyze Latest Anomaly → diagnosis từ Claude

## API Endpoints

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | /api/health | Health check |
| GET | /api/data/stats | Dataset statistics |
| POST | /api/data/generate | Generate synthetic data |
| POST | /api/train/start | Start training (async) |
| GET | /api/train/status | Training progress |
| POST | /api/evaluate/run | Run evaluation |
| GET | /api/evaluate/metrics | Precision/Recall/F1/AUC |
| POST | /api/predict/single | Single point prediction |
| GET | /api/predict/stream | SSE real-time stream |
| POST | /api/agent/analyze | AI anomaly analysis |

API docs: http://localhost:8000/docs

## Models

### Isolation Forest
- `contamination=0.1`, `n_estimators=200`
- Detects multivariate outliers
- Saved: `backend/saved_models/isolation_forest.pkl`

### LSTM Autoencoder
- Input: 60-step sliding window × 10 features
- Architecture: LSTM(64) → LSTM(32) → Dense(16) → RepeatVector → LSTM(32) → LSTM(64) → Dense(10)
- Anomaly threshold: mean + 3σ of reconstruction error on normal data
- Saved: `backend/saved_models/lstm_autoencoder.keras`

### Ensemble
- `score = 0.4 × IF_score + 0.6 × LSTM_score`
- Severity: NORMAL (<0.3) | LOW (0.3–0.5) | MEDIUM (0.5–0.75) | HIGH (>0.75)

## Sensor Parameters

| Sensor | Unit | Normal Range |
|--------|------|-------------|
| suction_pressure | bar | 0.9–1.1 |
| discharge_pressure | bar | 8.0–9.5 |
| suction_temperature | °C | 25–35 |
| discharge_temperature | °C | 80–110 |
| vibration_x | mm/s | 1.0–3.5 |
| vibration_y | mm/s | 1.0–3.5 |
| bearing_temperature | °C | 45–65 |
| motor_current | A | 45–55 |
| flow_rate | m³/h | 800–1200 |
| oil_pressure | bar | 2.5–4.0 |
