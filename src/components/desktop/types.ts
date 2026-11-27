export interface AppItem {
  id: string
  name: string
  description: string
  icon: string
  /** Contents of icon.svg, drawn instead of `icon` when valid. */
  iconSvg?: string | null
  version: string
  enabled: boolean
  /** Marketplace it was installed from (`nonladesk market install`); none for local apps. */
  market?: string | null
  /** Installed as its own macOS app: opening it launches that app. */
  standalone?: boolean
}
