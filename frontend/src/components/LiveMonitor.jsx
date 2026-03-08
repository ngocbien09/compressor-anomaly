import { useState, useEffect, useRef, useCallback } from 'react'
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, ReferenceLine } from 'recharts'
import { Play, Square, AlertTriangle, Activity, Wifi, WifiOff } from 'lucide-react'

const FEATURES = [
  'suction_pressure', 'discharge_pressure', 'suction_temperature',
  'discharge_temperature', 'vibration_x', 'vibration_y',
  'bearing_temperature', 'motor_current', 'flow_rate', 'oil_pressure',
]

const SENSOR_UNITS = {
  suction_pressure: 'bar', discharge_pressure: 'bar',
  suction_temperature: '°C', discharge_temperature: '°C',
  vibration_x: 'mm/s', vibration_y: 'mm/s',
  bearing_temperature: '°C', motor_current: 'A',
  flow_rate: 'm³/h', oil_pressure: 'bar',
}

const SENSOR_NORMAL = {
  suction_pressure: [0.9, 1.1], discharge_pressure: [8.0, 9.5],
  suction_temperature: [25, 35], discharge_temperature: [80, 110],
  vibration_x: [1.0, 3.5], vibration_y: [1.0, 3.5],
  bearing_temperature: [45, 65], motor_current: [45, 55],
  flow_rate: [800, 1200], oil_pressure: [2.5, 4.0],
}

function severityClass(sev) {
  return sev === 'HIGH' ? 'badge-high' : sev === 'MEDIUM' ? 'badge-medium' : sev === 'LOW' ? 'badge-low' : 'badge-normal'
}

function AnomalyGauge({ score }) {
  const pct = Math.round((score || 0) * 100)
  const color = pct >= 75 ? '#ef4444' : pct >= 50 ? '#f97316' : pct >= 30 ? '#f59e0b' : '#22c55e'
  return (
    <div className="flex flex-col items-center">
      <svg width={120} height={70} viewBox="0 0 120 70">
        <path d="M10 60 A50 50 0 0 1 110 60" fill="none" stroke="#1f2937" strokeWidth="12" strokeLinecap="round" />
        <path
          d="M10 60 A50 50 0 0 1 110 60"
          fill="none"
          stroke={color}
          strokeWidth="12"
          strokeLinecap="round"
          strokeDasharray={`${pct * 1.57} 157`}
        />
        <text x="60" y="58" textAnchor="middle" fontSize="22" fontWeight="bold" fill={color}>{pct}</text>
        <text x="60" y="70" textAnchor="middle" fontSize="9" fill="#6b7280">ANOMALY SCORE</text>
      </svg>
    </div>
  )
}

function SensorGauge({ name, value, unit, normal }) {
  const [lo, hi] = normal || [0, 100]
  const isAbnormal = value != null && (value < lo || value > hi)
  return (
    <div className={`p-3 rounded-lg border ${isAbnormal ? 'border-orange-700 bg-orange-900/10' : 'border-gray-800 bg-gray-900'}`}>
      <p className="text-[10px] text-gray-500 uppercase tracking-wide truncate">{name.replace(/_/g, ' ')}</p>
      <p className={`text-lg font-bold font-mono ${isAbnormal ? 'text-orange-400' : 'text-white'}`}>
        {value != null ? value.toFixed(2) : '—'}
        <span className="text-xs font-normal text-gray-500 ml-1">{unit}</span>
      </p>
      <div className="text-[10px] text-gray-600">{lo}–{hi}</div>
    </div>
  )
}

export default function LiveMonitor() {
  const [running, setRunning]   = useState(false)
  const [points, setPoints]     = useState([])
  const [current, setCurrent]   = useState(null)
  const [alerts, setAlerts]     = useState([])
  const eventSourceRef          = useRef(null)

  const startStream = useCallback(() => {
    if (eventSourceRef.current) eventSourceRef.current.close()
    setPoints([])
    setAlerts([])
    setRunning(true)

    const es = new EventSource('/api/predict/stream')
    eventSourceRef.current = es

    es.onmessage = (e) => {
      try {
        const data = JSON.parse(e.data)
        if (data.error) { es.close(); setRunning(false); return }
        setCurrent(data)
        setPoints(prev => {
          const next = [...prev, {
            t: prev.length,
            score: +((data.anomaly_score || 0) * 100).toFixed(1),
            if_score: +((data.if_score || 0) * 100).toFixed(1),
            true: (data.true_label || 0) * 100,
          }]
          return next.slice(-120)
        })
        if (data.severity === 'MEDIUM' || data.severity === 'HIGH') {
          setAlerts(prev => [{
            time: new Date().toLocaleTimeString(),
            severity: data.severity,
            score: data.anomaly_score,
            sensors: Object.keys(data.affected_sensors || {}).join(', ') || 'unknown',
          }, ...prev].slice(0, 5))
        }
      } catch {}
    }
    es.onerror = () => { es.close(); setRunning(false) }
  }, [])

  const stopStream = () => {
    eventSourceRef.current?.close()
    setRunning(false)
  }

  useEffect(() => () => eventSourceRef.current?.close(), [])

  const sensorValues = current?.sensor_values || {}

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <h2 className="text-2xl font-bold text-white">Live Monitor</h2>
        <div className="flex items-center gap-3">
          {running
            ? <span className="flex items-center gap-1.5 text-green-400 text-sm"><Wifi size={14} className="animate-pulse" /> Streaming</span>
            : <span className="flex items-center gap-1.5 text-gray-500 text-sm"><WifiOff size={14} /> Stopped</span>
          }
          {running
            ? <button onClick={stopStream} className="btn-secondary flex items-center gap-2"><Square size={14} fill="currentColor" /> Stop</button>
            : <button onClick={startStream} className="btn-primary flex items-center gap-2"><Play size={14} fill="currentColor" /> Start Simulation</button>
          }
        </div>
      </div>

      {/* Alert Banner */}
      {alerts[0]?.severity === 'HIGH' && (
        <div className="card border-red-700 bg-red-900/20 flex items-center gap-3">
          <AlertTriangle size={20} className="text-red-400 shrink-0" />
          <div>
            <p className="text-red-300 font-semibold">HIGH SEVERITY ANOMALY DETECTED</p>
            <p className="text-red-400/80 text-sm">Affected: {alerts[0].sensors} — Score: {(alerts[0].score * 100).toFixed(0)}%</p>
          </div>
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-4 gap-5">
        {/* Main content */}
        <div className="lg:col-span-3 space-y-5">
          {/* Current state */}
          {current && (
            <div className="card flex items-center justify-between flex-wrap gap-4">
              <AnomalyGauge score={current.anomaly_score} />
              <div className="flex flex-col gap-1">
                <span className={severityClass(current.severity)}><Activity size={10} /> {current.severity}</span>
                <p className="text-xs text-gray-500">IF: {((current.if_score || 0)*100).toFixed(0)}% | LSTM: {((current.lstm_score || 0)*100).toFixed(0)}%</p>
                <p className="text-xs text-gray-500">Event: {current.event_type}</p>
              </div>
              <div className="flex-1 min-w-48 grid grid-cols-2 gap-2 text-sm">
                {Object.entries(current.affected_sensors || {}).slice(0, 4).map(([s, v]) => (
                  <div key={s} className="bg-orange-900/20 border border-orange-800 rounded px-2 py-1">
                    <p className="text-[10px] text-gray-400">{s.replace(/_/g, ' ')}</p>
                    <p className="text-orange-300 font-mono">{v.deviation_pct > 0 ? '+' : ''}{v.deviation_pct?.toFixed(1)}%</p>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Real-time chart */}
          <div className="card">
            <h3 className="text-sm font-semibold text-gray-300 mb-3">Anomaly Score (Real-time)</h3>
            {points.length === 0
              ? <div className="h-40 flex items-center justify-center text-gray-600 text-sm">Start simulation to see data</div>
              : (
                <ResponsiveContainer width="100%" height={200}>
                  <LineChart data={points}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#1f2937" />
                    <XAxis dataKey="t" tick={false} stroke="#4b5563" />
                    <YAxis stroke="#4b5563" tick={{ fontSize: 11 }} domain={[0, 100]} />
                    <Tooltip contentStyle={{ background: '#111827', border: '1px solid #374151', fontSize: 12 }} />
                    <ReferenceLine y={30} stroke="#f59e0b" strokeDasharray="4 4" label={{ value: 'LOW', fill: '#f59e0b', fontSize: 9 }} />
                    <ReferenceLine y={50} stroke="#f97316" strokeDasharray="4 4" label={{ value: 'MED', fill: '#f97316', fontSize: 9 }} />
                    <ReferenceLine y={75} stroke="#ef4444" strokeDasharray="4 4" label={{ value: 'HIGH', fill: '#ef4444', fontSize: 9 }} />
                    <Line type="monotone" dataKey="score" stroke="#0ea5e9" dot={false} strokeWidth={2} name="Score" />
                    <Line type="monotone" dataKey="true" stroke="#22c55e" dot={false} strokeDasharray="4 4" name="True" />
                  </LineChart>
                </ResponsiveContainer>
              )
            }
          </div>

          {/* Sensor gauges */}
          <div className="grid grid-cols-2 sm:grid-cols-5 gap-3">
            {FEATURES.map(f => (
              <SensorGauge
                key={f}
                name={f}
                value={sensorValues[f] ?? null}
                unit={SENSOR_UNITS[f]}
                normal={SENSOR_NORMAL[f]}
              />
            ))}
          </div>
        </div>

        {/* Sidebar alerts */}
        <div className="space-y-3">
          <h3 className="text-sm font-semibold text-gray-400 uppercase tracking-wide">Recent Alerts</h3>
          {alerts.length === 0
            ? <p className="text-xs text-gray-600">No alerts yet.</p>
            : alerts.map((a, i) => (
              <div key={i} className={`card p-3 space-y-1 ${a.severity === 'HIGH' ? 'border-red-800' : 'border-orange-800'}`}>
                <div className="flex items-center justify-between">
                  <span className={severityClass(a.severity)}>{a.severity}</span>
                  <span className="text-[10px] text-gray-500">{a.time}</span>
                </div>
                <p className="text-xs text-gray-400 truncate">{a.sensors}</p>
                <p className="text-xs font-mono text-gray-300">Score: {(a.score * 100).toFixed(0)}%</p>
              </div>
            ))
          }
        </div>
      </div>
    </div>
  )
}
