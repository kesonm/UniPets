import assert from 'node:assert/strict'
import { randomUUID } from 'node:crypto'
import { once } from 'node:events'
import test from 'node:test'
import sharp from 'sharp'
import { createApp } from '../src/app.js'
import { removeFile } from '../src/assets.js'
import { config } from '../src/config.js'
import { db } from '../src/db.js'

test('admin management updates the same records used by the customer APIs', {timeout:30_000}, async () => {
  const server = createApp().listen(0,'127.0.0.1')
  await once(server,'listening')
  const address = server.address()
  assert.ok(address && typeof address==='object')
  const base = 'http://127.0.0.1:'+address.port+'/api'
  const suffix = randomUUID().slice(0,8)
  const accounts: string[] = []
  const stores: string[] = []
  const entries: string[] = []
  const files: string[] = []
  const password = 'admin-integration-fixture'

  async function request(path:string, method='GET', body?:unknown, cookie?:string) {
    const response = await fetch(base+path,{method,body:JSON.stringify(body),headers:{
      'Content-Type':'application/json',Origin:config.origins[0],...(cookie ? {Cookie:cookie} : {}),
    }})
    const data = response.headers.get('content-type')?.includes('application/json')
      ? await response.json()
      : (await response.arrayBuffer()).byteLength
    return {status:response.status,data,cookie:response.headers.get('set-cookie')?.split(';')[0]}
  }
  async function signup(label:string) {
    const username = label+'_'+suffix
    const result = await request('/auth/register','POST',{username,password})
    assert.equal(result.status,201)
    const id = result.data.user.id as string
    accounts.push(id)
    return {id,username,cookie:result.cookie}
  }

  try {
    const manager = await signup('manager')
    const member = await signup('member')
    assert.equal((await request('/admin/users')).status,401)
    assert.equal((await request('/admin/users','GET',undefined,member.cookie)).status,403)
    const denied = await request('/admin/login','POST',{username:member.username,password})
    assert.equal(denied.status,403)
    assert.equal(denied.cookie,undefined)
    await db.execute('UPDATE users SET is_admin=TRUE WHERE id=?',[manager.id])
    const login = await request('/admin/login','POST',{username:manager.username,password})
    assert.equal(login.status,200)
    const admin = (path:string, method='GET', body?:unknown) => request('/admin'+path,method,body,login.cookie)
    const users = (await admin('/users?q='+suffix+'&state=enabled')).data
    assert.equal(users.items.length,2)
    assert.equal(users.hasMore,false)
    assert.deepEqual(Object.keys(users.items[0]).sort(),
      ['createdAt','displayName','enabled','id','isAdmin','petCount','username','wechat'])
    assert.equal((await admin('/users/'+member.id,'PATCH',{isAdmin:true})).status,400)
    assert.equal((await admin('/users/'+manager.id,'PATCH',{enabled:false})).status,409)
    assert.equal((await admin('/users/'+member.id,'PATCH',{displayName:'测试宠友'})).status,200)
    assert.equal((await request('/auth/me','GET',undefined,member.cookie)).data.user.displayName,'测试宠友')

    const pet = await request('/pets','POST',{name:'测试小猫',species:'cat'},member.cookie)
    assert.equal(pet.status,201)
    const petId = pet.data.pet.id
    const photo = await sharp({create:{width:32,height:32,channels:3,background:'#eed0a8'}}).png().toBuffer()
    const uploaded = await request('/assets','POST',{petId,name:'测试照片',image:'data:image/png;base64,'+photo.toString('base64')},member.cookie)
    assert.equal(uploaded.status,201)
    const assetId = uploaded.data.asset.id
    files.push(assetId+'.png')
    assert.equal((await admin('/pets?q='+member.username+'&state=cat')).data.items[0].id,petId)
    assert.equal((await admin('/pets/'+petId,'PUT',{name:'改名后的猫',species:'cat',birthday:'2024-05-09'})).status,200)
    const editedPet = (await request('/pets','GET',undefined,member.cookie)).data.pets[0]
    assert.equal(editedPet.name,'改名后的猫')
    assert.equal(editedPet.avatarAssetId,assetId)

    const newStore = {name:'测试门店 '+suffix,area:'shenzhen-nanshan',address:'测试地址',phone:'0755-00000000'}
    const storeId = randomUUID()
    const mappedId = randomUUID()
    await db.execute('INSERT INTO h5_stores (id,name,area,address,phone) VALUES (?,?,?,?,?)',
      [storeId,newStore.name,newStore.area,newStore.address,newStore.phone])
    stores.push(storeId)
    assert.equal((await admin('/stores?q='+suffix)).data.items[0].id,storeId)
    assert.equal((await admin('/stores','POST',newStore)).status,404)
    assert.equal((await admin('/stores/'+storeId,'PUT',newStore)).status,404)

    assert.equal((await request('/admin/stores/map','GET',undefined,member.cookie)).status,403)
    assert.equal((await request('/admin/stores/map-settings')).status,401)
    assert.equal((await admin('/stores/map-settings')).data.key,config.tencentMapBrowserKey || null)
    await db.execute(`INSERT INTO h5_stores (id,name,address,phone,latitude,longitude,city_code)
      VALUES (?,?,?,?,?,?,?)`,[mappedId,'定位门店 '+suffix,newStore.address,newStore.phone,22.55,113.882,'440300'])
    stores.push(mappedId)
    const mapRecords = (await admin('/stores/map?q='+suffix+'&state=unbound')).data.items
    assert.equal(mapRecords.length,2)
    assert.equal(mapRecords.find((row: {id:string}) => row.id===storeId).mapPoint,null)
    const marker = mapRecords.find((row: {id:string}) => row.id===mappedId).mapPoint
    assert.ok(Math.abs(marker.latitude-22.55)<0.01)
    assert.ok(Math.abs(marker.longitude-113.882)>0.001)
    assert.deepEqual((await admin('/stores/map?q='+suffix+'&state=bound')).data.items,[])

    const listing = {module:'shop',kind:'product',category:'food',title:'测试商品 '+suffix,provider:'',
      description:'测试详情',area:null,venue:null,startsAt:null,closesAt:null,priceCents:2590,
      stock:3,externalUrl:null,published:true,storeId}
    const product = await admin('/products','POST',listing)
    assert.equal(product.status,201)
    const productId = product.data.id
    entries.push(productId)
    assert.equal((await request('/h5/catalog/'+productId)).data.listing.provider,newStore.name)
    assert.equal((await request('/h5/catalog/'+productId)).data.listing.venue,newStore.address)
    const offer = {...listing,module:'education',kind:'appointment',category:'training',title:'预约服务 '+suffix,
      startsAt:new Date(Date.now()+3600_000).toISOString(),stock:2,priceCents:null}
    assert.equal((await admin('/services','POST',{...offer,module:'services',category:'grooming'})).status,400)
    const service = await admin('/services','POST',offer)
    assert.equal(service.status,201)
    const serviceId = service.data.id
    entries.push(serviceId)
    assert.deepEqual((await admin('/services?q='+suffix)).data.items.map((item:{id:string}) => item.id),[serviceId])
    const serviceRecord = (await admin('/services?q='+suffix)).data.items[0]
    assert.equal((await admin('/services/'+serviceId,'PUT',{
      ...offer,title:'修改预约 '+suffix,updatedAt:serviceRecord.updatedAt,expectedStock:serviceRecord.stock,
    })).status,200)
    assert.equal((await admin('/services/'+productId,'PATCH',{published:false})).status,404)
    const booking = '/h5/catalog/'+serviceId+'/participation'
    assert.equal((await request(booking,'POST',{petId},member.cookie)).status,200)

    const productRecord = (await admin('/products?q='+suffix)).data.items[0]
    const orderInput = {requestKey:randomUUID(),items:[{itemId:productId,quantity:1,unitCents:2590}]}
    assert.equal((await request('/h5/orders','POST',orderInput,member.cookie)).status,200)
    assert.equal((await admin('/products/'+productId,'PUT',{
      ...listing,updatedAt:productRecord.updatedAt,expectedStock:productRecord.stock,
    })).status,409)
    assert.equal((await admin('/products?q='+suffix)).data.items[0].stock,2)
    assert.equal((await admin('/stores/'+storeId,'PATCH',{enabled:false})).status,200)
    assert.equal((await admin('/products?q='+suffix+'&state=paused')).data.items[0].id,productId)
    assert.equal((await request('/h5/catalog?q='+suffix)).data.listings.length,0)
    assert.equal((await request('/h5/catalog/'+productId)).status,404)
    assert.equal((await request(booking,'POST',{petId},member.cookie)).status,404)
    assert.equal((await request('/h5/orders','POST',{...orderInput,requestKey:randomUUID()},member.cookie)).status,409)
    assert.equal((await request('/h5/orders','GET',undefined,member.cookie)).data.orders.length,1)
    assert.equal((await request('/h5/engagements','GET',undefined,member.cookie)).data.engagements.length,1)
    assert.equal((await admin('/stores/'+storeId,'PATCH',{enabled:true})).status,200)
    assert.equal((await request('/h5/catalog/'+productId)).status,200)
    assert.equal((await admin('/products/'+productId,'PATCH',{published:false})).status,200)
    assert.equal((await request('/h5/catalog/'+productId)).status,404)

    const post = await request('/h5/posts','POST',{petId,assetId,title:'测试动态 '+suffix,body:'日常记录'},member.cookie)
    assert.equal(post.status,201)
    const postId = post.data.post.id
    const publicPost = '/h5/posts/'+postId
    assert.equal((await request(publicPost+'/comments','POST',{body:'测试评论'},member.cookie)).status,201)
    assert.equal((await admin('/posts?q='+suffix)).data.items[0].commentCount,1)
    assert.equal((await admin('/posts/'+postId)).data.record.body,'日常记录')
    assert.equal((await admin('/posts/'+postId+'/image')).status,200)
    assert.equal((await admin('/posts/'+postId,'PATCH',{hidden:true})).status,200)
    assert.equal((await request('/h5/posts?q='+suffix)).data.posts.length,0)
    assert.equal((await request(publicPost)).status,404)
    assert.equal((await request(publicPost+'/image')).status,404)
    assert.deepEqual((await request(publicPost+'/comments')).data.comments,[])
    assert.equal((await request(publicPost+'/comments','POST',{body:'不可评论'},member.cookie)).status,404)
    assert.equal((await request('/h5/me','GET',undefined,member.cookie)).data.published[0].hidden,1)
    assert.equal((await admin('/posts/'+postId,'PATCH',{hidden:false})).status,200)
    assert.equal((await request(publicPost+'/comments')).data.comments[0].body,'测试评论')

    const story = {title:'测试创作 '+suffix,scenes:['第一幕','第二幕'],coverAssetId:assetId,publish:true}
    const draftId = (await request('/h5/stories','POST',{...story,petId,publish:false},member.cookie)).data.id
    assert.equal((await admin('/stories?q='+suffix+'&state=draft')).data.items[0].id,draftId)
    assert.equal((await admin('/stories/'+draftId)).status,404)
    const storyId = (await request('/h5/stories','POST',{...story,petId},member.cookie)).data.id
    assert.deepEqual((await admin('/stories/'+storyId)).data.record.scenes,story.scenes)
    assert.equal((await admin('/stories/'+storyId,'PATCH',{hidden:true})).status,200)
    assert.equal((await request('/h5/stories/'+storyId+'/cover')).status,404)
    assert.equal((await request('/h5/stories/'+storyId,'PUT',story,member.cookie)).data.hidden,true)
    assert.equal((await request('/h5/stories?q='+suffix)).data.stories.length,0)
    assert.equal((await admin('/stories/'+storyId,'PATCH',{hidden:false})).status,200)
    assert.equal((await request('/h5/stories/'+storyId)).status,200)

    assert.equal((await admin('/users/'+member.id,'PATCH',{enabled:false})).status,200)
    assert.equal((await request('/auth/me','GET',undefined,member.cookie)).status,401)
    assert.equal((await request('/auth/login','POST',{username:member.username,password})).status,403)
    assert.equal((await admin('/users/'+member.id,'PATCH',{enabled:true})).status,200)
    assert.equal((await request('/auth/me','GET',undefined,member.cookie)).status,401)
    assert.equal((await request('/auth/login','POST',{username:member.username,password})).status,200)
  } finally {
    await new Promise<void>(resolve => server.close(() => resolve()))
    for (const id of accounts) await db.execute('DELETE FROM users WHERE id=?',[id])
    for (const id of entries) await db.execute('DELETE FROM h5_catalog_items WHERE id=?',[id])
    for (const id of stores) await db.execute('DELETE FROM h5_stores WHERE id=?',[id])
    await Promise.all(files.map(file => removeFile(file)))
    await db.end()
  }
})
