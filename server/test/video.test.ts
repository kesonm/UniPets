import test from 'node:test'
import assert from 'node:assert/strict'
import {execFile} from 'node:child_process'
import {promisify} from 'node:util'
import {mkdtemp,rm,readFile} from 'node:fs/promises'
import {tmpdir} from 'node:os'
import path from 'node:path'
import sharp from 'sharp'
import {videoRequest,providerTaskId,videoState,validateVideoUrl,isPublicAddress,resolveVideoAddresses,extractVideo,queryVideo} from '../src/video.js'
import {config} from '../src/config.js'
const execute=promisify(execFile)

test('video submission uses metadata duration and the actual reference image',()=>{
  const request=videoRequest('wan3.0-video',3,'data:image/jpeg;base64,AA==','原地轻轻摇尾巴')
  assert.equal(request.metadata.duration,3)
  assert.equal(request.metadata.content[0].role,'first_frame')
  assert.equal(request.metadata.content[0].image_url.url,'data:image/jpeg;base64,AA==')
  assert.equal(request.metadata.audio,false)
  assert.throws(()=>videoRequest('wan3.0-video',5,'image','动作'))
  assert.throws(()=>videoRequest('doubao-seedance-2-0-mini-260615',2,'image','动作'))
})

test('query success is distinguished from generation success',()=>{
  assert.equal(providerTaskId({data:{task_id:'task-123'}}),'task-123')
  assert.throws(()=>providerTaskId({code:'success'}),/未确认/)
  assert.equal(videoState({code:'success',data:{status:'FAILURE'}}).status,'failed')
  assert.equal(videoState({status:'in_progress'}).status,'generating')
  assert.deepEqual(videoState({status:'completed',metadata:{url:'https://cdn.example/video.mp4'}}),{status:'completed',url:'https://cdn.example/video.mp4'})
  assert.throws(()=>videoState({status:'completed'}),/下载地址/)
})

test('task query sends credentials only to configured API and accepts standard status format',async t=>{
  const mocked=t.mock.method(globalThis,'fetch',async(url:unknown,options:any)=>{
    assert.match(String(url),/\/videos\/task_123$/)
    assert.ok(options.headers.Authorization.startsWith('Bearer '))
    return new Response(JSON.stringify({status:'completed',metadata:{url:'https://cdn.example/movie.mp4'}}),{status:200})
  })
  assert.equal((await queryVideo('task_123')).status,'completed')
  assert.equal(mocked.mock.callCount(),1)
})

test('media downloads reject internal hosts, encoded credentials and private IPs',()=>{
  for(const url of ['http://example.com/a.mp4','https://127.0.0.1/a','https://10.1.2.3/a','https://198.18.1.13/a','https://localhost/a','https://[::1]/a','https://name:secret@example.com/a','https://example.com:8080/a'])assert.throws(()=>validateVideoUrl(url))
  for(const ip of ['10.0.0.1','172.20.0.1','192.168.1.1','169.254.169.254','100.64.0.1','::ffff:127.0.0.1','fc00::1'])assert.equal(isPublicAddress(ip),false)
  assert.equal(isPublicAddress('8.8.8.8'),true)
  assert.equal(isPublicAddress('2606:4700::1111'),true)
  assert.equal(validateVideoUrl('https://cdn.example/movie.mp4').hostname,'cdn.example')
})

test('known Wan result host can recover from a proxy DNS mapping without connecting to a private address',async t=>{
  const host='dashscope-a717.oss-accelerate.aliyuncs.com'
  const fake=async()=>[{address:'198.18.1.13',family:4}]
  let publicAnswer='121.196.3.195'
  const resolver=t.mock.method(globalThis,'fetch',async(url:URL,options:RequestInit)=>{
    assert.equal(url.origin,'https://dns.alidns.com')
    assert.deepEqual([...url.searchParams.entries()],[['name',host],['type','A']])
    assert.equal(options.redirect,'error')
    assert.equal(new Headers(options.headers).has('Authorization'),false)
    return Response.json({Status:0,Answer:[{type:5,data:'cdn.example'},{type:1,data:publicAnswer}]})
  })
  assert.deepEqual(await resolveVideoAddresses(host,fake),[{address:publicAnswer,family:4}])
  assert.deepEqual(await resolveVideoAddresses('cdn.example',async()=>[{address:'8.8.8.8',family:4}]),[{address:'8.8.8.8',family:4}])
  await assert.rejects(resolveVideoAddresses('other.oss-accelerate.aliyuncs.com',fake),/本地网络/)
  await assert.rejects(resolveVideoAddresses(host,async()=>[{address:'127.0.0.1',family:4}]),/本地网络/)
  assert.equal(resolver.mock.callCount(),1)
  publicAnswer='192.168.1.8'
  await assert.rejects(resolveVideoAddresses(host,fake),/暂未取得视频域名的公网地址/)
})

test('real FFmpeg extracts 2/3/4 seconds at 12fps into correctly ordered grid frames',{timeout:60_000},async()=>{
  const directory=await mkdtemp(path.join(tmpdir(),'petcloud-video-test-'))
  try {
    const file=path.join(directory,'source.mp4')
    await execute(config.ffmpeg,['-nostdin','-v','error','-f','lavfi','-i','testsrc2=size=160x120:rate=24','-t','4','-c:v','libx264','-pix_fmt','yuv420p',file],{timeout:15000})
    const before=await readFile(file)
    for(const duration of [2,3,4]) {
      const result=await extractVideo(file,duration)
      assert.equal(result.frames,duration*12)
      assert.equal(result.fps,12)
      assert.equal(result.duration,duration)
      assert.equal(result.backgroundRemoved,false,'transparent padding does not imply the video background was removed')
      assert.equal(result.columns,8)
      assert.equal(result.rows,Math.ceil(duration*12/8))
      const metadata=await sharp(result.bytes).metadata()
      assert.equal(metadata.width,2048)
      assert.equal(metadata.height,result.rows*256)
      const first=await sharp(result.bytes).extract({left:0,top:0,width:256,height:256}).png().toBuffer()
      const lastIndex=result.frames-1
      const last=await sharp(result.bytes).extract({left:lastIndex%8*256,top:Math.floor(lastIndex/8)*256,width:256,height:256}).png().toBuffer()
      assert.notDeepEqual(first,last,'different video instants must not become repeated stills')
    }
    assert.deepEqual(await readFile(file),before,'extraction leaves the original video intact')
  }finally{await rm(directory,{recursive:true,force:true})}
})
