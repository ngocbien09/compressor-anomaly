import { useState } from 'react'
import { Activity, Cpu, LayoutDashboard, FlaskConical, Radio, GitBranch, Brain, Settings } from 'lucide-react'
import Dashboard from './components/Dashboard'
import TrainingPanel from './components/TrainingPanel'
import EvaluationPanel from './components/EvaluationPanel'
import LiveMonitor from './components/LiveMonitor'
import AnomalyTimeline from './components/AnomalyTimeline'
import AgentPanel from './components/AgentPanel'

const NAV_ITEMS = [
  { id: 'dashboard',   label: 'Dashboard',  icon: LayoutDashboard },
  { id: 'training',    label: 'Training',   icon: Cpu },
  { id: 'evaluation',  label: 'Evaluation', icon: FlaskConical },
  { id: 'monitor',     label: 'Live Monitor', icon: Radio },
  { id: 'timeline',    label: 'Timeline',   icon: GitBranch },
  { id: 'agent',       label: 'AI Agent',   icon: Brain },
]

export default function App() {
  const [active, setActive] = useState('dashboard')

  return (
    <div className="min-h-screen flex flex-col">
      {/* Header */}
      <header className="bg-gray-900 border-b border-gray-800 px-6 py-3 flex items-center gap-4">
        <div className="flex items-center gap-2">
          <Activity size={22} className="text-brand-400" />
          <span className="font-bold text-white text-lg">CompressorGuard</span>
          <span className="text-brand-400 font-semibold text-lg">AI</span>
        </div>
        <span className="text-gray-600 text-sm hidden sm:block">Multi-Stage Compressor Anomaly Detection</span>
        <div className="ml-auto text-xs text-gray-600 hidden md:block">
          Powered by Isolation Forest + LSTM Autoencoder + Claude AI
        </div>
      </header>

      <div className="flex flex-1 overflow-hidden">
        {/* Sidebar */}
        <aside className="w-56 bg-gray-900 border-r border-gray-800 flex-shrink-0 flex flex-col py-4">
          <nav className="space-y-1 px-3 flex-1">
            {NAV_ITEMS.map(({ id, label, icon: Icon }) => (
              <button
                key={id}
                onClick={() => setActive(id)}
                className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-colors ${
                  active === id
                    ? 'bg-brand-600/20 text-brand-300 border border-brand-700/40'
                    : 'text-gray-400 hover:text-gray-200 hover:bg-gray-800'
                }`}
              >
                <Icon size={16} />
                {label}
              </button>
            ))}
          </nav>

          {/* Footer info */}
          <div className="px-4 pt-4 border-t border-gray-800 text-[10px] text-gray-700 space-y-0.5">
            <p>Backend: localhost:8000</p>
            <p>Frontend: localhost:3000</p>
            <p className="mt-1 text-gray-800">v1.0.0</p>
          </div>
        </aside>

        {/* Main content — all panels stay mounted; only active one is visible */}
        <main className="flex-1 overflow-y-auto p-6">
          <div style={{ display: active === 'dashboard'  ? 'block' : 'none' }}><Dashboard /></div>
          <div style={{ display: active === 'training'   ? 'block' : 'none' }}><TrainingPanel /></div>
          <div style={{ display: active === 'evaluation' ? 'block' : 'none' }}><EvaluationPanel /></div>
          <div style={{ display: active === 'monitor'    ? 'block' : 'none' }}><LiveMonitor /></div>
          <div style={{ display: active === 'timeline'   ? 'block' : 'none' }}><AnomalyTimeline /></div>
          <div style={{ display: active === 'agent'      ? 'block' : 'none' }}><AgentPanel /></div>
        </main>
      </div>
    </div>
  )
}
