/**
 * Mini apps are eval'd at runtime from ~/.nonla-desk/apps/.
 * Tailwind never sees those files, so any class not present in the
 * renderer source is silently missing. Keep the allowed set here.
 *
 * Do not delete unused-looking classes — they exist for MCP-generated apps.
 */
export const MINIAPP_TAILWIND_SAFELIST = [
  // spacing
  'p-0 p-0.5 p-1 p-1.5 p-2 p-2.5 p-3 p-4 p-5 p-6 p-8 p-10 p-12',
  'px-0 px-1 px-1.5 px-2 px-2.5 px-3 px-4 px-5 px-6 px-8',
  'py-0 py-0.5 py-1 py-1.5 py-2 py-2.5 py-3 py-4 py-5 py-6 py-8',
  'pt-0 pt-1 pt-2 pt-3 pt-4 pt-5 pt-6 pb-0 pb-1 pb-2 pb-3 pb-4 pb-5 pb-6',
  'pl-0 pl-1 pl-2 pl-3 pl-4 pr-0 pr-1 pr-2 pr-3 pr-4',
  'm-0 m-1 m-2 m-3 m-4 m-6 mx-auto mx-0 mx-2 mx-4 my-0 my-1 my-2 my-3 my-4',
  'mt-0 mt-1 mt-1.5 mt-2 mt-3 mt-4 mt-6 mb-0 mb-1 mb-2 mb-3 mb-4 mb-6',
  'ml-0 ml-1 ml-2 ml-auto mr-0 mr-1 mr-2',
  'gap-0 gap-0.5 gap-1 gap-1.5 gap-2 gap-2.5 gap-3 gap-4 gap-5 gap-6 gap-8',
  'gap-x-1 gap-x-2 gap-x-3 gap-x-4 gap-y-1 gap-y-2 gap-y-3 gap-y-4',

  // layout
  'flex flex-col flex-row flex-wrap flex-1 grow shrink-0',
  'items-start items-center items-end items-baseline items-stretch',
  'justify-start justify-center justify-between justify-end justify-around',
  'grid grid-cols-1 grid-cols-2 grid-cols-3 md:grid-cols-2',
  'w-full h-full min-h-0 min-w-0 max-w-xl max-w-2xl w-fit',
  'w-3 w-3.5 w-4 w-5 w-6 w-7 w-8 w-9 w-10 w-12',
  'h-1 h-1.5 h-3 h-3.5 h-4 h-5 h-6 h-7 h-8 h-9 h-10 h-12',
  'overflow-hidden overflow-y-auto overflow-x-auto overflow-visible',
  'relative absolute inset-0 block inline-flex hidden truncate',
  'min-h-[240px]',

  // type
  'text-xs text-sm text-base font-medium font-semibold font-bold font-mono',
  'leading-none leading-tight leading-relaxed tabular-nums break-all line-through',
  'text-left text-right text-center',
  'text-[9px] text-[10px] text-[11px] text-[12px] text-[13px] text-[15px] text-[22px]',

  // compiled token shorthand (the form the host actually emits)
  'bg-(--color-canvas) bg-(--color-canvas-soft) bg-(--color-primary) bg-(--color-bg-hover)',
  'text-(--color-ink) text-(--color-ink-strong) text-(--color-body) text-(--color-mute)',
  'text-(--color-primary) text-(--color-on-primary) text-(--color-error) text-(--color-warning) text-(--color-success)',
  'border-(--color-hairline) border-(--color-primary) border-(--color-error)',
  'bg-(--color-primary)/5 bg-(--color-primary)/10 bg-(--color-primary)/20',
  'border-(--color-primary)/20 border-(--color-primary)/30',
  'hover:bg-(--color-bg-hover) hover:text-(--color-ink) hover:text-(--color-primary) hover:text-(--color-error)',
  'hover:opacity-90 hover:border-(--color-primary)',

  // legacy arbitrary var() form — existing mini apps still use this
  'bg-[var(--color-canvas)] bg-[var(--color-canvas-soft)] bg-[var(--color-primary)]',
  'text-[var(--color-ink)] text-[var(--color-ink-strong)] text-[var(--color-body)] text-[var(--color-mute)]',
  'text-[var(--color-primary)] text-[var(--color-on-primary)] text-[var(--color-error)] text-[var(--color-warning)]',
  'border-[var(--color-hairline)] border-[var(--color-primary)]',
  'bg-[var(--color-primary)]/5 bg-[var(--color-primary)]/10',
  'border-[var(--color-primary)]/20 border-[var(--color-primary)]/30',
  'rounded-[var(--radius-xs)] rounded-[var(--radius-sm)] rounded-[var(--radius-md)] rounded-[var(--radius-pill)]',

  // chrome
  'rounded-xs rounded-sm rounded-md rounded-lg rounded-full',
  'border border-none border-solid border-b border-t',
  'cursor-pointer select-none outline-none',
  'opacity-0 opacity-50 opacity-100',
  'transition-all transition-colors duration-150 duration-500',
  'group group-hover:opacity-100',
].join(' ')
