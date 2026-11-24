import { useEffect, useState } from 'react'

const timeFormat = new Intl.DateTimeFormat(undefined, { hour: '2-digit', minute: '2-digit' })
const dateFormat = new Intl.DateTimeFormat(undefined, {
  weekday: 'long',
  day: 'numeric',
  month: 'long',
})

function greeting(hour: number) {
  if (hour < 5) return 'Good night'
  if (hour < 12) return 'Good morning'
  if (hour < 18) return 'Good afternoon'
  return 'Good evening'
}

/** Large clock in the middle of the idle desktop. Windows open on top of it. */
export function DesktopClock() {
  const [now, setNow] = useState(() => new Date())
  useEffect(() => {
    const id = window.setInterval(() => setNow(new Date()), 10_000)
    return () => window.clearInterval(id)
  }, [])

  return (
    <div
      aria-hidden="true"
      className="absolute inset-x-0 top-[18%] z-10 flex flex-col items-center gap-1 pointer-events-none select-none"
    >
      <span className="text-[13px] font-semibold tracking-[2.5px] uppercase text-white/90 [text-shadow:0_1px_8px_rgba(80,40,10,0.45)]">
        {greeting(now.getHours())}
      </span>
      <span className="text-[88px] leading-none font-extralight tracking-[-3px] tabular-nums text-white [text-shadow:0_2px_24px_rgba(80,40,10,0.35)]">
        {timeFormat.format(now)}
      </span>
      <span className="text-[15px] font-medium text-white/90 [text-shadow:0_1px_8px_rgba(80,40,10,0.45)]">
        {dateFormat.format(now)}
      </span>
    </div>
  )
}
