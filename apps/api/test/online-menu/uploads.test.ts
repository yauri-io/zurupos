// Online menu uploads (SPEC §12.7, D-079): 2 MB limit, decode check, EXIF
// rotation and no metadata, no upscaling, objects deleted after commit and
// kept when the transaction fails, and the gallery limit under parallel uploads.
import sharp from 'sharp'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { createTestApp, expectStatus, type TestApp } from '../support/app.js'
import { GPS_MARKER, CAMERA_MARKER, notAnImage, phonePhoto, solidImage } from '../support/images.js'
import { api, createCategory, createItem } from '../support/menu.js'
import { keyOfUrl, objectExists, recordingStore, upload, type RecordingStore } from '../support/media.js'
import { appPool, inTx } from '../support/pg.js'
import { roleShop, type RoleShop } from '../support/roles.js'

let t: TestApp
let shop: RoleShop
let store: RecordingStore
const pool = appPool(1)
let jpeg: Buffer

type Img = { url_small: string; url_large: string; width: number; height: number }
type Menu = { logo: Img | null; cover: Img | null; gallery: { id: string; image: Img }[] }
type Item = { id: string; photo: Img | null }

beforeAll(async () => {
  store = recordingStore()
  t = await createTestApp({ media: store })
  shop = await roleShop(t.app, 'omuploads')
  jpeg = await solidImage(1600, 1200)
})
afterAll(async () => {
  await t.close()
  await pool.end()
})

const newItem = async () => {
  const cat = await createCategory(t.app, shop.as.owner, `C ${Math.random().toString(36).slice(2, 8)}`)
  return createItem(t.app, shop.as.owner, cat.id, 'Kopi Susu')
}
const keysOf = (img: Img) => [keyOfUrl(img.url_small), keyOfUrl(img.url_large)]
const mediaRows = (keys: string[]) =>
  inTx(pool, shop.tenantId, async (c) => {
    const storageKeys = keys.map((k) => k.slice(2, 34))
    const { rows } = await c.query<{ n: string }>(
      'select count(*)::text as n from media where storage_key = any($1)',
      [storageKeys],
    )
    return Number(rows[0]?.n)
  })

describe('upload checks', () => {
  it('over 2 MB → 413 FILE_TOO_LARGE, nothing stored', async () => {
    const item = await newItem()
    const puts = store.puts.length
    const big = Buffer.concat([jpeg, Buffer.alloc(2 * 1024 * 1024 + 1 - jpeg.length, 0)])
    const res = await upload(t.app, shop.as.owner, 'PUT', `/v1/items/${item.id}/photo`, big)
    expect(res.statusCode).toBe(413)
    expect(res.json()).toMatchObject({ error: { code: 'FILE_TOO_LARGE' } })
    expect(store.puts.length).toBe(puts)
  })

  it('a photo just under 2 MB is accepted', async () => {
    const noisy = await sharp({
      create: {
        width: 1700,
        height: 1200,
        channels: 3,
        background: '#808080',
        noise: { type: 'gaussian', mean: 128, sigma: 40 },
      },
    })
      .jpeg({ quality: 92 })
      .toBuffer()
    expect(noisy.length).toBeGreaterThan(1024 * 1024)
    expect(noisy.length).toBeLessThanOrEqual(2 * 1024 * 1024)
    const item = await newItem()
    expectStatus(await upload(t.app, shop.as.owner, 'PUT', `/v1/items/${item.id}/photo`, noisy), 200)
  })

  it('a text file renamed to .jpg is rejected and nothing is stored', async () => {
    const item = await newItem()
    const puts = store.puts.length
    const res = await upload(t.app, shop.as.owner, 'PUT', `/v1/items/${item.id}/photo`, notAnImage(), {
      filename: 'kopi.jpg',
      contentType: 'image/jpeg',
    })
    expect(res.statusCode).toBe(400)
    expect(res.json()).toMatchObject({ error: { code: 'VALIDATION', details: { reason: 'not_an_image' } } })
    expect(store.puts.length).toBe(puts)
  })

  it('a missing file part, a wrong field name or a JSON body is a validation error', async () => {
    const item = await newItem()
    const url = `/v1/items/${item.id}/photo`
    expect((await upload(t.app, shop.as.owner, 'PUT', url, jpeg, { field: 'photo' })).statusCode).toBe(400)
    expect((await api(t.app, shop.as.owner, 'PUT', url, { file: 'x' })).statusCode).toBe(400)
  })
})

describe('what gets stored', () => {
  it('EXIF orientation applied; GPS and camera tags gone from every variant', async () => {
    const item = await newItem()
    const res = expectStatus(
      await upload(t.app, shop.as.owner, 'PUT', `/v1/items/${item.id}/photo`, await phonePhoto()),
      200,
    )
    const photo = res.json<Item>().photo
    if (!photo) throw new Error('no photo')
    expect({ width: photo.width, height: photo.height }).toEqual({ width: 100, height: 200 })
    for (const url of [photo.url_small, photo.url_large]) {
      // Served by the API's /media route, as R2 would serve it.
      const served = await t.app.inject({ method: 'GET', url: new URL(url).pathname })
      expect(served.statusCode).toBe(200)
      expect(served.headers['content-type']).toBe('image/webp')
      expect(served.headers['cache-control']).toBe('public, max-age=31536000, immutable')
      expect(served.headers['cross-origin-resource-policy']).toBe('cross-origin')
      const body = served.rawPayload
      const meta = await sharp(body).metadata()
      expect({
        format: meta.format,
        w: meta.width,
        h: meta.height,
        exif: meta.exif,
        orientation: meta.orientation,
      }).toEqual({
        format: 'webp',
        w: 100,
        h: 200,
        exif: undefined,
        orientation: undefined,
      })
      expect(body.includes(GPS_MARKER)).toBe(false)
      expect(body.includes(CAMERA_MARKER)).toBe(false)
    }
  })

  it('variants per purpose and no upscaling', async () => {
    const cover = expectStatus(
      await upload(t.app, shop.as.owner, 'PUT', '/v1/online-menu/cover', await solidImage(300, 200)),
      200,
    ).json<Menu>().cover
    expect(cover).toMatchObject({ width: 300, height: 200 })
    expect(cover?.url_small).toMatch(/-800\.webp$/)
    expect(cover?.url_large).toMatch(/-1600\.webp$/)
    const logo = expectStatus(
      await upload(t.app, shop.as.owner, 'PUT', '/v1/online-menu/logo', await solidImage(2000, 2000, 'png')),
      200,
    ).json<Menu>().logo
    expect(logo).toMatchObject({ width: 512, height: 512 })
    expect(logo?.url_small).toMatch(/-128\.webp$/)
    for (const img of [cover, logo])
      for (const key of keysOf(img as Img)) expect(await objectExists(key)).toBe(true)
  })

  it('object keys never contain the tenant or item id', async () => {
    const item = await newItem()
    const photo = expectStatus(
      await upload(t.app, shop.as.owner, 'PUT', `/v1/items/${item.id}/photo`, jpeg),
      200,
    ).json<Item>().photo as Img
    for (const url of [photo.url_small, photo.url_large]) {
      expect(url).not.toContain(shop.tenantId)
      expect(url).not.toContain(item.id)
      expect(url).toMatch(/\/m\/[0-9a-f]{32}-(480|1200)\.webp$/)
    }
  })

  it('the local /media route serves only well-formed keys', async () => {
    for (const path of [
      '/media/m/..%2F..%2Fetc%2Fpasswd',
      '/media/m/abc.webp',
      `/media/m/${'0'.repeat(32)}-480.webp`,
    ]) {
      expect((await t.app.inject({ method: 'GET', url: path })).statusCode, path).toBe(404)
    }
  })
})

describe('replacing and removing', () => {
  it("a replaced photo's objects and media row are deleted after commit", async () => {
    const item = await newItem()
    const url = `/v1/items/${item.id}/photo`
    const first = expectStatus(await upload(t.app, shop.as.owner, 'PUT', url, jpeg), 200).json<Item>()
      .photo as Img
    const second = expectStatus(
      await upload(t.app, shop.as.owner, 'PUT', url, await solidImage(800, 800)),
      200,
    ).json<Item>().photo as Img
    for (const key of keysOf(first)) expect(await objectExists(key), key).toBe(false)
    for (const key of keysOf(second)) expect(await objectExists(key), key).toBe(true)
    expect(await mediaRows(keysOf(first))).toBe(0)
    expect(await mediaRows(keysOf(second))).toBe(1)
  })

  it('when the transaction fails, the existing photo is kept and the new objects are deleted', async () => {
    const item = await newItem()
    const url = `/v1/items/${item.id}/photo`
    const kept = expectStatus(await upload(t.app, shop.as.owner, 'PUT', url, jpeg), 200).json<Item>()
      .photo as Img
    // Archived items keep their photo but can't be changed: the transaction fails.
    expectStatus(await api(t.app, shop.as.owner, 'DELETE', `/v1/items/${item.id}`), 204)
    const puts = store.puts.length
    const res = await upload(t.app, shop.as.owner, 'PUT', url, await solidImage(640, 640))
    expect(res.statusCode).toBe(404)
    const attempted = store.puts.slice(puts)
    expect(attempted).toHaveLength(2)
    for (const key of attempted) expect(await objectExists(key), key).toBe(false)
    for (const key of keysOf(kept)) expect(await objectExists(key), key).toBe(true)
    expect(await mediaRows(keysOf(kept))).toBe(1)
  })

  it('DELETE /items/:id/photo removes the photo, its row and its objects', async () => {
    const item = await newItem()
    const url = `/v1/items/${item.id}/photo`
    const photo = expectStatus(await upload(t.app, shop.as.owner, 'PUT', url, jpeg), 200).json<Item>()
      .photo as Img
    const res = expectStatus(await api(t.app, shop.as.owner, 'DELETE', url), 200).json<Item>()
    expect(res.photo).toBeNull()
    for (const key of keysOf(photo)) expect(await objectExists(key)).toBe(false)
    expect(await mediaRows(keysOf(photo))).toBe(0)
    // Deleting again is fine.
    expectStatus(await api(t.app, shop.as.owner, 'DELETE', url), 200)
  })

  it('logo and cover can be replaced and removed', async () => {
    for (const slot of ['logo', 'cover'] as const) {
      const one = expectStatus(
        await upload(t.app, shop.as.owner, 'PUT', `/v1/online-menu/${slot}`, jpeg),
        200,
      ).json<Menu>()[slot] as Img
      const two = expectStatus(
        await upload(t.app, shop.as.owner, 'PUT', `/v1/online-menu/${slot}`, await solidImage(900, 600)),
        200,
      ).json<Menu>()[slot] as Img
      for (const key of keysOf(one)) expect(await objectExists(key)).toBe(false)
      const gone = expectStatus(
        await api(t.app, shop.as.owner, 'DELETE', `/v1/online-menu/${slot}`),
        200,
      ).json<Menu>()
      expect(gone[slot]).toBeNull()
      for (const key of keysOf(two)) expect(await objectExists(key)).toBe(false)
    }
  })

  it('a failed object delete after commit only leaves an orphan', async () => {
    let failDeletes = false
    const flaky = recordingStore({ failDelete: () => failDeletes })
    const app2 = await createTestApp({ media: flaky })
    try {
      const own = await roleShop(app2.app, 'omflaky')
      const cat = await createCategory(app2.app, own.as.owner, 'K')
      const item = await createItem(app2.app, own.as.owner, cat.id)
      const url = `/v1/items/${item.id}/photo`
      expectStatus(await upload(app2.app, own.as.owner, 'PUT', url, jpeg), 200)
      failDeletes = true
      const res = await upload(app2.app, own.as.owner, 'PUT', url, await solidImage(500, 500))
      expect(res.statusCode).toBe(200)
      expect(res.json<Item>().photo).not.toBeNull()
    } finally {
      await app2.close()
    }
  })

  it('a failed object put stores nothing in the database', async () => {
    let calls = 0
    const failing = recordingStore({ failPut: () => ++calls === 2 })
    const app2 = await createTestApp({ media: failing })
    try {
      const own = await roleShop(app2.app, 'omfailput')
      const res = await upload(app2.app, own.as.owner, 'PUT', '/v1/online-menu/cover', jpeg)
      expect(res.statusCode).toBe(500)
      // The variant that did get written was removed again.
      for (const key of failing.puts) expect(await objectExists(key)).toBe(false)
      const menu = expectStatus(await api(app2.app, own.as.owner, 'GET', '/v1/online-menu'), 200).json<Menu>()
      expect(menu.cover).toBeNull()
    } finally {
      await app2.close()
    }
  })
})

describe('gallery', () => {
  it('up to 6 photos in upload order; the 7th is 409 gallery_limit and leaves no objects', async () => {
    const own = await roleShop(t.app, 'omgallery')
    const ids: string[] = []
    for (let i = 0; i < 6; i++) {
      const menu = expectStatus(
        await upload(t.app, own.as.owner, 'POST', '/v1/online-menu/gallery', jpeg),
        201,
      ).json<Menu>()
      ids.push(menu.gallery[menu.gallery.length - 1]?.id ?? '')
    }
    const menu = expectStatus(await api(t.app, own.as.owner, 'GET', '/v1/online-menu'), 200).json<Menu>()
    expect(menu.gallery.map((g) => g.id)).toEqual(ids)
    const puts = store.puts.length
    const res = await upload(t.app, own.as.owner, 'POST', '/v1/online-menu/gallery', jpeg)
    expect(res.statusCode).toBe(409)
    expect(res.json()).toMatchObject({ error: { code: 'CONFLICT', details: { reason: 'gallery_limit' } } })
    for (const key of store.puts.slice(puts)) expect(await objectExists(key)).toBe(false)
    // Deleting one makes room again.
    const removed = menu.gallery[2]
    if (!removed) throw new Error('no gallery photo')
    const after = expectStatus(
      await api(t.app, own.as.owner, 'DELETE', `/v1/online-menu/gallery/${removed.id}`),
      200,
    ).json<Menu>()
    expect(after.gallery).toHaveLength(5)
    for (const key of keysOf(removed.image)) expect(await objectExists(key)).toBe(false)
    expect(
      (await api(t.app, own.as.owner, 'DELETE', `/v1/online-menu/gallery/${removed.id}`)).statusCode,
    ).toBe(404)
    expectStatus(await upload(t.app, own.as.owner, 'POST', '/v1/online-menu/gallery', jpeg), 201)
  })

  it('two parallel uploads for the last place: exactly one wins, the loser leaves no objects', async () => {
    const own = await roleShop(t.app, 'omgalpar')
    for (let i = 0; i < 5; i++) {
      expectStatus(await upload(t.app, own.as.owner, 'POST', '/v1/online-menu/gallery', jpeg), 201)
    }
    const puts = store.puts.length
    const results = await Promise.all([
      upload(t.app, own.as.owner, 'POST', '/v1/online-menu/gallery', jpeg),
      upload(t.app, own.as.owner, 'POST', '/v1/online-menu/gallery', await solidImage(700, 500)),
    ])
    expect(results.map((r) => r.statusCode).sort()).toEqual([201, 409])
    const menu = expectStatus(await api(t.app, own.as.owner, 'GET', '/v1/online-menu'), 200).json<Menu>()
    expect(menu.gallery).toHaveLength(6)
    const live = new Set(menu.gallery.flatMap((g) => keysOf(g.image)))
    const attempted = store.puts.slice(puts)
    expect(attempted).toHaveLength(4)
    for (const key of attempted) expect(await objectExists(key), key).toBe(live.has(key))
  })
})

describe('item photo permissions', () => {
  it('manager can set and remove an item photo; cashier and employee cannot', async () => {
    const item = await newItem()
    const url = `/v1/items/${item.id}/photo`
    expectStatus(await upload(t.app, shop.as.manager, 'PUT', url, jpeg), 200)
    expectStatus(await api(t.app, shop.as.manager, 'DELETE', url), 200)
    for (const who of ['cashier', 'employee'] as const) {
      expect((await upload(t.app, shop.as[who], 'PUT', url, jpeg)).statusCode, who).toBe(403)
      expect((await api(t.app, shop.as[who], 'DELETE', url)).statusCode, who).toBe(403)
    }
  })

  it('manager gets 403 on logo, cover and gallery uploads', async () => {
    for (const [method, url] of [
      ['PUT', '/v1/online-menu/logo'],
      ['PUT', '/v1/online-menu/cover'],
      ['POST', '/v1/online-menu/gallery'],
    ] as const) {
      expect((await upload(t.app, shop.as.manager, method, url, jpeg)).statusCode, url).toBe(403)
    }
  })
})
