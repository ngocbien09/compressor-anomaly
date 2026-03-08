import { useState, useEffect, useRef, useCallback } from 'react'
import {
  AreaChart, Area, LineChart, Line,
  XAxis, YAxis, CartesianGrid, Tooltip,
  ResponsiveContainer, ReferenceLine,
} from 'recharts'
import { Play, Square, AlertTriangle, Activity, Wifi, WifiOff, CheckCircle, Clock } from 'lucide-react'

const BASE_FEATURES = [
  'suction_pressure', 'discharge_pressure', 'suction_temperature',
  'discharge_temperature', 'vibration_x', 'vibration_y',
  'bearing_temperature', 'motor_current', 'flow_rate', 'oil_pressure',
]
const SENSOR_UNITS = {
  suction_pressure: 'bar',  discharge_pressure: 'bar',
  suction_temperature: '°C', discharge_temperature: '°C',
  vibration_x: 'mm/s',      vibration_y: 'mm/s',
  bearing_temperature: '°C', motor_current: 'A',
  flow_rate: 'm³/h',         oil_pressure: 'bar',
}
const SENSOR_NORMAL = {
  suction_pressure: [0.9, 1.1],    discharge_pressure: [8.0, 9.5],
  suction_temperature: [25, 35],    discharge_temperature: [80, 110],
  vibration_x: [1.0, 3.5],         vibration_y: [1.0, 3.5],
  bearing_temperature: [45, 65],    motor_current: [45, 55],
  flow_rate: [800, 1200],           oil_pressure: [2.5, 4.0],
}

const PHASE_META = {
  NORMAL:      { label: 'Normal Operation', color: '#22c55e', bg: 'bg-green-900/20',  border: 'border-green-700',  Icon: CheckCircle },
  PRE_ANOMALY: { label: 'Early Warning',    color: '#f59e0b', bg: 'bg-yellow-900/20', border: 'border-yellow-600', Icon: Clock },
  ANOMALY:     { label: 'Critical Anomaly', color: '#ef4444', bg: 'bg-red-900/30',    border: 'border-red-600',    Icon: AlertTriangle },
}

// ── Gauge ─────────────────────────────────────────────────────────────────────
function AnomalyGauge({ score }) {
  const pct   = Math.round((score || 0) * 100)
  const color = pct >= 75 ? '#ef4444' : pct >= 50 ? '#f97316' : pct >= 30 ? '#f59e0b' : '#22c55e'
  return (
    <div className="flex flex-col items-center">
      <svg width={130} height={76} viewBox="0 0 130 76">
        <path d="M12 65 A53 53 0 0 1 118 65" fill="none" stroke="#1f2937" strokeWidth="13" strokeLinecap="round"/>
        <path
          d="M12 65 A53 53 0 0 1 118 65"
          fill="none" stroke={color} strokeWidth="13" strokeLinecap="round"
          strokeDasharray={`${pct * 1.66} 166`}
          style={{ transition: 'stroke-dasharray 0.4s ease, stroke 0.4s ease' }}
        />
        <text x="65" y="62" textAnchor="middle" fontSize="24" fontWeight="bold" fill={color}>{pct}</text>
        <text x="65" y="75" textAnchor="middle" fontSize="9" fill="#6b7280">ANOMALY SCORE</text>
      </svg>
    </div>
  )
}

// ── Phase banner ──────────────────────────────────────────────────────────────
function PhaseBanner({ phase, phaseProgress, phaseStep, phaseTotal }) {
  const m    = PHASE_META[phase] || PHASE_META.NORMAL
  const Icon = m.Icon
  const pct  = Math.round((phaseProgress || 0) * 100)
  return (
    <div className={`card ${m.bg} ${m.border} border-2 p-4 transition-all duration-500`}>
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div className="flex items-center gap-3">
          <Icon size={22} style={{ color: m.color }} className={phase === 'ANOMALY' ? 'animate-pulse' : ''} />
          <div>
            <p className="text-[10px] text-gray-400 uppercase tracking-widest">Current Phase</p>
            <p className="text-xl font-bold" style={{ color: m.color }}>{m.label}</p>
          </div>
        </div>
        <p className="text-xs text-gray-500">Step {(phaseStep ?? 0) + 1} / {phaseTotal ?? '?'}</p>
      </div>
      <div className="mt-3">
        <div className="h-1.5 bg-gray-800 rounded-full overflow-hidden">
          <div className="h-full rounded-full transition-all duration-500" style={{ width: `${pct}%`, backgroundColor: m.color }} />
        </div>
        <div className="flex justify-between text-[10px] text-gray-600 mt-1">
          <span>Phase start</span><span>Phase end</span>
        </div>
      </div>
    </div>
  )
}

// ── Scenario timeline dots ────────────────────────────────────────────────────
function ScenarioTimeline({ phase }) {
  const phases = ['NORMAL', 'PRE_ANOMALY', 'ANOMALY']
  const idx    = phases.indexOf(phase)
  return (
    <div className="flex items-center w-full">
      {phases.map((p, i) => {
        const m = PHASE_META[p]
        return (
          <div key={p} className="flex items-center flex-1">
            <div className="flex flex-col items-center gap-1 flex-1">
              <div
                className={`w-3 h-3 rounded-full border-2 transition-all duration-300 ${i === idx ? 'scale-125' : ''}`}
                style={{ borderColor: m.color, backgroundColor: i <= idx ? m.color : 'transparent' }}
              />
              <span className="text-[9px] text-gray-500 text-center leading-tight">{m.label}</span>
            </div>
            {i < phases.length - 1 && (
              <div className="h-0.5 flex-1 mx-1 transition-all duration-500"
                style={{ backgroundColor: i < idx ? PHASE_META[phases[i]].color : '#374151' }} />
            )}
          </div>
        )
      })}
    </div>
  )
}

// ── Sensor tile ───────────────────────────────────────────────────────────────
function SensorTile({ name, value, unit, normal }) {
  const [lo, hi] = normal || [0, 100]
  const bad = value != null && (value < lo || value > hi)
  const mid = (lo + hi) / 2
  const devPct = value != null ? (((value - mid) / ((hi - lo) / 2)) * 100).toFixed(0) : null
  return (
    <div className={`p-3 rounded-lg border transition-all duration-300 ${bad ? 'border-orange-600 bg-orange-900/15' : 'border-gray-800 bg-gray-900'}`}>
      <p className="text-[10px] text-gray-500 uppercase tracking-wide truncate">{name.replace(/_/g, ' ')}</p>
      <p className={`text-base font-bold font-mono transition-colors duration-300 ${bad ? 'text-orange-400' : 'text-white'}`}>
        {value != null ? value.toFixed(2) : '—'}
        <span className="text-xs font-normal text-gray-500 ml-1">{unit}</span>
      </p>
      <div className="flex items-center justify-between mt-1">
        <span className="text-[9px] text-gray-600">{lo}–{hi}</span>
        {bad && devPct && <span className="text-[9px] text-orange-400 font-mono">{devPct > 0 ? '+' : ''}{devPct}%</span>}
      </div>
    </div>
  )
}

// ── Main ──────────────────────────────────────────────────────────────────────
export default function LiveMonitor() {
  const [running, setRunning] = useState(false)
  const [done, setDone]       = useState(false)
  const [points, setPoints]   = useState([])
  const [current, setCurrent] = useState(null)
  const [alerts, setAlerts]   = useState([])
  const esRef                 = useRef(null)

  const startStream = useCallback(() => {
    if (esRef.current) esRef.current.close()
    setPoints([]); setAlerts([]); setCurrent(null); setDone(false); setRunning(true)

    const es = new EventSource('/api/predict/stream')
    esRef.current = es

    es.onmessage = (e) => {
      try {
        const data = JSON.parse(e.data)
        if (data.done)  { es.close(); setRunning(false); setDone(true); return }
        if (data.error) { es.close(); setRunning(false); return }

        setCurrent(data)
        setPoints(prev => [...prev, {
          t:        prev.length,
          score:    +((data.anomaly_score || 0) * 100).toFixed(1),
          if_score: +((data.if_score || 0) * 100).toFixed(1),
          true:     (data.true_label || 0) * 100,
          phase:    data.phase || 'NORMAL',
        }].slice(-200))

        if (data.severity === 'MEDIUM' || data.severity === 'HIGH') {
          setAlerts(prev => [{
            time:     new Date().toLocaleTimeString(),
            severity: data.severity,
            score:    data.anomaly_score,
            phase:    data.phase,
            sensors:  Object.keys(data.affected_sensors || {}).join(', ') || '—',
          }, ...prev].slice(0, 6))
        }
      } catch { /* ignore */ }
    }
    es.onerror = () => { es.close(); setRunning(false) }
  }, [])

  const stopStream = () => { esRef.current?.close(); setRunning(false) }
  useEffect(() => () => esRef.current?.close(), [])

  const phase     = current?.phase || 'NORMAL'
  const phaseMeta = PHASE_META[phase] || PHASE_META.NORMAL
  const sensors   = current?.sensor_values || {}

  // Colour chart dots by phase
  const PhaseDot = ({ cx, cy, payload }) => (
    <circle cx={cx} cy={cy} r={2} fill={PHASE_META[payload?.phase]?.color || '#22c55e'} />
  )

  return (
    <div className="space-y-4">

      {/* Header */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h2 className="text-2xl font-bold text-white">Live Monitor</h2>
          <p className="text-xs text-gray-500 mt-0.5">
            Simulated bearing-wear fault: Normal Operation → Early Warning → Critical Anomaly
          </p>
        </div>
        <div className="flex items-center gap-3">
          {running
            ? <span className="flex items-center gap-1.5 text-green-400 text-sm"><Wifi size={13} className="animate-pulse"/> Streaming</span>
            : done
              ? <span className="flex items-center gap-1.5 text-gray-400 text-sm"><WifiOff size={13}/> Complete</span>
              : <span className="flex items-center gap-1.5 text-gray-500 text-sm"><WifiOff size={13}/> Ready</span>
          }
          {running
            ? <button onClick={stopStream}   className="btn-secondary flex items-center gap-2"><Square size={13} fill="currentColor"/> Stop</button>
            : <button onClick={startStream}  className="btn-primary  flex items-center gap-2"><Play  size={13} fill="currentColor"/> {done ? 'Restart' : 'Start Simulation'}</button>
          }
        </div>
      </div>

      {/* Scenario timeline */}
      <div className="card p-4">
        <p className="text-[10px] text-gray-500 uppercase tracking-widest mb-3">Scenario Progression</p>
        <ScenarioTimeline phase={phase} />
      </div>

      {/* Phase banner */}
      {current && (
        <PhaseBanner
          phase={phase}
          phaseProgress={current.phase_progress}
          phaseStep={current.phase_step}
          phaseTotal={current.phase_total}
        />
      )}

      {/* Critical alert banner */}
      {alerts[0]?.severity === 'HIGH' && (
        <div className="card border-red-600 bg-red-900/25 flex items-center gap-3 animate-pulse">
          <AlertTriangle size={20} className="text-red-400 shrink-0"/>
          <div>
            <p className="text-red-300 font-semibold">CRITICAL ANOMALY DETECTED</p>
            <p className="text-red-400/80 text-sm">Sensors: {alerts[0].sensors} &nbsp;·&nbsp; Score: {(alerts[0].score * 100).toFixed(0)}%</p>
          </div>
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-4 gap-4">

        {/* ── Main column ── */}
        <div className="lg:col-span-3 space-y-4">

          {/* Status row */}
          {current ? (
            <div className="card flex items-center gap-6 flex-wrap">
              <AnomalyGauge score={current.anomaly_score} />
              <div className="flex flex-col gap-2">
                <span
                  className="px-2 py-0.5 rounded text-xs font-bold border w-fit"
                  style={{ color: phaseMeta.color, borderColor: phaseMeta.color }}
                >
                  {current.severity}
                </span>
                <p className="text-xs text-gray-400">RF score:   <span className="font-mono text-white">{((current.if_score   || 0)*100).toFixed(0)}%</span></p>
                <p className="text-xs text-gray-400">LSTM error: <span className="font-mono text-white">{((current.lstm_error || 0)*100).toFixed(0)}%</span></p>
              </div>
              {Object.keys(current.affected_sensors || {}).length > 0 && (
                <div className="flex flex-wrap gap-2">
                  {Object.entries(current.affected_sensors).slice(0, 5).map(([s, v]) => (
                    <div key={s} className="bg-orange-900/20 border border-orange-800 rounded px-2 py-1 text-xs">
                      <p className="text-gray-400">{s.replace(/_/g, ' ')}</p>
                      <p className="text-orange-300 font-mono">{v.deviation_pct > 0 ? '+' : ''}{v.deviation_pct?.toFixed(1)}%</p>
                    </div>
                  ))}
                </div>
              )}
            </div>
          ) : (
            <div className="card h-24 flex items-center justify-center text-gray-600 text-sm">
              Press <strong className="text-gray-400 mx-1">Start Simulation</strong> to begin
            </div>
          )}

          {/* Real-time chart */}
          <div className="card">
            <h3 className="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-3">Anomaly Score — Real-time</h3>
            {points.length === 0 ? (
              <div className="h-44 flex items-center justify-center text-gray-600 text-sm">Waiting for data…</div>
            ) : (
              <ResponsiveContainer width="100%" height={210}>
                <AreaChart data={points}>
                  <defs>
                    <linearGradient id="sg" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%"  stopColor="#0ea5e9" stopOpacity={0.3}/>
                      <stop offset="95%" stopColor="#0ea5e9" stopOpacity={0.0}/>
                    </linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="3 3" stroke="#1f2937"/>
                  <XAxis dataKey="t" tick={false} stroke="#374151"/>
                  <YAxis stroke="#374151" tick={{ fontSize: 10 }} domain={[0, 100]}/>
                  <Tooltip
                    contentStyle={{ background: '#111827', border: '1px solid #374151', fontSize: 11 }}
                    formatter={(v, n) => [`${v}%`, n]}
                  />
                  <ReferenceLine y={31} stroke="#f59e0b" strokeDasharray="4 4"
                    label={{ value: 'LOW',  fill: '#f59e0b', fontSize: 9, position: 'insideTopLeft' }}/>
                  <ReferenceLine y={50} stroke="#f97316" strokeDasharray="4 4"
                    label={{ value: 'MED',  fill: '#f97316', fontSize: 9, position: 'insideTopLeft' }}/>
                  <ReferenceLine y={75} stroke="#ef4444" strokeDasharray="4 4"
                    label={{ value: 'HIGH', fill: '#ef4444', fontSize: 9, position: 'insideTopLeft' }}/>
                  <Area
                    type="monotone" dataKey="score" stroke="#0ea5e9" fill="url(#sg)"
                    strokeWidth={2} dot={<PhaseDot/>} name="Anomaly Score" isAnimationActive={false}
                  />
                  <Line
                    type="monotone" dataKey="true" stroke="#22c55e" strokeDasharray="5 3"
                    dot={false} strokeWidth={1.5} name="True Label" isAnimationActive={false}
                  />
                </AreaChart>
              </ResponsiveContainer>
            )}
          </div>

          {/* Sensor grid */}
          <div className="grid grid-cols-2 sm:grid-cols-5 gap-2">
            {BASE_FEATURES.map(f => (
              <SensorTile key={f} name={f} unit={SENSOR_UNITS[f]}
                value={sensors[f] ?? null} normal={SENSOR_NORMAL[f]}/>
            ))}
          </div>
        </div>

        {/* ── Alert sidebar ── */}
        <div className="space-y-3">
          <h3 className="text-xs font-semibold text-gray-400 uppercase tracking-widest">Alert History</h3>

          {alerts.length === 0 ? (
            <p className="text-xs text-gray-600 mt-2">No alerts yet — monitoring…</p>
          ) : (
            alerts.map((a, i) => {
              const m = PHASE_META[a.phase] || PHASE_META.NORMAL
              return (
                <div key={i} className="card p-3 space-y-1.5 border"
                  style={{ borderColor: a.severity === 'HIGH' ? '#dc2626' : '#d97706' }}>
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-bold px-1.5 py-0.5 rounded"
                      style={{
                        color:      a.severity === 'HIGH' ? '#ef4444' : '#f59e0b',
                        background: a.severity === 'HIGH' ? '#450a0a' : '#451a03',
                      }}>
                      {a.severity}
                    </span>
                    <span className="text-[10px] text-gray-500">{a.time}</span>
                  </div>
                  <p className="text-[10px] font-semibold" style={{ color: m.color }}>{m.label}</p>
                  <p className="text-xs text-gray-400 truncate">{a.sensors}</p>
                  <div className="h-1 rounded-full bg-gray-800 overflow-hidden">
                    <div className="h-full rounded-full"
                      style={{
                        width:           `${Math.round(a.score * 100)}%`,
                        backgroundColor: a.severity === 'HIGH' ? '#ef4444' : '#f59e0b',
                      }}/>
                  </div>
                  <p className="text-[10px] font-mono text-gray-300 text-right">{(a.score * 100).toFixed(0)}%</p>
                </div>
              )
            })
          )}

          {done && (
            <div className="card p-3 border border-gray-700 text-center mt-2">
              <p className="text-xs text-gray-400">Simulation complete</p>
              <p className="text-[10px] text-gray-600 mt-1">Press Restart to replay</p>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
