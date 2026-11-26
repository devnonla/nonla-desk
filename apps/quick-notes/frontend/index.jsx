module.exports = function QuickNotes({ ctx }) {
  const { useState, useEffect } = ctx
  const [text, setText] = useState('')

  useEffect(() => {
    const off = ctx.ipc.on('notes:loaded', (value) => setText(value ?? ''))
    ctx.ipc.send('notes:load', {})
    return off
  }, [])

  const change = (e) => {
    setText(e.target.value)
    ctx.ipc.send('notes:save', e.target.value)
  }

  return (
    <div
      style={{
        height: '100%',
        padding: 24,
        boxSizing: 'border-box',
        fontFamily: 'system-ui, sans-serif',
      }}
    >
      <textarea
        value={text}
        onChange={change}
        placeholder="Write something. It is saved as you type."
        style={{
          width: '100%',
          height: '100%',
          boxSizing: 'border-box',
          padding: 12,
          fontSize: 14,
          border: '1px solid #d4d5ce',
          borderRadius: 8,
          resize: 'none',
          outline: 'none',
        }}
      />
    </div>
  )
}
