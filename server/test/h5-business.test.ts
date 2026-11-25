import assert from 'node:assert/strict'
import { randomUUID } from 'node:crypto'
import { once } from 'node:events'
import test from 'node:test'
import { createApp } from '../src/app.js'
import { config } from '../src/config.js'
import { db, rows } from '../src/db.js'

test('H5 business pages keep purchases and pet records private and persist participation', {timeout:20_000}, async () => {
  const server = createApp().listen(0,'127.0.0.1')
  await once(server,'listening')
  const address = server.address()
  assert.ok(address && typeof address==='object')
  const base = `http://127.0.0.1:${address.port}/api`
  const suffix = randomUUID().slice(0,8)
  const accounts: string[] = []
  const listings: string[] = []
  const operatorIds=config.h5OperatorIds

  async function request(path:string, method='GET', body?:unknown, cookie?:string) {
    const result = await fetch(base+path,{method,body:JSON.stringify(body),
      headers:{'Content-Type':'application/json',Origin:config.origins[0],...(cookie?{Cookie:cookie}:{})}})
    return {status:result.status,data:await result.json(),cookie:result.headers.get('set-cookie')?.split(';')[0]}
  }
  async function member(name:string) {
    const result = await request('/auth/register','POST',{
      username:'business_'+name+'_'+suffix,password:'business-page-fixture',displayName:'测试用户 '+name,
    })
    assert.equal(result.status,201)
    const id=result.data.user.id as string
    accounts.push(id)
    const pet=await request('/pets','POST',{name:'测试宠物 '+name,species:'cat',breed:'布偶猫',gender:'female'},result.cookie)
    assert.equal(pet.status,201)
    return {id,petId:pet.data.pet.id as string,cookie:result.cookie!}
  }
  async function listing(module:string,kind:string,category:string,title:string,{
    published=true,stock=null as number|null,price=null as number|null,start=null as Date|null,link=null as string|null,
    area='shenzhen-nanshan',
  }={}) {
    const id=randomUUID()
    listings.push(id)
    await db.execute(`INSERT INTO h5_catalog_items
      (id,module,kind,category,title,provider,description,area,published,stock,price_cents,starts_at,external_url)
      VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?)`,
    [id,module,kind,category,title+' '+suffix,'测试机构','隔离测试',area,published,stock,price,start,link])
    return id
  }
  async function stock(id:string) {
    const [item]=await rows<{stock:number}>('SELECT stock FROM h5_catalog_items WHERE id=?',[id])
    return item.stock
  }

  try {
    const owner=await member('owner'), other=await member('other')
    config.h5OperatorIds=[other.id]
    assert.deepEqual((await request('/h5/operations/access','GET',undefined,owner.cookie)).data,{allowed:false})
    assert.equal((await request('/h5/operations/catalog','GET',undefined,owner.cookie)).status,403)
    const serviceTitle='运营预约 '+suffix
    const created=await request('/h5/operations/catalog','POST',{
      module:'services',category:'photography',kind:'appointment',title:serviceTitle,
      provider:'测试门店',description:'隔离测试',area:'shenzhen-nanshan',venue:'测试地址',
      startsAt:new Date(Date.now()+3600000).toISOString(),closesAt:null,priceCents:null,stock:2,externalUrl:null,published:false,
    },other.cookie)
    assert.equal(created.status,201)
    listings.push(created.data.id)
    assert.equal((await request('/h5/catalog/'+created.data.id)).status,404)
    assert.equal((await request('/h5/operations/catalog/'+created.data.id,'PATCH',{published:true},other.cookie)).status,200)
    const newBooking=await request('/h5/catalog/'+created.data.id+'/participation','POST',{petId:owner.petId},owner.cookie)
    assert.equal(newBooking.status,200)
    const update='/h5/operations/engagements/'+newBooking.data.engagement.id
    assert.equal((await request(update,'PATCH',{action:'confirm'},owner.cookie)).status,403)
    assert.equal((await request(update,'PATCH',{action:'confirm'},other.cookie)).status,200)
    assert.equal((await request(update,'PATCH',{action:'redeem',code:randomUUID()},other.cookie)).status,400)
    assert.equal((await request(update,'PATCH',{action:'redeem',code:newBooking.data.engagement.id},other.cookie)).status,200)
    const appointment=await listing('services','appointment','grooming','洗护预约',{stock:1})
    const hidden=await listing('services','appointment','grooming','未公开预约',{published:false})
    const lesson=await listing('education','enrollment','online','宠物随行')
    const official=await listing('charity','link','donation','公益链接',{link:'http://example.com/'})
    assert.equal((await request('/h5/catalog/'+hidden)).status,404)
    assert.equal((await request('/h5/catalog/'+official)).data.listing.externalUrl,null)
    const visible=(await request('/h5/catalog?module=services&q='+suffix)).data.listings
    assert.deepEqual(new Set(visible.map((item:{id:string})=>item.id)),new Set([appointment,created.data.id]))
    const reserve='/h5/catalog/'+appointment+'/participation'
    assert.equal((await request(reserve,'POST',{petId:owner.petId})).status,401)
    assert.equal((await request(reserve,'POST',{petId:other.petId},owner.cookie)).status,404)
    const attempt=await request(reserve,'POST',{petId:owner.petId},owner.cookie)
    assert.equal(attempt.status,200)
    assert.equal(attempt.data.engagement.status,'requested')
    assert.equal((await request(reserve,'POST',{petId:owner.petId},owner.cookie)).data.engagement.id,attempt.data.engagement.id)
    assert.equal((await request(reserve,'POST',{petId:other.petId},other.cookie)).status,409)
    assert.equal((await request('/h5/engagements/'+attempt.data.engagement.id,'PATCH',{action:'cancel'},other.cookie)).status,404)
    assert.equal((await request('/h5/engagements/'+attempt.data.engagement.id,'PATCH',{action:'cancel'},owner.cookie)).status,200)
    assert.equal((await request(reserve,'POST',{petId:other.petId},other.cookie)).status,200)
    const enrolled=await request('/h5/catalog/'+lesson+'/participation','POST',{petId:owner.petId},owner.cookie)
    assert.equal(enrolled.status,200)
    const checkIn=await request('/h5/engagements/'+enrolled.data.engagement.id,'PATCH',{action:'check-in'},owner.cookie)
    assert.equal(checkIn.status,200)
    assert.ok(checkIn.data.engagement.checkedInAt)

    const goods=await listing('shop','product','food','宠粮',{stock:3,price:1500})
    const memorialGoods=await listing('immortality','product','keepsake','纪念品',{stock:2,price:990})
    const localAshes=await listing('immortality','article','ashes-storage','骨灰存放')
    const remoteAshes=await listing('immortality','article','ashes-storage','骨灰存放',{area:'shanghai-xuhui'})
    const temple=await listing('immortality','article','temple-blessing','寺庙祈福')
    const memorialCatalog='/h5/catalog?module=immortality&q='+suffix
    assert.deepEqual(new Set((await request(memorialCatalog+'&category=ashes-storage')).data.listings.map((item:{id:string})=>item.id)),
      new Set([localAshes,remoteAshes]))
    assert.deepEqual(new Set((await request(memorialCatalog+'&local=1&district=6571327')).data.listings.map((item:{id:string})=>item.id)),
      new Set([localAshes,temple,memorialGoods]))
    const checkout={requestKey:randomUUID(),items:[
      {itemId:goods,quantity:2,unitCents:1500},{itemId:memorialGoods,quantity:1,unitCents:990},
    ]}
    assert.equal((await request('/h5/orders','POST',{...checkout,items:[{...checkout.items[0],unitCents:1}]},owner.cookie)).status,409)
    assert.equal(await stock(goods),3)
    const [paidRequest,retry]=await Promise.all([
      request('/h5/orders','POST',checkout,owner.cookie),request('/h5/orders','POST',checkout,owner.cookie),
    ])
    assert.equal(paidRequest.status,200)
    const order=paidRequest.data.order
    assert.deepEqual(retry.data.order,order)
    assert.equal(order.totalCents,3990)
    assert.equal(order.status,'submitted')
    const productCatalog='/h5/catalog?kind=product&q='+suffix
    assert.equal((await request(productCatalog)).data.listings.find((item:{id:string})=>item.id===goods).salesCount,0)
    assert.equal(await stock(goods),1)
    assert.equal((await request('/h5/orders','GET',undefined,other.cookie)).data.orders.length,0)
    assert.equal((await request('/h5/orders/'+order.id+'/support','PUT',{message:'来自其他账号'},other.cookie)).status,404)
    assert.equal((await request('/h5/orders/'+order.id+'/support','PUT',{message:'售后记录测试'},owner.cookie)).status,200)
    assert.equal((await request('/h5/orders','GET',undefined,owner.cookie)).data.orders[0].supportMessage,'售后记录测试')
    for(let count=0;count<2;count++) assert.equal((await request('/h5/orders/'+order.id+'/cancel','POST',{},owner.cookie)).status,200)
    assert.equal(await stock(goods),3)
    assert.equal(await stock(memorialGoods),2)
    const bought=await request('/h5/orders','POST',{...checkout,requestKey:randomUUID()},owner.cookie)
    assert.equal(bought.status,200)
    const settlement='/h5/operations/orders/'+bought.data.order.id
    assert.equal((await request(settlement,'PATCH',{action:'confirm'},other.cookie)).status,200)
    assert.equal((await request(settlement,'PATCH',{action:'complete'},other.cookie)).status,200)
    const sold=(await request(productCatalog)).data.listings
    assert.equal(sold.find((item:{id:string})=>item.id===goods).salesCount,2)
    assert.equal(sold.find((item:{id:string})=>item.id===memorialGoods).salesCount,1)

    const archive='/h5/pet-records/'+owner.petId
    assert.equal((await request(archive,'GET',undefined,other.cookie)).status,404)
    assert.equal((await request(archive+'/health','POST',{kind:'exam',title:'体检记录',happenedOn:'2026-06-01'},owner.cookie)).status,201)
    assert.equal((await request(archive+'/memorial','PUT',{title:'私密纪念馆',remembrance:'测试回忆'},owner.cookie)).status,200)
    assert.equal((await request(archive+'/memorial/tributes','POST',{kind:'candle'},owner.cookie)).status,201)
    const privateArchive=(await request(archive,'GET',undefined,owner.cookie)).data
    assert.deepEqual(privateArchive.health.map((item:{title:string})=>item.title),['体检记录'])
    assert.equal(privateArchive.engagements.find((item:{itemId:string})=>item.itemId===lesson).status,'joined')
    assert.equal(privateArchive.memorial.title,'私密纪念馆')
    assert.equal(privateArchive.tributes[0].kind,'candle')
    await db.execute('INSERT INTO h5_wallet_entries (id,user_id,pet_id,currency,quantity,label) VALUES (?,?,?,?,?,?)',
      [randomUUID(),owner.id,owner.petId,'points',20,'测试积分入账'])
    assert.equal((await request('/h5/wallet?petId='+owner.petId,'GET',undefined,owner.cookie)).data.balances.points,20)
    assert.equal((await request('/h5/wallet?petId='+owner.petId,'GET',undefined,other.cookie)).status,404)
    const draft={title:'隔离剧本 '+suffix,scenes:['开场','回家'],publish:false,coverAssetId:null}
    const written=await request('/h5/stories','POST',{...draft,petId:owner.petId},owner.cookie)
    assert.equal(written.status,201)
    const storyId=written.data.id
    assert.equal((await request('/h5/stories/'+storyId)).status,404)
    assert.equal((await request('/h5/stories/'+storyId,'PUT',{...draft,publish:true},other.cookie)).status,404)
    assert.equal((await request('/h5/stories/'+storyId,'PUT',{...draft,publish:true},owner.cookie)).status,200)
    assert.deepEqual((await request('/h5/stories/'+storyId)).data.story.scenes,['开场','回家'])
    const reacted=await request('/h5/stories/'+storyId+'/reaction','PUT',{kind:'favorite',active:true},other.cookie)
    assert.equal(reacted.status,200)
    assert.equal((await request('/h5/my-story-reactions','GET',undefined,other.cookie)).data.favorites[0].id,storyId)

    const post=await request('/h5/posts','POST',{petId:owner.petId,title:'测试动态'},owner.cookie)
    const guide=await request('/h5/posts','POST',{petId:owner.petId,title:'出行测试 '+suffix,topic:'travel'},owner.cookie)
    assert.equal(guide.status,201)
    const guides=(await request('/h5/posts?topic=travel&q='+suffix)).data.posts
    assert.deepEqual(guides.map((item:{id:string})=>item.id),[guide.data.post.id])
    const comments='/h5/posts/'+post.data.post.id+'/comments'
    const comment=await request(comments,'POST',{body:'评论示例'},other.cookie)
    assert.equal(comment.status,201)
    assert.equal((await request(comments)).data.comments[0].body,'评论示例')
    assert.equal((await request(comments+'/'+comment.data.comment.id,'DELETE',{},owner.cookie)).status,404)

    const matchInfo={area:'shenzhen-nanshan',intent:'friends',introduction:'一起玩'}
    assert.equal((await request('/h5/my-matches/'+owner.petId,'PUT',matchInfo,other.cookie)).status,404)
    assert.equal((await request('/h5/my-matches/'+owner.petId,'PUT',matchInfo,owner.cookie)).status,200)
    const publicMatch=(await request('/h5/matches?area=shenzhen-nanshan&species=cat&breed=%E5%B8%83%E5%81%B6%E7%8C%AB')).data.matches.find((item:{petId:string})=>item.petId===owner.petId)
    assert.equal(publicMatch.petName,'测试宠物 owner')
    assert.equal('userId' in publicMatch,false)
    const invite=await request('/h5/friend-requests','POST',{sourcePetId:other.petId,targetPetId:owner.petId},other.cookie)
    assert.equal(invite.status,200)
    assert.equal((await request('/h5/friend-requests/'+invite.data.request.id,'PATCH',{status:'accepted'},other.cookie)).status,404)
    assert.equal((await request('/h5/friend-requests/'+invite.data.request.id,'PATCH',{status:'accepted'},owner.cookie)).status,200)

    const group=await listing('friends','group','community','同城社群')
    assert.equal((await request('/h5/groups/'+group+'/messages','GET',undefined,owner.cookie)).status,403)
    assert.equal((await request('/h5/catalog/'+group+'/participation','POST',{},owner.cookie)).status,200)
    assert.equal((await request('/h5/groups/'+group+'/messages','POST',{body:'测试社群成员发言'},owner.cookie)).status,201)
    assert.equal((await request('/h5/groups/'+group+'/messages','GET',undefined,other.cookie)).status,403)
    assert.equal((await request('/h5/groups/'+group+'/messages','GET',undefined,owner.cookie)).data.messages.length,1)
  } finally {
    config.h5OperatorIds=operatorIds
    await new Promise<void>(resolve=>server.close(()=>resolve()))
    for(const id of accounts) await db.execute('DELETE FROM users WHERE id=?',[id])
    for(const id of listings) await db.execute('DELETE FROM h5_catalog_items WHERE id=?',[id])
    await db.end()
  }
})
