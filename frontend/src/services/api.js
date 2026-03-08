import axios from 'axios'

const api = axios.create({
  baseURL: '/api',
  timeout: 120_000,
})

// ── Data ─────────────────────────────────────────────────────────────────────
export const getDataStats   = ()       => api.get('/data/stats').then(r => r.data)
export const getSampleData  = ()       => api.get('/data/sample').then(r => r.data)
export const generateData   = ()       => api.post('/data/generate').then(r => r.data)
export const uploadData     = (file)   => {
  const form = new FormData()
  form.append('file', file)
  return api.post('/data/upload', form).then(r => r.data)
}

// ── Training ─────────────────────────────────────────────────────────────────
export const startTraining    = ()   => api.post('/train/start').then(r => r.data)
export const getTrainingStatus= ()   => api.get('/train/status').then(r => r.data)
export const getTrainingResults=()   => api.get('/train/results').then(r => r.data)

// ── Evaluation ────────────────────────────────────────────────────────────────
export const runEvaluation    = ()   => api.post('/evaluate/run').then(r => r.data)
export const getEvalMetrics   = ()   => api.get('/evaluate/metrics').then(r => r.data)
export const getConfusion     = ()   => api.get('/evaluate/confusion').then(r => r.data)
export const getEvalTimeline  = ()   => api.get('/evaluate/timeline').then(r => r.data)

// ── Prediction ────────────────────────────────────────────────────────────────
export const predictSingle    = (data) => api.post('/predict/single', data).then(r => r.data)
export const predictBatch     = (file) => {
  const form = new FormData()
  form.append('file', file)
  return api.post('/predict/batch', form).then(r => r.data)
}

// ── Agent ─────────────────────────────────────────────────────────────────────
export const analyzeAnomaly   = (data) => api.post('/agent/analyze', data).then(r => r.data)
export const getAgentHistory  = ()     => api.get('/agent/history').then(r => r.data)

// ── Misc ─────────────────────────────────────────────────────────────────────
export const healthCheck      = ()     => api.get('/health').then(r => r.data)
export const getRecentPredictions = () => api.get('/predictions/recent').then(r => r.data)

export default api
