// Head data for a published menu (SPEC §12.7): title, description, link
// preview image and JSON-LD FoodEstablishment with hours and the menu.
import { translate, type Locale } from './i18n'
import { instagramLink } from './links'
import type { PublicMenu } from './types'

const SCHEMA_DAYS = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday']

export type MenuSeo = {
  title: string
  description: string
  // Cover 1600, else logo 512, else none.
  image: string | null
  twitterCard: 'summary_large_image' | 'summary'
  jsonLd: Record<string, unknown>
}

const clip = (text: string, max: number) =>
  text.length <= max ? text : `${text.slice(0, max - 1).trimEnd()}…`

export const menuSeo = (menu: PublicMenu, canonicalUrl: string, locale: Locale): MenuSeo => {
  const { shop } = menu
  const description = clip(
    shop.description ??
      translate(locale, 'description', {
        name: shop.name,
        categories: menu.categories.map((c) => c.name).join(', '),
      }),
    200,
  )
  const image = shop.cover?.url_large ?? shop.logo?.url_large ?? null
  const jsonLd: Record<string, unknown> = {
    '@context': 'https://schema.org',
    '@type': 'FoodEstablishment',
    name: shop.name,
    url: canonicalUrl,
    ...(shop.description ? { description: shop.description } : {}),
    ...(image ? { image } : {}),
    ...(shop.address
      ? { address: { '@type': 'PostalAddress', streetAddress: shop.address, addressCountry: 'ID' } }
      : {}),
    ...(shop.instagram ? { sameAs: [instagramLink(shop.instagram)] } : {}),
    ...(shop.maps_url ? { hasMap: shop.maps_url } : {}),
    currenciesAccepted: 'IDR',
    openingHoursSpecification: shop.hours.map((h) => ({
      '@type': 'OpeningHoursSpecification',
      dayOfWeek: `https://schema.org/${SCHEMA_DAYS[h.weekday - 1] ?? 'Monday'}`,
      opens: h.opens,
      closes: h.closes,
    })),
    hasMenu: {
      '@type': 'Menu',
      name: translate(locale, 'title', { name: shop.name }),
      hasMenuSection: menu.categories.map((c) => ({
        '@type': 'MenuSection',
        name: c.name,
        hasMenuItem: c.items.map((i) => ({
          '@type': 'MenuItem',
          name: i.name,
          ...(i.photo ? { image: i.photo.url_large } : {}),
          offers: {
            '@type': 'Offer',
            price: String(i.price),
            priceCurrency: 'IDR',
            availability: i.sold_out ? 'https://schema.org/OutOfStock' : 'https://schema.org/InStock',
          },
        })),
      })),
    },
  }
  return {
    title: translate(locale, 'title', { name: shop.name }),
    description,
    image,
    twitterCard: shop.cover ? 'summary_large_image' : 'summary',
    jsonLd,
  }
}

// Safe inside <script type="application/ld+json">: no "</script>" can close it.
export const jsonLdString = (data: Record<string, unknown>): string =>
  JSON.stringify(data).replace(/</g, '\\u003c').replace(/>/g, '\\u003e').replace(/&/g, '\\u0026')
