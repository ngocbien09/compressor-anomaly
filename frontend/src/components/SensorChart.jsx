import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer } from 'recharts'

const SENSOR_COLORS = {
  suction_pressure:      '#60a5fa',
  discharge_pressure:    '#f472b6',
  suction_temperature:   '#34d399',
  discharge_temperature: '#fb923c',
  vibration_x:           '#a78bfa',
  vibration_y:           '#c084fc',
  bearing_temperature:   '#f87171',
  motor_current:         '#facc15',
  flow_rate:             '#22d3ee',
  oil_pressure:          '#4ade80',
}

export default function SensorChart({ data, sensors, height = 240 }) {
  if (!data || data.length === 0) return null

  const displaySensors = sensors || Object.keys(SENSOR_COLORS)

  // Normalize data: extract sensor values from sensor_values sub-object if present
  const chartData = data.map((row, i) => {
    const values = row.sensor_values || row
    return {
      idx: i,
      timestamp: row.timestamp ? String(row.timestamp).slice(11, 19) : i,
      ...displaySensors.reduce((acc, s) => ({ ...acc, [s]: values[s] != null ? +values[s].toFixed(3) : null }), {}),
    }
  })

  return (
    <ResponsiveContainer width="100%" height={height}>
      <LineChart data={chartData} margin={{ top: 5, right: 10, left: 0, bottom: 5 }}>
        <CartesianGrid strokeDasharray="3 3" stroke="#1f2937" />
        <XAxis dataKey="timestamp" stroke="#4b5563" tick={{ fontSize: 10 }} interval="preserveStartEnd" />
        <YAxis stroke="#4b5563" tick={{ fontSize: 10 }} width={50} />
        <Tooltip
          contentStyle={{ background: '#111827', border: '1px solid #374151', fontSize: 12 }}
          itemStyle={{ color: '#d1d5db' }}
        />
        <Legend wrapperStyle={{ fontSize: 11 }} />
        {displaySensors.map(sensor => (
          <Line
            key={sensor}
            type="monotone"
            dataKey={sensor}
            stroke={SENSOR_COLORS[sensor] || '#9ca3af'}
            dot={false}
            strokeWidth={1.5}
            name={sensor.replace(/_/g, ' ')}
            connectNulls
          />
        ))}
      </LineChart>
    </ResponsiveContainer>
  )
}
