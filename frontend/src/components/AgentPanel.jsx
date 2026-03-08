import { useState, useEffect } from 'react'
import { Brain, Loader2, RefreshCw, AlertTriangle, Clock, Zap, CheckCircle, Info } from 'lucide-react'
import { analyzeAnomaly, getAgentHistory, getRecentPredictions } from '../services/api'

const urgencyColor = {
  Immediate:      'text-red-400 bg-red-900/20 border-red-800',
  'Within 4h':    'text-orange-400 bg-orange-900/20 border-orange-800',
  'Within 24h':   'text-yellow-400 bg-yellow-900/20 border-yellow-800',
  Monitor:        'text-blue-400 bg-blue-900/20 border-blue-800',
}

const confidenceColor = {
  High:   'text-green-400 bg-green-900/30 border-green-700',
  Medium: 'text-yellow-400 bg-yellow-900/30 border-yellow-700',
  Low:    'text-gray-400 bg-gray-800 border-gray-700',
}

function AnalysisCard({ analysis }) {
  const actions = analysis.recommended_actions || analysis.recommendations || []
  return (
    <div className="card space-y-4 border-gray-700">
      <div className="flex items-start justify-between gap-3 flex-wrap">
        <div>
          <div className="flex items-center gap-2 mb-1">
            <Brain size={16} className="text-brand-400" />
            <span className="font-semibold text-white">{analysis.root_cause}</span>
            {analysis.is_mock && (
              <span className="text-[10px] px-1.5 py-0.5 bg-gray-800 text-gray-500 rounded">MOCK</span>
            )}
          </div>
          <p className="text-sm text-gray-400">{analysis.root_cause_detail}</p>
        </div>
        <span className={`text-xs px-2 py-1 rounded border font-medium ${confidenceColor[analysis.confidence] || confidenceColor.Low}`}>
          {analysis.confidence} Confidence
        </span>
      </div>

      {analysis.confidence_reasoning && (
        <p className="text-xs text-gray-500 italic flex gap-1.5"><Info size={12} className="shrink-0 mt-0.5" />{analysis.confidence_reasoning}</p>
      )}

      {/* Affected Sensors */}
      {analysis.affected_sensors && Object.keys(analysis.affected_sensors).length > 0 && (
        <div>
          <p className="text-xs text-gray-500 uppercase tracking-wide mb-2">Affected Sensors</p>
          <div className="space-y-1.5">
            {Object.entries(analysis.affected_sensors).map(([sensor, info]) => {
              const dev = info.deviation_pct || 0
              return (
                <div key={sensor} className="flex items-center gap-2">
                  <span className="text-xs text-gray-400 w-36 truncate">{sensor.replace(/_/g, ' ')}</span>
                  <div className="flex-1 bg-gray-800 rounded-full h-1.5">
                    <div
                      className={`h-1.5 rounded-full ${Math.abs(dev) > 20 ? 'bg-red-500' : Math.abs(dev) > 10 ? 'bg-orange-500' : 'bg-yellow-500'}`}
                      style={{ width: `${Math.min(Math.abs(dev), 100)}%` }}
                    />
                  </div>
                  <span className={`text-xs font-mono w-14 text-right ${dev > 0 ? 'text-red-400' : 'text-blue-400'}`}>
                    {dev > 0 ? '+' : ''}{dev.toFixed(1)}%
                  </span>
                </div>
              )
            })}
          </div>
        </div>
      )}

      {/* Recommendations */}
      {actions.length > 0 && (
        <div>
          <p className="text-xs text-gray-500 uppercase tracking-wide mb-2">Recommended Actions</p>
          <div className="space-y-1.5">
            {actions.sort((a, b) => (a.priority || 99) - (b.priority || 99)).map((act, i) => (
              <div key={i} className={`flex items-start gap-2 text-sm rounded border px-3 py-2 ${urgencyColor[act.urgency] || urgencyColor.Monitor}`}>
                <Zap size={13} className="shrink-0 mt-0.5" />
                <div className="flex-1">
                  <span>{act.action}</span>
                </div>
                <span className="text-[10px] font-medium opacity-75 whitespace-nowrap">{act.urgency}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Time to Critical */}
      {analysis.time_to_critical && (
        <div className="flex items-center gap-2 text-sm">
          <Clock size={14} className="text-orange-400" />
          <span className="text-gray-400">Time to critical:</span>
          <span className="text-orange-300 font-medium">{analysis.time_to_critical}</span>
        </div>
      )}

      {analysis.additional_notes && (
        <p className="text-xs text-gray-600 border-t border-gray-800 pt-3">{analysis.additional_notes}</p>
      )}

      {analysis.created_at && (
        <p className="text-[10px] text-gray-600">Analyzed: {analysis.created_at}</p>
      )}
    </div>
  )
}

export default function AgentPanel() {
  const [loading, setLoading]   = useState(false)
  const [analysis, setAnalysis] = useState(null)
  const [history, setHistory]   = useState([])
  const [error, setError]       = useState(null)

  const fetchHistory = async () => {
    try {
      const data = await getAgentHistory()
      setHistory(data.analyses || [])
    } catch {}
  }

  useEffect(() => { fetchHistory() }, [])

  const handleAnalyze = async () => {
    setLoading(true)
    setError(null)
    try {
      // Get latest anomalous prediction for context
      let predData = null
      try {
        const preds = await getRecentPredictions()
        predData = (preds.predictions || []).find(p => p.is_anomaly) || preds.predictions?.[0]
      } catch {}

      const request = {
        prediction_id: predData?.id || null,
        anomaly_timestamp: predData?.timestamp || new Date().toISOString(),
        severity: predData?.severity || 'MEDIUM',
        affected_sensors: predData?.sensor_values
          ? Object.entries(predData.sensor_values).reduce((acc, [k, v]) => {
              const baselines = {
                suction_pressure: 1.0, discharge_pressure: 8.75, suction_temperature: 30.0,
                discharge_temperature: 95.0, vibration_x: 2.25, vibration_y: 2.25,
                bearing_temperature: 55.0, motor_current: 50.0, flow_rate: 1000.0, oil_pressure: 3.25,
              }
              const base = baselines[k] || v
              const devPct = ((v - base) / Math.abs(base)) * 100
              if (Math.abs(devPct) > 5) {
                acc[k] = { current: +v.toFixed(3), baseline: base, deviation_pct: +devPct.toFixed(1) }
              }
              return acc
            }, {})
          : {},
        anomaly_score: predData?.anomaly_score || 0.6,
        if_score: predData?.if_score || 0.55,
        lstm_reconstruction_error: predData?.lstm_error || 0.015,
        recent_trend: 'Gradual increase in anomaly score over the last 60 minutes',
        previous_anomalies_24h: history.length,
      }

      const result = await analyzeAnomaly(request)
      setAnalysis(result)
      await fetchHistory()
    } catch (e) {
      setError(e.response?.data?.detail || e.message)
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <h2 className="text-2xl font-bold text-white">AI Agent Analysis</h2>
        <div className="flex gap-3">
          <button onClick={fetchHistory} className="btn-secondary flex items-center gap-2 text-sm">
            <RefreshCw size={14} /> History
          </button>
          <button onClick={handleAnalyze} disabled={loading} className="btn-primary flex items-center gap-2">
            {loading ? <Loader2 size={16} className="animate-spin" /> : <Brain size={16} />}
            {loading ? 'Analyzing...' : 'Analyze Latest Anomaly'}
          </button>
        </div>
      </div>

      {/* Info about API key */}
      <div className="card border-gray-800 bg-gray-900/50 text-sm text-gray-500 flex items-start gap-2">
        <Info size={14} className="shrink-0 mt-0.5 text-brand-400" />
        <span>
          Set <code className="bg-gray-800 px-1 rounded text-gray-300">ANTHROPIC_API_KEY</code> environment variable for full Claude AI analysis.
          Without it, a mock analysis is returned for demonstration.
        </span>
      </div>

      {error && (
        <div className="card border-red-900 flex items-center gap-3 text-red-400">
          <AlertTriangle size={18} /> {error}
        </div>
      )}

      {/* Loading state */}
      {loading && (
        <div className="card flex items-center gap-4 py-8">
          <Loader2 size={28} className="animate-spin text-brand-400" />
          <div>
            <p className="text-white font-medium">Analyzing anomaly pattern...</p>
            <p className="text-gray-400 text-sm mt-1">Claude is correlating sensor data and generating diagnosis</p>
            <div className="flex gap-1 mt-3">
              {['Correlating sensors', 'Identifying root cause', 'Generating recommendations'].map((s, i) => (
                <span key={i} className="text-xs bg-gray-800 text-gray-400 px-2 py-0.5 rounded animate-pulse" style={{ animationDelay: `${i * 0.3}s` }}>{s}</span>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* Latest analysis */}
      {analysis && !loading && (
        <div>
          <div className="flex items-center gap-2 text-green-400 text-sm mb-3">
            <CheckCircle size={14} /> Latest Analysis
          </div>
          <AnalysisCard analysis={analysis} />
        </div>
      )}

      {/* History */}
      {history.length > 0 && (
        <div>
          <h3 className="text-sm font-semibold text-gray-400 uppercase tracking-wide mb-3">Analysis History</h3>
          <div className="space-y-3">
            {history.slice(0, 5).map(h => (
              <AnalysisCard key={h.id} analysis={h} />
            ))}
          </div>
        </div>
      )}

      {!analysis && !loading && history.length === 0 && (
        <div className="card text-center py-12 text-gray-500">
          <Brain size={48} className="mx-auto mb-3 opacity-30" />
          <p>Click "Analyze Latest Anomaly" to get AI-powered diagnosis.</p>
          <p className="text-sm mt-1">Works best after running the Live Monitor simulation.</p>
        </div>
      )}
    </div>
  )
}
