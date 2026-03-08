import { useState } from 'react'
import {
  AreaChart, Area, LineChart, Line, BarChart, Bar,
  XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer, ReferenceLine
} from 'recharts'
import { FlaskConical, Loader2, CheckCircle, AlertTriangle } from 'lucide-react'
import { runEvaluation } from '../services/api'

const COLORS = { tp: '#22c55e', fp: '#f59e0b', fn: '#ef4444', tn: '#6b7280' }

export default function EvaluationPanel() {
  const [loading, setLoading] = useState(false)
  const [results, setResults] = useState(null)
  const [error, setError]     = useState(null)

  const handleRun = async () => {
    setLoading(true)
    setError(null)
    try {
      const data = await runEvaluation()
      setResults(data)
    } catch (e) {
      setError(e.response?.data?.detail || e.message)
    } finally {
      setLoading(false)
    }
  }

  const cm = results?.confusion_matrix
  const total = cm ? cm.tp + cm.fp + cm.fn + cm.tn : 0

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h2 className="text-2xl font-bold text-white">Model Evaluation</h2>
        <button onClick={handleRun} disabled={loading} className="btn-primary flex items-center gap-2">
          {loading ? <Loader2 size={16} className="animate-spin" /> : <FlaskConical size={16} />}
          {loading ? 'Evaluating...' : 'Run Evaluation'}
        </button>
      </div>

      {error && (
        <div className="card border-red-900 flex items-center gap-3 text-red-400">
          <AlertTriangle size={18} /> {error}
        </div>
      )}

      {!results && !loading && (
        <div className="card text-center py-12 text-gray-500">
          <FlaskConical size={48} className="mx-auto mb-3 opacity-30" />
          <p>Click "Run Evaluation" to test model performance on the held-out test set.</p>
          <p className="text-sm mt-1">Requires trained models.</p>
        </div>
      )}

      {results && (
        <div className="space-y-6">
          <div className="flex items-center gap-2 text-green-400 font-semibold">
            <CheckCircle size={18} /> Evaluation Complete — {results.test_samples?.toLocaleString()} test samples
          </div>

          {/* Metrics cards */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <ScoreCard label="Precision"  value={results.precision}  color={scoreColor(results.precision)} />
            <ScoreCard label="Recall"     value={results.recall}     color={scoreColor(results.recall)} />
            <ScoreCard label="F1 Score"   value={results.f1_score}   color={scoreColor(results.f1_score)} />
            <ScoreCard label="AUC-ROC"    value={results.auc_roc}    color={scoreColor(results.auc_roc)} />
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            {/* Confusion Matrix */}
            {cm && (
              <div className="card">
                <h3 className="text-sm font-semibold text-gray-300 mb-4">Confusion Matrix</h3>
                <div className="grid grid-cols-2 gap-2 max-w-xs mx-auto">
                  {[
                    { key: 'tp', label: 'True Positive',  color: 'border-green-500 bg-green-900/20' },
                    { key: 'fp', label: 'False Positive', color: 'border-yellow-500 bg-yellow-900/20' },
                    { key: 'fn', label: 'False Negative', color: 'border-red-500 bg-red-900/20' },
                    { key: 'tn', label: 'True Negative',  color: 'border-gray-600 bg-gray-800/50' },
                  ].map(({ key, label, color }) => (
                    <div key={key} className={`border rounded-lg p-4 text-center ${color}`}>
                      <p className="text-2xl font-bold">{cm[key]?.toLocaleString()}</p>
                      <p className="text-xs text-gray-400 mt-1">{label}</p>
                      <p className="text-xs text-gray-500">{total ? ((cm[key]/total)*100).toFixed(1) : 0}%</p>
                    </div>
                  ))}
                </div>
                <div className="mt-3 text-center text-xs text-gray-500">
                  <span className="mr-4">Predicted →</span>
                  <span>Actual ↓</span>
                </div>
              </div>
            )}

            {/* ROC Curve */}
            {results.roc_curve?.length > 0 && (
              <div className="card">
                <h3 className="text-sm font-semibold text-gray-300 mb-4">ROC Curve (AUC = {results.auc_roc})</h3>
                <ResponsiveContainer width="100%" height={220}>
                  <AreaChart data={results.roc_curve}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#374151" />
                    <XAxis dataKey="fpr" stroke="#6b7280" tick={{ fontSize: 11 }} label={{ value: 'FPR', position: 'insideRight', fill: '#9ca3af', fontSize: 11 }} />
                    <YAxis stroke="#6b7280" tick={{ fontSize: 11 }} label={{ value: 'TPR', angle: -90, position: 'insideLeft', fill: '#9ca3af', fontSize: 11 }} />
                    <Tooltip contentStyle={{ background: '#111827', border: '1px solid #374151', fontSize: 12 }} />
                    <ReferenceLine x={0} y={0} stroke="#4b5563" strokeDasharray="4 4" />
                    <Area type="monotone" dataKey="tpr" stroke="#0ea5e9" fill="#0ea5e9" fillOpacity={0.15} dot={false} />
                  </AreaChart>
                </ResponsiveContainer>
              </div>
            )}
          </div>

          {/* Anomaly Timeline */}
          {results.timeline?.length > 0 && (
            <div className="card">
              <h3 className="text-sm font-semibold text-gray-300 mb-4">Anomaly Detection Timeline (Test Set Sample)</h3>
              <ResponsiveContainer width="100%" height={200}>
                <LineChart data={results.timeline}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#374151" />
                  <XAxis dataKey="timestamp" tick={false} stroke="#6b7280" />
                  <YAxis stroke="#6b7280" tick={{ fontSize: 11 }} domain={[0, 1]} />
                  <Tooltip
                    contentStyle={{ background: '#111827', border: '1px solid #374151', fontSize: 12 }}
                    labelFormatter={v => `Time: ${v}`}
                  />
                  <Line type="monotone" dataKey="score" stroke="#0ea5e9" dot={false} name="Anomaly Score" />
                  <Line type="monotone" dataKey="true_label" stroke="#22c55e" dot={false} name="True Label" strokeDasharray="4 4" />
                  <ReferenceLine y={0.3} stroke="#f59e0b" strokeDasharray="4 4" label={{ value: 'threshold', fill: '#f59e0b', fontSize: 10 }} />
                </LineChart>
              </ResponsiveContainer>
            </div>
          )}

          {/* Lead Time Histogram */}
          {results.lead_time_histogram?.length > 0 && (
            <div className="card">
              <h3 className="text-sm font-semibold text-gray-300 mb-1">Early Warning Lead Time</h3>
              <p className="text-xs text-gray-500 mb-4">Minutes detected before actual anomaly block</p>
              <ResponsiveContainer width="100%" height={160}>
                <BarChart data={results.lead_time_histogram}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#374151" />
                  <XAxis dataKey="range" stroke="#6b7280" tick={{ fontSize: 11 }} />
                  <YAxis stroke="#6b7280" tick={{ fontSize: 11 }} />
                  <Tooltip contentStyle={{ background: '#111827', border: '1px solid #374151' }} />
                  <Bar dataKey="count" fill="#0ea5e9" radius={[3, 3, 0, 0]} name="Detections" />
                </BarChart>
              </ResponsiveContainer>
            </div>
          )}
        </div>
      )}
    </div>
  )
}

function scoreColor(v) {
  if (v == null) return 'text-gray-400'
  if (v >= 0.85) return 'text-green-400'
  if (v >= 0.70) return 'text-yellow-400'
  return 'text-red-400'
}

function ScoreCard({ label, value, color }) {
  return (
    <div className="card text-center">
      <p className="text-xs text-gray-500 uppercase tracking-wide mb-1">{label}</p>
      <p className={`text-3xl font-bold font-mono ${color}`}>
        {value != null ? (value * 100).toFixed(1) + '%' : '—'}
      </p>
    </div>
  )
}
