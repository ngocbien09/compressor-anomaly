/**
 * CompressorGuard AI — Client Pitch Deck
 * 2 slides: Architecture + Key Features
 * Generated with PptxGenJS
 */
const PptxGenJS = require('pptxgenjs')
const pptx = new PptxGenJS()

// ─── Palette ────────────────────────────────────────────────────────────────
const C = {
  bg:        '0A1628',   // deep navy
  bg2:       '0F2040',   // card navy
  accent:    '3B82F6',   // brand blue
  accent2:   '60A5FA',   // lighter blue
  teal:      '0EA5E9',   // teal highlight
  green:     '10B981',   // success
  orange:    'F59E0B',   // warning
  purple:    '8B5CF6',   // purple
  border:    '1E3A5F',   // border blue
  textWht:   'FFFFFF',
  textGray:  '94A3B8',
  textDim:   '475569',
  row1:      '1E3A5F',   // darker card row
}

pptx.defineLayout({ name: 'WIDE', width: 13.33, height: 7.5 })
pptx.layout = 'WIDE'

// ════════════════════════════════════════════════════════════════════════════
// SLIDE 1 — System Architecture
// ════════════════════════════════════════════════════════════════════════════
const s1 = pptx.addSlide()

// Full-bleed background
s1.addShape(pptx.ShapeType.rect, { x: 0, y: 0, w: 13.33, h: 7.5, fill: { color: C.bg } })

// Left accent bar
s1.addShape(pptx.ShapeType.rect, { x: 0, y: 0, w: 0.06, h: 7.5, fill: { color: C.accent } })

// ── Header strip ─────────────────────────────────────────────────────────
s1.addShape(pptx.ShapeType.rect, { x: 0.06, y: 0, w: 13.27, h: 0.9, fill: { color: C.bg2 } })

s1.addText('CompressorGuard', {
  x: 0.28, y: 0.1, w: 4, h: 0.45,
  fontSize: 15, bold: true, color: C.accent2,
  fontFace: 'Calibri', valign: 'middle',
})
s1.addText('AI', {
  x: 1.88, y: 0.1, w: 0.5, h: 0.45,
  fontSize: 15, bold: true, color: C.teal,
  fontFace: 'Calibri', valign: 'middle',
})
s1.addText('System Architecture', {
  x: 0.28, y: 0.5, w: 6, h: 0.35,
  fontSize: 22, bold: true, color: C.textWht,
  fontFace: 'Calibri', valign: 'middle',
})
s1.addText('Predictive Maintenance Platform for Multi-Stage Centrifugal Compressors', {
  x: 5.2, y: 0.28, w: 7.8, h: 0.35,
  fontSize: 9, color: C.textGray, fontFace: 'Calibri',
  align: 'right', valign: 'middle',
})

// ── Helper: draw a component box ─────────────────────────────────────────
function box(slide, x, y, w, h, title, subs, accentCol, iconChar) {
  // shadow rect
  slide.addShape(pptx.ShapeType.rect, {
    x: x + 0.04, y: y + 0.04, w, h,
    fill: { color: '000000', transparency: 75 },
    line: { color: '000000', transparency: 100 },
  })
  // main card
  slide.addShape(pptx.ShapeType.rect, {
    x, y, w, h,
    fill: { color: C.bg2 },
    line: { color: accentCol, width: 1.5 },
  })
  // top accent stripe
  slide.addShape(pptx.ShapeType.rect, {
    x, y, w, h: 0.055,
    fill: { color: accentCol },
    line: { color: accentCol },
  })
  // icon
  if (iconChar) {
    slide.addText(iconChar, {
      x: x + 0.1, y: y + 0.06, w: 0.32, h: 0.28,
      fontSize: 14, bold: true, color: accentCol,
      fontFace: 'Segoe UI', valign: 'middle', align: 'center',
    })
  }
  // title
  slide.addText(title, {
    x: x + (iconChar ? 0.42 : 0.12), y: y + 0.06, w: w - (iconChar ? 0.52 : 0.22), h: 0.28,
    fontSize: 9.5, bold: true, color: C.textWht,
    fontFace: 'Calibri', valign: 'middle',
  })
  // sub-items
  if (subs && subs.length) {
    const itemH = Math.min(0.22, (h - 0.42) / subs.length)
    subs.forEach((s, i) => {
      slide.addText('• ' + s, {
        x: x + 0.14, y: y + 0.37 + i * itemH, w: w - 0.22, h: itemH,
        fontSize: 7.5, color: C.textGray, fontFace: 'Calibri',
      })
    })
  }
}

// ── Helper: arrow ─────────────────────────────────────────────────────────
function arrow(slide, x1, y1, x2, y2, label) {
  const isVert = Math.abs(x2 - x1) < 0.1
  if (isVert) {
    slide.addShape(pptx.ShapeType.line, {
      x: x1, y: Math.min(y1, y2), w: 0, h: Math.abs(y2 - y1),
      line: { color: C.accent, width: 1.2, dashType: 'sysDash', endArrowType: 'triangle' },
    })
  } else {
    slide.addShape(pptx.ShapeType.line, {
      x: Math.min(x1, x2), y: y1, w: Math.abs(x2 - x1), h: 0,
      line: { color: C.accent, width: 1.2, dashType: 'sysDash', endArrowType: 'triangle' },
    })
  }
  if (label) {
    const lx = (x1 + x2) / 2 - 0.3
    const ly = (y1 + y2) / 2 - 0.12
    slide.addText(label, {
      x: lx, y: ly, w: 0.65, h: 0.18,
      fontSize: 6.5, color: C.teal, fontFace: 'Calibri', align: 'center',
      bold: true,
    })
  }
}

// ── Row labels ─────────────────────────────────────────────────────────────
function rowLabel(slide, y, txt) {
  slide.addShape(pptx.ShapeType.rect, {
    x: 0.08, y, w: 0.5, h: 0.22,
    fill: { color: C.border },
    line: { color: C.accent, width: 0.5 },
  })
  slide.addText(txt, {
    x: 0.08, y, w: 0.5, h: 0.22,
    fontSize: 5.5, bold: true, color: C.accent2, fontFace: 'Calibri',
    align: 'center', valign: 'middle',
  })
}

// ── Architecture rows ──────────────────────────────────────────────────────
// Layout: 5 rows stacked
// Row 0 (USER): browser icon
// Row 1 (FRONTEND): 3 boxes
// Row 2 (BACKEND): API Gateway
// Row 3 (ML ENGINE): 3 boxes
// Row 4 (DATA LAYER): 2 boxes

const TOP = 1.05   // start below header
const ROW_H = 1.18
const GAP = 0.14

// ── Row 0: External / User ─────────────────────────────────────────────────
rowLabel(s1, TOP + 0.22, 'USERS')
s1.addShape(pptx.ShapeType.ellipse, {
  x: 0.65, y: TOP + 0.08, w: 0.65, h: 0.65,
  fill: { color: C.bg2 },
  line: { color: C.accent2, width: 1.2 },
})
s1.addText('👤', { x: 0.65, y: TOP + 0.08, w: 0.65, h: 0.65, fontSize: 18, align: 'center', valign: 'middle' })
s1.addText('Operations\nEngineer', {
  x: 0.55, y: TOP + 0.75, w: 0.85, h: 0.3,
  fontSize: 6.5, color: C.textGray, fontFace: 'Calibri', align: 'center',
})

// Arrow user → frontend
arrow(s1, 1.32, TOP + 0.4, 2.05, TOP + 0.4, 'Browser')

// ── Row 1: Frontend (3 panels) ────────────────────────────────────────────
const FY = TOP
const FW = 2.8
const FH = ROW_H

rowLabel(s1, FY + 0.35, 'FRONT\nEND')
box(s1, 2.05, FY, FW, FH, 'React 18 Dashboard',
  ['Dashboard  ·  Training', 'Evaluation  ·  Live Monitor', 'Timeline  ·  AI Agent'],
  C.accent, '⬡')

box(s1, 5.05, FY, FW * 0.88, FH, 'Real-Time UI',
  ['SSE streaming (EventSource)', 'Recharts sensor visualizations', 'Tailwind dark-mode design'],
  C.teal, '◈')

box(s1, 7.6, FY, FW * 0.88, FH, 'API Client',
  ['Axios + 120 s timeout', 'REST + Server-Sent Events', 'Vite dev-server proxy'],
  C.purple, '⇄')

// Arrow frontend → backend
const midFront = 2.05 + FW / 2 + 0.1
arrow(s1, midFront, FY + FH, midFront, FY + FH + GAP + 0.05, 'HTTP/SSE')

// ── Row 2: Backend API ────────────────────────────────────────────────────
const BY = FY + FH + GAP
const BW = 13.33 - 0.7 - 0.08
box(s1, 0.7, BY, BW, ROW_H, 'FastAPI Backend  ·  Python 3.11  ·  uvicorn  ·  SQLAlchemy ORM',
  [
    '/api/health   /api/data/*   /api/train/*   /api/evaluate/*   /api/predict/*   /api/agent/*   /api/predictions/*',
    'CORS middleware  ·  BackgroundTasks for async training  ·  StreamingResponse for SSE  ·  Pydantic request validation',
  ],
  C.orange, '⚡')

rowLabel(s1, BY + 0.35, 'API\nGATEWAY')

// Arrow backend → ML
const midApi = 0.7 + BW / 2
arrow(s1, midApi, BY + ROW_H, midApi, BY + ROW_H + GAP + 0.05, '')

// ── Row 3: ML Engine (3 boxes) ────────────────────────────────────────────
const MY = BY + ROW_H + GAP
const MW = 3.2
const MH = ROW_H * 1.42
rowLabel(s1, MY + 0.38, 'ML\nENGINE')

box(s1, 0.7, MY, MW, MH, 'Isolation Forest',
  ['RandomForest — 85% ensemble weight', '50 features: 10 base + 36 temporal + 4 physics',
   'Rolling stats: 5/10/30 min windows', 'AUC-ROC: 0.9726'],
  C.green, '🌲')

box(s1, 4.1, MY, MW, MH, 'LSTM Autoencoder',
  ['TensorFlow/Keras — 15% ensemble weight', 'Encoder 64→32→16, Decoder 32→64→10',
   '60-step sliding window input', 'Reconstruction error threshold: μ + 3σ'],
  C.teal, '∿')

box(s1, 7.5, MY, MW, MH, 'Ensemble Predictor',
  ['Score = 0.85×IF + 0.15×LSTM', 'Threshold: Prec ≥65%, FPR ≤10%',
   'Confidence from model agreement', 'Severity: NORMAL/LOW/MEDIUM/HIGH'],
  C.accent, '⊕')

// Arrow ensemble → DB
arrow(s1, 9.1, MY + MH, 9.1, MY + MH + GAP + 0.04, '')
// Arrow IF → Ensemble
arrow(s1, 2.95, MY + MH * 0.5, 4.1, MY + MH * 0.5, '')
arrow(s1, 5.6, MY + MH * 0.5, 7.5, MY + MH * 0.5, '')

// Claude Agent box (right column)
const AX = 10.85
box(s1, AX, MY, 2.38, MH, 'Claude AI Agent',
  ['claude-sonnet-4-6', 'Structured + streaming', 'Multi-turn chat'],
  C.purple, '🤖')

// Arrow backend → Claude
s1.addShape(pptx.ShapeType.line, {
  x: AX + 1.19, y: BY + ROW_H,
  w: 0, h: MY - (BY + ROW_H),
  line: { color: C.purple, width: 1.2, dashType: 'sysDash', endArrowType: 'triangle' },
})
s1.addText('Anthropic\nAPI', {
  x: AX + 0.5, y: BY + ROW_H + GAP * 0.2, w: 0.85, h: 0.3,
  fontSize: 6, color: C.purple, fontFace: 'Calibri', align: 'center',
})

// ── Row 4: Data Layer (2 boxes) ───────────────────────────────────────────
const DY = MY + MH + GAP
const DH = 1.28
rowLabel(s1, DY + 0.22, 'DATA\nLAYER')

box(s1, 0.7, DY, 4.5, DH, 'SQLite Database  (SQLAlchemy ORM)',
  ['Prediction  ·  AgentAnalysis  ·  TrainingRun',
   'Stores: timestamps, sensor JSON, scores, severity',
   'CRUD helpers · auto-created on first startup'],
  C.green, '🗄')

box(s1, 5.4, DY, 5.2, DH, 'Model Store  (saved_models/)',
  ['isolation_forest.pkl  ·  if_scaler.pkl',
   'lstm_autoencoder.keras  ·  lstm_meta.pkl',
   'optimal_threshold.json  — auto-loaded at startup'],
  C.orange, '💾')

box(s1, 10.82, DY, 2.41, DH, 'Data Source',
  ['50 000 synthetic sensor rows',
   '4 fault modes: bearing, valve,',
   'fouling, seal leak'],
  C.teal, '📊')

// ── Slide 1 footer ────────────────────────────────────────────────────────
s1.addShape(pptx.ShapeType.rect, { x: 0.06, y: 7.32, w: 13.27, h: 0.18, fill: { color: C.bg2 } })
s1.addText('CompressorGuard AI  ·  Confidential  ·  2025', {
  x: 0.2, y: 7.33, w: 8, h: 0.16,
  fontSize: 6.5, color: C.textDim, fontFace: 'Calibri', valign: 'middle',
})
s1.addText('1 / 2', {
  x: 12.8, y: 7.33, w: 0.45, h: 0.16,
  fontSize: 6.5, color: C.textDim, fontFace: 'Calibri', align: 'right', valign: 'middle',
})

// ════════════════════════════════════════════════════════════════════════════
// SLIDE 2 — Key Features
// ════════════════════════════════════════════════════════════════════════════
const s2 = pptx.addSlide()
s2.addShape(pptx.ShapeType.rect, { x: 0, y: 0, w: 13.33, h: 7.5, fill: { color: C.bg } })
s2.addShape(pptx.ShapeType.rect, { x: 0, y: 0, w: 0.06, h: 7.5, fill: { color: C.accent } })
s2.addShape(pptx.ShapeType.rect, { x: 0.06, y: 0, w: 13.27, h: 0.9, fill: { color: C.bg2 } })

s2.addText('CompressorGuard', {
  x: 0.28, y: 0.1, w: 4, h: 0.45,
  fontSize: 15, bold: true, color: C.accent2, fontFace: 'Calibri', valign: 'middle',
})
s2.addText('AI', {
  x: 1.88, y: 0.1, w: 0.5, h: 0.45,
  fontSize: 15, bold: true, color: C.teal, fontFace: 'Calibri', valign: 'middle',
})
s2.addText('Key Features & Capabilities', {
  x: 0.28, y: 0.5, w: 7, h: 0.35,
  fontSize: 22, bold: true, color: C.textWht, fontFace: 'Calibri', valign: 'middle',
})
s2.addText('Six pillars of the CompressorGuard platform', {
  x: 7.2, y: 0.55, w: 5.9, h: 0.3,
  fontSize: 9, color: C.textGray, fontFace: 'Calibri', align: 'right', valign: 'middle',
})

// ── Feature card helper ───────────────────────────────────────────────────
function featureCard(slide, x, y, w, h, icon, category, title, desc, color, chips) {
  const chipH = chips && chips.length ? 0.50 : 0
  // outer glow (border)
  slide.addShape(pptx.ShapeType.rect, {
    x, y, w, h,
    fill: { color: C.bg2 },
    line: { color: color, width: 1.5 },
  })
  // left accent column
  slide.addShape(pptx.ShapeType.rect, {
    x, y, w: 0.07, h,
    fill: { color: color },
    line: { color: color },
  })
  // Icon circle
  slide.addShape(pptx.ShapeType.ellipse, {
    x: x + 0.18, y: y + 0.14, w: 0.62, h: 0.62,
    fill: { color: color, transparency: 82 },
    line: { color: color, width: 1 },
  })
  slide.addText(icon, {
    x: x + 0.18, y: y + 0.14, w: 0.62, h: 0.62,
    fontSize: 18, align: 'center', valign: 'middle',
  })
  // Category badge
  slide.addShape(pptx.ShapeType.rect, {
    x: x + 0.88, y: y + 0.14, w: w - 1.05, h: 0.22,
    fill: { color: color, transparency: 85 },
    line: { color: color, width: 0.5 },
  })
  slide.addText(category.toUpperCase(), {
    x: x + 0.88, y: y + 0.14, w: w - 1.05, h: 0.22,
    fontSize: 6.5, bold: true, color: color,
    fontFace: 'Calibri', valign: 'middle', align: 'center',
  })
  // Feature title
  slide.addText(title, {
    x: x + 0.88, y: y + 0.4, w: w - 1.0, h: 0.3,
    fontSize: 11, bold: true, color: C.textWht,
    fontFace: 'Calibri', valign: 'middle',
  })
  // Description — fixed height sized to match ~5-6 lines at 8.5 pt
  const descH = 1.10
  slide.addText(desc, {
    x: x + 0.18, y: y + 0.74, w: w - 0.32, h: descH,
    fontSize: 8.5, color: C.textGray,
    fontFace: 'Calibri', valign: 'top',
    wrap: true,
  })
  // Metric chips anchored immediately below description
  if (chips && chips.length) {
    const chipY = y + 0.74 + descH + 0.08
    // thin separator line
    slide.addShape(pptx.ShapeType.line, {
      x: x + 0.18, y: chipY - 0.04, w: w - 0.28, h: 0,
      line: { color: color, width: 0.5, transparency: 60 },
    })
    const cw = (w - 0.28 - (chips.length - 1) * 0.08) / chips.length
    chips.forEach((chip, ci) => {
      const cx = x + 0.18 + ci * (cw + 0.08)
      slide.addShape(pptx.ShapeType.rect, {
        x: cx, y: chipY, w: cw, h: 0.28,
        fill: { color: color, transparency: 80 },
        line: { color: color, width: 0.75 },
      })
      slide.addText(chip, {
        x: cx, y: chipY, w: cw, h: 0.28,
        fontSize: 7, bold: true, color: color,
        fontFace: 'Calibri', align: 'center', valign: 'middle',
      })
    })
  }
}

// ── 6 feature cards in 3 × 2 grid ─────────────────────────────────────────
const CX0 = 0.22
const CY0 = 1.00
const CW  = 4.18
// CH = top-bar(0.055) + icon/badge row(0.62) + title(0.30) + gap(0.12) +
//      desc(1.28) + gap(0.08) + sep+chips(0.44) + bottom-pad(0.16) ≈ 2.50
// CH = top-bar(0.055) + icon/badge(0.62) + title(0.30) + gap(0.08) +
//      desc(1.10) + gap(0.08) + sep+chips(0.44) + bottom-pad(0.35) ≈ 2.65
const CH  = 2.65
const CGX = 0.19   // horizontal gap
const CGY = 0.38   // vertical gap — wider to fill slide height

const features = [
  {
    icon: '📡', cat: 'Monitoring', col: C.teal,
    title: 'Live Sensor Streaming',
    desc: 'Simulates 10 industrial sensor channels across a 3-phase fault progression — Normal, Pre-Anomaly (gradual drift), and Anomaly (critical). Displays a real-time anomaly gauge, phase banner, sensor tiles with live deviation %, and a multi-line Recharts time-series chart. All data streams via Server-Sent Events at 500 ms intervals.',
    chips: ['10 Sensors', '3 Fault Phases', '500 ms Refresh'],
  },
  {
    icon: '🧠', cat: 'Machine Learning', col: C.accent,
    title: 'Ensemble Anomaly Detection',
    desc: 'Fuses a Random Forest classifier (85% weight, 50 features: 10 base + 36 rolling-window stats at 5/10/30 min + 4 physics-derived features) with an LSTM Autoencoder (15% weight, 60-step window). Threshold auto-tuned per evaluation to hold Precision ≥65% and false-positive rate ≤10%.',
    chips: ['AUC-ROC 0.97+', '85:15 Weighting', '50 Features'],
  },
  {
    icon: '🤖', cat: 'AI Agent', col: C.purple,
    title: 'Claude AI Diagnosis',
    desc: 'On each detected anomaly, invokes Anthropic claude-sonnet-4-6 via SSE token streaming. Returns a structured JSON report: root-cause hypothesis, confidence level with reasoning, affected subsystems, maintenance actions tagged Immediate / 4h / 24h / Monitor, and estimated time-to-critical. Supports full multi-turn follow-up chat.',
    chips: ['Streaming Tokens', 'Structured JSON', 'Multi-turn Chat'],
  },
  {
    icon: '⚙️', cat: 'Training', col: C.orange,
    title: 'One-Click Model Training',
    desc: 'Generates 50 000 synthetic sensor rows covering 4 fault modes — bearing degradation, valve issues, fouling, and seal leaks — each with a realistic 3-phase fault progression and sinusoidal load variation. Trains Isolation Forest and LSTM Autoencoder sequentially with live progress polling, then displays loss curves, thresholds, and elapsed time.',
    chips: ['50K Rows', '4 Fault Modes', 'Auto Threshold'],
  },
  {
    icon: '📊', cat: 'Evaluation', col: C.green,
    title: 'Performance Evaluation',
    desc: 'Full evaluation on the 20% held-out test split reporting Precision, Recall, F1, and AUC-ROC as interactive metric cards. Also renders the confusion matrix (TP/FP/FN/TN with %) an interactive ROC curve, a prediction timeline, and a lead-time histogram showing how many minutes before critical failure each anomaly was first flagged.',
    chips: ['Prec / Recall / F1', 'ROC Curve', 'Lead-Time Histogram'],
  },
  {
    icon: '🗂', cat: 'History & Chat', col: C.accent2,
    title: 'Anomaly Timeline & Chat',
    desc: 'Browsable log of all predictions stored in SQLite. Filter by severity level (ALL / LOW / MEDIUM / HIGH), view an hourly aggregation bar chart, and click any event to inspect its full sensor-value breakdown. Each anomaly opens a dedicated multi-turn Claude AI chat session — conversation state persists across tab switches.',
    chips: ['Severity Filter', 'Hourly Chart', 'Chat History'],
  },
]

features.forEach((f, i) => {
  const col = i % 3
  const row = Math.floor(i / 3)
  featureCard(
    s2,
    CX0 + col * (CW + CGX),
    CY0 + row * (CH + CGY),
    CW, CH,
    f.icon, f.cat, f.title, f.desc, f.col,
    f.chips,
  )
})

// ── Slide 2 footer ────────────────────────────────────────────────────────
s2.addShape(pptx.ShapeType.rect, { x: 0.06, y: 7.32, w: 13.27, h: 0.18, fill: { color: C.bg2 } })
s2.addText('CompressorGuard AI  ·  Confidential  ·  2025', {
  x: 0.2, y: 7.33, w: 8, h: 0.16,
  fontSize: 6.5, color: C.textDim, fontFace: 'Calibri', valign: 'middle',
})
s2.addText('2 / 2', {
  x: 12.8, y: 7.33, w: 0.45, h: 0.16,
  fontSize: 6.5, color: C.textDim, fontFace: 'Calibri', align: 'right', valign: 'middle',
})

// ── Save ──────────────────────────────────────────────────────────────────
pptx.writeFile({ fileName: 'client_presentation.pptx' })
  .then(() => console.log('✅  client_presentation.pptx saved'))
  .catch(e => { console.error('❌', e); process.exit(1) })
