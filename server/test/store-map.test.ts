import assert from 'node:assert/strict'
import { randomBytes } from 'node:crypto'
import { once } from 'node:events'
import test from 'node:test'
import { createApp } from '../src/app.js'
import { db } from '../src/db.js'
import { mapPointToWgs84 } from '../src/map-coordinates.js'

test('map selection binds existing stores and prevents concurrent duplicate registration', {timeout:30_000}, async () => {
  const reference = mapPointToWgs84({latitude:39.915,longitude:116.404})
  assert.ok(Math.abs(reference.latitude-39.9135957) < 0.00002)
  assert.ok(Math.abs(reference.longitude-116.3977555) < 0.00002)
  const server = createApp().listen(0,'127.0.0.1')
  await once(server,'listening')
  const address = server.address()
  assert.ok(address && typeof address === 'object')
  const base = 'http://127.0.0.1:'+address.port+'/api'
  const suffix = randomBytes(6).toString('hex')
  const users: string[] = []
  const stores = new Set<string>()
  const posts: string[] = []
  const located = {latitude:22.55,longitude:113.886}
  const point = mapPointToWgs84(located)
  const path = '/h5/catalog/stores/map'

  async function request(route: string, method = 'GET', body?: unknown, token?: string) {
    const reply = await fetch(base+route,{
      method,body:JSON.stringify(body),headers:{'Content-Type':'application/json','X-PetCloud-Client':'desktop',
        ...(token ? {Authorization:'Bearer '+token} : {})},
    })
    return {status:reply.status,data:await reply.json()}
  }
  async function signup(label: string) {
    const result = await request('/auth/register','POST',{username:label+'_'+suffix,password:'location-fixture'})
    assert.equal(result.status,201)
    users.push(result.data.user.id)
    return {id:result.data.user.id as string,token:result.data.token as string}
  }
  async function addStore(manager: string, name: string, address: string, coordinates?: {latitude:number;longitude:number}) {
    const result = await request('/admin/stores','POST',{
      name,address,area:null,phone:'0755-23456789',coordinates,
    },manager)
    assert.equal(result.status,201,result.data.error)
    stores.add(result.data.id)
    return result.data.id as string
  }

  try {
    const owner = await signup('mapowner')
    const other = await signup('mapother')
    await db.execute('UPDATE users SET is_admin=TRUE WHERE id=?',[owner.id])
    const known = await addStore(owner.token,'已定位门店 '+suffix,'宝安区测试街道',point)
    const selected = {location:located,storeId:known}
    assert.equal((await request(path+'/preview','POST',{location:located})).status,401)
    const preview = await request(path+'/preview','POST',{location:located},owner.token)
    assert.equal(preview.status,200)
    assert.equal(preview.data.cityCode,'440300')
    assert.match(preview.data.district,/宝安区/)
    assert.equal(preview.data.stores.find((item:{id:string}) => item.id === known).state,'available')
    assert.equal((await request(path+'/bind','POST',{...selected,location:{latitude:23,longitude:113}},owner.token)).status,409)
    assert.deepEqual((await request(path+'/bind','POST',selected,owner.token)).data,{id:known,created:false})
    assert.equal((await request(path+'/bind','POST',selected,other.token)).status,409)
    const after = await request(path+'/preview','POST',{location:located},other.token)
    assert.equal(after.data.stores.find((item:{id:string}) => item.id === known).state,'bound')

    const legacyName = '历史门店 '+suffix
    const legacyAddress = '宝安区联调路 12 号 '+suffix
    const legacy = await addStore(owner.token,legacyName,legacyAddress)
    const migrated = await request(path+'/bind','POST',{
      location:located,name:legacyName,address:legacyAddress,phone:'0755-12345678',
    },owner.token)
    assert.equal(migrated.status,200)
    assert.deepEqual(migrated.data,{id:legacy,created:false})

    const registration = {location:located,name:'地图门店 '+suffix,address:'宝安区联调路 18 号 '+suffix,phone:'0755-23456789'}
    const [first,second] = await Promise.all([
      request(path+'/bind','POST',registration,owner.token),
      request(path+'/bind','POST',{...registration,location:{...located,longitude:located.longitude+0.00003}},other.token),
    ])
    for (const result of [first,second]) if (result.data.id) stores.add(result.data.id)
    assert.deepEqual([first.status,second.status].sort(),[201,409])
    const [winner,created] = first.status === 201 ? [owner,first.data.id] : [other,second.data.id]
    assert.deepEqual((await request(path+'/bind','POST',registration,winner.token)).data,{id:created,created:false})
    const newPost = await request('/h5/catalog/service-posts','POST',{
      storeId:created,category:'grooming',title:'地图门店洗护',description:'地图绑定后发布的服务',
    },winner.token)
    assert.equal(newPost.status,201,newPost.data.error)
    posts.push(newPost.data.id)
    const own = await request('/h5/catalog/stores/mine','GET',undefined,owner.token)
    assert.ok(own.data.stores.some((item:{id:string;ready:boolean}) => item.id === legacy && item.ready))
    assert.ok(own.data.stores.some((item:{id:string;ready:boolean}) => item.id === known && item.ready))
  } finally {
    await new Promise<void>(resolve => server.close(() => resolve()))
    for (const id of posts) await db.execute('DELETE FROM h5_catalog_items WHERE id=?',[id])
    for (const id of stores) await db.execute('DELETE FROM h5_stores WHERE id=?',[id])
    for (const id of users) await db.execute('DELETE FROM users WHERE id=?',[id])
    await db.end()
  }
})
