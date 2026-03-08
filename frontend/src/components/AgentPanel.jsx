import { useState, useEffect, useRef, useCallback } from 'react'
import {
  Brain, Loader2, RefreshCw, AlertTriangle, Clock, Zap,
  CheckCircle, Send, User, Bot, Trash2, ChevronDown, ChevronUp,
} from 'lucide-react'
import { getAgentHistory, getRecentPredictions } from '../services/api'

// ── Markdown-lite renderer ────────────────────────────────────────────────────
function Markdown({ text }) {
  if (!text) return null
  const lines = text.split('\n')
  return (
    <div className="space-y-1 text-sm text-gray-300 leading-relaxed">
      {lines.map((line, i) => {
        if (line.startsWith('## '))
          return <p key={i} className="text-white font-semibold mt-3 mb-1 text-base">{line.slice(3)}</p>
        if (line.startsWith('# '))
          return <p key={i} className="text-white font-bold mt-3 mb-1 text-lg">{line.slice(2)}</p>
        if (line.match(/^\d+\./))
          return <p key={i} className="ml-3">• {line.replace(/^\d+\.\s*/, '')}</p>
        if (line.startsWith('- ') || line.startsWith('* '))
          return <p key={i} className="ml-3">• {line.slice(2)}</p>
        if (line.trim() === '')
          return <div key={i} className="h-1" />
        return <p key={i}>{line}</p>
      })}
    </div>
  )
}

// ── Urgency / confidence colours ──────────────────────────────────────────────
const urgencyColor = {
  Immediate:    'text-red-400 bg-red-900/20 border-red-800',
  'Within 4h':  'text-orange-400 bg-orange-900/20 border-orange-800',
  'Within 24h': 'text-yellow-400 bg-yellow-900/20 border-yellow-800',
  Monitor:      'text-blue-400 bg-blue-900/20 border-blue-800',
}
const confColor = {
  High:   'text-green-400 bg-green-900/30 border-green-700',
  Medium: 'text-yellow-400 bg-yellow-900/30 border-yellow-700',
  Low:    'text-gray-400 bg-gray-800 border-gray-700',
}

// ── Structured result card ────────────────────────────────────────────────────
function StructuredCard({ data, collapsible }) {
  const [open, setOpen] = useState(!collapsible)
  if (!data) return null
  const actions = data.recommended_actions || []
  return (
    <div className="card border-gray-700 space-y-3">
      <div className="flex items-center justify-between cursor-pointer" onClick={() => collapsible && setOpen(o => !o)}>
        <div className="flex items-center gap-2">
          <Brain size={14} className="text-brand-400" />
          <span className="font-semibold text-white text-sm">{data.root_cause}</span>
          {data.is_mock && <span className="text-[10px] px-1.5 py-0.5 bg-gray-800 text-gray-500 rounded">MOCK</span>}
        </div>
        <div className="flex items-center gap-2">
          <span className={`text-xs px-2 py-0.5 rounded border ${confColor[data.confidence] || confColor.Low}`}>
            {data.confidence} Confidence
          </span>
          {collapsible && (open ? <ChevronUp size={14}/> : <ChevronDown size={14}/>)}
        </div>
      </div>

      {open && (
        <>
          {data.root_cause_detail && (
            <p className="text-sm text-gray-400">{data.root_cause_detail}</p>
          )}

          {actions.length > 0 && (
            <div>
              <p className="text-xs text-gray-500 uppercase tracking-wide mb-1.5">Actions</p>
              <div className="space-y-1">
                {actions.sort((a, b) => (a.priority||9)-(b.priority||9)).map((a, i) => (
                  <div key={i} className={`flex items-start gap-2 text-xs rounded border px-2.5 py-1.5 ${urgencyColor[a.urgency]||urgencyColor.Monitor}`}>
                    <Zap size={11} className="shrink-0 mt-0.5"/>
                    <span className="flex-1">{a.action}</span>
                    <span className="opacity-70 whitespace-nowrap">{a.urgency}</span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {data.time_to_critical && (
            <div className="flex items-center gap-2 text-sm">
              <Clock size={13} className="text-orange-400"/>
              <span className="text-gray-400">Time to critical:</span>
              <span className="text-orange-300 font-medium">{data.time_to_critical}</span>
            </div>
          )}

          {data.additional_notes && (
            <p className="text-xs text-gray-600 border-t border-gray-800 pt-2">{data.additional_notes}</p>
          )}
        </>
      )}
    </div>
  )
}

// ── Chat message bubble ───────────────────────────────────────────────────────
function ChatBubble({ role, content, streaming }) {
  const isUser = role === 'user'
  return (
    <div className={`flex gap-3 ${isUser ? 'flex-row-reverse' : 'flex-row'}`}>
      <div className={`w-7 h-7 rounded-full flex items-center justify-center shrink-0 mt-0.5 ${isUser ? 'bg-brand-600' : 'bg-gray-700'}`}>
        {isUser ? <User size={13}/> : <Bot size={13}/>}
      </div>
      <div className={`max-w-[80%] rounded-xl px-4 py-3 ${isUser ? 'bg-brand-900/40 border border-brand-800' : 'bg-gray-800 border border-gray-700'}`}>
        {isUser
          ? <p className="text-sm text-gray-200">{content}</p>
          : <Markdown text={content} />
        }
        {streaming && <span className="inline-block w-1.5 h-4 bg-brand-400 animate-pulse ml-1 align-bottom" />}
      </div>
    </div>
  )
}

// ── Main component ────────────────────────────────────────────────────────────
export default function AgentPanel() {
  const [phase, setPhase]               = useState('idle')   // idle | streaming | chat
  const [streamText, setStreamText]     = useState('')
  const [structured, setStructured]     = useState(null)
  const [chatMessages, setChatMessages] = useState([])
  const [chatInput, setChatInput]       = useState('')
  const [chatLoading, setChatLoading]   = useState(false)
  const [history, setHistory]           = useState([])
  const [error, setError]               = useState(null)
  const [anomalyCtx, setAnomalyCtx]    = useState(null)
  const chatEndRef                      = useRef(null)
  const esRef                           = useRef(null)

  useEffect(() => { fetchHistory() }, [])
  useEffect(() => { chatEndRef.current?.scrollIntoView({ behavior: 'smooth' }) }, [chatMessages, streamText])

  const fetchHistory = async () => {
    try { const d = await getAgentHistory(); setHistory(d.analyses || []) } catch {}
  }

  // Build anomaly context from latest prediction
  const buildContext = async () => {
    const baselines = {
      suction_pressure: 1.0, discharge_pressure: 8.75, suction_temperature: 30.0,
      discharge_temperature: 95.0, vibration_x: 2.25, vibration_y: 2.25,
      bearing_temperature: 55.0, motor_current: 50.0, flow_rate: 1000.0, oil_pressure: 3.25,
    }
    let predData = null
    try {
      const preds = await getRecentPredictions()
      predData = (preds.predictions || []).find(p => p.is_anomaly) || preds.predictions?.[0]
    } catch {}

    const affected = predData?.sensor_values
      ? Object.entries(predData.sensor_values).reduce((acc, [k, v]) => {
          const base = baselines[k] || v
          const dev  = ((v - base) / Math.abs(base)) * 100
          if (Math.abs(dev) > 5) acc[k] = { current: +v.toFixed(3), baseline: base, deviation_pct: +dev.toFixed(1) }
          return acc
        }, {})
      : {}

    return {
      severity:              predData?.severity || 'MEDIUM',
      anomaly_score:         predData?.anomaly_score || 0.6,
      if_score:              predData?.if_score || 0.55,
      lstm_error:            predData?.lstm_error || 0.015,
      affected_sensors:      affected,
      anomaly_timestamp:     predData?.timestamp || new Date().toISOString(),
      previous_anomalies_24h: history.length,
      recent_trend:          'Gradual increase in anomaly score over last 60 minutes',
    }
  }

  const handleAnalyze = useCallback(async () => {
    if (esRef.current) esRef.current.close()
    setPhase('streaming')
    setStreamText('')
    setStructured(null)
    setChatMessages([])
    setError(null)

    const ctx = await buildContext()
    setAnomalyCtx(ctx)

    // Build query string
    const params = new URLSearchParams({
      severity:               ctx.severity,
      anomaly_score:          ctx.anomaly_score,
      if_score:               ctx.if_score,
      lstm_error:             ctx.lstm_error,
      previous_anomalies_24h: ctx.previous_anomalies_24h,
      recent_trend:           ctx.recent_trend,
      sensors:                JSON.stringify(ctx.affected_sensors),
    })

    const es = new EventSource(`/api/agent/stream?${params}`)
    esRef.current = es
    let buffer = ''

    es.onmessage = (e) => {
      try {
        const { chunk } = JSON.parse(e.data)
        if (!chunk) return

        if (chunk.startsWith('text:')) {
          buffer += chunk.slice(5)
          setStreamText(buffer)
        } else if (chunk.startsWith('done:')) {
          const parsed = JSON.parse(chunk.slice(5))
          setStructured(parsed)
          // Seed chat with the stream text as assistant's first message
          setChatMessages([{ role: 'assistant', content: buffer }])
          setPhase('chat')
          es.close()
          fetchHistory()
        } else if (chunk.startsWith('error:')) {
          setError(chunk.slice(6))
          // Still try to get a mock/rule-based analysis via the regular endpoint
          try {
            const r = await fetch('/api/agent/analyze', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({
                severity: ctx.severity,
                anomaly_score: ctx.anomaly_score,
                if_score: ctx.if_score,
                lstm_reconstruction_error: ctx.lstm_error,
                affected_sensors: ctx.affected_sensors,
                previous_anomalies_24h: ctx.previous_anomalies_24h,
              }),
            })
            const fallback = await r.json()
            setStructured(fallback)
            const fallbackText = `## Root Cause\n${fallback.root_cause}\n\n${fallback.root_cause_detail || ''}\n\n## Recommended Actions\n${(fallback.recommended_actions||[]).map(a => `- [${a.urgency}] ${a.action}`).join('\n')}\n\n## Time to Critical\n${fallback.time_to_critical || 'Unknown'}`
            setChatMessages([{ role: 'assistant', content: fallbackText }])
            setPhase('chat')
          } catch { setPhase('idle') }
          es.close()
        }
      } catch { /* ignore parse errors */ }
    }
    es.onerror = () => { es.close(); if (phase === 'streaming') setPhase('idle') }
  }, [history.length])

  const handleChat = async () => {
    if (!chatInput.trim() || chatLoading) return
    const userMsg = { role: 'user', content: chatInput.trim() }
    const nextMsgs = [...chatMessages, userMsg]
    setChatMessages(nextMsgs)
    setChatInput('')
    setChatLoading(true)

    // Placeholder for streaming assistant reply
    const placeholderIdx = nextMsgs.length
    setChatMessages(prev => [...prev, { role: 'assistant', content: '', streaming: true }])

    try {
      const resp = await fetch('/api/agent/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          messages: nextMsgs,
          anomaly_context: anomalyCtx || {},
        }),
      })

      const reader = resp.body.getReader()
      const decoder = new TextDecoder()
      let replyBuf = ''

      while (true) {
        const { done, value } = await reader.read()
        if (done) break
        const text = decoder.decode(value)
        // Each SSE line: "data: {...}\n\n"
        for (const line of text.split('\n')) {
          if (!line.startsWith('data: ')) continue
          try {
            const { chunk } = JSON.parse(line.slice(6))
            if (!chunk) continue
            if (chunk.startsWith('text:')) {
              replyBuf += chunk.slice(5)
              setChatMessages(prev => {
                const updated = [...prev]
                updated[placeholderIdx] = { role: 'assistant', content: replyBuf, streaming: true }
                return updated
              })
            } else if (chunk.startsWith('done:')) {
              setChatMessages(prev => {
                const updated = [...prev]
                updated[placeholderIdx] = { role: 'assistant', content: replyBuf }
                return updated
              })
            }
          } catch { /* ignore */ }
        }
      }
    } catch (e) {
      setChatMessages(prev => {
        const updated = [...prev]
        updated[placeholderIdx] = { role: 'assistant', content: `Error: ${e.message}` }
        return updated
      })
    } finally {
      setChatLoading(false)
    }
  }

  const handleKeyDown = (e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); handleChat() } }

  const reset = () => {
    esRef.current?.close()
    setPhase('idle'); setStreamText(''); setStructured(null)
    setChatMessages([]); setChatInput(''); setError(null)
  }

  return (
    <div className="space-y-4">

      {/* Header */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h2 className="text-2xl font-bold text-white">AI Agent Analysis</h2>
          <p className="text-xs text-gray-500 mt-0.5">Powered by Claude {phase === 'chat' ? '· Chat active' : ''}</p>
        </div>
        <div className="flex gap-2">
          {phase !== 'idle' && (
            <button onClick={reset} className="btn-secondary flex items-center gap-2 text-sm">
              <Trash2 size={13}/> Reset
            </button>
          )}
          <button onClick={fetchHistory} className="btn-secondary flex items-center gap-2 text-sm">
            <RefreshCw size={13}/> History
          </button>
          <button
            onClick={handleAnalyze}
            disabled={phase === 'streaming'}
            className="btn-primary flex items-center gap-2"
          >
            {phase === 'streaming'
              ? <><Loader2 size={15} className="animate-spin"/> Analyzing…</>
              : <><Brain size={15}/> {phase === 'chat' ? 'Re-analyze' : 'Analyze Latest Anomaly'}</>
            }
          </button>
        </div>
      </div>

      {error && (
        <div className="card border-orange-800 bg-orange-900/10 space-y-2">
          <div className="flex items-center gap-3 text-orange-400 text-sm">
            <AlertTriangle size={16} className="shrink-0"/> {error}
          </div>
          {error.includes('credits') && (
            <p className="text-xs text-gray-500 ml-7">
              Add credits at{' '}
              <span className="text-brand-400 font-mono">console.anthropic.com → Billing</span>
              {' '}then click Re-analyze. The fallback rule-based analysis still works below.
            </p>
          )}
        </div>
      )}

      {/* ── Idle: empty state ── */}
      {phase === 'idle' && !error && history.length === 0 && (
        <div className="card text-center py-14 text-gray-500">
          <Brain size={52} className="mx-auto mb-4 opacity-25"/>
          <p className="font-medium text-gray-400">Click "Analyze Latest Anomaly" to start</p>
          <p className="text-sm mt-1">Run the Live Monitor first to generate anomaly data.</p>
        </div>
      )}

      {/* ── Streaming: show text as it arrives ── */}
      {phase === 'streaming' && (
        <div className="card border-brand-800 bg-gray-900/60 space-y-3">
          <div className="flex items-center gap-2 text-brand-400 text-sm">
            <Loader2 size={14} className="animate-spin"/>
            <span>Claude is analyzing the anomaly pattern…</span>
          </div>
          <div className="min-h-32 bg-gray-950 rounded-lg p-4 border border-gray-800">
            <Markdown text={streamText} />
            {streamText.length === 0 && (
              <div className="flex gap-1.5 mt-2">
                {['Correlating sensors','Identifying root cause','Generating diagnosis'].map((s, i) => (
                  <span key={i} className="text-xs bg-gray-800 text-gray-500 px-2 py-0.5 rounded animate-pulse"
                    style={{ animationDelay: `${i * 0.25}s` }}>{s}</span>
                ))}
              </div>
            )}
            {streamText.length > 0 && (
              <span className="inline-block w-1.5 h-4 bg-brand-400 animate-pulse ml-0.5 align-bottom" />
            )}
          </div>
        </div>
      )}

      {/* ── Chat mode ── */}
      {phase === 'chat' && (
        <div className="space-y-4">
          {/* Structured summary (collapsible) */}
          {structured && <StructuredCard data={structured} collapsible />}

          {/* Chat transcript */}
          <div className="card border-gray-700 space-y-4 max-h-[480px] overflow-y-auto">
            <p className="text-xs text-gray-500 uppercase tracking-widest sticky top-0 bg-gray-900 pb-1">Conversation</p>
            {chatMessages.map((m, i) => (
              <ChatBubble key={i} role={m.role} content={m.content} streaming={m.streaming && i === chatMessages.length - 1} />
            ))}
            <div ref={chatEndRef} />
          </div>

          {/* Chat input */}
          <div className="card border-gray-700 p-3">
            <div className="flex gap-2 items-end">
              <textarea
                value={chatInput}
                onChange={e => setChatInput(e.target.value)}
                onKeyDown={handleKeyDown}
                placeholder="Ask a follow-up question… (Enter to send, Shift+Enter for newline)"
                rows={2}
                disabled={chatLoading}
                className="flex-1 bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-sm text-gray-200
                           placeholder-gray-600 resize-none focus:outline-none focus:border-brand-600"
              />
              <button
                onClick={handleChat}
                disabled={!chatInput.trim() || chatLoading}
                className="btn-primary px-3 py-2 flex items-center gap-1.5 shrink-0"
              >
                {chatLoading
                  ? <Loader2 size={15} className="animate-spin"/>
                  : <Send size={15}/>
                }
              </button>
            </div>
            <p className="text-[10px] text-gray-600 mt-1.5">
              Ask about root causes, maintenance procedures, risk assessment, or anything about this anomaly.
            </p>
          </div>
        </div>
      )}

      {/* ── History ── */}
      {history.length > 0 && (
        <div>
          <h3 className="text-xs font-semibold text-gray-400 uppercase tracking-widest mb-3">
            Analysis History ({history.length})
          </h3>
          <div className="space-y-2">
            {history.slice(0, 5).map(h => (
              <div key={h.id} className="card p-3 border-gray-800 flex items-start justify-between gap-3">
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <Brain size={12} className="text-brand-400 shrink-0"/>
                    <p className="text-sm text-white truncate">{h.root_cause}</p>
                    <span className={`text-[10px] px-1.5 py-0.5 rounded border shrink-0 ${confColor[h.confidence]||confColor.Low}`}>
                      {h.confidence}
                    </span>
                  </div>
                  {h.time_to_critical && (
                    <p className="text-xs text-gray-500 mt-1 flex items-center gap-1">
                      <Clock size={10}/> {h.time_to_critical}
                    </p>
                  )}
                </div>
                {h.created_at && (
                  <p className="text-[10px] text-gray-600 shrink-0">{h.created_at.slice(0,16)}</p>
                )}
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}
