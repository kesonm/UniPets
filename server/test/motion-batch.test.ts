import test from 'node:test'
import assert from 'node:assert/strict'
import { once } from 'node:events'
import { randomUUID } from 'node:crypto'
import { writeFile } from 'node:fs/promises'
import sharp from 'sharp'
import { catClips, catDefaultAction, catGenerationClips, catJumpAction, catPoses, catReversedClips, resolveCatFlow, type CatClipId } from '../../shared/cat-motion.mjs'
import { jumpFps, jumpFrameCount } from '../../shared/jump-motion.mjs'
import { createGenerationTestApp } from './generation-app.js'
import { db, rows } from '../src/db.js'
import { config } from '../src/config.js'
import { removeFile } from '../src/assets.js'
import { recoverInterruptedJobs, workerTick } from '../src/jobs.js'
import { assembleVideoSprite, type VideoState } from '../src/video.js'

test('uploaded photo sets drive durable batches, per-clip progress and reuse', {timeout:60_000}, async t => {
  const local = Object.keys(catReversedClips).length+1
  const initialPlan = {poses:Object.keys(catPoses).length,clips:catGenerationClips.length,jump:true,local,total:Object.keys(catPoses).length+catGenerationClips.length+local}
  config.imageKey = 'batch-test-only'
  config.imageUrl = 'http://127.0.0.1:9/batch-image-test'
  config.videoKey = 'batch-test-only'
  config.videoModel = 'wan3.0-video'
  config.videoMatting = false
  const users: string[] = []
  const server = createGenerationTestApp().listen(0,'127.0.0.1')
  await once(server,'listening')
  const address = server.address()
  assert.ok(address && typeof address==='object')
  const base = `http://127.0.0.1:${address.port}/api`
  const png = await sharp(Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" width="256" height="256">
    <ellipse cx="134" cy="131" rx="81" ry="42" fill="#eea651"/><circle cx="54" cy="100" r="34" fill="#eea651"/>
    <path d="M52 143v64h30v-56m97-7v63h33v-64" fill="#eea651"/>
  </svg>`)).png().toBuffer()
  const sprites = new Map(await Promise.all([2,3].map(async duration=>[duration,await assembleVideoSprite(Array(duration*12).fill(png),12,false)] as const)))
  let images = 0
  let expectedPhotoColors: number[] = []
  const realFetch = globalThis.fetch
  t.mock.method(globalThis,'fetch',async (url: Parameters<typeof fetch>[0], options?: RequestInit) => {
    if (url !== config.imageUrl) return realFetch(url,options)
    const form = options?.body as FormData
    assert.equal(form.get('size'),'1024x1024')
    assert.match(String(form.get('prompt')),/仅提取宠物主体.*忽略输入照片的姿势.*背景/)
    const colors = await Promise.all((form.getAll('image') as Blob[]).map(async file=>{
      const pixels = await sharp(Buffer.from(await file.arrayBuffer())).raw().toBuffer()
      return pixels[0]
    }))
    assert.deepEqual(colors,expectedPhotoColors,'the image provider gets every selected upload in the planned order')
    images++
    return Response.json({data:[{b64_json:png.toString('base64')}]})
  })
  const sent: CatClipId[] = []
  let rejectTurnOnce = true
  let reviewWakeOnce = true
  let idleQueries = 0
  const services = {
    submitMotionVideo: async (_model:string,_duration:number,first:string,last:string,motion:string) => {
      const key = (Object.keys(catClips) as CatClipId[]).find(item=>catClips[item].motion===motion)!
      assert.ok(key)
      assert.match(first,/^data:image\/jpeg;base64,/)
      assert.match(last,/^data:image\/jpeg;base64,/)
      sent.push(key)
      return `${key}_${sent.length}`
    },
    queryVideo: async (id:string): Promise<VideoState> => {
      if (id===`${catDefaultAction}_1`) {
        idleQueries++
        if (idleQueries===1) throw new Error('fixture poll failure')
        if (idleQueries===2) return {status:'generating',progress:42}
      }
      if (rejectTurnOnce && id.startsWith('turn_right_')) { rejectTurnOnce = false; return {status:'failed'} }
      return {status:'completed',url:'https://fixture.invalid/local-video.mp4'}
    },
    downloadVideo: async (_url:string,destination:string) => { await writeFile(destination,'test-only saved video') },
    extractVideo: async (_file:string,duration:number,_fps?:number,_background?:unknown,action?:string,anchors?:unknown) => {
      assert.ok(anchors,'flow video must use the generated pose anchors')
      const pendingReview = reviewWakeOnce && action==='wake_up'
      if (pendingReview) reviewWakeOnce = false
      return {...sprites.get(duration)!,motionJoinable:!pendingReview}
    },
  }

  try {
    assert.equal((await rows("SELECT id FROM generation_jobs WHERE status IN ('queued','running')")).length,0,'run against an isolated local DB')
    async function request(route:string,method='GET',body?:unknown,token='') {
      const result = await fetch(base+route,{method,headers:{'Content-Type':'application/json','X-PetCloud-Client':'desktop',...(token?{Authorization:`Bearer ${token}`}:{})},body:JSON.stringify(body)})
      return {status:result.status,data:await result.json() as any}
    }
    async function account() {
      const result = await request('/auth/register','POST',{username:`batch_${randomUUID().slice(0,8)}`,password:'Motion_Batch_Test_2026!'})
      assert.equal(result.status,201)
      users.push(result.data.user.id)
      return result.data.token as string
    }
    const alice = await account(), bob = await account()
    const {data:{pet}} = await request('/pets','POST',{name:'Batch cat',species:'cat'},alice)
    const {data:{pet:otherPet}} = await request('/pets','POST',{name:'Other cat',species:'cat'},alice)
    const uploadedColors = new Map<string,number>()
    async function upload(red:number,petId=pet.id) {
      const bytes = await sharp({create:{width:256,height:256,channels:3,background:{r:red,g:45,b:90}}}).png().toBuffer()
      const result = await request('/assets','POST',{petId,name:'参考照 '+red,image:`data:image/png;base64,${bytes.toString('base64')}`},alice)
      assert.equal(result.status,201)
      uploadedColors.set(result.data.asset.id,red)
      return result.data.asset
    }
    const route = `/motions/${pet.id}`
    const readPlan = (token=alice) => request(`${route}/batch-plan`,'GET',undefined,token)
    const enqueue = ({poses,clips,references}: {poses:number;clips:number;references:{id:string}[]}) => request(`${route}/generate`,'POST',{
      kind:'batch', referenceAssetIds:references.map(photo=>photo.id), approved:{poses,clips},
    },alice)

    assert.deepEqual((await readPlan()).data,{references:[],poses:0,clips:0,jump:false,local:0,total:initialPlan.total})
    assert.equal((await enqueue({...initialPlan,references:[{id:randomUUID()}]})).status,400)
    const oldest = await upload(40)
    assert.deepEqual((await readPlan()).data.references,[{id:oldest.id,name:oldest.name}])
    assert.deepEqual((await request(`${route}/batch-plan/${oldest.id}`,'GET',undefined,alice)).data,initialPlan)
    for (const red of [50,60,70,80,90]) await upload(red)
    await upload(200,otherPet.id)
    const quoted = (await readPlan()).data
    const {data:{assets:listed}} = await request(`/assets?petId=${pet.id}&kind=photo`,'GET',undefined,alice)
    assert.deepEqual(quoted.references,listed.slice(0,5).map(({id,name}: {id:string;name:string})=>({id,name})))
    assert.equal(quoted.references.length,5)
    assert.ok(quoted.references.every((photo: {id:string})=>photo.id!==oldest.id))
    assert.equal((await readPlan(bob)).status,404)
    assert.equal((await enqueue({...quoted,poses:initialPlan.poses-1})).status,409,'a stale approval cannot increase the number of generation calls')
    assert.equal((await enqueue({...quoted,references:[oldest]})).status,409,'clients cannot choose a different source set')
    expectedPhotoColors = quoted.references.map((photo: {id:string})=>uploadedColors.get(photo.id))
    const first = await enqueue(quoted)
    assert.equal(first.status,202,JSON.stringify(first.data))
    assert.equal(first.data.job.total,initialPlan.total)
    const firstId = first.data.job.id
    assert.equal((await enqueue(quoted)).status,409,'only one active batch per account')
    assert.equal((await request('/jobs','GET',undefined,alice)).data.jobs.length,1,'the browser tracks one parent job')
    assert.equal((await request(`/assets/${quoted.references[4].id}`,'DELETE',{},alice)).status,409,'secondary photo references stay available during generation')
    const advance = async () => {
      await db.execute('UPDATE generation_actions SET next_poll_at=NULL')
      await workerTick(services)
    }
    for (let count=0;count<initialPlan.poses+1;count++) await advance()
    assert.equal(images,initialPlan.poses)
    assert.equal(sent.length,1)
    const [recordedTask] = await rows(`SELECT a.provider_task_id FROM generation_actions a JOIN generation_jobs j ON j.id=a.job_id
      WHERE j.batch_id=? AND a.status='generating'`,[firstId])
    assert.ok(recordedTask.provider_task_id)
    assert.deepEqual((await request(route,'GET',undefined,alice)).data.poses,{})
    await recoverInterruptedJobs()
    await advance()
    assert.equal(sent.length,1,'restart resumes the recorded video task')
    const idle = async () => (await request(route,'GET',undefined,alice)).data.steps.find((step: {action:string})=>step.action===catDefaultAction)
    assert.equal((await idle()).retrying,1)
    await advance()
    const inProgress = await idle()
    assert.equal(inProgress.status,'generating')
    assert.equal(inProgress.progress,42)
    assert.equal(inProgress.retrying,0)
    assert.match((await request('/jobs','GET',undefined,alice)).data.jobs[0].phase,/视频生成中/)
    async function finish(id:string) {
      for (let count=0;count<initialPlan.total*3;count++) {
        const [state]=await rows('SELECT status,completed FROM generation_jobs WHERE id=?',[id])
        if (['completed','partial','failed'].includes(state.status)) return state
        await advance()
      }
      throw new Error('batch did not finish')
    }
    assert.deepEqual(await finish(firstId),{status:'partial',completed:initialPlan.total-2})
    assert.deepEqual(sent,catGenerationClips)
    let manifest = (await request(route,'GET',undefined,alice)).data
    assert.equal(manifest.assets.length,initialPlan.clips-1+local,'clip with a bad seam and locally rendered assets are retained for previews')
    for (const [reverse,forward] of Object.entries(catReversedClips)) {
      const from = manifest.assets.find((asset:{action:string})=>asset.action===forward)
      const to = manifest.assets.find((asset:{action:string})=>asset.action===reverse)
      assert.equal(to.motionFromAssetId,from.motionToAssetId)
      assert.equal(to.motionToAssetId,from.motionFromAssetId)
      assert.equal(to.frames,from.frames)
    }
    const jump = manifest.assets.find((asset:{action:string})=>asset.action===catJumpAction)
    assert.equal(jump.motionFromAssetId,manifest.poses.stand_left)
    assert.equal(jump.frames,jumpFrameCount)
    assert.equal(jump.fps,jumpFps)
    assert.equal(jump.backgroundRemoved,1)
    assert.equal(jump.hasVideo,0)
    assert.equal(manifest.steps.find((step:{action:string})=>step.action===catJumpAction).status,'completed')
    const file = await fetch(base+`/assets/${jump.id}/file`,{headers:{Authorization:`Bearer ${alice}`}})
    assert.equal(file.status,200)
    const grid = sharp(Buffer.from(await file.arrayBuffer()))
    const frame = (index:number)=>grid.clone().extract({left:index%jump.columns*256,top:Math.floor(index/jump.columns)*256,width:256,height:256}).raw().toBuffer()
    const [start,air,end] = await Promise.all([frame(0),frame(18),frame(jump.frames-1)])
    assert.ok(start.equals(end),'the local jump closes on the source standing frame')
    assert.ok(!start.equals(air) && air.some((value,index)=>index%4===3 && value>160),'jump includes visible articulated frames')
    const wake = manifest.steps.find((step: {action:string})=>step.action==='wake_up')
    assert.equal(wake.status,'failed')
    assert.ok(wake.assetId)
    const published = manifest.poses
    assert.equal(Object.keys(published).length,initialPlan.poses)
    assert.equal(resolveCatFlow('rest',manifest),null)
    assert.equal(resolveCatFlow('walk',manifest),null)

    const retry = (await readPlan()).data
    assert.deepEqual(retry,{references:quoted.references,poses:0,clips:2,jump:false,local:0,total:initialPlan.total},'generated pose images are excluded from the reference set')
    const next = await enqueue(retry)
    assert.equal(next.status,202)
    assert.equal(next.data.job.completed,initialPlan.total-2)
    assert.equal((await request(`/assets/${published.stand_left}`,'DELETE',{},alice)).status,409,'reused anchors are protected while queued')
    assert.deepEqual(await finish(next.data.job.id),{status:'completed',completed:initialPlan.total})
    assert.equal(images,initialPlan.poses)
    assert.equal(sent.length,initialPlan.clips+2)
    assert.deepEqual(new Set(sent.slice(initialPlan.clips)),new Set(['turn_right','wake_up']))
    manifest = (await request(route,'GET',undefined,alice)).data
    assert.deepEqual(manifest.poses,published)
    assert.ok(resolveCatFlow('rest',manifest))
    assert.ok(resolveCatFlow('walk',manifest))
    const done = (await readPlan()).data
    assert.deepEqual(done,{references:quoted.references,poses:0,clips:0,jump:false,local:0,total:initialPlan.total})
    const sync = await enqueue(done)
    assert.equal(sync.status,202)
    assert.equal((await finish(sync.data.job.id)).completed,initialPlan.total)
    assert.equal(images,initialPlan.poses)
    assert.equal(sent.length,initialPlan.clips+2)

    assert.equal((await request(`/assets/${jump.id}`,'DELETE',{},alice)).status,200)
    const localOnly = (await readPlan()).data
    assert.deepEqual(localOnly,{...done,jump:true,local:1})
    config.imageKey = ''
    config.videoKey = ''
    const localBatch = await enqueue(localOnly)
    assert.equal(localBatch.status,202)
    assert.equal(localBatch.data.job.completed,initialPlan.total-1)
    assert.equal((await finish(localBatch.data.job.id)).completed,initialPlan.total)
    assert.equal(images,initialPlan.poses)
    assert.equal(sent.length,initialPlan.clips+2)

    assert.equal((await request(`/assets/${quoted.references[4].id}`,'DELETE',{},alice)).status,200)
    const changed = (await readPlan()).data
    assert.equal(changed.references[0].id,quoted.references[0].id)
    assert.ok(changed.references.some((photo: {id:string})=>photo.id===oldest.id))
    assert.equal(changed.poses,initialPlan.poses,'a changed secondary reference starts a fresh set even if the first photo is unchanged')
    assert.equal(changed.clips,initialPlan.clips)
    assert.equal(changed.jump,true)
    assert.equal(changed.local,local)
    assert.equal((await enqueue(done)).status,409,'a photo change invalidates the generation plan')
  } finally {
    await new Promise<void>(resolve=>server.close(()=>resolve()))
    for (const id of users) {
      const files=await rows('SELECT file_key,source_video_key FROM assets WHERE user_id=?',[id])
      await db.execute('DELETE FROM users WHERE id=?',[id])
      await Promise.all(files.map(file=>removeFile(file.file_key,file.source_video_key)))
    }
    await db.end()
  }
})
