import { Modal } from 'devnonla-ui'
import type { ReactNode } from 'react'

interface ConfirmConfig {
  title: string
  content: ReactNode
  okText?: string
  cancelText?: string
  okButtonProps?: { danger?: boolean }
  onOk?: () => void | Promise<void>
  onCancel?: () => void
}

/** Confirmation dialog (devnonla-ui `Modal.confirm`). */
export function confirm(config: ConfirmConfig) {
  Modal.confirm({
    title: config.title,
    content: config.content,
    okText: config.okText,
    cancelText: config.cancelText,
    okButtonProps: config.okButtonProps,
    onOk: config.onOk,
    onCancel: config.onCancel,
  })
}
