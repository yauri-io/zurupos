// Templates are style tokens on one fixed layout (D-082): switching template can
// never drop content. Each sets its own light background; no dark mode in v1.
import { accentColors } from './accent'

export const TEMPLATES = ['foto', 'papan', 'hangat'] as const
export type Template = (typeof TEMPLATES)[number]

export type TemplateTokens = {
  bg: string
  surface: string
  text: string
  muted: string
  line: string
  radius: string
  font: string
  headingFont: string
}

export const TEMPLATE_TOKENS: Record<Template, TemplateTokens> = {
  // Photo-led cards in a grid.
  foto: {
    bg: '#f5f3f0',
    surface: '#ffffff',
    text: '#1c1917',
    muted: '#5f5750',
    line: '#e4dfd8',
    radius: '14px',
    font: 'system-ui, -apple-system, "Segoe UI", Roboto, sans-serif',
    headingFont: 'system-ui, -apple-system, "Segoe UI", Roboto, sans-serif',
  },
  // A clean text list like a chalkboard menu; good without photos.
  papan: {
    bg: '#fbfaf7',
    surface: '#fbfaf7',
    text: '#1f1f1f',
    muted: '#5e5e5e',
    line: '#d9d6cf',
    radius: '4px',
    font: 'system-ui, -apple-system, "Segoe UI", Roboto, sans-serif',
    headingFont: 'Georgia, "Times New Roman", serif',
  },
  // Soft, rounded and warm.
  hangat: {
    bg: '#fff4e6',
    surface: '#fffaf3',
    text: '#3b2a1e',
    muted: '#6e5442',
    line: '#f0dcc4',
    radius: '20px',
    font: 'ui-rounded, "SF Pro Rounded", system-ui, -apple-system, "Segoe UI", Roboto, sans-serif',
    headingFont: 'ui-rounded, "SF Pro Rounded", system-ui, -apple-system, "Segoe UI", Roboto, sans-serif',
  },
}

export const isTemplate = (value: string): value is Template =>
  (TEMPLATES as readonly string[]).includes(value)

// CSS custom properties for the page root.
export const pageStyle = (template: Template, accent: string): Record<string, string> => {
  const t = TEMPLATE_TOKENS[template]
  const colors = accentColors(accent, t.bg)
  return {
    '--zm-bg': t.bg,
    '--zm-surface': t.surface,
    '--zm-text': t.text,
    '--zm-muted': t.muted,
    '--zm-line': t.line,
    '--zm-radius': t.radius,
    '--zm-font': t.font,
    '--zm-heading-font': t.headingFont,
    '--zm-accent': colors.accent,
    '--zm-on-accent': colors.on_accent,
    '--zm-accent-text': colors.accent_text,
  }
}
