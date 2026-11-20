import { execFile } from 'node:child_process'
import { promisify } from 'node:util'
import { mkdir, mkdtemp, readdir, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { lookup } from 'node:dns/promises'
import type { LookupAddress } from 'node:dns'
import { isIP } from 'node:net'
import https from 'node:https'
import sharp from 'sharp'
import type { Action } from './assets.js'
import { config } from './config.js'
import { removeFrameBackgrounds, supportsForegroundRemoval } from './foreground.js'
import { blendRgba, frameDistance, frameThumbnail, makeSleepLoop } from './sleep-loop.js'
const execute = promisify(execFile)
const MAX_VIDEO_BYTES = 64 * 1024 * 1024
const WAN_VIDEO_HOSTS = new Set([
  'dashscope-a717.oss-accelerate.aliyuncs.com',
  'dashscope-result-bj.oss-cn-beijing.aliyuncs.com',
  'dashscope-result-sh.oss-cn-shanghai.aliyuncs.com',
  'dashscope-result-sh.oss-accelerate.aliyuncs.com',
])
export const VIDEO_FPS = 12
export const FRAME_SIZE = 256
const MASK_INPUT_SIZE = 768
const transparent = {r:0,g:0,b:0,alpha:0}
export type VideoState = { status: 'queued'|'generating'|'completed'|'failed'; url?: string; progress?: number }
export type VideoSprite = {bytes:Buffer;frames:number;columns:number;rows:number;fps:number;duration:number;width:number;height:number;backgroundRemoved:boolean;sleepLoop?:boolean;motionJoinable?:boolean}
export type MotionAnchors = { first: Buffer; last: Buffer; samePose: boolean }

export function supportsMotionVideo(model: string) {
  return /^wan3\.0-video(?:-prime)?$/.test(model)
}

export async function checkVideoTools() {
  try {
    await Promise.all([config.ffmpeg,config.ffprobe].map(binary => execute(binary,['-version'],{timeout:5000,maxBuffer:64*1024})))
    return true
  } catch { return false }
}
export async function referenceDataUrl(bytes: Buffer) {
  const jpeg = await sharp(bytes).rotate().resize({width:1024,height:1024,fit:'inside',withoutEnlargement:true}).jpeg({quality:85}).toBuffer()
  if (jpeg.length > 1_400_000) throw new Error('参考照片压缩后仍过大，请换一张较小的照片')
  return `data:image/jpeg;base64,${jpeg.toString('base64')}`
}

export function normalizeMotionPhoto(bytes: Buffer) {
  return sharp(bytes).rotate().resize(512,512,{fit:'contain',background:'#f4f4f4'}).flatten({background:'#f4f4f4'}).png().toBuffer()
}
export function videoRequest(model: string, duration: number, image: string, motion: string, action?: Action) {
  if (![2,3,4].includes(duration)) throw new Error('视频时长请选择 2、3 或 4 秒')
  if (/seedance/.test(model) && duration < 4) throw new Error('Seedance 视频最短为 4 秒，请选择 4 秒')
  const sleep = action === 'sleep'
  const lookReference = sleep && /^(wan3\.0-video(?:-prime)?|doubao-seedance-.+)$/.test(model)
  const prompt = sleep
    ? [
        '真实宠物睡觉的循环动作。还原参考中同一只宠物的毛色、花纹、面部和体型。',
        lookReference
          ? '照片只参考外观。第一帧已经舒适趴卧，头安稳地靠在前爪上，眼睛闭合。'
          : '如果首帧还没有躺下，在开头尽早趴稳闭眼，头靠在前爪上。',
        '保持趴姿，只有胸腹和周围毛发随一次缓慢吸气和呼气轻轻起伏，末帧回到安静呼气末的姿势。头、四肢、尾巴保持稳定。禁止起身、走动、翻身、睁眼和镜头运动，固定光线，完整全身入镜，无文字或其他动物。',
      ].join('')
    : `真实宠物动作素材。保持首帧动物的品种、毛色、花纹、面部与体型。${motion}。固定镜头、固定背景和光线，不推拉、不平移、不切镜、不添加文字或其他动物。宠物全身始终在画面内，大小与位置稳定。动作自然轻柔，结尾尽量回到初始姿势，便于循环。不要添加棋盘格或模拟透明背景。`
  return {
    model,
    prompt,
    metadata: { duration, resolution: '480p', ...(/wan/.test(model)?{audio:false}:{}), content: [{ type:'image_url',image_url:{url:image},role:lookReference ? 'reference_image' : 'first_frame' }] },
  }
}
export function providerTaskId(body: any): string {
  const id = body?.id ?? body?.task_id ?? body?.data?.id ?? body?.data?.task_id
  if (typeof id !== 'string' || !/^[a-zA-Z0-9_-]{1,200}$/.test(id)) throw new Error('视频提交结果未确认，请保留任务记录联系平台核查，勿重复生成')
  return id
}
export function videoState(body: any): VideoState {
  const state = String(body?.status ?? body?.data?.status ?? '').toLowerCase()
  if (['completed','success','succeeded'].includes(state)) {
    const url = body?.metadata?.url ?? body?.data?.data?.content?.video_url
    if (typeof url !== 'string') throw new Error('视频任务已完成，但暂未返回下载地址')
    return {status:'completed',url}
  }
  if (['failed','failure','cancelled','canceled','expired'].includes(state)) return {status:'failed'}
  const reported = body?.progress ?? body?.data?.progress
  const percent = typeof reported === 'string' && /^\d+(?:\.\d+)?%$/.test(reported) ? Number(reported.slice(0,-1)) : Number.isInteger(reported) ? reported : NaN
  const details = percent >= 0 && percent <= 100 ? {progress:Math.round(percent)} : {}
  if (['queued','pending','submitted'].includes(state)) return {status:'queued',...details}
  if (['in_progress','running','processing'].includes(state)) return {status:'generating',...details}
  throw new Error('视频任务状态暂时无法识别，将继续查询原任务')
}
export function motionVideoRequest(model: string, duration: number, first: string, last: string, motion: string) {
  if (!supportsMotionVideo(model)) throw new Error('连续动作需要支持首尾帧的 Wan 3.0 视频模型')
  return {
    model,
    prompt: `写实的同一只宠物。准确匹配给定首尾帧中宠物的物种、体型、姿势、毛色和花纹。${motion}。耳朵、脚爪和整条尾巴全程完整入镜。尾尖接近画面边缘时减小摆幅。固定比例、机位、地面位置和光线。走动和起收步保持在拍摄区域内，身体没有明显横向位移。单一连续镜头，保持原背景，无额外物体、字幕或棋盘格。`,
    metadata: { duration, resolution:'480p', ratio:'1:1', audio:false, content:[
      {type:'image_url',image_url:{url:first},role:'first_frame'},
      {type:'image_url',image_url:{url:last},role:'last_frame'},
    ] },
  }
}

async function submitVideoRequest(body: object) {
  const response = await fetch(`${config.videoBaseUrl}/video/generations`, { method:'POST',headers:{Authorization:`Bearer ${config.videoKey}`,'Content-Type':'application/json'},body:JSON.stringify(body),signal:AbortSignal.timeout(90_000) })
  if (!response.ok) throw new Error(`视频提交返回 HTTP ${response.status}；未自动重新提交`)
  return providerTaskId(await response.json())
}
export function submitVideo(model: string, duration: number, image: string, motion: string, action?: Action) {
  return submitVideoRequest(videoRequest(model,duration,image,motion,action))
}
export function submitMotionVideo(model: string, duration: number, first: string, last: string, motion: string) {
  return submitVideoRequest(motionVideoRequest(model,duration,first,last,motion))
}
export async function queryVideo(id: string) {
  const response = await fetch(`${config.videoBaseUrl}/videos/${encodeURIComponent(id)}`,{headers:{Authorization:`Bearer ${config.videoKey}`},signal:AbortSignal.timeout(30_000)})
  if (!response.ok) throw new Error(`视频查询暂时失败（HTTP ${response.status}），将继续查询原任务`)
  return videoState(await response.json())
}

export function isPublicAddress(address: string) {
  if (isIP(address) === 4) {
    const [a,b] = address.split('.').map(Number)
    return !(a===0 || a===10 || a===127 || a>=224 || a===169&&b===254 || a===172&&b>=16&&b<=31 || a===192&&(b===168||b===0) || a===100&&b>=64&&b<=127 || a===198&&(b===18||b===19))
  }
  return isIP(address)===6 && /^[23][0-9a-f]{3}:/i.test(address) && !/^2002:|^2001:(?:0:|db8:)/i.test(address)
}
export function validateVideoUrl(value: string) {
  const url = new URL(value)
  if (url.protocol!=='https:' || url.username || url.password || url.port && url.port!=='443') throw new Error('视频下载地址必须为公开 HTTPS 地址')
  const host = url.hostname.replace(/^\[|\]$/g,'')
  if (host==='localhost' || host.endsWith('.localhost') || host.endsWith('.local') || isIP(host)&&!isPublicAddress(host)) throw new Error('视频下载地址不能指向本地网络')
  return url
}

const isProxyFakeIp = (address: string) => /^198\.(?:18|19)\./.test(address.replace(/^::ffff:/i,''))

export async function resolveVideoAddresses(host: string, resolveLocal: (hostname: string) => Promise<LookupAddress[]> = hostname => lookup(hostname,{all:true})): Promise<LookupAddress[]> {
  const addresses = await resolveLocal(host)
  if (addresses.length && addresses.every(item=>isPublicAddress(item.address))) return addresses
  if (!WAN_VIDEO_HOSTS.has(host) || !addresses.length || !addresses.every(item=>isProxyFakeIp(item.address))) {
    throw new Error('视频下载地址不能指向本地网络')
  }

  // Some DNS proxies map real OSS names to 198.18.0.0/15. Resolve only known Wan
  // result hosts via public DNS and still pin a public IP for the TLS connection.
  const url = new URL('https://dns.alidns.com/resolve')
  url.searchParams.set('name',host)
  url.searchParams.set('type','A')
  try {
    const response = await fetch(url,{headers:{Accept:'application/dns-json'},redirect:'error',signal:AbortSignal.timeout(8000)})
    if (!response.ok) throw new Error(`HTTP ${response.status}`)
    const body = await response.json() as { Status?: number; Answer?: { type: number; data: string }[] }
    const ipv4 = body.Status===0 && Array.isArray(body.Answer) ? body.Answer.filter(item=>item?.type===1).map(item=>item.data) : []
    if (!ipv4.length || ipv4.some(address=>typeof address!=='string' || isIP(address)!==4 || !isPublicAddress(address))) throw new Error('无有效公网地址')
    return Array.from(new Set(ipv4),address=>({address,family:4}))
  } catch {
    throw new Error('本机 DNS 返回代理虚拟地址，暂未取得视频域名的公网地址')
  }
}

// Resolve and pin the validated address for each hop. Provider URLs never receive API credentials.
export async function downloadVideo(value: string, destination: string, redirects = 0): Promise<void> {
  if (redirects>3) throw new Error('视频下载重定向过多')
  const url = validateVideoUrl(value)
  const addresses = await resolveVideoAddresses(url.hostname.replace(/^\[|\]$/g,''))
  const result = await new Promise<Buffer|string>((resolve,reject)=>{
    const request = https.get(url,{
      signal:AbortSignal.timeout(60_000),
      lookup: ((_host: string, options: any, callback: any)=> options?.all ? callback(null,addresses) : callback(null,addresses[0].address,addresses[0].family)) as any,
    },async response=>{
      try {
        if ([301,302,303,307,308].includes(response.statusCode||0) && response.headers.location) { response.resume();resolve(new URL(response.headers.location,url).href);return }
        if (response.statusCode!==200) throw new Error(`视频下载返回 HTTP ${response.statusCode}`)
        if (Number(response.headers['content-length'])>MAX_VIDEO_BYTES) throw new Error('视频超过 64MB 限制')
        const chunks: Buffer[]=[];let size=0
        for await (const chunk of response) { size+=chunk.length;if(size>MAX_VIDEO_BYTES)throw new Error('视频超过 64MB 限制');chunks.push(Buffer.from(chunk)) }
        resolve(Buffer.concat(chunks))
      } catch(error) { response.destroy();reject(error) }
    })
    request.on('error',reject)
  })
  if (typeof result==='string') return downloadVideo(result,destination,redirects+1)
  await writeFile(destination,result)
}
export async function assembleVideoSprite(frames: Buffer[], fps: number, backgroundRemoved: boolean, sleepLoop = false): Promise<VideoSprite> {
  const columns = Math.min(8, frames.length)
  const rows = Math.ceil(frames.length / columns)
  const width = columns * FRAME_SIZE
  const height = rows * FRAME_SIZE
  const layers = frames.map((input, index) => ({input, left:index % columns * FRAME_SIZE, top:Math.floor(index / columns) * FRAME_SIZE}))
  const bytes = await sharp({create:{width,height,channels:4,background:transparent}}).composite(layers).png().toBuffer()
  return {bytes,frames:frames.length,columns,rows,fps,duration:frames.length/fps,width,height,backgroundRemoved,sleepLoop}
}

export async function reverseVideoSprite(filePath: string, asset: {width:number;height:number;columns:number;rows:number;frames:number;fps:number;backgroundRemoved:boolean|number;motionJoinable?:boolean|number|null}) {
  const tileWidth = asset.width / asset.columns
  const tileHeight = asset.height / asset.rows
  const image = sharp(filePath)
  const frames = await Promise.all(Array.from({length:asset.frames},(_,offset)=>{
    const index = asset.frames - offset - 1
    return image.clone().extract({left:index % asset.columns * tileWidth,top:Math.floor(index / asset.columns) * tileHeight,width:tileWidth,height:tileHeight})
      .resize(FRAME_SIZE,FRAME_SIZE,{fit:'contain',background:transparent}).png().toBuffer()
  }))
  return {...await assembleVideoSprite(frames,asset.fps,Boolean(asset.backgroundRemoved)),motionJoinable:Boolean(asset.motionJoinable)}
}

export async function motionAnchorTile(photo: Buffer, dir: string, removeBackground: boolean) {
  if (!removeBackground) return sharp(photo).resize(FRAME_SIZE,FRAME_SIZE).ensureAlpha().png().toBuffer()
  await mkdir(dir)
  const filename = 'frame-001.png'
  await writeFile(path.join(dir,filename),photo)
  const output = path.join(dir,'cutout')
  // Process each anchor on its own so its mask does not depend on the prior pose.
  await removeFrameBackgrounds(dir,output)
  return sharp(path.join(output,filename)).resize(FRAME_SIZE,FRAME_SIZE).ensureAlpha().png().toBuffer()
}

async function blendMotionEdge(frames: Buffer[], anchor: Buffer, index: number, direction: 1|-1, limit: number) {
  const layout = {width:FRAME_SIZE,height:FRAME_SIZE,channels:4 as const}
  const anchorPixels = await sharp(anchor).ensureAlpha().raw().toBuffer()
  const patched = [anchor]
  for (let offset=1;offset<=3;offset++) {
    const pixels = await sharp(frames[index+offset*direction]).ensureAlpha().raw().toBuffer()
    const blended = blendRgba(anchorPixels,pixels,offset/4)
    patched.push(await sharp(blended,{raw:layout}).png().toBuffer())
  }
  const thumbnails = await Promise.all([...patched,frames[index+4*direction]].map(frameThumbnail))
  if (thumbnails.slice(1).some((frame,offset)=>frameDistance(thumbnails[offset],frame)>limit)) return false
  for (const [offset,frame] of patched.entries()) frames[index+offset*direction] = frame
  return true
}

async function pinMotionBoundaries(frames: Buffer[], first: Buffer, last: Buffer, cutout: boolean, transition: boolean, action?: Action) {
  const [anchorIn, next, previous, anchorOut] = await Promise.all([first,frames[1],frames.at(-2)!,last].map(frameThumbnail))
  const limit = cutout ? 0.14 : 0.07
  const entrance = frameDistance(anchorIn,next)
  const exit = frameDistance(previous,anchorOut)
  if (entrance>limit || exit>limit) {
    // Bridge modest silhouette shifts only on transparent transitions between two poses.
    if (!transition || !cutout || Math.max(entrance,exit)>0.20) return false
    const candidate = [...frames]
    if (entrance>limit && !await blendMotionEdge(candidate,first,0,1,limit)) return false
    if (exit>limit && !await blendMotionEdge(candidate,last,frames.length-1,-1,limit)) return false
    for (const [index,frame] of candidate.entries()) frames[index] = frame
  }
  if (action === 'sleep_breathe' || action === 'sleep_breathe_clear') {
    const interior = await Promise.all(frames.slice(1,-1).map(frameThumbnail))
    const excursion = Math.max(...interior.map(frame => frameDistance(anchorIn,frame)))
    if (excursion < (action === 'sleep_breathe_clear' ? 0.004 : 0.002) || excursion > limit) return false
  }
  frames[0] = first
  frames[frames.length - 1] = last
  return true
}

export async function extractVideo(videoPath: string, duration: number, fps = VIDEO_FPS, background: 'keep'|'prefer-transparent'|'require-transparent' = 'keep', action?: Action, anchors?: MotionAnchors): Promise<VideoSprite> {
  if (![2,3,4].includes(duration) || fps!==VIDEO_FPS) throw new Error('抽帧参数无效')
  const useMatte = background!=='keep' && supportsForegroundRemoval()
  if (background==='require-transparent' && !useMatte) throw new Error('透明动作用于已启用前景识别的 macOS 14 或更新版本')
  const scratch = await mkdtemp(path.join(tmpdir(),'petcloud-frames-'))
  try {
    const {stdout} = await execute(config.ffprobe,['-v','error','-protocol_whitelist','file,pipe','-f','mov','-select_streams','v:0','-show_entries','stream=width,height:format=duration','-of','json',videoPath],{timeout:15000,maxBuffer:64*1024})
    const info = JSON.parse(stdout), stream = info.streams?.[0], seconds = Number(info.format?.duration)
    if (!stream || !Number.isFinite(seconds) || seconds<1 || seconds>45 || stream.width>4096 || stream.height>4096) throw new Error('视频规格不支持，请使用 2–4 秒的普通 MP4 视频')
    const clipDuration = Math.min(duration,seconds)
    const sampleSize = useMatte ? MASK_INPUT_SIZE : FRAME_SIZE
    await execute(config.ffmpeg,['-nostdin','-v','error','-protocol_whitelist','file,pipe','-f','mov','-i',videoPath,'-t',String(clipDuration),'-vf',`fps=${fps},scale=${sampleSize}:${sampleSize}:force_original_aspect_ratio=decrease,setsar=1`,'-frames:v',String(duration*fps),'-an','-threads','2',path.join(scratch,'frame-%03d.png')],{timeout:90_000,maxBuffer:256*1024})
    const files = (await readdir(scratch)).filter(name=>/^frame-\d+\.png$/.test(name)).sort()
    if (files.length<fps || files.length>duration*fps) throw new Error('视频未能抽取足够的有效帧')
    const framesFrom = (dir: string) => Promise.all(files.map(name => sharp(path.join(dir,name))
      .ensureAlpha().resize(FRAME_SIZE,FRAME_SIZE,{fit:'contain',background:transparent}).png().toBuffer()))
    let frames: Buffer[] | undefined
    let boundaries: [Buffer, Buffer] | undefined
    async function getBoundaries(cutout: boolean): Promise<[Buffer, Buffer] | undefined> {
      if (!anchors) return
      const first = await motionAnchorTile(anchors.first,path.join(scratch,'anchor-first'),cutout)
      const last = anchors.samePose ? first : await motionAnchorTile(anchors.last,path.join(scratch,'anchor-last'),cutout)
      return [first,last]
    }
    if (useMatte) {
      const output = path.join(scratch,'transparent')
      try {
        await removeFrameBackgrounds(scratch,output)
        const cutoutFrames = await framesFrom(output)
        boundaries = await getBoundaries(true)
        frames = cutoutFrames
      } catch(error) {
        if (background==='require-transparent') throw error
        // Keep the entire original sequence if a cutout fails, avoiding a flash of background mid-animation.
        console.warn('Video foreground:',error instanceof Error?error.message:'无法去除背景')
      }
    }
    const backgroundRemoved = Boolean(frames)
    frames ??= await framesFrom(scratch)
    if (action === 'sleep') frames = await makeSleepLoop(frames, fps)
    const pair = boundaries ?? await getBoundaries(false)
    const motionJoinable = pair ? await pinMotionBoundaries(frames,pair[0],pair[1],backgroundRemoved,anchors!.samePose===false,action) : undefined
    const sheet = await assembleVideoSprite(frames,fps,backgroundRemoved,action === 'sleep')
    return {...sheet,motionJoinable}
  } finally { await rm(scratch,{recursive:true,force:true}) }
}
