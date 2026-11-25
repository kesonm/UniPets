import assert from 'node:assert/strict'
import { randomUUID } from 'node:crypto'
import { once } from 'node:events'
import test from 'node:test'
import { createApp } from '../src/app.js'
import { config } from '../src/config.js'
import { db } from '../src/db.js'

test('storefronts and cart metadata use explicit store ownership and public content scopes', {timeout:30_000}, async () => {
  const server = createApp().listen(0,'127.0.0.1')
  await once(server,'listening')
  const address = server.address()
  assert.ok(address && typeof address === 'object')
  const origin = 'http://127.0.0.1:'+address.port+'/api'
  const marker = randomUUID().slice(0,8)
  const users: string[] = []
  const stores: string[] = []
  const products: string[] = []

  async function request(path: string, body?: unknown, cookie?: string, method = body ? 'POST' : 'GET') {
    const response = await fetch(origin+path,{method,body:JSON.stringify(body),headers:{
      'Content-Type':'application/json',Origin:config.origins[0],...(cookie ? {Cookie:cookie} : {}),
    }})
    return {status:response.status,data:await response.json(),cookie:response.headers.get('set-cookie')?.split(';')[0]}
  }
  async function member(label: string) {
    const registered = await request('/auth/register',{username:label+'_'+marker,password:'storefront-test-fixture'})
    assert.equal(registered.status,201)
    const id = registered.data.user.id as string
    users.push(id)
    const pet = await request('/pets',{name:'测试猫',species:'cat',breed:'布偶',gender:'female'},registered.cookie)
    assert.equal(pet.status,201)
    return {id,cookie:registered.cookie,petId:pet.data.pet.id as string}
  }
  async function store(owner: string, name: string) {
    const id = randomUUID()
    await db.execute('INSERT INTO h5_stores (id,name,owner_user_id,city_code,address,phone) VALUES (?,?,?,?,?,?)',
      [id,name,owner,'360100','测试地址','0791-00000000'])
    stores.push(id)
    return id
  }
  async function listing(storeId: string|null, kind: string, module: string, published = true) {
    const id = randomUUID()
    await db.execute(`INSERT INTO h5_catalog_items (id,store_id,kind,module,title,category,description,price_cents,stock,published)
      VALUES (?,?,?,?,?,?,?,?,?,?)`,[id,storeId,kind,module,'测试项目','food','项目内容',2600,10,published])
    products.push(id)
    return id
  }

  try {
    const owner = await member('store_owner')
    const visitor = await member('store_visitor')
    const main = await store(owner.id,'同名门店')
    const branch = await store(owner.id,'同名门店')
    const product = await listing(main,'product','shop')
    const branchProduct = await listing(branch,'product','shop')
    const standalone = await listing(null,'product','shop')
    const hidden = await listing(main,'product','shop',false)
    const generic = await listing(main,'article','education')
    const service = await listing(main,'article','services')
    const job = randomUUID(), demoJob = randomUUID(), pendingJob = randomUUID()
    for (const [id,status,demo] of [[job,'published',false],[demoJob,'published',true],[pendingJob,'pending',false]]) {
      await db.execute(`INSERT INTO h5_store_jobs (id,store_id,title,category,employment_type,salary,description,status,internal_demo,published_at)
        VALUES (?,?,'洗护员','care','full-time','面议','测试岗位',?,?,UTC_TIMESTAMP(3))`,[id,main,status,demo])
    }
    const postBody = {title:'门店动态',petId:owner.petId,body:'动态内容'}
    const unowned = await request('/h5/posts',{...postBody,petId:visitor.petId,storeId:main},visitor.cookie)
    assert.equal(unowned.status,404)
    const post = await request('/h5/posts',{...postBody,storeId:main},owner.cookie)
    const personal = await request('/h5/posts',postBody,owner.cookie)
    assert.equal(post.status,201)
    assert.equal(post.data.post.storeId,main)
    assert.equal(personal.data.post.storeId,null)
    const changeStore = '/h5/posts/'+personal.data.post.id+'/store'
    assert.equal((await request(changeStore,{storeId:null},visitor.cookie,'PUT')).status,404)
    assert.equal((await request(changeStore,{storeId:branch},owner.cookie,'PUT')).data.post.storeId,branch)
    assert.equal((await request(changeStore,{storeId:null},owner.cookie,'PUT')).data.post.storeId,null)
    const storyBody = {title:'宠物短剧',scenes:['门店短剧内容'],publish:true}
    assert.equal((await request('/h5/stories',{...storyBody,petId:visitor.petId,storeId:main},visitor.cookie)).status,404)
    const story = await request('/h5/stories',{...storyBody,petId:owner.petId,storeId:main},owner.cookie)
    assert.equal(story.status,201)
    const storyId = story.data.id
    assert.equal((await request('/h5/stories/'+storyId,storyBody,owner.cookie,'PUT')).status,200)
    assert.equal((await request('/h5/stories/'+storyId)).data.story.storeId,main)
    const draft = await request('/h5/stories',{...storyBody,petId:owner.petId,storeId:main,publish:false},owner.cookie)
    assert.equal(draft.status,201)

    const path = '/h5/catalog/storefront/'+main
    const storefront = await request(path)
    assert.equal(storefront.status,200)
    assert.equal(storefront.data.store.name,'同名门店')
    assert.equal('ownerUserId' in storefront.data.store,false)
    const contents = new Map(storefront.data.items.map((item: {kind:string;id:string})=>[item.kind,item.id]))
    assert.deepEqual(contents,new Map([
      ['product',product],['catalog',generic],['service',service],['job',job],['post',post.data.post.id],['story',storyId],
    ]))
    assert.equal(storefront.data.items.length,6)
    assert.deepEqual((await request(path+'?kind=job')).data.items.map((item:{id:string})=>item.id),[job])
    assert.equal((await request('/h5/catalog/'+product)).data.listing.storeId,main)
    assert.equal((await request('/h5/catalog/service-posts/'+service)).data.post.storeId,main)
    const metadata = await request('/h5/catalog/cart-stores?ids='+[product,branchProduct,standalone,hidden].join(','))
    assert.deepEqual(new Map(metadata.data.items.map((item:{itemId:string;storeId:string|null})=>[item.itemId,item.storeId])),
      new Map([[product,main],[branchProduct,branch],[standalone,null]]))
    assert.equal((await request('/h5/catalog/cart-stores?ids=bad')).status,400)
    await db.execute('UPDATE h5_stores SET enabled=FALSE WHERE id=?',[main])
    assert.equal((await request(path)).status,404)
    assert.equal((await request('/h5/posts/'+post.data.post.id)).data.post.storeId,null)
    assert.equal((await request('/h5/stories/'+storyId)).data.story.storeId,null)
  } finally {
    for (const id of products) await db.execute('DELETE FROM h5_catalog_items WHERE id=?',[id])
    for (const id of stores) await db.execute('DELETE FROM h5_stores WHERE id=?',[id])
    for (const id of users) await db.execute('DELETE FROM users WHERE id=?',[id])
    await new Promise<void>(resolve=>server.close(()=>resolve()))
    await db.end()
  }
})
