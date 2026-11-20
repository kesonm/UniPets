import test from 'node:test'
import assert from 'node:assert/strict'
import { createServer } from 'node:http'
import { randomBytes, randomUUID } from 'node:crypto'
import { once } from 'node:events'
import sharp from 'sharp'
import { createApp } from '../src/app.js'
import { db, rows } from '../src/db.js'
import { config } from '../src/config.js'
import { startWorker, stopWorker } from '../src/jobs.js'
import { removeFile, saveImage } from '../src/assets.js'
import { createGenerationTestApp } from './generation-app.js'

test('MySQL-backed accounts, private assets, generation and desktop lifecycle', {timeout:60_000}, async t=>{
  const photo=await sharp({create:{width:80,height:80,channels:4,background:{r:255,g:210,b:20,alpha:1}}}).png().toBuffer()
  const strip=await sharp({create:{width:512,height:128,channels:4,background:{r:150,g:100,b:40,alpha:0.8}}}).png().toBuffer()
  let failWalk=false, calls=0
  const provider=createServer(async(req,res)=>{
    let body='';for await(const chunk of req)body+=chunk.toString()
    calls++
    if(failWalk&&body.includes('walking in place')){res.writeHead(503);res.end('{}');return}
    res.setHeader('Content-Type','application/json');res.end(JSON.stringify({data:[{b64_json:strip.toString('base64')}]}))
  }).listen(0,'127.0.0.1')
  await once(provider,'listening')
  config.imageKey='integration-test';config.imageUrl=`http://127.0.0.1:${(provider.address() as any).port}/images/edits`
  config.videoKey='integration-test';config.videoBaseUrl=`http://127.0.0.1:${(provider.address() as any).port}`
  const server=createApp().listen(0,'127.0.0.1');await once(server,'listening')
  const publicBase=`http://127.0.0.1:${(server.address() as any).port}/api`
  let base=publicBase
  let legacy: typeof server | undefined
  const userIds:string[]=[]
  const suffix=randomBytes(6).toString('hex'),aName=`qa_a_${suffix}`,bName=`qa_b_${suffix}`,password='PetCloud_test_2026!'
  let alice='',bob='',petId='',assetId='',cookie=''
  async function request(path:string,method='GET',body?:unknown,token='',headers:Record<string,string>={}) {
    const response=await fetch(`${base}${path}`,{method,headers:{'Content-Type':'application/json','X-PetCloud-Client':'desktop',...(token?{Authorization:`Bearer ${token}`} : {}),...headers},body:body===undefined?undefined:JSON.stringify(body)})
    const data=response.headers.get('content-type')?.includes('application/json')?await response.json():await response.arrayBuffer()
    return {status:response.status,data,headers:response.headers}
  }
  const petBody={name:'测试伙伴',species:'dog',breed:'金毛',birthday:'2024-05-01',gender:'male',notes:'测试数据',avatarAssetId:null}
  async function waitJob(id:string){
    for(let i=0;i<100;i++){const result=await request('/jobs','GET',undefined,alice);const job=result.data.jobs.find((j:any)=>j.id===id);if(!['queued','running'].includes(job.status))return job;await new Promise(r=>setTimeout(r,100))}
    throw new Error('Job timeout')
  }
  try {
    assert.equal((await rows("SELECT id FROM generation_jobs WHERE status IN ('queued','running')")).length,0,'Stop the API and wait for existing jobs before running integration tests')
    await t.test('registration validates passwords; credentials are hashed; cookies restore sessions',async()=>{
      assert.equal((await request('/auth/register','POST',{username:aName,password:'short'})).status,400)
      const a=await request('/auth/register','POST',{username:aName,password});assert.equal(a.status,201);alice=a.data.token;userIds.push(a.data.user.id)
      assert.equal(a.data.user.passwordHash,undefined)
      const b=await request('/auth/register','POST',{username:bName,password});assert.equal(b.status,201);bob=b.data.token;userIds.push(b.data.user.id)
      assert.equal((await request('/auth/register','POST',{username:aName,password})).status,409)
      assert.equal((await request('/auth/login','POST',{username:aName,password:'wrong'})).status,401)
      const [stored]=await rows('SELECT password_hash FROM users WHERE id=?',[a.data.user.id]);assert.notEqual(stored.password_hash,password);assert.match(stored.password_hash,/^scrypt:/)
      const credentials={username:aName,password}
      const headers={'X-PetCloud-Client':'web',Origin:'http://127.0.0.1:4173'}
      const {production,allowHttpAuth}=config
      try {
        config.production=true
        config.allowHttpAuth=false
        const secure=await request('/auth/login','POST',credentials,'',headers)
        assert.match(secure.headers.get('set-cookie')!,/; Secure\b/i)
        config.allowHttpAuth=true
        const web=await request('/auth/login','POST',credentials,'',headers)
        assert.equal(web.status,200);assert.equal(web.data.token,undefined)
        const setCookie=web.headers.get('set-cookie')!
        assert.match(setCookie,/HttpOnly/i);assert.match(setCookie,/SameSite=Lax/i)
        assert.doesNotMatch(setCookie,/; Secure\b/i)
        cookie=setCookie.split(';')[0]
      } finally {
        config.production=production
        config.allowHttpAuth=allowHttpAuth
      }
      assert.equal((await request('/auth/me','GET',undefined,'',{Cookie:cookie})).data.user.username,aName)
      assert.equal((await request('/auth/login','POST',{username:aName,password},'',{Origin:'https://untrusted.example'})).status,403)
    })
    await t.test('pets persist and are isolated by owner',async()=>{
      assert.equal((await request('/pets')).status,401)
      const pet=await request('/pets','POST',petBody,alice);assert.equal(pet.status,201);petId=pet.data.pet.id
      assert.equal((await request('/pets','GET',undefined,alice)).data.pets[0].name,'测试伙伴')
      assert.equal((await request('/pets','GET',undefined,bob)).data.pets.length,0)
      assert.equal((await request(`/pets/${petId}`,'PATCH',petBody,bob)).status,404)
      assert.equal((await request(`/pets/${petId}`,'DELETE',{},bob)).status,404)
      assert.equal((await request(`/pets/${petId}`,'PATCH',{...petBody,name:'伙伴新名字'},alice)).status,200)
    })
    await t.test('uploads validate decoded content; bytes, rename, memories and desktop settings are private',async()=>{
      assert.equal((await request('/assets','POST',{petId,name:'伪造图片',image:'data:image/png;base64,SGVsbG8='},alice)).status,400)
      const result=await request('/assets','POST',{petId,name:'正面照',image:`data:image/png;base64,${photo.toString('base64')}`},alice)
      assert.equal(result.status,201);assetId=result.data.asset.id
      assert.equal((await request(`/assets/${assetId}/file`,'GET',undefined,alice)).status,200)
      assert.equal((await request(`/assets/${assetId}/file`,'GET',undefined,bob)).status,404)
      assert.equal((await request(`/assets/${assetId}`,'PATCH',{name:'非法改名'},bob)).status,404)
      assert.equal((await request(`/assets/${assetId}`,'DELETE',{},bob)).status,404)
      assert.equal((await request(`/assets/${assetId}`,'PATCH',{name:'伙伴的照片'},alice)).status,200)
      const memory=await request('/memories','POST',{petId,title:'初次见面',content:'保留的测试记忆',happenedOn:'2026-10-26',assetId},alice)
      assert.equal(memory.status,201);assert.equal((await request('/memories','GET',undefined,bob)).data.memories.length,0)
      assert.equal((await request(`/memories/${memory.data.memory.id}`,'DELETE',{},bob)).status,404)
      const settings={petId,size:220,enabled:true,idleAssetId:assetId,happyAssetId:null,walkAssetId:null,sleepAssetId:null}
      assert.equal((await request('/desktop','PUT',settings,bob)).status,404)
      assert.equal((await request('/desktop','PUT',settings,alice)).status,200)
      const desktop=await request('/desktop','GET',undefined,alice);assert.equal(desktop.data.profile.idleAssetId,assetId);assert.equal(desktop.data.assets[0].id,assetId)
    })
    await t.test('paused generation keeps pet management and existing media available',async()=>{
      assert.equal((await request('/dashboard','GET',undefined,alice)).data.generationEnabled,false)
      assert.equal((await request('/jobs','GET',undefined,alice)).status,404)
      assert.equal((await request('/jobs','POST',{petId,referenceAssetId:assetId,mode:'image'},alice)).status,404)
      assert.equal((await request('/jobs','POST',{petId,referenceAssetId:assetId,mode:'video'},alice)).status,404)
      assert.equal((await request(`/motions/${petId}/batch-plan`,'GET',undefined,alice)).status,404)
      assert.equal((await request(`/motions/${petId}/batch-plan/${assetId}`,'GET',undefined,alice)).status,404)
      assert.equal((await request(`/motions/${petId}/poses/stand_left`,'PUT',{assetId},alice)).status,404)
      assert.equal((await request(`/motions/${petId}/generate`,'POST',{kind:'pose',key:'stand_left',referenceAssetId:assetId},alice)).status,404)
      const manifest=await request(`/motions/${petId}`,'GET',undefined,alice)
      assert.equal(manifest.status,200)
      assert.equal(manifest.data.poseGenerationEnabled,false)
      assert.equal(manifest.data.clipGenerationEnabled,false)
      assert.deepEqual(manifest.data.steps,[])
      assert.equal((await request(`/assets/${assetId}/file`,'GET',undefined,alice)).status,200)
      assert.equal(calls,0)
    })
    await t.test('owners can manage profiles with jobs left in the paused queue',async()=>{
      const webHeaders={Cookie:cookie,Origin:'http://127.0.0.1:4173','X-PetCloud-Client':'web'}
      const draft=await request('/pets','POST',{name:'普通档案',species:'other'},'',webHeaders)
      assert.equal(draft.status,201)
      const id=draft.data.pet.id
      assert.equal(draft.data.pet.identityNumber,null)
      const photoResult=await request('/assets','POST',{petId:id,name:'照片',image:`data:image/png;base64,${photo.toString('base64')}`},'',webHeaders)
      assert.equal(photoResult.status,201)
      const photoId=photoResult.data.asset.id
      await db.execute('INSERT INTO generation_jobs (id,user_id,pet_id,reference_asset_id) VALUES (?,?,?,?)',[randomUUID(),userIds[0],id,photoId])
      assert.equal((await request(`/assets/${photoId}`,'DELETE',{},'',webHeaders)).status,409,'references remain intact while a historical job is paused')
      assert.equal((await request(`/pets/${id}`,'DELETE',{},bob)).status,404)
      assert.equal((await request(`/pets/${id}`,'DELETE',{},'',webHeaders)).status,200)
      assert.equal((await rows('SELECT id FROM generation_jobs WHERE pet_id=?',[id])).length,0)
      assert.equal((await request(`/assets/${photoId}/file`,'GET',undefined,'',webHeaders)).status,404)
    })
    legacy=createGenerationTestApp().listen(0,'127.0.0.1')
    await once(legacy,'listening')
    base=`http://127.0.0.1:${(legacy.address() as any).port}/api`
    await t.test('durable jobs prevent duplicates and retain successful frames on partial failure',async()=>{
      const job=await request('/jobs','POST',{petId,referenceAssetId:assetId,mode:'image'},alice);assert.equal(job.status,202)
      assert.equal((await request('/jobs','POST',{petId,referenceAssetId:assetId,mode:'image'},alice)).status,409)
      assert.equal((await request(`/assets/${assetId}`,'DELETE',{},alice)).status,409)
      assert.equal((await request(`/pets/${petId}`,'DELETE',{},alice)).status,409)
      await startWorker()
      const completed=await waitJob(job.data.job.id);assert.equal(completed.status,'completed');assert.equal(completed.completed,4);assert.equal(calls,4)
      assert.equal((await request('/assets','GET',undefined,alice)).data.assets.filter((a:any)=>a.kind==='sprite').length,4)
      failWalk=true
      const partial=await request('/jobs','POST',{petId,referenceAssetId:assetId,mode:'image'},alice)
      const result=await waitJob(partial.data.job.id);assert.equal(result.status,'partial');assert.equal(result.completed,3);assert.equal(calls,8)
    })
    await t.test('an owned web action is claimed once by the matching desktop session',async()=>{
      const owner=userIds[0],body={petId,action:'stand_idle'},gentle={petId,action:'stand_tail_gentle'}
      const webHeaders={Cookie:cookie,Origin:'http://127.0.0.1:4173','X-PetCloud-Client':'web'}
      assert.equal((await request('/desktop/action','POST',body,alice)).status,409,'a key action needs transparent frames')
      assert.equal((await request(`/motions/${petId}/poses/stand_left`,'PUT',{assetId},alice)).status,200)
      const idle=await saveImage({userId:owner,petId,name:'待机',bytes:strip,action:'stand_idle'})
      await db.execute('UPDATE assets SET motion_from_asset_id=?,motion_to_asset_id=?,motion_joinable=1,background_removed=1 WHERE id=?',[assetId,assetId,idle.id])
      assert.equal((await request('/desktop/action','POST',gentle,'',webHeaders)).status,409,'an older standing clip cannot satisfy a gentle tail request')
      assert.equal((await request('/desktop/action','GET',undefined,alice)).data.command,null)
      assert.equal((await request('/desktop/action','POST',{petId,action:'wake_up'},alice)).status,400)
      assert.equal((await request('/desktop/action','POST',body,bob)).status,404)
      const issued=await request('/desktop/action','POST',body,'',webHeaders)
      assert.equal(issued.status,202,JSON.stringify(issued.data))
      const {command}=issued.data, route=`/desktop/action/${command.id}`
      assert.equal(command.status,'queued')
      assert.equal(command.action,'stand_idle','the stored request preserves a deliberate return to standing')
      assert.equal((await request('/desktop/action','POST',body,alice)).status,409)
      assert.equal((await request('/desktop/action','GET',undefined,bob)).data.command,null)
      assert.equal((await request(route,'PUT',{status:'playing'},'',webHeaders)).status,403)
      assert.equal((await request(route,'PUT',{status:'playing'},alice)).status,200)
      assert.equal((await request(route,'PUT',{status:'playing'},alice)).status,409)
      const anotherSession=await request('/auth/login','POST',{username:aName,password})
      assert.equal((await request(route,'PUT',{status:'completed'},anotherSession.data.token)).status,409)
      assert.equal((await request(route,'PUT',{status:'completed'},alice)).status,200)
      assert.equal((await request('/desktop/action','GET',undefined,'',webHeaders)).data.command.status,'completed')

      const stand=await saveImage({userId:owner,petId,name:'轻摆尾',bytes:strip,action:'stand_tail_gentle'})
      await db.execute('UPDATE assets SET motion_from_asset_id=?,motion_to_asset_id=?,motion_joinable=1,background_removed=1 WHERE id=?',[assetId,assetId,stand.id])
      const expired=await request('/desktop/action','POST',gentle,alice)
      assert.equal(expired.status,202,'the generation makes this action available')
      assert.equal(expired.data.command.action,'stand_tail_gentle')
      await db.execute('UPDATE desktop_action_requests SET expires_at=DATE_SUB(UTC_TIMESTAMP(3),INTERVAL 1 SECOND) WHERE user_id=?',[owner])
      assert.equal((await request('/desktop/action','GET',undefined,alice)).data.command.status,'expired')
      assert.equal((await request(`/desktop/action/${expired.data.command.id}`,'PUT',{status:'playing'},alice)).status,409)
    })
    await t.test('password changes revoke browser and desktop sessions; delete cascades and logout revoke access',async()=>{
      base=publicBase
      assert.equal((await request('/auth/password','POST',{currentPassword:password,newPassword:'New_PetCloud_2026!'},alice)).status,200)
      assert.equal((await request('/auth/me','GET',undefined,alice)).status,401)
      assert.equal((await request('/auth/me','GET',undefined,'',{Cookie:cookie})).status,401)
      const login=await request('/auth/login','POST',{username:aName,password:'New_PetCloud_2026!'});alice=login.data.token;assert.equal(login.status,200)
      assert.equal((await request(`/pets/${petId}`,'DELETE',{},alice)).status,200)
      assert.equal((await request('/assets','GET',undefined,alice)).data.assets.length,0)
      assert.equal((await request('/memories','GET',undefined,alice)).data.memories.length,0)
      assert.equal((await request('/desktop','GET',undefined,alice)).data.profile.petId,null)
      assert.equal((await request('/auth/logout','POST',{},alice)).status,200)
      assert.equal((await request('/auth/me','GET',undefined,alice)).status,401)
    })
  } finally {
    await stopWorker()
    if (legacy) await new Promise<void>(resolve=>legacy!.close(()=>resolve()))
    for(const id of userIds){const files=await rows('SELECT file_key,source_video_key FROM assets WHERE user_id=?',[id]);await db.execute('DELETE FROM users WHERE id=?',[id]);await Promise.all(files.map(file=>removeFile(file.file_key,file.source_video_key)))}
    await new Promise<void>(resolve=>server.close(()=>resolve()));await new Promise<void>(resolve=>provider.close(()=>resolve()));await db.end()
  }
})
