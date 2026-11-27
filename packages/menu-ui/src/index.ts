// @zurupos/menu-ui: the online menu page (SPEC §12.7, D-082).
export { default as MenuPage } from './components/MenuPage.vue'
export { accentColors, contrast, type AccentColors } from './accent'
export { formatIdr } from './format'
export { pickLocale, translate, type Locale, type MessageKey } from './i18n'
export { todayLine, weekdayIn, formatRange } from './hours'
export { jsonLdString, menuSeo, type MenuSeo } from './seo'
export { TEMPLATES, TEMPLATE_TOKENS, pageStyle, type Template } from './templates'
export type * from './types'
