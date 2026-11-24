import assert from 'node:assert/strict'
import { randomUUID } from 'node:crypto'
import { once } from 'node:events'
import type { AddressInfo } from 'node:net'
import test from 'node:test'
import sharp from 'sharp'
import { createApp } from '../src/app.js'
import { config } from '../src/config.js'
import { db, rows } from '../src/db.js'

test('WeChat code exchange, concurrent registration and private pet sessions', async (t) => {
  const appId = 'tests-' + randomUUID()
  const first = 'test_wechat_' + randomUUID()
  const second = first.toUpperCase()
  const wechatCodes = new Map([
    ['first', first],
    ['concurrent', first],
    ['returning', first],
    ['other', second],
  ])
  const publicFetch = globalThis.fetch
  const originalApp = config.wechatAppId,
    originalSecret = config.wechatAppSecret
  config.wechatAppId = appId
  config.wechatAppSecret = 'test-only'
  const exchange = t.mock.method(globalThis, 'fetch', async (input: URL, options: RequestInit) => {
    assert.equal(input.origin + input.pathname, 'https://api.weixin.qq.com/sns/jscode2session')
    assert.equal(input.searchParams.get('appid'), appId)
    assert.equal(input.searchParams.get('secret'), 'test-only')
    assert.equal(input.searchParams.get('grant_type'), 'authorization_code')
    assert.equal(options.redirect, 'error')
    const code = input.searchParams.get('js_code')!
    if (code === 'offline') throw new Error('private upstream error')
    const openid = wechatCodes.get(code)
    wechatCodes.delete(code)
    return Response.json(
      openid
        ? { openid, session_key: 'private-test-session-key' }
        : { errcode: 40029, errmsg: 'invalid code' },
    )
  })
  const server = createApp().listen(0, '127.0.0.1')
  try {
    await once(server, 'listening')
    const base = 'http://127.0.0.1:' + (server.address() as AddressInfo).port + '/api'
    async function request(
      path: string,
      method = 'GET',
      data?: Record<string, unknown>,
      token = '',
      headers: Record<string, string> = {},
    ) {
      const response = await publicFetch(base + path, {
        method,
        headers: {
          'Content-Type': 'application/json',
          'X-PetCloud-Client': 'miniprogram',
          ...(token ? { Authorization: 'Bearer ' + token } : {}),
          ...headers,
        },
        body: method === 'GET' ? undefined : JSON.stringify(data || {}),
      })
      return {
        status: response.status,
        data: await response.json(),
        cookie: response.headers.get('set-cookie'),
      }
    }
    const login = (code: string) => request('/auth/wechat', 'POST', { code })
    assert.equal((await request('/auth/wechat', 'POST', { code: 'first', openid: first })).status, 400)
    assert.equal(
      (await request('/auth/wechat', 'POST', { code: 'first' }, '', { 'X-PetCloud-Client': '' })).status,
      403,
    )
    assert.equal(
      (await request('/auth/wechat', 'POST', { code: 'first' }, '', { Origin: 'https://invalid.example' }))
        .status,
      403,
    )
    assert.equal(exchange.mock.callCount(), 0)
    assert.equal((await login('invalid')).status, 401)
    assert.equal((await login('offline')).status, 502)
    const [a, b] = await Promise.all([login('first'), login('concurrent')])
    assert.deepEqual([a.status, b.status].sort(), [200, 201])
    assert.equal(a.cookie, null)
    assert.equal(a.data.user.id, b.data.user.id)
    assert.notEqual(a.data.token, b.data.token)
    assert.deepEqual(Object.keys(a.data).sort(), ['token', 'user'])
    assert.deepEqual(Object.keys(a.data.user).sort(), ['avatarVersion', 'createdAt', 'displayName', 'id', 'username'])
    assert.equal(a.data.user.avatarVersion, null)
    assert.match(a.data.token, /^[a-f0-9]{64}$/)
    assert.deepEqual((await request('/pets', 'GET', undefined, a.data.token)).data, { pets: [] })
    assert.equal((await login('first')).status, 401)
    assert.equal((await request('/pets', 'POST', { name: '无会话', species: 'cat' })).status, 403)
    const pet = await request('/pets', 'POST', { name: '小云', species: 'cat' }, a.data.token)
    assert.equal(pet.status, 201)
    const id = pet.data.pet.id
    assert.equal(pet.data.pet.identityNumber, null)
    assert.equal((await request('/pets/'+id+'/identity/codes/qrcode', 'GET', undefined, a.data.token)).status, 404)
    const again = await login('returning'),
      other = await login('other')
    assert.equal(again.status, 200)
    assert.equal(other.status, 201)
    assert.notEqual(other.data.user.id, a.data.user.id)
    assert.equal((await request('/pets', 'GET', undefined, again.data.token)).data.pets[0].id, id)
    assert.deepEqual((await request('/pets', 'GET', undefined, other.data.token)).data.pets, [])
    const update = { name: '小云的新名字', species: 'cat' }
    assert.equal((await request('/pets/' + id, 'PUT', update, other.data.token)).status, 404)
    assert.equal((await request('/pets/' + id, 'DELETE', {}, other.data.token)).status, 404)
    assert.equal((await request('/pets/' + id, 'PUT', update, again.data.token)).data.pet.name, update.name)
    assert.equal(
      (await request('/auth/profile', 'PUT', { displayName: '小云的主人' }, again.data.token)).data.user
        .displayName,
      '小云的主人',
    )
    assert.equal(
      (await request('/auth/me', 'GET', undefined, b.data.token)).data.user.displayName,
      '小云的主人',
    )
    const avatarPath = '/auth/profile/avatar'
    const avatar = await sharp({
      create: { width: 640, height: 480, channels: 3, background: '#ffe34e' },
    }).png().toBuffer()
    const avatarImage = 'data:image/png;base64,' + avatar.toString('base64')
    const saved = await request(avatarPath, 'PUT', { displayName: ' 云云 ', avatarImage }, again.data.token)
    assert.equal(saved.status, 200)
    assert.equal(saved.data.user.displayName, '云云')
    assert.match(saved.data.user.avatarVersion, /^[a-f0-9]{16}$/)
    assert.equal((await request(avatarPath)).status, 401)
    assert.equal((await request(avatarPath, 'GET', undefined, other.data.token)).status, 404)
    const download = await publicFetch(base + avatarPath, { headers: { Authorization: 'Bearer ' + b.data.token } })
    assert.equal(download.status, 200)
    assert.match(download.headers.get('content-type') ?? '', /^image\/webp\b/)
    const thumbnail = await sharp(Buffer.from(await download.arrayBuffer())).metadata()
    assert.equal(thumbnail.width, 256)
    assert.equal(thumbnail.height, 256)
    const invalid = await request(avatarPath, 'PUT', {
      displayName: '无效头像不得改名', avatarImage: 'data:image/png;base64,AAAA',
    }, again.data.token)
    assert.equal(invalid.status, 400)
    const current = (await request('/auth/me', 'GET', undefined, b.data.token)).data.user
    assert.equal(current.displayName, '云云')
    assert.equal(current.avatarVersion, saved.data.user.avatarVersion)
    const renamed = await request('/auth/profile', 'PUT', { displayName: '小云的主人' }, b.data.token)
    assert.equal(renamed.data.user.avatarVersion, saved.data.user.avatarVersion)
    assert.equal((await request('/auth/logout', 'POST', {}, a.data.token)).status, 200)
    assert.equal((await request('/auth/me', 'GET', undefined, a.data.token)).status, 401)
    assert.equal((await request('/auth/me', 'GET', undefined, b.data.token)).status, 200)
    const profiles = await rows<{ n: number }>(
      'SELECT COUNT(*) AS n FROM desktop_profiles p JOIN users u ON p.user_id=u.id WHERE u.wechat_appid=?',
      [appId],
    )
    assert.equal(profiles[0].n, 2)
    assert.equal((await request('/pets/' + id, 'DELETE', {}, again.data.token)).status, 200)
    assert.equal(
      (await request('/dashboard', 'GET', undefined, again.data.token)).data.generationEnabled,
      false,
    )
    await db.execute('UPDATE users SET disabled_at=UTC_TIMESTAMP(3) WHERE id=?',[a.data.user.id])
    wechatCodes.set('disabled',first)
    assert.equal((await login('disabled')).status,403)
    assert.equal((await request('/auth/me','GET',undefined,again.data.token)).status,401)
  } finally {
    config.wechatAppId = originalApp
    config.wechatAppSecret = originalSecret
    await new Promise<void>((resolve) => server.close(() => resolve()))
    await db.execute('DELETE FROM users WHERE wechat_appid=?', [appId])
    await db.end()
  }
})
