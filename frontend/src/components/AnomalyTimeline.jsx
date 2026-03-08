import { useState, useEffect } from 'react'
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer } from 'recharts'
import { Loader2, RefreshCw, X } from 'lucide-react'
import { getRecentPredictions } from '../services/api'

function severityBadge(sev) {
  const cls = sev === 'HIGH' ? 'badge-high' : sev === 'MEDIUM' ? 'badge-medium' : sev === 'LOW' ? 'badge-low' : 'badge-normal'
  return <span className={cls}>{sev}</span>
}

function DetailModal({ pred, onClose }) {
  if (!pred) return null
  const sensors = pred.sensor_values || {}
  return (
    <div className="fixed inset-0 bg-black/70 flex items-center justify-center z-50 p-4">
      <div className="bg-gray-900 border border-gray-700 rounded-xl max-w-lg w-full p-6 space-y-4">
        <div className="flex items-center justify-between">
          <h3 className="font-semibold text-white">Prediction Detail #{pred.id}</h3>
          <button onClick={onClose} className="text-gray-500 hover:text-white"><X size={18} /></button>
        </div>
        <div className="grid grid-cols-2 gap-2 text-sm">
          <Info label="Timestamp" value={pred.timestamp?.slice(0, 19)} />
          <Info label="Severity" value={severityBadge(pred.severity)} />
          <Info label="Anomaly Score" value={((pred.anomaly_score || 0) * 100).toFixed(1) + '%'} />
          <Info label="IF Score" value={((pred.if_score || 0) * 100).toFixed(1) + '%'} />
          <Info label="LSTM Error" value={(pred.lstm_error || 0).toFixed(5)} />
          <Info label="Is Anomaly" value={pred.is_anomaly ? 'Yes' : 'No'} />
        </div>
        <div>
          <p className="text-xs text-gray-500 uppercase tracking-wide mb-2">Sensor Values</p>
          <div className="grid grid-cols-2 gap-1">
            {Object.entries(sensors).map(([k, v]) => (
              <div key={k} className="flex justify-between text-xs bg-gray-800 rounded px-2 py-1">
                <span className="text-gray-400">{k.replace(/_/g, ' ')}</span>
                <span className="font-mono text-gray-200">{Number(v).toFixed(3)}</span>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  )
}

function Info({ label, value }) {
  return (
    <div>
      <p className="text-xs text-gray-500">{label}</p>
      <p className="text-gray-200">{value}</p>
    </div>
  )
}

export default function AnomalyTimeline() {
  const [preds, setPreds]       = useState([])
  const [loading, setLoading]   = useState(false)
  const [filter, setFilter]     = useState('ALL')
  const [selected, setSelected] = useState(null)

  const fetchPredictions = async () => {
    setLoading(true)
    try {
      const data = await getRecentPredictions()
      setPreds(data.predictions || [])
    } catch {
      setPreds([])
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => { fetchPredictions() }, [])

  const filtered = filter === 'ALL'
    ? preds
    : preds.filter(p => p.severity === filter || (filter === 'ANOMALY' && p.is_anomaly))

  // Build bar chart data grouped by hour
  const barData = (() => {
    const groups = {}
    for (const p of preds) {
      const hour = p.timestamp?.slice(0, 13) || 'unknown'
      if (!groups[hour]) groups[hour] = { hour, NORMAL: 0, LOW: 0, MEDIUM: 0, HIGH: 0 }
      groups[hour][p.severity] = (groups[hour][p.severity] || 0) + 1
    }
    return Object.values(groups).slice(-24)
  })()

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <h2 className="text-2xl font-bold text-white">Anomaly Timeline</h2>
        <button onClick={fetchPredictions} disabled={loading} className="btn-secondary flex items-center gap-2 text-sm">
          {loading ? <Loader2 size={14} className="animate-spin" /> : <RefreshCw size={14} />}
          Refresh
        </button>
      </div>

      {/* Bar chart */}
      {barData.length > 0 && (
        <div className="card">
          <h3 className="text-sm font-semibold text-gray-300 mb-4">Anomalies by Hour (stacked severity)</h3>
          <ResponsiveContainer width="100%" height={160}>
            <BarChart data={barData}>
              <CartesianGrid strokeDasharray="3 3" stroke="#374151" />
              <XAxis dataKey="hour" tick={{ fontSize: 10 }} stroke="#6b7280" />
              <YAxis stroke="#6b7280" tick={{ fontSize: 10 }} />
              <Tooltip contentStyle={{ background: '#111827', border: '1px solid #374151', fontSize: 12 }} />
              <Legend wrapperStyle={{ fontSize: 11 }} />
              <Bar dataKey="HIGH"   stackId="a" fill="#ef4444" />
              <Bar dataKey="MEDIUM" stackId="a" fill="#f97316" />
              <Bar dataKey="LOW"    stackId="a" fill="#f59e0b" />
              <Bar dataKey="NORMAL" stackId="a" fill="#374151" />
            </BarChart>
          </ResponsiveContainer>
        </div>
      )}

      {/* Filter */}
      <div className="flex gap-2 flex-wrap">
        {['ALL', 'ANOMALY', 'HIGH', 'MEDIUM', 'LOW', 'NORMAL'].map(f => (
          <button
            key={f}
            onClick={() => setFilter(f)}
            className={`px-3 py-1 rounded-full text-xs font-medium border transition-colors ${
              filter === f
                ? 'bg-brand-600 border-brand-500 text-white'
                : 'border-gray-700 text-gray-400 hover:border-gray-500'
            }`}
          >
            {f}
          </button>
        ))}
      </div>

      {/* Table */}
      <div className="card overflow-hidden p-0">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-gray-800 text-gray-400 text-xs uppercase tracking-wide">
              <tr>
                <th className="px-4 py-3 text-left">ID</th>
                <th className="px-4 py-3 text-left">Timestamp</th>
                <th className="px-4 py-3 text-left">Severity</th>
                <th className="px-4 py-3 text-right">Score</th>
                <th className="px-4 py-3 text-right">IF Score</th>
                <th className="px-4 py-3 text-left">Affected Sensors</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-800">
              {filtered.length === 0 ? (
                <tr>
                  <td colSpan={6} className="px-4 py-8 text-center text-gray-600">
                    No predictions yet. Start the live simulation.
                  </td>
                </tr>
              ) : (
                filtered.map(p => {
                  const affected = Object.keys(p.sensor_values || {})
                    .filter(k => Math.abs((p.sensor_values[k] || 0)) > 0)
                    .slice(0, 3)
                  return (
                    <tr
                      key={p.id}
                      className="hover:bg-gray-800/50 cursor-pointer transition-colors"
                      onClick={() => setSelected(p)}
                    >
                      <td className="px-4 py-2.5 font-mono text-gray-500">#{p.id}</td>
                      <td className="px-4 py-2.5 text-gray-300 whitespace-nowrap">{p.timestamp?.slice(0, 19)}</td>
                      <td className="px-4 py-2.5">{severityBadge(p.severity)}</td>
                      <td className="px-4 py-2.5 text-right font-mono text-gray-300">
                        {((p.anomaly_score || 0) * 100).toFixed(0)}%
                      </td>
                      <td className="px-4 py-2.5 text-right font-mono text-gray-400">
                        {((p.if_score || 0) * 100).toFixed(0)}%
                      </td>
                      <td className="px-4 py-2.5 text-gray-500 text-xs">{affected.join(', ') || '—'}</td>
                    </tr>
                  )
                })
              )}
            </tbody>
          </table>
        </div>
      </div>

      {selected && <DetailModal pred={selected} onClose={() => setSelected(null)} />}
    </div>
  )
}
