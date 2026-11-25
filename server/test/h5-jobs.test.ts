import assert from 'node:assert/strict'
import { randomUUID } from 'node:crypto'
import { once } from 'node:events'
import test from 'node:test'
import { createApp } from '../src/app.js'
import { config } from '../src/config.js'
import { db } from '../src/db.js'

test('only approved openings at active stores appear in the job directory', {timeout:30_000}, async () => {
  const server = createApp().listen(0,'127.0.0.1')
  await once(server,'listening')
  const address = server.address()
  assert.ok(address && typeof address === 'object')
  const base = 'http://127.0.0.1:'+address.port+'/api'
  const suffix = randomUUID().slice(0,8)
  const users: string[] = []
  const stores: string[] = []
  const password = 'jobs-integration-fixture'

  async function request(path: string, method = 'GET', body?: unknown, cookie?: string) {
    const response = await fetch(base+path,{method,body:JSON.stringify(body),headers:{
      Origin:config.origins[0],'Content-Type':'application/json',...(cookie ? {Cookie:cookie} : {}),
    }})
    return {status:response.status,data:await response.json(),cookie:response.headers.get('set-cookie')?.split(';')[0]}
  }

  async function register(label: string) {
    const username = label+'_'+suffix
    const result = await request('/auth/register','POST',{username,password})
    assert.equal(result.status,201)
    const id = result.data.user.id as string
    users.push(id)
    return {id,username,cookie:result.cookie}
  }

  async function createStore(ownerId: string, city: string) {
    const id = randomUUID()
    await db.execute('INSERT INTO h5_stores (id,name,city_code,address,phone,owner_user_id) VALUES (?,?,?,?,?,?)',
      [id,'测试招聘门店 '+suffix,city,'测试门店地址','0791-00000000',ownerId])
    stores.push(id)
    return id
  }

  try {
    const owner = await register('job_owner')
    const other = await register('job_member')
    const manager = await register('job_admin')
    await db.execute('UPDATE users SET is_admin=TRUE WHERE id=?',[manager.id])
    const login = await request('/admin/login','POST',{username:manager.username,password})
    assert.equal(login.status,200)
    const admin = (path: string, method = 'GET', body?: unknown) => request('/admin/stores'+path,method,body,login.cookie)
    const store = await createStore(owner.id,'360100')
    const secondStore = await createStore(owner.id,'440300')
    const mine = '/h5/jobs/mine/'+store
    const form = {title:'测试宠物美容师 '+suffix,category:'grooming',employmentType:'full-time',salary:'5000–7000 元/月',description:'洗护与日常美容'}

    assert.equal((await request(mine)).status,401)
    assert.equal((await request(mine,'GET',undefined,other.cookie)).status,404)
    assert.equal((await request(mine,'POST',form,other.cookie)).status,404)
    assert.equal((await request(mine,'POST',{...form,phone:'123'},owner.cookie)).status,400)
    assert.equal((await request('/admin/stores/jobs','GET',undefined,owner.cookie)).status,403)
    const submitted = await request(mine,'POST',form,owner.cookie)
    assert.equal(submitted.status,201)
    const id = submitted.data.id as string
    const pending = await request(mine,'GET',undefined,owner.cookie)
    assert.equal(pending.data.items[0].status,'pending')
    assert.equal((await request('/h5/jobs/'+id)).status,404)
    assert.deepEqual((await admin('/jobs?state=pending&q='+suffix)).data.items.map((job: {id:string}) => job.id),[id])

    assert.equal((await admin('/jobs/'+id,'PATCH',{status:'published'})).status,200)
    const detail = await request('/h5/jobs/'+id)
    assert.equal(detail.status,200)
    assert.equal(detail.data.job.storeId,store)
    assert.equal(detail.data.job.phone,'0791-00000000')
    assert.equal(detail.data.job.address,'测试门店地址')
    assert.ok(detail.data.job.publishedAt)
    assert.equal((await admin('/jobs/'+id,'PATCH',{status:'rejected'})).status,409)

    const second = await request('/h5/jobs/mine/'+secondStore,'POST',
      {...form,category:'care',employmentType:'part-time'},owner.cookie)
    assert.equal(second.status,201)
    assert.equal((await admin('/jobs/'+second.data.id,'PATCH',{status:'published'})).status,200)
    const ids = async (filter = '') => (await request('/h5/jobs'+filter)).data.items.map((job: {id:string}) => job.id) as string[]
    const latest = await ids()
    assert.ok(latest.indexOf(second.data.id) >= 0 && latest.indexOf(second.data.id) < latest.indexOf(id))
    const filtered = await ids('?city=360100&category=grooming&type=full-time')
    assert.ok(filtered.includes(id))
    assert.ok(!filtered.includes(second.data.id))
    assert.ok(!(await ids('?city=440300')).includes(id))
    assert.ok(!(await ids('?category=care')).includes(id))
    assert.ok(!(await ids('?type=part-time')).includes(id))
    assert.equal((await request('/h5/jobs?category=unknown')).status,400)

    assert.equal((await admin('/'+store,'PATCH',{enabled:false})).status,200)
    assert.equal((await request('/h5/jobs/'+id)).status,404)
    assert.equal((await request(mine,'POST',form,owner.cookie)).status,409)
    assert.equal((await admin('/'+store,'PATCH',{enabled:true})).status,200)
    assert.equal((await request('/h5/jobs/'+id)).status,200)

    assert.equal((await request(mine+'/'+id+'/close','PUT',{},other.cookie)).status,404)
    assert.equal((await request(mine+'/'+id+'/close','PUT',{},owner.cookie)).status,200)
    assert.equal((await request('/h5/jobs/'+id)).status,404)
    assert.equal((await admin('/jobs/'+id,'PATCH',{status:'published'})).status,409)
    assert.equal((await admin('/jobs/'+second.data.id,'PATCH',{status:'closed'})).status,200)
    assert.equal((await request('/h5/jobs/'+second.data.id)).status,404)

    const rejected = await request(mine,'POST',form,owner.cookie)
    assert.equal(rejected.status,201)
    assert.equal((await admin('/jobs/'+rejected.data.id,'PATCH',{status:'rejected'})).status,200)
    assert.ok((await request(mine,'GET',undefined,owner.cookie)).data.items.some((job: {id:string;status:string}) =>
      job.id === rejected.data.id && job.status === 'rejected'))
  } finally {
    for (const id of stores) await db.execute('DELETE FROM h5_stores WHERE id=?',[id])
    for (const id of users) await db.execute('DELETE FROM users WHERE id=?',[id])
    await new Promise<void>(resolve => server.close(() => resolve()))
    await db.end()
  }
})
