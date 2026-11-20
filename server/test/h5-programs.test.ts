import assert from 'node:assert/strict'
import { randomUUID } from 'node:crypto'
import { once } from 'node:events'
import test from 'node:test'
import { createApp } from '../src/app.js'
import { config } from '../src/config.js'
import { db } from '../src/db.js'

test('H5 publishes program data and accepts one registration per eligible owned pet during enrollment', { timeout: 15_000 }, async () => {
  const service = createApp().listen(0, '127.0.0.1')
  await once(service, 'listening')
  const address = service.address()
  assert.ok(address && typeof address === 'object')
  const base = `http://127.0.0.1:${address.port}/api`
  const members: string[] = []
  const eventIds: string[] = []
  const courseIds: string[] = []

  async function request(path: string, method = 'GET', body?: unknown, cookie?: string) {
    const result = await fetch(base + path, { method, body: JSON.stringify(body),
      headers: { 'Content-Type': 'application/json', Origin: config.origins[0], ...(cookie ? { Cookie: cookie } : {}) } })
    return { status: result.status, body: await result.json(), cookie: result.headers.get('set-cookie')?.split(';', 1)[0] }
  }

  async function account() {
    const result = await request('/auth/register', 'POST', {
      username: 'event_' + randomUUID().replaceAll('-', '').slice(0, 12), password: 'event-fixture-pass',
    })
    assert.equal(result.status, 201)
    members.push(result.body.user.id)
    assert.ok(result.cookie)
    return result.cookie
  }

  async function pet(cookie: string, name: string, species: 'cat'|'dog') {
    const result = await request('/pets', 'POST', { name, species }, cookie)
    assert.equal(result.status, 201)
    return result.body.pet.id as string
  }

  const now = Date.now()
  const hour = 3600_000
  async function event(opens: number, closes: number, published = true) {
    const id = randomUUID()
    eventIds.push(id)
    await db.execute(`INSERT INTO h5_events (id,title,organizer,city,venue,area,species,starts_at,
      registration_opens_at,registration_closes_at,rules,published) VALUES (?,?,?,?,?,?,?,?,?,?,?,?)`,
    [id, '测试赛程', '测试主办方', '深圳', '测试赛场', 'shenzhen-nanshan', 'cat',
      new Date(now + 6 * hour), new Date(now + opens * hour), new Date(now + closes * hour), '使用与报名一致的宠物档案。', published])
    return id
  }

  async function course(published: boolean) {
    const id = randomUUID()
    courseIds.push(id)
    await db.execute(`INSERT INTO h5_training_courses
      (id,title,learning_format,starts_at,exam_at,exam_location,eligibility,credential,issuer,published)
      VALUES (?,?,?,?,?,?,?,?,?,?)`, [id, '测试课程', '线上理论与线下实训', new Date(now + hour), null,
      '测试考点', '完成实训后可报考', '测试证书', '测试发证方', published])
    return id
  }

  try {
    const open = await event(-1, 2)
    const upcoming = await event(1, 2)
    const closed = await event(-3, -1)
    const hidden = await event(-1, 2, false)
    const publishedCourse = await course(true)
    const hiddenCourse = await course(false)
    const listing = await request('/h5/events')
    assert.equal(listing.status, 200)
    const published = listing.body.events.filter((item: { id: string }) => eventIds.includes(item.id))
    assert.equal(published.length, 3)
    const statuses = Object.fromEntries(published.map((item: { id: string; registrationStatus: string }) => [item.id, item.registrationStatus]))
    assert.deepEqual(statuses, { [open]: 'open', [upcoming]: 'upcoming', [closed]: 'closed' })
    assert.equal((await request('/h5/events/' + hidden)).status, 404)
    const detail = await request('/h5/events/' + open)
    assert.equal(detail.body.event.rules, '使用与报名一致的宠物档案。')
    assert.equal(detail.body.event.area, 'shenzhen-nanshan')
    const training = await request('/h5/training')
    assert.equal(training.status, 200)
    assert.deepEqual(training.body.courses.filter((item: { id: string }) => courseIds.includes(item.id)), [{
      id: publishedCourse, title: '测试课程', learningFormat: '线上理论与线下实训', startsAt: new Date(now + hour).toISOString(),
      examAt: null, examLocation: '测试考点', eligibility: '完成实训后可报考', credential: '测试证书', issuer: '测试发证方',
    }])
    assert.ok(!training.body.courses.some((item: { id: string }) => item.id === hiddenCourse))

    const owner = await account(), other = await account()
    const cat = await pet(owner, '自有猫', 'cat'), dog = await pet(owner, '自有狗', 'dog')
    const outside = await pet(other, '其他账号的猫', 'cat')
    const route = (id: string) => '/h5/events/' + id + '/registrations'
    assert.equal((await request(route(open), 'POST', { petId: cat })).status, 401)
    assert.equal((await request(route(open), 'GET')).status, 401)
    assert.equal((await request(route(open), 'POST', { petId: outside }, owner)).status, 404)
    assert.equal((await request(route(open), 'POST', { petId: dog }, owner)).status, 400)
    assert.equal((await request(route(upcoming), 'POST', { petId: cat }, owner)).status, 409)
    assert.equal((await request(route(closed), 'POST', { petId: cat }, owner)).status, 409)
    assert.equal((await request(route(hidden), 'POST', { petId: cat }, owner)).status, 404)

    const results = await Promise.all([request(route(open), 'POST', { petId: cat }, owner),
      request(route(open), 'POST', { petId: cat }, owner)])
    assert.deepEqual(results.map(result => result.status).sort(), [200, 201])
    const registration = results[0].body.registration
    assert.equal(registration.petId, cat)
    assert.equal(registration.petName, '自有猫')
    assert.deepEqual(results[1].body.registration, registration)
    assert.deepEqual((await request(route(open), 'GET', undefined, owner)).body.registrations, [registration])
    assert.deepEqual((await request(route(open), 'GET', undefined, other)).body.registrations, [])
  } finally {
    await new Promise<void>(resolve => service.close(() => resolve()))
    for (const id of members) await db.execute('DELETE FROM users WHERE id=?', [id])
    for (const id of eventIds) await db.execute('DELETE FROM h5_events WHERE id=?', [id])
    for (const id of courseIds) await db.execute('DELETE FROM h5_training_courses WHERE id=?', [id])
    await db.end()
  }
})
