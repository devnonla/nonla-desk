/**
 * MiniAppUI — UI component library for mini app runtime.
 *
 * Exposed to mini apps as `ctx.ui`.
 * Provides commonly used shadcn-style component APIs that mini apps can use.
 */

import React, { type ReactNode, useRef, useState } from 'react'
import { FloatingPortal } from './FloatingLayer'

export { Tooltip } from './Tooltip'

// ─── Button ──────────────────────────────────────────────────────────────────

export function Button({
  children,
  type = 'default',
  size = 'middle',
  icon,
  loading = false,
  disabled = false,
  danger = false,
  block = false,
  className = '',
  onClick,
  style,
}: {
  children?: ReactNode
  type?: 'primary' | 'default' | 'text' | 'link' | 'dashed'
  size?: 'small' | 'middle' | 'large'
  icon?: ReactNode
  loading?: boolean
  disabled?: boolean
  danger?: boolean
  block?: boolean
  className?: string
  onClick?: (e: React.MouseEvent) => void
  style?: React.CSSProperties
}) {
  const sizeH: Record<string, string> = {
    small: 'h-7 px-3 text-[12px] gap-1',
    middle: 'h-8 px-4 text-[13px] gap-1.5',
    large: 'h-10 px-5 text-sm gap-2',
  }
  const variants: Record<string, string> = {
    primary: danger
      ? 'bg-(--color-error) text-white border-transparent hover:opacity-90'
      : 'bg-(--color-primary) text-(--color-on-primary) border-transparent hover:opacity-90',
    default: danger
      ? 'bg-transparent text-(--color-error) border-(--color-error)/30 hover:bg-(--color-error)/10'
      : 'bg-transparent text-(--color-body) border-(--color-hairline) hover:bg-(--color-bg-hover) hover:text-(--color-ink)',
    text: 'bg-transparent text-(--color-body) border-transparent hover:bg-(--color-bg-hover) hover:text-(--color-ink)',
    link: 'bg-transparent text-(--color-primary) border-transparent hover:opacity-80 underline-offset-2',
    dashed:
      'bg-transparent text-(--color-body) border-dashed border-(--color-hairline) hover:border-(--color-primary) hover:text-(--color-primary)',
  }

  return React.createElement(
    'button',
    {
      type: 'button',
      disabled: disabled || loading,
      onClick,
      style,
      className: `inline-flex items-center justify-center font-semibold rounded-sm border cursor-pointer transition-all duration-150 disabled:opacity-40 disabled:cursor-not-allowed ${sizeH[size]} ${variants[type] || variants.default} ${block ? 'w-full' : ''} ${className}`,
    },
    loading
      ? React.createElement('span', {
          className:
            'w-3.5 h-3.5 border-2 border-current border-t-transparent rounded-full animate-spin shrink-0',
        })
      : icon
        ? React.createElement('span', { className: 'shrink-0 flex items-center' }, icon)
        : null,
    children,
  )
}

// ─── Input ───────────────────────────────────────────────────────────────────

export function Input({
  value,
  onChange,
  placeholder,
  size = 'middle',
  disabled,
  className = '',
  style,
  type = 'text',
  ...rest
}: {
  value?: string
  defaultValue?: string
  onChange?: (e: React.ChangeEvent<HTMLInputElement>) => void
  placeholder?: string
  size?: 'small' | 'middle' | 'large'
  disabled?: boolean
  className?: string
  style?: React.CSSProperties
  type?: string
  [key: string]: any
}) {
  const sizeH: Record<string, string> = {
    small: 'h-7 px-2.5 text-[12px]',
    middle: 'h-9 px-3 text-sm',
    large: 'h-10 px-3.5 text-sm',
  }
  return React.createElement('input', {
    type,
    value,
    onChange,
    placeholder,
    disabled,
    style,
    className: `w-full bg-(--color-canvas) text-(--color-ink) border border-(--color-hairline) rounded-sm outline-none transition-colors placeholder:text-(--color-mute) focus:border-(--color-primary) disabled:opacity-50 ${sizeH[size]} ${className}`,
    ...rest,
  })
}

// TextArea
Input.TextArea = function TextArea({
  value,
  onChange,
  placeholder,
  rows = 4,
  disabled,
  className = '',
  style,
  ...rest
}: {
  value?: string
  onChange?: (e: React.ChangeEvent<HTMLTextAreaElement>) => void
  placeholder?: string
  rows?: number
  disabled?: boolean
  className?: string
  style?: React.CSSProperties
  [key: string]: any
}) {
  return React.createElement('textarea', {
    value,
    onChange,
    placeholder,
    rows,
    disabled,
    style,
    className: `w-full bg-(--color-canvas) text-(--color-ink) border border-(--color-hairline) rounded-sm outline-none transition-colors placeholder:text-(--color-mute) focus:border-(--color-primary) disabled:opacity-50 p-3 text-sm resize-y ${className}`,
    ...rest,
  })
}

// ─── InputNumber ─────────────────────────────────────────────────────────────

export function InputNumber({
  value,
  onChange,
  placeholder,
  size = 'middle',
  min,
  max,
  step,
  disabled,
  className = '',
  style,
}: {
  value?: number | string | null
  onChange?: (val: number | null) => void
  placeholder?: string
  size?: 'small' | 'middle' | 'large'
  min?: number
  max?: number
  step?: number
  disabled?: boolean
  className?: string
  style?: React.CSSProperties
}) {
  const sizeH: Record<string, string> = {
    small: 'h-7 px-2.5 text-[12px]',
    middle: 'h-9 px-3 text-sm',
    large: 'h-10 px-3.5 text-sm',
  }
  return React.createElement('input', {
    type: 'number',
    value: value ?? '',
    onChange: (e: React.ChangeEvent<HTMLInputElement>) => {
      const v = e.target.value
      onChange?.(v === '' ? null : Number(v))
    },
    placeholder,
    min,
    max,
    step,
    disabled,
    style,
    className: `w-full bg-(--color-canvas) text-(--color-ink) border border-(--color-hairline) rounded-sm outline-none transition-colors placeholder:text-(--color-mute) focus:border-(--color-primary) disabled:opacity-50 [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none ${sizeH[size]} ${className}`,
  })
}

// ─── Select ──────────────────────────────────────────────────────────────────

export function Select({
  value,
  onChange,
  options = [],
  placeholder = 'Select...',
  size = 'middle',
  disabled,
  className = '',
  style,
}: {
  value?: string
  defaultValue?: string
  onChange?: (val: string) => void
  options?: { value: string; label: ReactNode }[]
  placeholder?: string
  size?: 'small' | 'middle' | 'large'
  disabled?: boolean
  className?: string
  style?: React.CSSProperties
  [key: string]: any
}) {
  const sizeH: Record<string, string> = {
    small: 'h-7 text-[12px]',
    middle: 'h-9 text-sm',
    large: 'h-10 text-sm',
  }
  return React.createElement(
    'select',
    {
      value: value ?? '',
      onChange: (e: React.ChangeEvent<HTMLSelectElement>) => onChange?.(e.target.value),
      disabled,
      style,
      className: `w-full px-3 bg-(--color-canvas) text-(--color-ink) border border-(--color-hairline) rounded-sm outline-none transition-colors focus:border-(--color-primary) disabled:opacity-50 cursor-pointer ${sizeH[size]} ${className}`,
    },
    placeholder ? React.createElement('option', { value: '', disabled: true }, placeholder) : null,
    ...options.map((o) =>
      React.createElement('option', { key: String(o.value), value: o.value }, o.label),
    ),
  )
}

// ─── Switch ──────────────────────────────────────────────────────────────────

export function Switch({
  checked = false,
  onChange,
  onClick,
  size = 'default',
  disabled,
  className = '',
  style,
}: {
  checked?: boolean
  defaultChecked?: boolean
  onChange?: (checked: boolean) => void
  onClick?: (checked: boolean, e: React.MouseEvent) => void
  size?: 'small' | 'default'
  disabled?: boolean
  className?: string
  style?: React.CSSProperties
}) {
  const isSmall = size === 'small'
  const trackW = isSmall ? 'w-7' : 'w-9'
  const trackH = isSmall ? 'h-4' : 'h-5'
  const thumbSize = isSmall ? 'w-3 h-3' : 'w-3.5 h-3.5'
  const thumbPos = checked
    ? isSmall
      ? 'translate-x-[13px]'
      : 'translate-x-[18px]'
    : 'translate-x-[3px]'

  return React.createElement(
    'button',
    {
      type: 'button',
      role: 'switch',
      'aria-checked': checked,
      disabled,
      style,
      className: `relative inline-flex items-center rounded-full border-none cursor-pointer transition-colors duration-200 shrink-0 disabled:opacity-40 disabled:cursor-not-allowed ${trackW} ${trackH} ${
        checked ? 'bg-(--color-primary)' : 'bg-(--color-hairline)'
      } ${className}`,
      onClick: (e: React.MouseEvent) => {
        if (onClick) onClick(!checked, e)
        else onChange?.(!checked)
      },
    },
    React.createElement('span', {
      className: `block rounded-full shadow-sm transition-transform duration-200 ${thumbSize} ${thumbPos} ${checked ? 'bg-(--color-on-primary)' : 'bg-white'}`,
    }),
  )
}

// ─── Tag ─────────────────────────────────────────────────────────────────────

export function Tag({
  children,
  color,
  className = '',
  style,
  closable,
  onClose,
}: {
  children?: ReactNode
  color?: string
  className?: string
  style?: React.CSSProperties
  closable?: boolean
  onClose?: () => void
}) {
  const baseStyle: React.CSSProperties = { ...style }
  if (color) {
    baseStyle.backgroundColor = `${color}20`
    baseStyle.color = color
    baseStyle.borderColor = `${color}30`
  }

  return React.createElement(
    'span',
    {
      style: baseStyle,
      className: `inline-flex items-center gap-1 px-1.5 py-0 text-[10px] font-medium leading-tight rounded-xs border border-(--color-hairline) bg-(--color-canvas-soft) text-(--color-mute) ${className}`,
    },
    children,
    closable
      ? React.createElement(
          'button',
          {
            type: 'button',
            onClick: onClose,
            className:
              'bg-transparent border-none cursor-pointer text-current opacity-60 hover:opacity-100 p-0 leading-none',
          },
          '×',
        )
      : null,
  )
}

// ─── Modal ───────────────────────────────────────────────────────────────────

export function Modal({
  open,
  title,
  children,
  onOk,
  onCancel,
  okText = 'OK',
  cancelText = 'Cancel',
  footer,
  width,
  className = '',
}: {
  open?: boolean
  title?: ReactNode
  children?: ReactNode
  onOk?: () => void
  onCancel?: () => void
  okText?: string
  cancelText?: string
  footer?: ReactNode | null
  width?: number | string
  className?: string
}) {
  if (!open) return null

  return React.createElement(
    'div',
    { className: 'fixed inset-0 z-9998 flex items-center justify-center' },
    React.createElement('div', {
      className: 'absolute inset-0 bg-black/60 backdrop-blur-sm',
      onClick: onCancel,
    }),
    React.createElement(
      'div',
      {
        className: `relative z-10 bg-(--color-canvas) border border-(--color-hairline) rounded-md shadow-[0_20px_60px_rgba(0,0,0,0.7)] overflow-hidden ${className}`,
        style: { width: width || 420, maxWidth: '90vw', maxHeight: '85vh' },
      },
      title
        ? React.createElement(
            'div',
            {
              className:
                'flex items-center justify-between px-5 py-3 border-b border-(--color-hairline)',
            },
            React.createElement(
              'h3',
              { className: 'text-sm font-semibold text-(--color-ink)' },
              title,
            ),
            React.createElement(
              'button',
              {
                type: 'button',
                onClick: onCancel,
                className:
                  'w-6 h-6 flex items-center justify-center rounded bg-transparent border-none cursor-pointer text-(--color-mute) hover:text-(--color-ink) transition-colors',
              },
              '✕',
            ),
          )
        : null,
      React.createElement('div', { className: 'p-5 overflow-y-auto' }, children),
      footer !== null
        ? footer !== undefined
          ? React.createElement(
              'div',
              {
                className:
                  'px-5 py-3 border-t border-(--color-hairline) flex items-center justify-end gap-2',
              },
              footer,
            )
          : React.createElement(
              'div',
              {
                className:
                  'px-5 py-3 border-t border-(--color-hairline) flex items-center justify-end gap-2',
              },
              React.createElement(Button, { onClick: onCancel, size: 'small' }, cancelText),
              React.createElement(
                Button,
                { type: 'primary', onClick: onOk, size: 'small' },
                okText,
              ),
            )
        : null,
    ),
  )
}

// Static confirm method
Modal.confirm = function modalConfirm(config: {
  title: string
  content: ReactNode
  okText?: string
  cancelText?: string
  okButtonProps?: { danger?: boolean }
  onOk?: () => void | Promise<void>
  onCancel?: () => void
}) {
  const container = document.createElement('div')
  document.body.appendChild(container)

  const cleanup = () => {
    const root = (React as any).__miniAppConfirmRoot || null
    if (root) {
      root.unmount()
      ;(React as any).__miniAppConfirmRoot = null
    }
    container.remove()
  }

  // Simple render for mini app context
  const isDanger = config.okButtonProps?.danger
  container.innerHTML = ''
  const overlay = document.createElement('div')
  overlay.style.cssText =
    'position:fixed;inset:0;z-index:9998;display:flex;align-items:center;justify-content:center;'
  overlay.innerHTML = `
    <div style="position:absolute;inset:0;background:rgba(0,0,0,0.6);backdrop-filter:blur(4px)" data-backdrop></div>
    <div style="position:relative;z-index:10;width:380px;max-width:90vw;background:var(--color-canvas);border:1px solid var(--color-hairline);border-radius:var(--radius-md);box-shadow:0 20px 60px rgba(0,0,0,0.7);overflow:hidden">
      <div style="padding:20px">
        <h3 style="font-size:14px;font-weight:600;color:var(--color-ink);margin:0 0 8px 0">${config.title}</h3>
        <p style="font-size:12px;color:var(--color-body);margin:0;line-height:1.5">${typeof config.content === 'string' ? config.content : ''}</p>
      </div>
      <div style="padding:12px 20px;border-top:1px solid var(--color-hairline);display:flex;justify-content:flex-end;gap:8px;background:var(--color-canvas-soft)">
        <button data-cancel style="height:32px;padding:0 16px;font-size:13px;font-weight:500;border-radius:var(--radius-sm);background:transparent;border:1px solid var(--color-hairline);color:var(--color-body);cursor:pointer">${config.cancelText || 'Cancel'}</button>
        <button data-ok style="height:32px;padding:0 16px;font-size:13px;font-weight:600;border-radius:var(--radius-sm);border:none;cursor:pointer;${isDanger ? 'background:var(--color-error);color:white' : 'background:var(--color-primary);color:var(--color-on-primary)'}">${config.okText || 'OK'}</button>
      </div>
    </div>
  `
  container.appendChild(overlay)

  overlay.querySelector('[data-backdrop]')?.addEventListener('click', () => {
    config.onCancel?.()
    cleanup()
  })
  overlay.querySelector('[data-cancel]')?.addEventListener('click', () => {
    config.onCancel?.()
    cleanup()
  })
  overlay.querySelector('[data-ok]')?.addEventListener('click', async () => {
    await config.onOk?.()
    cleanup()
  })
}

// ─── message (toast) ─────────────────────────────────────────────────────────

function showToast(msg: string, type: 'success' | 'error' | 'warning' | 'info' = 'info') {
  const colors: Record<string, string> = {
    success: 'var(--color-primary)',
    error: 'var(--color-error)',
    warning: 'var(--color-warning)',
    info: '#3b82f6',
  }
  const el = document.createElement('div')
  el.style.cssText = `position:fixed;top:12px;left:50%;transform:translateX(-50%);z-index:9999;padding:8px 16px;border-radius:var(--radius-md);background:var(--color-canvas-soft);border:1px solid ${colors[type]}30;color:var(--color-ink);font-size:12px;font-weight:500;font-family:var(--font-sans);box-shadow:0 4px 20px rgba(0,0,0,0.4);pointer-events:auto;`
  el.textContent = msg
  document.body.appendChild(el)
  setTimeout(() => {
    el.style.opacity = '0'
    el.style.transition = 'opacity 200ms'
    setTimeout(() => el.remove(), 200)
  }, 2500)
}

export const message = {
  success: (msg: string) => showToast(msg, 'success'),
  error: (msg: string) => showToast(msg, 'error'),
  warning: (msg: string) => showToast(msg, 'warning'),
  info: (msg: string) => showToast(msg, 'info'),
}

// ─── Spin ────────────────────────────────────────────────────────────────────

export function Spin({ children, spinning = true }: { children?: ReactNode; spinning?: boolean }) {
  if (!spinning) return React.createElement(React.Fragment, null, children)
  return React.createElement(
    'div',
    { className: 'relative' },
    children
      ? React.createElement('div', { className: 'opacity-40 pointer-events-none' }, children)
      : null,
    React.createElement(
      'div',
      { className: 'absolute inset-0 flex items-center justify-center' },
      React.createElement('div', {
        className:
          'w-5 h-5 border-2 border-(--color-primary) border-t-transparent rounded-full animate-spin',
      }),
    ),
  )
}

// ─── Divider ─────────────────────────────────────────────────────────────────

export function Divider({
  children,
  className = '',
}: {
  children?: ReactNode
  className?: string
}) {
  if (children) {
    return React.createElement(
      'div',
      { className: `flex items-center gap-3 my-3 ${className}` },
      React.createElement('div', { className: 'flex-1 h-px bg-(--color-hairline)' }),
      React.createElement('span', { className: 'text-[11px] text-(--color-mute)' }, children),
      React.createElement('div', { className: 'flex-1 h-px bg-(--color-hairline)' }),
    )
  }
  return React.createElement('div', {
    className: `h-px bg-(--color-hairline) my-3 ${className}`,
  })
}

// ─── Space ───────────────────────────────────────────────────────────────────

export function Space({
  children,
  direction = 'horizontal',
  size = 8,
  className = '',
  style,
}: {
  children: ReactNode
  direction?: 'horizontal' | 'vertical'
  size?: number | 'small' | 'middle' | 'large'
  className?: string
  style?: React.CSSProperties
}) {
  const gap = typeof size === 'number' ? size : { small: 8, middle: 16, large: 24 }[size]
  return React.createElement(
    'div',
    {
      className: `flex ${direction === 'vertical' ? 'flex-col' : 'flex-row items-center'} ${className}`,
      style: { gap, ...style },
    },
    children,
  )
}

// ─── Card ────────────────────────────────────────────────────────────────────

export function Card({
  children,
  title,
  extra,
  className = '',
  style,
  bordered = true,
}: {
  children?: ReactNode
  title?: ReactNode
  extra?: ReactNode
  className?: string
  style?: React.CSSProperties
  bordered?: boolean
}) {
  return React.createElement(
    'div',
    {
      className: `bg-(--color-canvas) rounded-md ${bordered ? 'border border-(--color-hairline)' : ''} ${className}`,
      style,
    },
    title || extra
      ? React.createElement(
          'div',
          {
            className:
              'flex items-center justify-between px-4 py-3 border-b border-(--color-hairline)',
          },
          React.createElement(
            'span',
            { className: 'text-sm font-semibold text-(--color-ink)' },
            title,
          ),
          extra,
        )
      : null,
    React.createElement('div', { className: 'p-4' }, children),
  )
}

// ─── Alert ───────────────────────────────────────────────────────────────────

export function Alert({
  message: msg,
  description,
  type = 'info',
  showIcon = true,
  closable,
  onClose,
  className = '',
}: {
  message: ReactNode
  description?: ReactNode
  type?: 'success' | 'info' | 'warning' | 'error'
  showIcon?: boolean
  closable?: boolean
  onClose?: () => void
  className?: string
}) {
  const [closed, setClosed] = useState(false)
  if (closed) return null

  const colors: Record<string, { bg: string; border: string; text: string; icon: string }> = {
    success: {
      bg: 'bg-(--color-primary)/10',
      border: 'border-(--color-primary)/20',
      text: 'text-(--color-primary)',
      icon: '✓',
    },
    info: { bg: 'bg-blue-500/10', border: 'border-blue-500/20', text: 'text-blue-400', icon: 'ℹ' },
    warning: {
      bg: 'bg-(--color-warning)/10',
      border: 'border-(--color-warning)/20',
      text: 'text-(--color-warning)',
      icon: '⚠',
    },
    error: {
      bg: 'bg-(--color-error)/10',
      border: 'border-(--color-error)/20',
      text: 'text-(--color-error)',
      icon: '✕',
    },
  }

  const c = colors[type]

  return React.createElement(
    'div',
    {
      className: `flex items-start gap-2 p-3 rounded-md border ${c.bg} ${c.border} ${className}`,
    },
    showIcon
      ? React.createElement('span', { className: `${c.text} shrink-0 text-sm mt-0.5` }, c.icon)
      : null,
    React.createElement(
      'div',
      { className: 'flex-1 min-w-0' },
      React.createElement('div', { className: `text-[12px] font-medium ${c.text}` }, msg),
      description
        ? React.createElement(
            'div',
            { className: 'text-[11px] text-(--color-body) mt-1' },
            description,
          )
        : null,
    ),
    closable
      ? React.createElement(
          'button',
          {
            type: 'button',
            onClick: () => {
              setClosed(true)
              onClose?.()
            },
            className:
              'bg-transparent border-none cursor-pointer text-(--color-mute) hover:text-(--color-ink) transition-colors p-0',
          },
          '✕',
        )
      : null,
  )
}

// ─── Checkbox ────────────────────────────────────────────────────────────────

export function Checkbox({
  checked,
  onChange,
  children,
  disabled,
  className = '',
}: {
  checked?: boolean
  onChange?: (e: { target: { checked: boolean } }) => void
  children?: ReactNode
  disabled?: boolean
  className?: string
}) {
  return React.createElement(
    'label',
    {
      className: `inline-flex items-center gap-2 cursor-pointer text-[13px] text-(--color-body) ${disabled ? 'opacity-50 cursor-not-allowed' : ''} ${className}`,
    },
    React.createElement('input', {
      type: 'checkbox',
      checked,
      onChange: (e: React.ChangeEvent<HTMLInputElement>) =>
        onChange?.({ target: { checked: e.target.checked } }),
      disabled,
      className: 'accent-(--color-primary) w-4 h-4 cursor-pointer',
    }),
    children,
  )
}

// ─── Radio ───────────────────────────────────────────────────────────────────

export function Radio({
  checked,
  onChange,
  children,
  value,
  disabled,
  className = '',
}: {
  checked?: boolean
  onChange?: (e: { target: { value: any } }) => void
  children?: ReactNode
  value?: any
  disabled?: boolean
  className?: string
}) {
  return React.createElement(
    'label',
    {
      className: `inline-flex items-center gap-2 cursor-pointer text-[13px] text-(--color-body) ${disabled ? 'opacity-50' : ''} ${className}`,
    },
    React.createElement('input', {
      type: 'radio',
      checked,
      onChange: () => onChange?.({ target: { value } }),
      disabled,
      className: 'accent-(--color-primary) w-4 h-4 cursor-pointer',
    }),
    children,
  )
}

Radio.Group = function RadioGroup({
  value: _value,
  onChange: _onChange,
  children,
  className = '',
}: {
  value?: any
  onChange?: (e: { target: { value: any } }) => void
  children: ReactNode
  className?: string
}) {
  return React.createElement('div', { className: `flex items-center gap-3 ${className}` }, children)
}

// ─── Tabs ────────────────────────────────────────────────────────────────────

export function Tabs({
  activeKey,
  onChange,
  items = [],
  className = '',
}: {
  activeKey?: string
  defaultActiveKey?: string
  onChange?: (key: string) => void
  items?: { key: string; label: ReactNode; children?: ReactNode }[]
  className?: string
}) {
  const [internalKey, setInternalKey] = useState(items[0]?.key || '')
  const current = activeKey ?? internalKey
  const activeItem = items.find((i) => i.key === current)

  return React.createElement(
    'div',
    { className },
    React.createElement(
      'div',
      { className: 'flex items-center border-b border-(--color-hairline) gap-0' },
      ...items.map((item) =>
        React.createElement(
          'button',
          {
            key: item.key,
            type: 'button',
            onClick: () => {
              onChange?.(item.key)
              setInternalKey(item.key)
            },
            className: `px-4 py-2.5 text-[12px] font-medium cursor-pointer transition-colors border-b-2 bg-transparent border-x-0 border-t-0 ${
              item.key === current
                ? 'text-(--color-primary) border-(--color-primary)'
                : 'text-(--color-mute) border-transparent hover:text-(--color-body)'
            }`,
          },
          item.label,
        ),
      ),
    ),
    activeItem?.children
      ? React.createElement('div', { className: 'py-3' }, activeItem.children)
      : null,
  )
}

// ─── Slider ──────────────────────────────────────────────────────────────────

export function Slider({
  value,
  onChange,
  min = 0,
  max = 100,
  step = 1,
  disabled,
  className = '',
}: {
  value?: number
  onChange?: (val: number) => void
  min?: number
  max?: number
  step?: number
  disabled?: boolean
  className?: string
}) {
  return React.createElement('input', {
    type: 'range',
    value: value ?? min,
    onChange: (e: React.ChangeEvent<HTMLInputElement>) => onChange?.(Number(e.target.value)),
    min,
    max,
    step,
    disabled,
    className: `w-full h-1 rounded-full appearance-none cursor-pointer accent-(--color-primary) bg-(--color-hairline) ${className}`,
  })
}

// ─── Collapse ────────────────────────────────────────────────────────────────

export function Collapse({
  items = [],
  defaultActiveKey = [],
  className = '',
}: {
  items?: { key: string; label: ReactNode; children: ReactNode }[]
  defaultActiveKey?: string[]
  className?: string
}) {
  const [activeKeys, setActiveKeys] = useState<string[]>(defaultActiveKey)

  const toggle = (key: string) => {
    setActiveKeys((prev) => (prev.includes(key) ? prev.filter((k) => k !== key) : [...prev, key]))
  }

  return React.createElement(
    'div',
    {
      className: `border border-(--color-hairline) rounded-md overflow-hidden ${className}`,
    },
    ...items.map((item, idx) =>
      React.createElement(
        'div',
        { key: item.key },
        React.createElement(
          'button',
          {
            type: 'button',
            onClick: () => toggle(item.key),
            className: `w-full flex items-center justify-between px-4 py-3 bg-transparent border-none cursor-pointer text-left text-[13px] font-medium text-(--color-ink) transition-colors hover:bg-(--color-bg-hover) ${
              idx > 0 ? 'border-t border-(--color-hairline)' : ''
            }`,
          },
          item.label,
          React.createElement(
            'span',
            {
              className: `text-(--color-mute) transition-transform ${activeKeys.includes(item.key) ? 'rotate-180' : ''}`,
            },
            '▾',
          ),
        ),
        activeKeys.includes(item.key)
          ? React.createElement(
              'div',
              {
                className:
                  'px-4 py-3 border-t border-(--color-hairline) text-[12px] text-(--color-body)',
              },
              item.children,
            )
          : null,
      ),
    ),
  )
}

// ─── Popover ─────────────────────────────────────────────────────────────────

export function Popover({
  content,
  title,
  children,
  trigger = 'click',
}: {
  content: ReactNode
  title?: ReactNode
  children: ReactNode
  trigger?: 'click' | 'hover'
}) {
  const [visible, setVisible] = useState(false)
  const ref = useRef<HTMLDivElement>(null)
  const hover = trigger === 'hover'

  return React.createElement(
    React.Fragment,
    null,
    React.createElement(
      'div',
      {
        ref,
        className: 'inline-flex',
        ...(hover
          ? { onMouseEnter: () => setVisible(true), onMouseLeave: () => setVisible(false) }
          : { onClick: () => setVisible((v) => !v) }),
      },
      children,
    ),
    React.createElement(
      FloatingPortal,
      {
        open: visible,
        anchorRef: ref,
        placement: 'top' as const,
        onDismiss: hover ? undefined : () => setVisible(false),
        onMouseEnter: hover ? () => setVisible(true) : undefined,
        onMouseLeave: hover ? () => setVisible(false) : undefined,
        className:
          'min-w-50 bg-(--color-canvas-soft) border border-(--color-hairline) rounded-md shadow-lg overflow-hidden',
      },
      title
        ? React.createElement(
            'div',
            {
              className:
                'px-3 py-2 border-b border-(--color-hairline) text-[12px] font-semibold text-(--color-ink)',
            },
            title,
          )
        : null,
      React.createElement(
        'div',
        { className: 'px-3 py-2 text-[12px] text-(--color-body)' },
        content,
      ),
    ),
  )
}

// ─── Drawer ──────────────────────────────────────────────────────────────────

export function Drawer({
  open,
  title,
  children,
  onClose,
  width = 360,
  placement = 'right',
}: {
  open?: boolean
  title?: ReactNode
  children?: ReactNode
  onClose?: () => void
  width?: number | string
  placement?: 'left' | 'right'
}) {
  if (!open) return null

  return React.createElement(
    'div',
    { className: 'fixed inset-0 z-[9997]' },
    React.createElement('div', {
      className: 'absolute inset-0 bg-black/50',
      onClick: onClose,
    }),
    React.createElement(
      'div',
      {
        className: `absolute top-0 bottom-0 bg-(--color-canvas) border-${placement === 'right' ? 'l' : 'r'} border-(--color-hairline) flex flex-col`,
        style: { width, [placement]: 0 },
      },
      title
        ? React.createElement(
            'div',
            {
              className:
                'flex items-center justify-between px-4 py-3 border-b border-(--color-hairline) shrink-0',
            },
            React.createElement(
              'span',
              { className: 'text-sm font-semibold text-(--color-ink)' },
              title,
            ),
            React.createElement(
              'button',
              {
                type: 'button',
                onClick: onClose,
                className:
                  'bg-transparent border-none cursor-pointer text-(--color-mute) hover:text-(--color-ink) transition-colors text-lg',
              },
              '✕',
            ),
          )
        : null,
      React.createElement('div', { className: 'flex-1 overflow-y-auto p-4' }, children),
    ),
  )
}

// ─── Dropdown ────────────────────────────────────────────────────────────────

export function Dropdown({
  children,
  menu,
}: {
  children: ReactNode
  menu?: { items?: { key: string; label: ReactNode; onClick?: () => void; danger?: boolean }[] }
}) {
  const [open, setOpen] = useState(false)
  const ref = useRef<HTMLDivElement>(null)

  return React.createElement(
    React.Fragment,
    null,
    React.createElement(
      'div',
      { ref, className: 'inline-flex', onClick: () => setOpen(!open) },
      children,
    ),
    React.createElement(
      FloatingPortal,
      {
        open: open && Boolean(menu?.items),
        anchorRef: ref,
        placement: 'bottom' as const,
        align: 'end' as const,
        onDismiss: () => setOpen(false),
        className:
          'min-w-35 bg-(--color-canvas-soft) border border-(--color-hairline) rounded-md shadow-lg py-1 overflow-hidden',
      },
      ...(menu?.items?.map((item) =>
        React.createElement(
          'button',
          {
            key: item.key,
            type: 'button',
            onClick: () => {
              item.onClick?.()
              setOpen(false)
            },
            className: `w-full text-left px-3 py-1.5 text-[12px] bg-transparent border-none cursor-pointer transition-colors ${
              item.danger
                ? 'text-(--color-error) hover:bg-(--color-error)/10'
                : 'text-(--color-body) hover:bg-(--color-bg-hover) hover:text-(--color-ink)'
            }`,
          },
          item.label,
        ),
      ) ?? []),
    ),
  )
}

// ─── ConfigProvider (no-op wrapper) ──────────────────────────────────────────

export function ConfigProvider({ children }: { children: ReactNode; [key: string]: any }) {
  return React.createElement(React.Fragment, null, children)
}

// ─── Typography ──────────────────────────────────────────────────────────────

export const Typography = {
  Title: ({
    children,
    level = 3,
    className = '',
  }: {
    children: ReactNode
    level?: number
    className?: string
  }) => {
    const sizes: Record<number, string> = {
      1: 'text-2xl',
      2: 'text-xl',
      3: 'text-lg',
      4: 'text-base',
      5: 'text-sm',
    }
    return React.createElement(
      `h${level}` as any,
      {
        className: `font-semibold text-(--color-ink) ${sizes[level] || 'text-base'} ${className}`,
      },
      children,
    )
  },
  Text: ({
    children,
    type,
    className = '',
  }: {
    children: ReactNode
    type?: 'secondary' | 'success' | 'warning' | 'danger'
    className?: string
  }) => {
    const colors: Record<string, string> = {
      secondary: 'text-(--color-body)',
      success: 'text-(--color-primary)',
      warning: 'text-(--color-warning)',
      danger: 'text-(--color-error)',
    }
    return React.createElement(
      'span',
      { className: `${colors[type || ''] || 'text-(--color-ink)'} ${className}` },
      children,
    )
  },
  Paragraph: ({ children, className = '' }: { children: ReactNode; className?: string }) => {
    return React.createElement(
      'p',
      { className: `text-sm text-(--color-body) leading-relaxed ${className}` },
      children,
    )
  },
}

// ─── theme (no-op) ───────────────────────────────────────────────────────────

export const theme = {
  darkAlgorithm: {},
  defaultAlgorithm: {},
  useToken: () => ({ token: {} }),
}

// ─── Empty ───────────────────────────────────────────────────────────────────

export function Empty({
  description,
  children,
  className = '',
}: {
  description?: ReactNode
  children?: ReactNode
  className?: string
}) {
  return React.createElement(
    'div',
    { className: `flex flex-col items-center justify-center py-8 ${className}` },
    React.createElement(
      'svg',
      {
        width: 64,
        height: 41,
        viewBox: '0 0 64 41',
        fill: 'none',
        className: 'mx-auto mb-3 opacity-25',
      },
      React.createElement('ellipse', {
        cx: 32,
        cy: 33,
        rx: 32,
        ry: 7,
        fill: 'var(--color-hairline)',
      }),
      React.createElement('path', {
        d: 'M55 12.76L44.854 1.258C44.367.474 43.656 0 42.907 0H21.093c-.749 0-1.46.474-1.947 1.257L9 12.761V22h46v-9.24z',
        fill: 'var(--color-canvas-soft)',
        stroke: 'var(--color-hairline)',
        strokeWidth: 1,
      }),
      React.createElement('path', {
        d: 'M41.613 15.931c0-1.605.994-2.93 2.227-2.931H55v18.137C55 33.26 53.68 35 52.05 35H11.95C10.32 35 9 33.259 9 31.137V13h11.16c1.233 0 2.227 1.323 2.227 2.928v.022c0 1.605 1.005 2.901 2.237 2.901h14.752c1.232 0 2.237-1.308 2.237-2.913v-.007z',
        fill: 'var(--color-canvas)',
        stroke: 'var(--color-hairline)',
        strokeWidth: 1,
      }),
    ),
    description !== null
      ? React.createElement(
          'div',
          { className: 'text-xs text-(--color-mute) mt-1' },
          description ?? 'No data',
        )
      : null,
    children ? React.createElement('div', { className: 'mt-3' }, children) : null,
  )
}

// ─── Progress ────────────────────────────────────────────────────────────────

export function Progress({
  percent = 0,
  size = 'default',
  status,
  showInfo = true,
  strokeColor,
  className = '',
}: {
  percent?: number
  size?: 'small' | 'default'
  status?: 'success' | 'exception' | 'active' | 'normal'
  showInfo?: boolean
  strokeColor?: string
  className?: string
}) {
  const clampedPercent = Math.min(100, Math.max(0, percent))
  const height = size === 'small' ? 'h-1' : 'h-2'

  let color = strokeColor || 'var(--color-primary)'
  if (status === 'exception') color = 'var(--color-error)'
  else if (status === 'success' || clampedPercent >= 100) color = '#22c55e'

  return React.createElement(
    'div',
    { className: `flex items-center gap-2 ${className}` },
    React.createElement(
      'div',
      {
        className: `flex-1 ${height} bg-(--color-canvas-soft) rounded-full overflow-hidden`,
      },
      React.createElement('div', {
        className: `h-full rounded-full transition-all duration-300 ${status === 'active' ? 'animate-pulse' : ''}`,
        style: { width: `${clampedPercent}%`, backgroundColor: color },
      }),
    ),
    showInfo
      ? React.createElement(
          'span',
          {
            className: 'text-[11px] font-medium shrink-0 tabular-nums',
            style: { color },
          },
          `${Math.round(clampedPercent)}%`,
        )
      : null,
  )
}

// ─── Avatar ──────────────────────────────────────────────────────────────────

export function Avatar({
  children,
  src,
  alt,
  size = 32,
  shape = 'circle',
  className = '',
  style,
}: {
  children?: ReactNode
  src?: string
  alt?: string
  size?: number
  shape?: 'circle' | 'square'
  className?: string
  style?: React.CSSProperties
}) {
  const radius = shape === 'circle' ? 'rounded-full' : 'rounded-sm'
  const fontSize = Math.max(12, size * 0.4)

  if (src) {
    return React.createElement('img', {
      src,
      alt: alt || '',
      style: { width: size, height: size, ...style },
      className: `${radius} object-cover shrink-0 ${className}`,
    })
  }

  return React.createElement(
    'div',
    {
      style: {
        width: size,
        height: size,
        fontSize,
        ...style,
      },
      className: `${radius} bg-(--color-primary)/20 text-(--color-primary) flex items-center justify-center font-semibold shrink-0 select-none ${className}`,
    },
    children,
  )
}

// ─── Badge ───────────────────────────────────────────────────────────────────

export function Badge({
  children,
  count,
  dot = false,
  color,
  overflowCount = 99,
  showZero = false,
  className = '',
}: {
  children?: ReactNode
  count?: number
  dot?: boolean
  color?: string
  overflowCount?: number
  showZero?: boolean
  className?: string
}) {
  const showBadge = dot || (count !== undefined && (count > 0 || showZero))
  const displayCount =
    count !== undefined && count > overflowCount ? `${overflowCount}+` : String(count ?? '')

  return React.createElement(
    'div',
    { className: `relative inline-flex ${className}` },
    children,
    showBadge
      ? React.createElement(
          dot ? 'span' : 'span',
          {
            className: dot
              ? 'absolute -top-0.5 -right-0.5 w-2 h-2 rounded-full'
              : 'absolute -top-1.5 -right-2 min-w-[18px] h-[18px] flex items-center justify-center rounded-full text-[10px] font-semibold text-white px-1 leading-none',
            style: { backgroundColor: color || 'var(--color-error)' },
          },
          dot ? null : displayCount,
        )
      : null,
  )
}

// ─── Skeleton ────────────────────────────────────────────────────────────────

export function Skeleton({
  active = true,
  avatar = false,
  title = true,
  paragraph = true,
  rows = 3,
  className = '',
}: {
  active?: boolean
  avatar?: boolean
  title?: boolean
  paragraph?: boolean
  rows?: number
  className?: string
}) {
  const pulse = active ? 'animate-pulse' : ''

  return React.createElement(
    'div',
    { className: `flex gap-3 ${className}` },
    avatar
      ? React.createElement('div', {
          className: `w-10 h-10 rounded-full bg-(--color-canvas-soft) shrink-0 ${pulse}`,
        })
      : null,
    React.createElement(
      'div',
      { className: 'flex-1 space-y-3' },
      title
        ? React.createElement('div', {
            className: `h-4 bg-(--color-canvas-soft) rounded w-2/5 ${pulse}`,
          })
        : null,
      paragraph
        ? React.createElement(
            'div',
            { className: 'space-y-2' },
            Array.from({ length: rows }).map((_, i) =>
              React.createElement('div', {
                key: i,
                className: `h-3 bg-(--color-canvas-soft) rounded ${pulse}`,
                style: { width: i === rows - 1 ? '60%' : '100%' },
              }),
            ),
          )
        : null,
    ),
  )
}

// ─── Table ───────────────────────────────────────────────────────────────────

export function Table({
  columns = [],
  dataSource = [],
  rowKey = 'key',
  size = 'middle',
  bordered = false,
  className = '',
}: {
  columns?: {
    title: ReactNode
    dataIndex?: string
    key?: string
    render?: (value: any, record: any, index: number) => ReactNode
    width?: number | string
    align?: 'left' | 'center' | 'right'
  }[]
  dataSource?: any[]
  rowKey?: string | ((record: any) => string)
  size?: 'small' | 'middle'
  bordered?: boolean
  className?: string
}) {
  const cellPadding = size === 'small' ? 'px-3 py-1.5' : 'px-4 py-2.5'
  const borderClass = bordered ? 'border border-(--color-hairline)' : ''

  const getRowKey = (record: any, index: number): string => {
    if (typeof rowKey === 'function') return rowKey(record)
    return record[rowKey] ?? String(index)
  }

  return React.createElement(
    'div',
    { className: `overflow-x-auto rounded-md ${borderClass} ${className}` },
    React.createElement(
      'table',
      { className: 'w-full text-left border-collapse' },
      React.createElement(
        'thead',
        null,
        React.createElement(
          'tr',
          { className: 'border-b border-(--color-hairline) bg-(--color-canvas-soft)' },
          columns.map((col, i) =>
            React.createElement(
              'th',
              {
                key: col.key || col.dataIndex || i,
                className: `${cellPadding} text-[11px] font-semibold uppercase tracking-wider text-(--color-mute) whitespace-nowrap`,
                style: {
                  width: col.width,
                  textAlign: col.align || 'left',
                },
              },
              col.title,
            ),
          ),
        ),
      ),
      React.createElement(
        'tbody',
        null,
        dataSource.length === 0
          ? React.createElement(
              'tr',
              null,
              React.createElement(
                'td',
                {
                  colSpan: columns.length,
                  className: `${cellPadding} text-center text-xs text-(--color-mute) py-8`,
                },
                'No data',
              ),
            )
          : dataSource.map((record, rowIndex) =>
              React.createElement(
                'tr',
                {
                  key: getRowKey(record, rowIndex),
                  className:
                    'border-b border-(--color-hairline) last:border-b-0 transition-colors hover:bg-(--color-bg-hover)',
                },
                columns.map((col, colIndex) => {
                  const value = col.dataIndex ? record[col.dataIndex] : undefined
                  return React.createElement(
                    'td',
                    {
                      key: col.key || col.dataIndex || colIndex,
                      className: `${cellPadding} text-sm text-(--color-body)`,
                      style: { textAlign: col.align || 'left' },
                    },
                    col.render ? col.render(value, record, rowIndex) : value,
                  )
                }),
              ),
            ),
      ),
    ),
  )
}

// ─── Timeline ────────────────────────────────────────────────────────────────

export function Timeline({
  items = [],
  className = '',
}: {
  items?: { children: ReactNode; color?: string; dot?: ReactNode }[]
  className?: string
}) {
  return React.createElement(
    'div',
    { className: `flex flex-col ${className}` },
    items.map((item, i) =>
      React.createElement(
        'div',
        { key: i, className: 'flex gap-3' },
        React.createElement(
          'div',
          { className: 'flex flex-col items-center' },
          item.dot ||
            React.createElement('div', {
              className: 'w-2.5 h-2.5 rounded-full shrink-0 mt-1.5',
              style: { backgroundColor: item.color || 'var(--color-primary)' },
            }),
          i < items.length - 1
            ? React.createElement('div', {
                className: 'w-px flex-1 bg-(--color-hairline) my-1',
              })
            : null,
        ),
        React.createElement(
          'div',
          {
            className: `pb-4 text-sm text-(--color-body) ${i === items.length - 1 ? '' : ''}`,
          },
          item.children,
        ),
      ),
    ),
  )
}

// ─── Segmented ───────────────────────────────────────────────────────────────

export function Segmented({
  options = [],
  value,
  onChange,
  size = 'middle',
  block = false,
  className = '',
}: {
  options?: (string | { label: ReactNode; value: string })[]
  value?: string
  onChange?: (val: string) => void
  size?: 'small' | 'middle' | 'large'
  block?: boolean
  className?: string
}) {
  const sizeH: Record<string, string> = {
    small: 'text-[11px] px-2.5 py-1',
    middle: 'text-[12px] px-3 py-1.5',
    large: 'text-[13px] px-4 py-2',
  }

  return React.createElement(
    'div',
    {
      className: `inline-flex p-0.5 bg-(--color-canvas-soft) rounded-md border border-(--color-hairline) ${block ? 'w-full' : ''} ${className}`,
    },
    options.map((opt) => {
      const optValue = typeof opt === 'string' ? opt : opt.value
      const optLabel = typeof opt === 'string' ? opt : opt.label
      const isActive = value === optValue

      return React.createElement(
        'button',
        {
          key: optValue,
          type: 'button',
          onClick: () => onChange?.(optValue),
          className: `${sizeH[size]} font-medium rounded-sm border-none cursor-pointer transition-all ${
            block ? 'flex-1' : ''
          } ${
            isActive
              ? 'bg-(--color-canvas) text-(--color-ink) shadow-sm'
              : 'bg-transparent text-(--color-mute) hover:text-(--color-body)'
          }`,
        },
        optLabel,
      )
    }),
  )
}
