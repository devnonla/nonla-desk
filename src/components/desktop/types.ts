export interface AppItem {
  id: string
  name: string
  description: string
  icon: string
  /** Contents of icon.svg, drawn instead of `icon` when valid. */
  iconSvg?: string | null
  version: string
  enabled: boolean
}
