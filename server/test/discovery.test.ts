import assert from 'node:assert/strict'
import { randomBytes } from 'node:crypto'
import { once } from 'node:events'
import test from 'node:test'
import { districtAt } from '../../shared/h5-districts.mjs'
import { createApp } from '../src/app.js'
import { db } from '../src/db.js'

test('nearby merchant posts, community filters and personalized home feed', { timeout: 30_000 }, async () => {
  const server = createApp().listen(0, '127.0.0.1')
  await once(server, 'listening')
  const address = server.address()
  assert.ok(address && typeof address === 'object')
  const base = 'http://127.0.0.1:' + address.port + '/api'
  const suffix = randomBytes(6).toString('hex')
  const accounts: string[] = []
  const stores: string[] = []
  const services: string[] = []
  const servicePath = '/h5/catalog/service-posts'

  async function request(path: string, method = 'GET', body?: unknown, token?: string, client = 'miniprogram') {
    const response = await fetch(base + path, {
      method, body: JSON.stringify(body),
      headers: {
        'Content-Type': 'application/json', 'X-PetCloud-Client': client,
        ...(token ? {Authorization: 'Bearer ' + token} : {}),
      },
    })
    return { status: response.status, data: await response.json() }
  }
  async function signup(label: string) {
    const result = await request('/auth/register','POST',{username: label + '_' + suffix,password:'discovery-fixture'},undefined,'desktop')
    assert.equal(result.status, 201)
    accounts.push(result.data.user.id)
    return { id: result.data.user.id as string, token: result.data.token as string }
  }
  async function addStore(manager: string, code: string) {
    const result = await request('/admin/stores','POST',{
      name: '测试门店 ' + suffix, area: null, districtCode: code, address: '测试地址', phone: '0755-23456789',
    },manager)
    assert.equal(result.status,201)
    stores.push(result.data.id)
    return result.data.id as string
  }
  async function addService(manager: string, storeId: string, category: string, title: string) {
    const result = await request('/admin/services','POST',{
      module:'services', kind:'appointment', category, title: title + ' ' + suffix,
      provider:'', description:title + '的项目详情', area:null, venue:null,
      startsAt:'2099-12-01T10:00:00.000Z', closesAt:null, priceCents:null, stock:null, externalUrl:null,
      published:true, storeId,
    },manager)
    assert.equal(result.status,201)
    services.push(result.data.id)
    return result.data.id as string
  }
  async function addPost(token: string, species: string, breed: string, title: string, topic = 'daily', petType?: string) {
    const pet = await request('/pets','POST',{name:'测试宠物',species,breed},token)
    assert.equal(pet.status,201)
    const result = await request('/h5/posts','POST',{petId:pet.data.pet.id,title:title+' '+suffix,topic,petType},token)
    assert.equal(result.status,201)
    return result.data.post.id as string
  }

  try {
    const tile = await request('/h5/catalog/district-boundaries?x=113&y=22')
    assert.equal(tile.status,200)
    assert.equal(districtAt(22.55,113.882,tile.data.boundaries)?.name,'宝安区')
    assert.equal(districtAt(22.533,113.93,tile.data.boundaries)?.name,'南山区')

    const owner = await signup('owner')
    const dogOwner = await signup('dog')
    await db.execute('UPDATE users SET is_admin=TRUE WHERE id=?',[owner.id])
    const found = await request('/admin/districts?q='+encodeURIComponent('深圳 宝安'), 'GET', undefined, owner.token)
    assert.ok(found.data.items.some((district: {id:string}) => district.id === '1816983'))
    const ba = await addStore(owner.token,'1816983')
    const ns = await addStore(owner.token,'6571327')
    const wash = await addService(owner.token,ba,'grooming','洗护')
    const board = await addService(owner.token,ba,'boarding','宠物寄养')
    const home = await addService(owner.token,ns,'home-service','上门喂养')
    const nearby = await request(servicePath + '?district=1816983&q=' + suffix)
    assert.deepEqual(new Set(nearby.data.posts.map((post: {id:string}) => post.id)),new Set([board,wash]))
    const category = await request(servicePath+'?district=1816983&category=grooming&q='+suffix)
    assert.deepEqual(category.data.posts.map((post: {id:string}) => post.id),[wash])
    const detail = await request(servicePath+'/'+board)
    assert.equal(detail.data.post.phone,'0755-23456789')
    assert.equal((await request('/h5/catalog/'+board+'/participation','POST',{},owner.token)).status,409)
    for (let attempt=0; attempt<2; attempt++) {
      const liked = await request(servicePath+'/'+board+'/like','PUT',{active:true},dogOwner.token)
      assert.deepEqual(liked.data,{active:true,likes:1})
    }
    const added = await request(servicePath+'/'+board+'/comments','POST',{body:'可以代养吗？'},dogOwner.token)
    assert.equal(added.status,201)
    assert.equal((await request(servicePath+'/'+board+'/comments')).data.comments[0].body,'可以代养吗？')
    assert.equal((await request(servicePath+'/'+board,'GET',undefined,dogOwner.token)).data.post.liked,1)
    assert.equal((await request(servicePath+'/'+board,'GET',undefined,owner.token)).data.post.liked,0)
    const unliked = await request(servicePath+'/'+board+'/like','PUT',{active:false},dogOwner.token)
    assert.deepEqual(unliked.data,{active:false,likes:0})

    const cat = await addPost(owner.token,'cat','英短','求助周末寄养','help')
    const dog = await addPost(dogOwner.token,'dog','拉布拉多','周末散步')
    const rabbit = await addPost(owner.token,'other','荷兰垂耳兔','兔子换草','daily','rabbit')
    for (const [position, id] of [cat,dog,rabbit].entries()) {
      await db.execute('UPDATE h5_posts SET created_at=UTC_TIMESTAMP(3)-INTERVAL ? MINUTE WHERE id=?',[3-position,id])
    }
    const posts = '/h5/posts?sort=latest&q=' + suffix
    const ids = (result: Awaited<ReturnType<typeof request>>) => result.data.posts.map((post: {id:string}) => post.id)
    assert.deepEqual(ids(await request(posts)),[rabbit,dog,cat])
    assert.deepEqual(ids(await request(posts+'&petType=rabbit')),[rabbit])
    assert.deepEqual(ids(await request(posts+'&petType=dog&breed='+encodeURIComponent('拉布拉多'))),[dog])
    assert.deepEqual(ids(await request(posts+'&petType=cat&breed='+encodeURIComponent('拉布拉多'))),[])
    assert.ok(ids(await request('/h5/posts?sort=latest&q='+encodeURIComponent('拉布拉多'))).includes(dog))
    assert.ok((await request('/h5/posts/breeds?petType=rabbit')).data.breeds.includes('荷兰垂耳兔'))

    const recommend = '/h5/posts/recommendations?district=1816983&seed=guest'
    const ranked = (result: Awaited<ReturnType<typeof request>>) => result.data.items.map((item: {post: {id:string}}) => item.post.id)
    const forCat = ranked(await request(recommend,'GET',undefined,owner.token))
    const forDog = ranked(await request(recommend,'GET',undefined,dogOwner.token))
    assert.ok(forCat.includes(cat) && forCat.includes(board) && !forCat.includes(home))
    assert.ok(forCat.indexOf(cat)<forCat.indexOf(dog))
    assert.ok(forDog.indexOf(dog)<forDog.indexOf(cat))
    assert.ok(forCat.indexOf(board)<forCat.indexOf(wash))

    assert.equal((await request('/admin/stores/'+ba,'PATCH',{enabled:false},owner.token)).status,200)
    assert.equal((await request(servicePath+'/'+board)).status,404)
    assert.equal((await request(servicePath+'/'+board+'/comments')).status,404)
    assert.equal((await request(servicePath+'/'+board+'/like','PUT',{active:true},dogOwner.token)).status,404)
    assert.deepEqual((await request(servicePath+'?district=1816983&q='+suffix)).data.posts,[])
  } finally {
    await new Promise<void>(resolve => server.close(() => resolve()))
    for (const id of services) await db.execute('DELETE FROM h5_catalog_items WHERE id=?',[id])
    for (const id of stores) await db.execute('DELETE FROM h5_stores WHERE id=?',[id])
    for (const id of accounts) await db.execute('DELETE FROM users WHERE id=?',[id])
    await db.end()
  }
})
