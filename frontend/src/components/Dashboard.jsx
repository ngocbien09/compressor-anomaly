import { useState, useEffect } from 'react'
import { Activity, Shield, AlertTriangle, CheckCircle, Cpu, Database } from 'lucide-react'
import { healthCheck, getDataStats } from '../services/api'
import SensorChart from './SensorChart'
import { getSampleData } from '../services/api'

function StatusBadge({ modelsReady }) {
  if (modelsReady) {
    return (
      <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-sm font-medium bg-green-900/50 text-green-300 border border-green-700/50">
        <span className="w-2 h-2 rounded-full bg-green-400 animate-pulse" />
        MODELS READY
      </span>
    )
  }
  return (
    <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-sm font-medium bg-yellow-900/50 text-yellow-300 border border-yellow-700/50">
      <span className="w-2 h-2 rounded-full bg-yellow-400" />
      MODELS NOT TRAINED
    </span>
  )
}

export default function Dashboard() {
  const [health, setHealth]     = useState(null)
  const [stats, setStats]       = useState(null)
  const [sampleData, setSample] = useState([])

  useEffect(() => {
    healthCheck().then(setHealth).catch(() => setHealth(null))
    getDataStats().then(setStats).catch(() => setStats(null))
    getSampleData().then(d => setSample(d.data?.slice(0, 200) || [])).catch(() => setSample([]))
  }, [])

  const steps = [
    { step: 1, title: 'Generate Data', desc: 'Go to Training tab, click "Generate Sample Data" to create 50,000 rows of synthetic compressor data.' },
    { step: 2, title: 'Train Models',  desc: 'Click "Start Training". Isolation Forest + LSTM Autoencoder will train (~5–15 min).' },
    { step: 3, title: 'Evaluate',      desc: 'Switch to Evaluation tab and click "Run Evaluation" to see Precision, Recall, F1, AUC-ROC.' },
    { step: 4, title: 'Live Monitor',  desc: 'Use Live Monitor to stream real-time simulation and watch anomaly scores.' },
    { step: 5, title: 'AI Analysis',   desc: 'Click "Analyze Latest Anomaly" in the AI Agent tab for diagnosis and recommendations.' },
  ]

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-2xl font-bold text-white">CompressorGuard AI</h2>
        <p className="text-gray-400 text-sm mt-1">Multi-Stage Compressor Anomaly Detection System</p>
      </div>

      {/* Status row */}
      <div className="flex flex-wrap gap-3 items-center">
        {health ? <StatusBadge modelsReady={health.models_ready} /> : <StatusBadge modelsReady={false} />}
        {health?.api_key_set && (
          <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-sm font-medium bg-brand-900/50 text-brand-300 border border-brand-700/50">
            <Cpu size={12} /> Claude API Connected
          </span>
        )}
        <span className="text-xs text-gray-600 ml-auto">{new Date().toLocaleString()}</span>
      </div>

      {/* Stats cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <StatCard icon={<Database size={18} />} label="Dataset Rows" value={stats?.total_rows?.toLocaleString() ?? '—'} />
        <StatCard icon={<AlertTriangle size={18} />} label="Anomaly Rate" value={stats ? (stats.anomaly_rate * 100).toFixed(1) + '%' : '—'} color="text-orange-400" />
        <StatCard icon={<Shield size={18} />} label="Models" value={health?.models_ready ? 'Trained' : 'Untrained'} color={health?.models_ready ? 'text-green-400' : 'text-yellow-400'} />
        <StatCard icon={<Activity size={18} />} label="API Status" value={health ? 'Online' : 'Offline'} color={health ? 'text-green-400' : 'text-red-400'} />
      </div>

      {/* Getting Started */}
      {!health?.models_ready && (
        <div className="card border-brand-800 bg-brand-900/10">
          <h3 className="text-brand-300 font-semibold mb-4 flex items-center gap-2">
            <CheckCircle size={16} /> Getting Started
          </h3>
          <div className="grid grid-cols-1 md:grid-cols-5 gap-3">
            {steps.map(s => (
              <div key={s.step} className="bg-gray-800/50 rounded-lg p-3">
                <div className="w-6 h-6 rounded-full bg-brand-700 text-brand-200 text-xs font-bold flex items-center justify-center mb-2">{s.step}</div>
                <p className="text-white text-sm font-medium mb-1">{s.title}</p>
                <p className="text-gray-500 text-xs">{s.desc}</p>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Sample data chart */}
      {sampleData.length > 0 && (
        <div className="card">
          <h3 className="text-sm font-semibold text-gray-300 mb-4">Sample Data Preview — Pressure & Temperature Sensors</h3>
          <SensorChart
            data={sampleData}
            sensors={['suction_pressure', 'discharge_pressure', 'suction_temperature', 'discharge_temperature']}
            height={200}
          />
        </div>
      )}

      {sampleData.length > 0 && (
        <div className="card">
          <h3 className="text-sm font-semibold text-gray-300 mb-4">Sample Data Preview — Vibration & Bearing</h3>
          <SensorChart
            data={sampleData}
            sensors={['vibration_x', 'vibration_y', 'bearing_temperature', 'motor_current']}
            height={200}
          />
        </div>
      )}

      {/* Architecture info */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <InfoCard title="Isolation Forest" color="border-purple-700" desc="Multivariate outlier detection. Contamination=10%, 200 estimators. Scores each reading in feature space." />
        <InfoCard title="LSTM Autoencoder" color="border-blue-700" desc="60-step temporal windows. Encoder→Bottleneck→Decoder. High reconstruction error = anomaly." />
        <InfoCard title="Ensemble + AI Agent" color="border-brand-700" desc="IF×0.4 + LSTM×0.6 weighted score. Claude analyzes patterns and recommends operator actions." />
      </div>
    </div>
  )
}

function StatCard({ icon, label, value, color = 'text-white' }) {
  return (
    <div className="card flex items-center gap-3">
      <div className="text-brand-400">{icon}</div>
      <div>
        <p className="text-xs text-gray-500">{label}</p>
        <p className={`font-bold ${color}`}>{value}</p>
      </div>
    </div>
  )
}

function InfoCard({ title, desc, color }) {
  return (
    <div className={`card border-l-2 ${color}`}>
      <h4 className="font-semibold text-white mb-1">{title}</h4>
      <p className="text-gray-400 text-sm">{desc}</p>
    </div>
  )
}
