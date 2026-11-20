import test from 'node:test'
import assert from 'node:assert/strict'
import { once } from 'node:events'
import { randomBytes } from 'node:crypto'
import { execFile } from 'node:child_process'
import { promisify } from 'node:util'
import { mkdtemp, readFile, copyFile, rm, access, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'
import sharp from 'sharp'
import { createGenerationTestApp } from './generation-app.js'
import { db, rows } from '../src/db.js'
import { config } from '../src/config.js'
import { workerTick, recoverInterruptedJobs } from '../src/jobs.js'
import { removeFile, saveTransparentReplacement, storagePath, type Action } from '../src/assets.js'
import { extractVideo, motionVideoRequest, videoRequest, type VideoState } from '../src/video.js'
const execute=promisify(execFile)

test('video jobs persist provider IDs, recover without resubmission, and protect original videos', {timeout:60_000}, async t=>{
  // Use an idle development DB and stop the API worker before running this suite.
  const directory=await mkdtemp(path.join(tmpdir(),'petcloud-video-jobs-'))
  const userIds:string[]=[]
  let server:ReturnType<ReturnType<typeof createGenerationTestApp>['listen']>|undefined
  config.videoKey='local-test-only'
  config.videoMatting=false // These local test patterns do not need foreground recognition.
  const sleepTasks = new Set<string>()
  let submitted=0,queries=0,extracts=0,failQuery=true
  const services={
    submitVideo:async(model:string,duration:number,image:string,motion:string,action?:Action)=>{
      assert.equal(model,'wan3.0-video');assert.ok([2,3,4].includes(duration));assert.match(image,/^data:image\/jpeg;base64,/)
      const id = `test-task-${++submitted}`
      if (action === 'sleep') {
        const request = videoRequest(model,duration,image,motion,action)
        assert.equal(request.metadata.content[0].role,'reference_image')
        assert.match(request.prompt,/第一帧已经舒适趴卧.*胸腹/)
        sleepTasks.add(id)
      }
      return id
    },
    queryVideo:async(id:string):Promise<VideoState>=>{
      queries++
      if(failQuery){failQuery=false;throw new Error('Simulated temporary query outage')}
      if(id==='saved-failed-task')return {status:'failed'}
      return {status:'completed',url:sleepTasks.has(id)?'fixture-sleep':'fixture-source'}
    },
    downloadVideo:async(url:string,destination:string)=>{await copyFile(path.join(directory,url==='fixture-sleep'?'sleep.mp4':'source.mp4'),destination)},
    extractVideo:async(...args:Parameters<typeof extractVideo>)=>{extracts++;return extractVideo(...args)},
  }
  config.videoModel='wan3.0-video'
  try {
    assert.equal((await rows("SELECT id FROM generation_jobs WHERE status IN ('queued','running')")).length,0,'Stop the API and wait for existing jobs before running integration tests')
    await execute(config.ffmpeg,['-nostdin','-v','error','-f','lavfi','-i','testsrc2=size=160x120:rate=24','-t','4','-c:v','libx264','-pix_fmt','yuv420p',path.join(directory,'source.mp4')],{timeout:15000})
    // A tall shape at the beginning represents the standing pose. After it settles,
    // a broad low shape moves slowly through a breathing cycle.
    await execute(config.ffmpeg, [
      '-nostdin','-v','error','-f','lavfi','-i','color=c=white:s=160x120:r=24',
      '-f','lavfi','-i','color=c=0x806A42:s=60x30:r=24',
      '-filter_complex',"[0:v]drawbox=x=62:y=30:w=35:h=65:color=0x806A42:t=fill:enable='lt(t,0.58)'[floor];[floor][1:v]overlay=x=50:y='68-3*sin(2*PI*t/1.8)':enable='gte(t,0.58)'",
      '-t','4','-c:v','libx264','-pix_fmt','yuv420p',path.join(directory,'sleep.mp4'),
    ],{timeout:15000})
    server=createGenerationTestApp().listen(0,'127.0.0.1');await once(server,'listening')
    const base=`http://127.0.0.1:${(server.address() as any).port}/api`
    async function request(url:string,method='GET',body?:unknown,token='',headers:Record<string,string>={}){
      const response=await fetch(`${base}${url}`,{method,headers:{'Content-Type':'application/json','X-PetCloud-Client':'desktop',...(token?{Authorization:`Bearer ${token}`} : {}),...headers},body:body===undefined?undefined:JSON.stringify(body)})
      const data=response.headers.get('content-type')?.includes('application/json')?await response.json():Buffer.from(await response.arrayBuffer())
      return {status:response.status,data,headers:response.headers}
    }
    async function register(prefix:string){
      const result=await request('/auth/register','POST',{username:`${prefix}_${randomBytes(6).toString('hex')}`,password:'Video_test_only_2026!'})
      assert.equal(result.status,201);userIds.push(result.data.user.id);return result.data.token as string
    }
    const alice=await register('video_a'),bob=await register('video_b')
    const pet=await request('/pets','POST',{name:'视频测试伙伴',species:'cat'},alice),petId=pet.data.pet.id
    const photo=await sharp({create:{width:80,height:80,channels:3,background:'#ffd800'}}).png().toBuffer()
    const uploaded=await request('/assets','POST',{petId,name:'参考照片',image:`data:image/png;base64,${photo.toString('base64')}`},alice),referenceAssetId=uploaded.data.asset.id
    let jobId=''
    await t.test('new requests default to video and validate duration and reference ownership',async()=>{
      assert.equal((await request('/jobs','POST',{petId,referenceAssetId,duration:5},alice)).status,400)
      assert.equal((await request('/jobs','POST',{petId,referenceAssetId},bob)).status,404)
      const created=await request('/jobs','POST',{petId,referenceAssetId},alice)
      assert.equal(created.status,202);jobId=created.data.job.id
      assert.equal(created.data.job.mode,'video');assert.equal(created.data.job.duration,3);assert.equal(created.data.job.fps,12)
      assert.equal((await request('/jobs','POST',{petId,referenceAssetId},alice)).status,409)
    })
    const tick=async()=>{await db.execute('UPDATE generation_actions SET next_poll_at=NULL WHERE job_id=?',[jobId]);await workerTick(services)}
    await t.test('persisted submissions survive restart and temporary query failures',async()=>{
      await tick();assert.equal(submitted,1)
      let [action]=await rows("SELECT * FROM generation_actions WHERE job_id=? AND action='idle'",[jobId])
      assert.equal(action.provider_task_id,'test-task-1');assert.equal(action.status,'generating')
      await recoverInterruptedJobs();await tick()
      ;[action]=await rows("SELECT * FROM generation_actions WHERE job_id=? AND action='idle'",[jobId])
      assert.equal(action.poll_failures,1);assert.equal(action.provider_task_id,'test-task-1');assert.equal(submitted,1)
      await tick();assert.equal(submitted,1);assert.equal(queries,2)
      for(let i=0;i<6;i++)await tick()
      const [job]=await rows('SELECT status,completed FROM generation_jobs WHERE id=?',[jobId])
      assert.equal(job.status,'completed');assert.equal(job.completed,4);assert.equal(submitted,4);assert.equal(extracts,4)
    })
    let assets:any[]=[]
    await t.test('saved grids and MP4s have accurate metadata, private access and desktop compatibility',async()=>{
      assets=(await request('/assets','GET',undefined,alice)).data.assets.filter((a:any)=>a.kind==='sprite')
      assert.equal(assets.length,4)
      for(const asset of assets){
        assert.equal(asset.frames,36);assert.equal(asset.columns,8);assert.equal(asset.rows,5);assert.equal(asset.fps,12);assert.equal(asset.duration,3);assert.ok(asset.hasVideo)
        assert.equal(asset.backgroundRemoved,0)
      }
      const id=assets.find(asset=>asset.action==='idle').id
      assert.equal((await request(`/assets/${id}/video`)).status,401)
      assert.equal((await request(`/assets/${id}/video`,'GET',undefined,bob)).status,404)
      assert.equal((await request(`/assets/${referenceAssetId}/video`,'GET',undefined,alice)).status,404)
      const video=await request(`/assets/${id}/video`,'GET',undefined,alice)
      assert.equal(video.status,200);assert.match(video.headers.get('cache-control')!,/no-store/)
      assert.deepEqual(video.data,await readFile(path.join(directory,'source.mp4')))
      const range=await request(`/assets/${id}/video`,'GET',undefined,alice,{Range:'bytes=0-99'})
      assert.equal(range.status,206);assert.equal(range.data.length,100)
      assert.equal((await request('/desktop','PUT',{petId,size:220,enabled:true,idleAssetId:id,happyAssetId:null,walkAssetId:null,sleepAssetId:null},alice)).status,200)
      assert.equal((await request('/desktop','GET',undefined,alice)).data.assets.find((a:any)=>a.id===id).frames,36)
    })
    await t.test('sleep playback excludes the standing prefix and closes the breathing loop',async()=>{
      const asset=assets.find(item=>item.action==='sleep')
      assert.equal(asset.sleepLoop,1)
      const response=await request(`/assets/${asset.id}/file`,'GET',undefined,alice)
      assert.equal(response.status,200)
      const sheet=sharp(response.data)
      const topFrames: Buffer[]=[]
      for (let frame=0;frame<asset.frames;frame++) {
        const left=frame % asset.columns * 256
        const top=Math.floor(frame / asset.columns) * 256
        const pixels = await sheet.clone().extract({left:left+128,top:top+83,width:1,height:1}).raw().toBuffer()
        assert.ok(pixels[0]>220 && pixels[1]>220 && pixels[2]>220,'standing silhouette is absent')
        if ([0,18,35].includes(frame)) topFrames.push(await sheet.clone().extract({left,top,width:256,height:256}).raw().toBuffer())
      }
      const totalChange=(a:Buffer,b:Buffer)=>a.reduce((sum,value,index)=>sum+Math.abs(value-b[index]),0)
      const breath=totalChange(topFrames[0],topFrames[1])
      assert.ok(breath>1000,'the resting subject still moves')
      assert.ok(totalChange(topFrames[0],topFrames[2]) < breath * 0.2,'there is no visible reset at the seam')
      assert.deepEqual((await request(`/assets/${asset.id}/video`,'GET',undefined,alice)).data,await readFile(path.join(directory,'sleep.mp4')))
    })
    await t.test('crash after asset commit does not create duplicate assets or submit another video',async()=>{
      await db.execute("UPDATE generation_actions SET status='processing' WHERE job_id=? AND action='idle'",[jobId])
      await db.execute("UPDATE generation_jobs SET status='running',completed=3 WHERE id=?",[jobId])
      await tick()
      assert.equal(submitted,4);assert.equal(extracts,4)
      assert.equal((await rows('SELECT id FROM assets WHERE job_id=?',[jobId])).length,4)
      assert.equal((await rows('SELECT status FROM generation_jobs WHERE id=?',[jobId]))[0].status,'completed')
    })
    await t.test('replacing a video grid in place preserves its MP4 and desktop binding',async()=>{
      const original=assets.find(asset=>asset.action==='idle')
      const id=original.id
      const fixture=await sharp({create:{width:256,height:256,channels:4,background:'#00000000'}})
        .composite([{input:{create:{width:120,height:120,channels:4,background:'#ffd800'}},gravity:'centre'}]).png().toBuffer()
      const bytes=await sharp({create:{width:2048,height:1280,channels:4,background:'#00000000'}})
        .composite(Array.from({length:36},(_,i)=>({input:fixture,left:i%8*256,top:Math.floor(i/8)*256}))).png().toBuffer()
      const sheet={bytes,width:2048,height:1280,columns:8,rows:5,frames:36,duration:3,fps:12,backgroundRemoved:true}
      await assert.rejects(saveTransparentReplacement(userIds[1],id,sheet),/原视频/)
      await assert.rejects(saveTransparentReplacement(userIds[0],id,{...sheet,frames:35}),/规格/)
      assert.equal(await saveTransparentReplacement(userIds[0],id,sheet),true)
      assert.equal(await saveTransparentReplacement(userIds[0],id,sheet),false)
      assert.deepEqual((await request(`/assets/${id}/file`,'GET',undefined,alice)).data,bytes)
      assert.equal((await request(`/assets/${id}/file`,'GET',undefined,bob)).status,404)
      assert.deepEqual((await request(`/assets/${id}/video`,'GET',undefined,alice)).data,await readFile(path.join(directory,'source.mp4')))
      const {data:desktop}=await request('/desktop','GET',undefined,alice)
      assert.equal(desktop.profile.idleAssetId,id)
      const updated=desktop.assets.find((a:any)=>a.id===id)
      assert.equal(updated.backgroundRemoved,1)
      assert.notEqual(updated.imageVersion,original.imageVersion)
      assert.equal(submitted,4)
      await assert.rejects(access(storagePath(`${id}.png`)))
    })
    await t.test('deleting a video asset removes the new grid and the original MP4',async()=>{
      const id=assets.find(asset=>asset.action==='idle').id
      const [{file_key,source_video_key}]=await rows('SELECT file_key,source_video_key FROM assets WHERE id=?',[id])
      await access(storagePath(file_key));await access(storagePath(source_video_key))
      assert.equal((await request(`/assets/${id}`,'DELETE',{},alice)).status,200)
      await assert.rejects(access(storagePath(file_key)))
      await assert.rejects(access(storagePath(source_video_key)))
    })
    await t.test('unknown submissions are not repeated; partial jobs keep successful actions',async()=>{
      const created=await request('/jobs','POST',{petId,referenceAssetId,duration:2},alice)
      assert.equal(created.status,202);jobId=created.data.job.id
      await db.execute("UPDATE generation_actions SET status='submitting' WHERE job_id=? AND action='idle'",[jobId])
      await db.execute("UPDATE generation_actions SET status='generating',provider_task_id='saved-failed-task' WHERE job_id=? AND action='happy'",[jobId])
      await recoverInterruptedJobs()
      for(let i=0;i<5;i++)await tick()
      const [job]=await rows('SELECT * FROM generation_jobs WHERE id=?',[jobId])
      assert.equal(job.status,'partial');assert.equal(job.completed,2);assert.equal(submitted,6)
      const [unknown]=await rows("SELECT * FROM generation_actions WHERE job_id=? AND action='idle'",[jobId])
      assert.equal(unknown.status,'failed');assert.match(unknown.error,/未重新提交/)
      const saved=await rows('SELECT frames,source_video_key FROM assets WHERE job_id=?',[jobId])
      assert.equal(saved.length,2);assert.ok(saved.every(a=>a.frames===24&&a.source_video_key))
    })
    await t.test('independent motion jobs save reusable pose anchors and byte-identical joins',async t=>{
      const { matchingCatClip } = await import('../../shared/cat-motion.mjs')
      const route = `/motions/${petId}`
      const pose = (key:string,assetId:string) => request(`${route}/poses/${key}`,'PUT',{assetId},alice)
      const generation = (kind:string,key:string) => request(`${route}/generate`,'POST',{kind,key,referenceAssetId},alice)
      assert.equal((await request(route,'GET',undefined,bob)).status,404)
      assert.equal((await generation('clip','lower_to_crouch')).status,409)
      assert.equal((await pose('stand_left',referenceAssetId)).status,200)

      const posePng = await sharp({create:{width:256,height:256,channels:3,background:'#4d5354'}}).png().toBuffer()
      config.imageKey = 'mock-image-only'
      config.imageUrl = 'http://127.0.0.1:9/mock-edit'
      const localFetch = globalThis.fetch
      t.mock.method(globalThis,'fetch',async (url: Parameters<typeof fetch>[0], options?: RequestInit) => {
        if (url === config.imageUrl) {
          assert.equal((options!.body as FormData).get('size'),'1024x1024')
          return Response.json({data:[{b64_json:posePng.toString('base64')}]})
        }
        return localFetch(url,options)
      })
      const poseJob = await generation('pose','crouch_left')
      assert.equal(poseJob.status,202)
      assert.equal((await pose('crouch_left',referenceAssetId)).status,409)
      await workerTick()
      let manifest = (await request(route,'GET',undefined,alice)).data
      assert.ok(manifest.poses.crouch_left && manifest.poses.crouch_left !== referenceAssetId)
      const [imageJob] = await rows('SELECT status,completed,total FROM generation_jobs WHERE id=?',[poseJob.data.job.id])
      assert.deepEqual([imageJob.status,imageJob.completed,imageJob.total],['completed',1,1])

      let calls = 0
      let generated = ''
      const localServices = {
        submitMotionVideo: async (model:string,duration:number,first:string,last:string,motion:string) => {
          const body = motionVideoRequest(model,duration,first,last,motion)
          assert.deepEqual(body.metadata.content.map(item=>item.role),['first_frame','last_frame'])
          if (calls === 0) assert.equal(first,last)
          else assert.notEqual(first,last)
          const a = path.join(directory,`anchor-first-${calls}.jpg`)
          const b = path.join(directory,`anchor-last-${calls}.jpg`)
          await writeFile(a,Buffer.from(first.split(',')[1],'base64'))
          await writeFile(b,Buffer.from(last.split(',')[1],'base64'))
          generated = path.join(directory,`motion-${++calls}.mp4`)
          const blend = calls === 3
            ? '[0:v][1:v]blend=all_expr=A'
            : `[0:v][1:v]blend=all_expr='A*(1-clip((T-0.2)/${duration-0.4},0,1))+B*clip((T-0.2)/${duration-0.4},0,1)'`
          await execute(config.ffmpeg,['-nostdin','-v','error','-loop','1','-i',a,'-loop','1','-i',b,'-filter_complex',blend,'-t',String(duration),'-pix_fmt','yuv420p','-c:v','libx264',generated],{timeout:15_000})
          return `motion-${calls}`
        },
        queryVideo:async():Promise<VideoState> => ({status:'completed',url:'https://fixture.invalid/motion.mp4'}),
        downloadVideo:async(_url:string,destination:string) => { await copyFile(generated,destination) },
      }
      async function generateClip(key:string) {
        const accepted = await generation('clip',key)
        assert.equal(accepted.status,202)
        const id = accepted.data.job.id
        assert.equal(accepted.data.job.total,1)
        assert.equal((await request(`/assets/${manifest.poses.crouch_left}`,'DELETE',{},alice)).status,409,'the end pose is protected while a job is using it')
        await workerTick(localServices)
        await db.execute('UPDATE generation_actions SET next_poll_at=NULL WHERE job_id=?',[id])
        await workerTick(localServices)
        const [job] = await rows('SELECT status,completed,error FROM generation_jobs WHERE id=?',[id])
        assert.equal(job.status,'completed',job.error)
        assert.equal(job.completed,1)
        const response = await request(route,'GET',undefined,alice)
        return response.data.assets.find((asset:any) => asset.jobId === id)
      }
      const standingJob = await generation('clip','stand_idle')
      assert.equal(standingJob.status,202)
      await workerTick(localServices)
      await db.execute('UPDATE generation_actions SET next_poll_at=NULL WHERE job_id=?',[standingJob.data.job.id])
      await workerTick(localServices)
      const standing = (await request(route,'GET',undefined,alice)).data.assets[0]
      const lowering = await generateClip('lower_to_crouch')
      assert.equal(lowering.motionJoinable,1)
      assert.equal(standing.motionJoinable,1)
      const readTile = async (asset:any,index:number) => {
        const image = await request(`/assets/${asset.id}/file`,'GET',undefined,alice)
        assert.equal(image.status,200)
        return sharp(image.data).extract({left:index%8*256,top:Math.floor(index/8)*256,width:256,height:256}).raw().toBuffer()
      }
      assert.deepEqual(await readTile(standing,standing.frames-1),await readTile(lowering,0))
      const mismatched = await generateClip('lower_to_crouch')
      assert.equal(mismatched.motionJoinable,0,'a visibly different tail stays previewable without replacing the joined clip')
      assert.equal((await request(`/assets/${mismatched.id}/file`,'GET',undefined,alice)).status,200)
      manifest = (await request(route,'GET',undefined,alice)).data
      assert.equal(matchingCatClip('lower_to_crouch',manifest)?.id,lowering.id)
      assert.equal((await pose('crouch_left',referenceAssetId)).status,200)
      manifest = (await request(route,'GET',undefined,alice)).data
      assert.equal(matchingCatClip('lower_to_crouch',manifest),undefined,'a new anchor invalidates old dependent clips for joined playback')
    })
  }finally{
    if(server)await new Promise<void>(resolve=>server!.close(()=>resolve()))
    for(const id of userIds){const files=await rows('SELECT file_key,source_video_key FROM assets WHERE user_id=?',[id]);await db.execute('DELETE FROM users WHERE id=?',[id]);await Promise.all(files.map(file=>removeFile(file.file_key,file.source_video_key)))}
    await db.end();await rm(directory,{recursive:true,force:true})
  }
})
