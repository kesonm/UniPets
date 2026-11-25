import assert from 'node:assert/strict'
import { randomBytes } from 'node:crypto'
import { once } from 'node:events'
import test from 'node:test'
import { districtAt } from '../../shared/h5-districts.mjs'
import { storeBindingQrPrefix } from '../../shared/h5-discovery.mjs'
import { createApp } from '../src/app.js'
import { db } from '../src/db.js'
import { renderQrCode } from '../src/identity-codes.js'
import { wgs84ToMapPoint } from '../src/map-coordinates.js'

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
  const customCategories: string[] = []
  const servicePath = '/h5/catalog/service-posts'
  const bindPath = '/h5/catalog/stores/bind'
  const codesPath = '/admin/stores/binding-codes'

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
  function storeDetails(name: string, latitude = 22.55, longitude = 113.883) {
    return {name:name+' '+suffix,address:'测试门店详细地址',phone:'0755-23456789',location:wgs84ToMapPoint({latitude,longitude})}
  }
  async function bindStore(token: string, code: string, profile: ReturnType<typeof storeDetails>) {
    const result = await request(bindPath,'POST',{code,...profile},token)
    assert.equal(result.status,201)
    stores.push(result.data.id)
    return result.data.id as string
  }
  async function bindingCodes(admin: string) {
    const result = await request(codesPath,'GET',undefined,admin)
    assert.equal(result.status,200)
    return result.data.codes as {slot:number;code:string;qrCode:string}[]
  }
  async function addService(merchant: string, storeId: string, category: string, title: string) {
    const result = await request(servicePath,'POST',{
      category, title:title+' '+suffix, description:title+'的项目详情', storeId,
    },merchant)
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
    const manager = await signup('manager')
    await db.execute('UPDATE users SET is_admin=TRUE WHERE id=?',[manager.id])
    const defaultCategories = await request('/h5/catalog/service-categories')
    assert.deepEqual(defaultCategories.data.items.slice(0,6).map((item:{label:string}) => item.label),
      ['洗护','代养','上门','拍摄','套餐','其他'])
    assert.equal((await request('/admin/service-categories','POST',{label:'剪甲'},dogOwner.token)).status,403)
    assert.equal((await request('/admin/service-categories','POST',{label:'宠物剪甲护理'},manager.token)).status,400)
    const custom = await request('/admin/service-categories','POST',{label:'宠物剪甲'},manager.token)
    assert.equal(custom.status,201)
    customCategories.push(custom.data.id)
    assert.equal((await request('/admin/service-categories','POST',{label:'宠物剪甲'},manager.token)).status,409)
    assert.equal((await request('/admin/service-categories/'+custom.data.id,'PUT',{label:'剪甲'},manager.token)).status,200)
    assert.equal((await request(codesPath)).status,401)
    assert.equal((await request(codesPath,'GET',undefined,owner.token)).status,403)
    assert.equal((await request(codesPath+'/1/qr','GET',undefined,owner.token)).status,403)
    const codes = await bindingCodes(manager.token)
    assert.deepEqual(codes.map(({slot}) => slot),[1,2,3,4,5,6,7,8,9,10])
    assert.equal(new Set(codes.map(({code}) => code)).size,10)
    assert.ok(codes.every(({code}) => /^[0-9A-F]{12}$/.test(code)))
    const qr = await request(codesPath+'/1/qr','GET',undefined,manager.token)
    assert.equal(qr.status,200)
    assert.equal(qr.data.code,codes[0].code)
    assert.equal(qr.data.qrCode,codes[0].qrCode)
    assert.match(qr.data.qrCode,/^data:image\/png;base64,/)
    assert.deepEqual(Buffer.from(qr.data.qrCode.split(',')[1],'base64'),await renderQrCode(storeBindingQrPrefix+codes[0].code))

    const profile = storeDetails('宝安测试门店')
    const located = await request('/h5/catalog/stores/location','POST',profile.location,owner.token)
    assert.equal(located.status,200)
    assert.equal(located.data.district?.id,'1816983')
    assert.equal(located.data.district?.serviceCityCode,'440300')
    const codeCheck = '/h5/catalog/stores/binding-code/check'
    const bindingCode = codes[0].code
    assert.equal((await request('/h5/catalog/stores/map/bind','POST',profile,owner.token)).status,404)
    assert.equal((await request(bindPath,'POST',profile,owner.token)).status,400)
    assert.equal((await request(bindPath,'POST',{...profile,code:bindingCode})).status,403)
    assert.equal((await request(codeCheck,'POST',{code:bindingCode.toLowerCase()},owner.token)).status,200)
    assert.equal((await request(bindPath,'POST',{...profile,code:bindingCode,phone:'错误号码'},owner.token)).status,400)
    assert.deepEqual(await bindingCodes(manager.token),codes)
    const ba = await bindStore(owner.token,bindingCode.toLowerCase(),profile)
    const rotated = await bindingCodes(manager.token)
    assert.equal(rotated.length,10)
    assert.notEqual(rotated[0].code,bindingCode)
    assert.deepEqual(rotated.slice(1),codes.slice(1))
    assert.equal((await request(codeCheck,'POST',{code:bindingCode},owner.token)).status,409)
    assert.equal((await request(bindPath,'POST',{...storeDetails('重放验证'),code:bindingCode},dogOwner.token)).status,409)
    assert.equal((await request(bindPath,'POST',{...profile,code:codes[1].code},dogOwner.token)).status,409)
    assert.deepEqual(await bindingCodes(manager.token),rotated)

    const old = rotated[9]
    const refreshPath = `${codesPath}/${old.slot}/refresh`
    assert.equal((await request(refreshPath,'POST',{code:old.code},owner.token)).status,403)
    assert.equal((await request(refreshPath,'POST',{code:rotated[0].code},manager.token)).status,409)
    const refreshes = await Promise.all([1,2].map(() => request(refreshPath,'POST',{code:old.code},manager.token)))
    assert.deepEqual(refreshes.map(result => result.status).sort(),[200,409])
    const replacement = refreshes.find(result => result.status===200)!.data
    assert.equal(replacement.slot,old.slot)
    assert.notEqual(replacement.code,old.code)
    assert.deepEqual(Buffer.from(replacement.qrCode.split(',')[1],'base64'),await renderQrCode(storeBindingQrPrefix+replacement.code))
    assert.deepEqual(await bindingCodes(manager.token),[...rotated.slice(0,9),replacement])
    assert.equal((await request(codeCheck,'POST',{code:old.code},owner.token)).status,409)
    assert.equal((await request(bindPath,'POST',{...storeDetails('旧码刷新验证'),code:storeBindingQrPrefix+old.code},owner.token)).status,409)
    assert.equal((await request(codeCheck,'POST',{code:replacement.code},owner.token)).status,200)

    const boundStores = await request('/admin/stores/bound?q='+suffix,'GET',undefined,manager.token)
    assert.ok(boundStores.data.items.some((store:{id:string;bound:number}) => store.id === ba && store.bound))
    const ns = await bindStore(owner.token,storeBindingQrPrefix+codes[1].code,storeDetails('南山测试门店',22.533,113.93))
    await db.execute('UPDATE h5_stores SET latitude=NULL,longitude=NULL WHERE id=?',[ns])
    const guangzhouProfile = storeDetails('广州测试门店',23.14,113.32)
    const guangzhou = await bindStore(owner.token,codes[2].code,guangzhouProfile)
    const bound = await request('/h5/catalog/stores/mine','GET',undefined,owner.token)
    assert.deepEqual(new Set(bound.data.stores.map((item:{id:string}) => item.id)),new Set([ba,ns,guangzhou]))
    const storedPoint = bound.data.stores.find((item:{id:string}) => item.id===ba).location
    assert.ok(Math.abs(storedPoint.longitude-profile.location.longitude)<0.00001)
    assert.ok(Math.abs(storedPoint.latitude-profile.location.latitude)<0.00001)
    assert.deepEqual((await request('/h5/catalog/stores/mine','GET',undefined,dogOwner.token)).data.stores,[])
    const contestedCode = codes[3].code
    const claims = await Promise.all([owner,dogOwner].map((account,index) =>
      request(bindPath,'POST',{code:contestedCode,...storeDetails('并发门店 '+index)},account.token)))
    for (const claim of claims) if (claim.status===201) stores.push(claim.data.id)
    assert.deepEqual(claims.map(claim => claim.status).sort(),[201,409])
    assert.equal((await bindingCodes(manager.token)).length,10)
    const forbiddenPost = {storeId:ba,category:'grooming',title:'越权测试',description:'不应显示'}
    assert.equal((await request(servicePath,'POST',forbiddenPost,dogOwner.token)).status,403)
    const revisedStore = {...guangzhouProfile,address:'天河区测试地址',phone:'020-23456789'}
    const editPath = '/h5/catalog/stores/mine/'+guangzhou
    assert.equal((await request(editPath,'PUT',revisedStore,dogOwner.token)).status,404)
    assert.equal((await request(editPath,'PUT',revisedStore,owner.token)).status,200)
    const wash = await addService(owner.token,ba,'grooming','洗护')
    const board = await addService(owner.token,ba,'boarding','宠物寄养')
    const home = await addService(owner.token,ns,'home-service','大型犬上门喂养')
    const nails = await addService(owner.token,guangzhou,custom.data.id,'猫咪剪甲')
    function serviceIds(result: Awaited<ReturnType<typeof request>>) {
      assert.equal(result.status,200,result.data.error)
      return result.data.posts.map((post:{id:string}) => post.id)
    }
    const serviceSearch = '?q='+suffix
    assert.deepEqual(new Set(serviceIds(await request(servicePath+serviceSearch))),
      new Set([wash,board,home,nails]))
    assert.deepEqual(new Set(serviceIds(await request(servicePath+serviceSearch+'&region=440300'))),
      new Set([wash,board,home]))
    assert.deepEqual(new Set(serviceIds(await request(servicePath+serviceSearch+'&region=440000'))),
      new Set([wash,board,home,nails]))
    const selected = await request(servicePath+serviceSearch+'&region=440100&category='+custom.data.id)
    assert.deepEqual(serviceIds(selected),[nails])
    assert.equal(selected.data.posts[0].categoryLabel,'剪甲')
    const distance = {q:suffix,location:{latitude:22.55,longitude:113.882}}
    const closest = await request(servicePath+'/search','POST',{...distance,sort:'distance-asc'})
    assert.equal(closest.status,200)
    assert.deepEqual(new Set(serviceIds(closest).slice(0,2)),new Set([wash,board]))
    assert.deepEqual(serviceIds(closest).slice(2),[nails,home])
    assert.ok(closest.data.posts[0].distanceMeters < 400)
    assert.equal(closest.data.posts[3].distanceMeters,null)
    const farthest = await request(servicePath+'/search','POST',{...distance,sort:'distance-desc'})
    assert.equal(serviceIds(farthest)[0],nails)
    assert.equal(serviceIds(farthest)[3],home)
    assert.equal((await request(servicePath+'/search','POST',{sort:'distance-asc'})).status,400)
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
    assert.equal(serviceIds(await request(servicePath+serviceSearch+'&sort=likes-desc'))[0],board)
    assert.equal(serviceIds(await request(servicePath+serviceSearch+'&sort=likes-asc')).at(-1),board)
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
    const recommendedServices = servicePath + serviceSearch + '&sort=recommended'
    const catServices = serviceIds(await request(recommendedServices,'GET',undefined,owner.token))
    const dogServices = serviceIds(await request(recommendedServices,'GET',undefined,dogOwner.token))
    assert.ok(catServices.indexOf(board)<catServices.indexOf(home))
    assert.ok(dogServices.indexOf(home)<dogServices.indexOf(board))

    const pets = await request('/pets','GET',undefined,owner.token)
    const story = await request('/h5/stories','POST',{
      petId:pets.data.pets.find((pet:{species:string}) => pet.species === 'cat').id,title:'猫咪小故事',scenes:['回到家'],publish:true,
    },owner.token)
    assert.equal(story.status,201)
    for (const content of ['/h5/posts/'+cat,'/h5/stories/'+story.data.id]) {
      for (const kind of ['like','favorite']) {
        assert.equal((await request(content+'/reaction','PUT',{kind,active:true},dogOwner.token)).status,200)
      }
    }
    assert.equal((await request(servicePath+'/'+board+'/like','PUT',{active:true},dogOwner.token)).status,200)
    const personal = '/h5/posts/mine'
    const counts = async (token:string) => {
      const result = await request(personal+'/counts','GET',undefined,token)
      assert.equal(result.status,200,result.data.error)
      return result.data.counts
    }
    const mine = async (token:string,tab:string) => {
      const result = await request(personal+'?tab='+tab,'GET',undefined,token)
      assert.equal(result.status,200,result.data.error)
      return result.data.items.map((item:{id:string}) => item.id)
    }
    assert.equal((await request(personal+'/counts')).status,401)
    assert.deepEqual(await counts(owner.token),{published:7,likes:0,favorites:0})
    assert.deepEqual(new Set(await mine(owner.token,'published')),new Set([cat,rabbit,wash,board,home,nails,story.data.id]))
    assert.deepEqual(await counts(dogOwner.token),{published:1,likes:3,favorites:2})
    assert.deepEqual(new Set(await mine(dogOwner.token,'likes')),new Set([cat,story.data.id,board]))
    assert.deepEqual(new Set(await mine(dogOwner.token,'favorites')),new Set([cat,story.data.id]))
    assert.equal((await request('/admin/posts/'+cat,'PATCH',{hidden:true},manager.token)).status,200)
    assert.equal((await request(personal+'/'+cat,'GET',undefined,owner.token)).status,200)
    assert.equal((await request(personal+'/'+cat,'GET',undefined,dogOwner.token)).status,404)

    assert.equal((await request('/admin/stores/'+ba,'PATCH',{enabled:false},manager.token)).status,200)
    assert.equal((await request(servicePath,'POST',forbiddenPost,owner.token)).status,403)
    assert.deepEqual(await counts(dogOwner.token),{published:1,likes:1,favorites:1})
    assert.equal((await request(servicePath+'/'+board)).status,404)
    assert.equal((await request(servicePath+'/'+board+'/comments')).status,404)
    assert.equal((await request(servicePath+'/'+board+'/like','PUT',{active:true},dogOwner.token)).status,404)
    assert.deepEqual((await request(servicePath+'?district=1816983&q='+suffix)).data.posts,[])
  } finally {
    await new Promise<void>(resolve => server.close(() => resolve()))
    for (const id of services) await db.execute('DELETE FROM h5_catalog_items WHERE id=?',[id])
    for (const id of stores) await db.execute('DELETE FROM h5_stores WHERE id=?',[id])
    for (const id of customCategories) await db.execute('DELETE FROM h5_service_categories WHERE id=?',[id])
    for (const id of accounts) await db.execute('DELETE FROM users WHERE id=?',[id])
    await db.end()
  }
})
