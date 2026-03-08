import { useState, useEffect, useRef } from 'react'
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer } from 'recharts'
import { Play, Database, CheckCircle, AlertCircle, Loader2, RefreshCw } from 'lucide-react'
import { startTraining, getTrainingStatus, getDataStats, generateData } from '../services/api'

export default function TrainingPanel() {
  const [stats, setStats]           = useState(null)
  const [status, setStatus]         = useState({ status: 'idle', progress: 0, message: '' })
  const [results, setResults]       = useState(null)
  const [loadingStats, setLoadingStats] = useState(false)
  const [generatingData, setGeneratingData] = useState(false)
  const pollRef = useRef(null)

  const fetchStats = async () => {
    setLoadingStats(true)
    try {
      const data = await getDataStats()
      setStats(data)
    } catch {
      setStats(null)
    } finally {
      setLoadingStats(false)
    }
  }

  useEffect(() => {
    fetchStats()
    return () => { if (pollRef.current) clearInterval(pollRef.current) }
  }, [])

  const handleGenerate = async () => {
    setGeneratingData(true)
    try {
      await generateData()
      await fetchStats()
    } catch (e) {
      alert('Failed to generate data: ' + e.message)
    } finally {
      setGeneratingData(false)
    }
  }

  const handleTrain = async () => {
    try {
      await startTraining()
      setStatus({ status: 'running', progress: 0, message: 'Starting...' })
      setResults(null)
      pollRef.current = setInterval(async () => {
        const s = await getTrainingStatus()
        setStatus(s)
        if (s.status === 'completed') {
          clearInterval(pollRef.current)
          setResults(s.metrics)
        } else if (s.status === 'failed') {
          clearInterval(pollRef.current)
        }
      }, 2000)
    } catch (e) {
      alert('Failed to start training: ' + (e.response?.data?.detail || e.message))
    }
  }

  const lossData = results?.loss_curve
    ? results.loss_curve.map((v, i) => ({
        epoch: i + 1,
        loss: +v.toFixed(6),
        val_loss: +(results.val_loss_curve?.[i] ?? v).toFixed(6),
      }))
    : []

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h2 className="text-2xl font-bold text-white">Model Training</h2>
        <button onClick={fetchStats} className="btn-secondary flex items-center gap-2 text-sm">
          <RefreshCw size={14} /> Refresh
        </button>
      </div>

      {/* Dataset Info */}
      <div className="card space-y-4">
        <div className="flex items-center gap-2 text-brand-400 font-semibold">
          <Database size={18} /> Dataset Info
        </div>
        {loadingStats ? (
          <div className="flex items-center gap-2 text-gray-400"><Loader2 size={16} className="animate-spin" /> Loading...</div>
        ) : stats ? (
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <MetricItem label="Total Rows" value={stats.total_rows?.toLocaleString()} />
            <MetricItem label="Features" value={stats.features?.length} />
            <MetricItem label="Anomaly Rate" value={(stats.anomaly_rate * 100).toFixed(1) + '%'} color="text-orange-400" />
            <MetricItem label="Anomaly Count" value={stats.anomaly_count?.toLocaleString()} />
            <MetricItem label="Start Date" value={stats.date_start?.slice(0, 16)} span="col-span-2" />
            <MetricItem label="End Date"   value={stats.date_end?.slice(0, 16)}   span="col-span-2" />
          </div>
        ) : (
          <p className="text-gray-500 text-sm">No dataset found.</p>
        )}
      </div>

      {/* Action Buttons */}
      <div className="flex gap-4 flex-wrap">
        <button
          onClick={handleGenerate}
          disabled={generatingData}
          className="btn-secondary flex items-center gap-2"
        >
          {generatingData ? <Loader2 size={16} className="animate-spin" /> : <Database size={16} />}
          {generatingData ? 'Generating...' : 'Generate Sample Data'}
        </button>

        <button
          onClick={handleTrain}
          disabled={status.status === 'running' || !stats}
          className="btn-primary flex items-center gap-2"
        >
          {status.status === 'running'
            ? <Loader2 size={16} className="animate-spin" />
            : <Play size={16} />}
          {status.status === 'running' ? 'Training...' : 'Start Training'}
        </button>
      </div>

      {/* Progress */}
      {status.status === 'running' && (
        <div className="card space-y-3">
          <div className="flex justify-between text-sm">
            <span className="text-gray-400">{status.message}</span>
            <span className="text-brand-400 font-mono">{status.progress}%</span>
          </div>
          <div className="w-full bg-gray-800 rounded-full h-2">
            <div
              className="bg-brand-500 h-2 rounded-full transition-all duration-500"
              style={{ width: `${status.progress}%` }}
            />
          </div>
        </div>
      )}

      {status.status === 'failed' && (
        <div className="card border-red-900 flex items-center gap-3 text-red-400">
          <AlertCircle size={20} /> Training failed: {status.message}
        </div>
      )}

      {/* Results */}
      {results && results.status === 'completed' && (
        <div className="space-y-4">
          <div className="flex items-center gap-2 text-green-400 font-semibold">
            <CheckCircle size={18} /> Training Complete
          </div>

          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <MetricCard label="Training Time" value={`${results.training_time_s}s`} />
            <MetricCard label="IF Threshold" value={results.if_threshold?.toFixed(4)} />
            <MetricCard label="LSTM Threshold" value={results.lstm_threshold?.toFixed(6)} />
            <MetricCard label="Final Val Loss" value={results.lstm_val_loss?.toFixed(6)} />
          </div>

          {lossData.length > 0 && (
            <div className="card">
              <h3 className="text-sm font-semibold text-gray-300 mb-4">LSTM Training Loss</h3>
              <ResponsiveContainer width="100%" height={220}>
                <LineChart data={lossData}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#374151" />
                  <XAxis dataKey="epoch" stroke="#6b7280" tick={{ fontSize: 12 }} />
                  <YAxis stroke="#6b7280" tick={{ fontSize: 12 }} />
                  <Tooltip contentStyle={{ background: '#111827', border: '1px solid #374151' }} />
                  <Legend />
                  <Line type="monotone" dataKey="loss" stroke="#0ea5e9" dot={false} name="Train Loss" />
                  <Line type="monotone" dataKey="val_loss" stroke="#f59e0b" dot={false} name="Val Loss" strokeDasharray="5 5" />
                </LineChart>
              </ResponsiveContainer>
            </div>
          )}
        </div>
      )}
    </div>
  )
}

function MetricItem({ label, value, color = 'text-white', span = '' }) {
  return (
    <div className={span}>
      <p className="text-xs text-gray-500 uppercase tracking-wide">{label}</p>
      <p className={`font-semibold ${color}`}>{value ?? '—'}</p>
    </div>
  )
}

function MetricCard({ label, value }) {
  return (
    <div className="card text-center">
      <p className="text-xs text-gray-500 uppercase tracking-wide mb-1">{label}</p>
      <p className="text-xl font-bold text-brand-400 font-mono">{value ?? '—'}</p>
    </div>
  )
}
