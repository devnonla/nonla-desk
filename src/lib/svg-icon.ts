/**
 * Inline SVG icons for mini apps (same rules as open-agent-hands tool icons).
 * The Rust side validates on write; this re-checks before anything is drawn.
 */
const MAX_LENGTH = 8000
const SVG_NS = 'http://www.w3.org/2000/svg'
const UNSAFE_TAGS = new Set(['script', 'foreignobject', 'iframe', 'image', 'style'])

function withNamespace(svg: string): string {
  const openTag = svg.slice(0, svg.indexOf('>'))
  return /\sxmlns\s*=/.test(openTag) ? svg : svg.replace(/^<svg/i, `<svg xmlns="${SVG_NS}"`)
}

export function parseSvgIcon(icon?: string | null): SVGSVGElement | null {
  const raw = icon?.trim()
  if (!raw || raw.length > MAX_LENGTH || !/^<svg[\s>]/i.test(raw) || !/<\/svg>$/i.test(raw)) {
    return null
  }
  const doc = new DOMParser().parseFromString(withNamespace(raw), 'image/svg+xml')
  const root = doc.documentElement
  if (
    doc.getElementsByTagName('parsererror').length > 0 ||
    root.namespaceURI !== SVG_NS ||
    root.localName !== 'svg' ||
    !root.getAttribute('viewBox')
  ) {
    return null
  }
  for (const el of [root, ...Array.from(root.querySelectorAll('*'))]) {
    if (UNSAFE_TAGS.has(el.localName.toLowerCase())) return null
    for (const attr of Array.from(el.attributes)) {
      const name = attr.name.toLowerCase()
      if (
        name.startsWith('on') ||
        ((name === 'href' || name === 'xlink:href') && !attr.value.startsWith('#')) ||
        /javascript:/i.test(attr.value)
      ) {
        return null
      }
    }
  }
  return root as unknown as SVGSVGElement
}

/** Clone for the page: prefix ids so gradients in two icons never clash, fill the box. */
export function prepareSvgIcon(svg: SVGSVGElement, idPrefix: string): SVGSVGElement {
  const node = document.importNode(svg, true)
  const ids = new Map<string, string>()
  for (const el of Array.from(node.querySelectorAll('[id]'))) {
    const next = `${idPrefix}-${el.id}`
    ids.set(el.id, next)
    el.id = next
  }
  if (ids.size > 0) {
    for (const el of [node, ...Array.from(node.querySelectorAll('*'))]) {
      for (const attr of Array.from(el.attributes)) {
        let value = attr.value.replace(/url\(\s*['"]?#([^'")\s]+)['"]?\s*\)/g, (m, id) =>
          ids.has(id) ? `url(#${ids.get(id)})` : m,
        )
        if (
          (attr.name === 'href' || attr.name === 'xlink:href') &&
          value.startsWith('#') &&
          ids.has(value.slice(1))
        ) {
          value = `#${ids.get(value.slice(1))}`
        }
        if (value !== attr.value) el.setAttributeNS(attr.namespaceURI, attr.name, value)
      }
    }
  }
  node.setAttribute('width', '100%')
  node.setAttribute('height', '100%')
  node.setAttribute('aria-hidden', 'true')
  node.setAttribute('focusable', 'false')
  return node
}
