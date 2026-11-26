const ZONES = [
  ['Ho Chi Minh', 'Asia/Ho_Chi_Minh'],
  ['London', 'Europe/London'],
  ['New York', 'America/New_York'],
  ['Tokyo', 'Asia/Tokyo'],
]

module.exports = function WorldClock({ ctx }) {
  const { useState, useEffect } = ctx
  const [now, setNow] = useState(new Date())

  useEffect(() => {
    const timer = setInterval(() => setNow(new Date()), 1000)
    return () => clearInterval(timer)
  }, [])

  return (
    <div
      style={{
        height: '100%',
        overflowY: 'auto',
        padding: 24,
        boxSizing: 'border-box',
        fontFamily: 'system-ui, sans-serif',
      }}
    >
      {ZONES.map(([label, zone]) => (
        <div
          key={zone}
          style={{
            display: 'flex',
            justifyContent: 'space-between',
            padding: '10px 0',
            borderBottom: '1px solid #d4d5ce',
          }}
        >
          <span style={{ color: '#5c5e58' }}>{label}</span>
          <strong style={{ fontVariantNumeric: 'tabular-nums' }}>
            {now.toLocaleTimeString('en-GB', { timeZone: zone })}
          </strong>
        </div>
      ))}
    </div>
  )
}
