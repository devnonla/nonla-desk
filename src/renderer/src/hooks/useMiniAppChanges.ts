import { useEffect, useRef } from 'react'

export interface MiniAppChangeEvent {
  action: 'created' | 'updated' | 'deleted'
  id: string
  enabled?: boolean
  codeChanged?: boolean
  metadataChanged?: boolean
}

export function useMiniAppChanges(onChange: (event: MiniAppChangeEvent) => void) {
  const onChangeRef = useRef(onChange)
  onChangeRef.current = onChange

  useEffect(() => {
    const cleanup = window.api?.onMiniAppChanged((event: MiniAppChangeEvent) => {
      onChangeRef.current(event)
    })
    return () => cleanup?.()
  }, [])
}
