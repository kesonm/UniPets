import { readFile, mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'
import sharp from 'sharp'
import type { PoolConnection, RowDataPacket } from 'mysql2/promise'
import { availableCatClip, catClips, catDefaultAction, catJumpAction, catPoses, catReversedClips, resolveCatAction, type CatClipId, type CatPoseId } from '../../shared/cat-motion.mjs'
import { db, rows, transaction } from './db.js'
import { config } from './config.js'
import { ownedAsset, ownedPet, saveImage, saveSprite, saveVideoSprite, storagePath, type Action } from './assets.js'
import { HttpError } from './errors.js'
import { normalizeMotionPhoto, referenceDataUrl, reverseVideoSprite, submitMotionVideo, submitVideo, queryVideo, downloadVideo, extractVideo } from './video.js'
import { supportsForegroundRemoval } from './foreground.js'
import { batchAnchorOutputs, batchOrder, getMotionAssets, publishBatchPoses } from './motion-batches.js'
import { renderJumpSprite } from './jump-render.js'
export const jobSelect = 'id, pet_id AS petId, reference_asset_id AS referenceAssetId, status, completed, total, error, mode, duration_seconds AS duration, fps, model, phase, motion_key AS motionKey, created_at AS createdAt, updated_at AS updatedAt'
export const actions: {id:Action;label:string;motion:string}[] = [
  {id:'idle',label:'待机呼吸',motion:'原地安静站立，轻微呼吸、眨眼和摆尾'},
  {id:'happy',label:'开心互动',motion:'开心地坐着，轻轻抬起一只前爪再放下'},
  {id:'walk',label:'轻快行走',motion:'侧身原地踏步行走，四肢步态自然连贯，不离开画面'},
  {id:'sleep',label:'安心睡觉',motion:'从第一帧起趴卧闭眼，头靠前爪，全程保持同一睡姿，只有胸腹随一呼一吸轻轻起伏'},
]
interface Job {
  id:string;user_id:string;pet_id:string;reference_asset_id:string|null;end_asset_id:string|null;
  mode:'image'|'video'|'motion_batch'|'motion_render';model:string;duration_seconds:number;fps:number;total:number;
  motion_key:CatClipId|CatPoseId|null;batch_id:string|null;transparent_output:0|1|null;appearance_reference_ids:string[]|null;
  status:'queued'|'running'|'completed'|'partial'|'failed';
}
interface Task {action:Action;status:string;provider_task_id:string|null;poll_failures:number;next_poll_at:Date|null;created_at:Date;submitted_at:Date|null}
const videoServices={submitVideo,submitMotionVideo,queryVideo,downloadVideo,extractVideo}
let working=false,stopped=false,timer:ReturnType<typeof setInterval>|undefined
let activeTask:Promise<void>=Promise.resolve()
const readableError=(error:unknown)=>error instanceof Error?error.message.slice(0,380):'处理失败'

export async function reserveGeneration(conn: PoolConnection, owner: string, units: number, legacy = false) {
  await conn.execute('SELECT id FROM users WHERE id=? FOR UPDATE',[owner])
  const [active] = await conn.execute<RowDataPacket[]>("SELECT id FROM generation_jobs WHERE user_id=? AND status IN ('queued','running') LIMIT 1",[owner])
  if (active.length) throw new HttpError(409,'你已有一个生成任务，请等待完成后再提交')
  const [[counts]] = await conn.execute<RowDataPacket[]>(`SELECT COALESCE(SUM(COALESCE(planned_units,total)),0) AS units,
    COALESCE(SUM(mode<>'motion_batch' AND motion_key IS NULL),0) AS legacy FROM generation_jobs
    WHERE user_id=? AND batch_id IS NULL AND created_at>DATE_SUB(UTC_TIMESTAMP(),INTERVAL 1 DAY)`,[owner])
  if (legacy && Number(counts.legacy) >= 20) throw new HttpError(429,'今天已达到 20 次快捷生成上限')
  if (Number(counts.units) + units > 80) throw new HttpError(429,'今天已达到素材生成上限')
}

function actionLabel(action: Action) {
  return Object.hasOwn(catClips,action) ? catClips[action as CatClipId].label : actions.find(item => item.id === action)?.label
}

async function referencePhoto(job: Job, id: string | null) {
  if (!id) throw new Error('参考照片已删除')
  const asset = await ownedAsset(job.user_id,id)
  if (asset.petId !== job.pet_id || asset.kind !== 'photo') throw new Error('参考照片必须属于当前宠物')
  return readFile(storagePath(asset.fileKey))
}

async function motionAnchors(job: Job) {
  const first = await normalizeMotionPhoto(await referencePhoto(job,job.reference_asset_id))
  const samePose = job.reference_asset_id === job.end_asset_id
  const last = samePose ? first : await normalizeMotionPhoto(await referencePhoto(job,job.end_asset_id))
  return {first,last,samePose}
}
async function failAction(jobId:string,action:Action,error:string) {
  await db.execute("UPDATE generation_actions SET status='failed',error=? WHERE job_id=? AND action=?",[error.slice(0,400),jobId,action])
}
async function finishVideoJob(job:Job) {
  const result=await rows<{status:string;error:string|null;action:Action}>('SELECT action,status,error FROM generation_actions WHERE job_id=?',[job.id])
  const completed=result.filter(item=>item.status==='completed').length
  const active=result.some(item=>!['completed','failed'].includes(item.status))
  const errors=result.filter(item=>item.error&&item.status==='failed').map(item=>`${actionLabel(item.action)}：${item.error}`).join('；')
  const complete = completed === job.total
  await db.execute('UPDATE generation_jobs SET completed=?,status=?,error=?,phase=? WHERE id=?',[completed,active?'running':complete?'completed':completed?'partial':'failed',errors.slice(0,500)||null,active?'继续处理剩余动作':complete?'视频生成与抽帧完成':completed?'已保留完成的动作':'未取得可用的动作素材',job.id])
}

async function finishVideoStep(job: Job, action: Action, asset: {motionJoinable?: number|boolean|null; backgroundRemoved: number|boolean}) {
  if (job.batch_id && !asset.motionJoinable) {
    await failAction(job.id,action,'动作或接缝需检查，已保存单段预览')
  } else if (job.batch_id && Boolean(asset.backgroundRemoved)!==Boolean(job.transparent_output)) {
    await failAction(job.id,action,'透明帧处理未完成，已保存单段预览')
  } else {
    await db.execute("UPDATE generation_actions SET status='completed',provider_progress=100,error=NULL WHERE job_id=? AND action=?",[job.id,action])
  }
}

async function processVideoJob(job:Job, services=videoServices) {
  const [task]=await rows<Task>("SELECT action,status,provider_task_id,poll_failures,next_poll_at,created_at,submitted_at FROM generation_actions WHERE job_id=? AND status NOT IN ('completed','failed') ORDER BY FIELD(action,'idle','happy','walk','sleep') LIMIT 1",[job.id])
  if(!task){await finishVideoJob(job);return}
  const motion = job.motion_key ? catClips[job.motion_key as CatClipId] : undefined
  const legacy = actions.find(item => item.id === task.action)
  const action = motion ?? legacy
  if (!action) {
    await failAction(job.id,task.action,'动作配置不存在')
    await finishVideoJob(job)
    return
  }
  // A crash between the asset insert and task update must not duplicate an asset.
  const [saved]=await rows<{motionJoinable:number|null;backgroundRemoved:number}>('SELECT motion_joinable AS motionJoinable,background_removed AS backgroundRemoved FROM assets WHERE job_id=? AND action=?',[job.id,task.action])
  if (saved) { await finishVideoStep(job,task.action,saved);await finishVideoJob(job);return }
  if(task.status==='submitting') {await failAction(job.id,task.action,'提交结果未确认，请联系平台核查；为避免重复计费未重新提交');await finishVideoJob(job);return}
  if(task.next_poll_at&&new Date(task.next_poll_at).getTime()>Date.now())return
  if(task.status==='queued') {
    try {
      const anchors = motion ? await motionAnchors(job) : undefined
      const reference = await referenceDataUrl(anchors?.first ?? await referencePhoto(job,job.reference_asset_id))
      const end = anchors ? anchors.samePose ? reference : await referenceDataUrl(anchors.last) : undefined
      await db.execute("UPDATE generation_actions SET status='submitting',submitted_at=UTC_TIMESTAMP(3) WHERE job_id=? AND action=?",[job.id,task.action])
      await db.execute('UPDATE generation_jobs SET phase=? WHERE id=?',[`${action.label}：提交视频任务`,job.id])
      const id = end
        ? await services.submitMotionVideo(job.model,job.duration_seconds,reference,end,action.motion)
        : await services.submitVideo(job.model,job.duration_seconds,reference,action.motion,task.action)
      await db.execute("UPDATE generation_actions SET status='generating',provider_task_id=?,next_poll_at=DATE_ADD(UTC_TIMESTAMP(3),INTERVAL 10 SECOND),error=NULL WHERE job_id=? AND action=?",[id,job.id,task.action])
      await db.execute('UPDATE generation_jobs SET phase=? WHERE id=?',[`${action.label}：视频生成中`,job.id])
    } catch(error) {await failAction(job.id,task.action,readableError(error));await finishVideoJob(job)}
    return
  }
  if(!task.provider_task_id){await failAction(job.id,task.action,'缺少视频任务 ID，未重新提交生成');await finishVideoJob(job);return}
  if(Date.now()-new Date(task.submitted_at ?? task.created_at).getTime()>2*60*60*1000){await failAction(job.id,task.action,'查询超过两小时，任务 ID 已保留供平台核查；未重新提交生成');await finishVideoJob(job);return}
  let scratch:string|undefined
  let stage:'查询'|'下载'='查询'
  try {
    const result=await services.queryVideo(task.provider_task_id)
    if(result.status==='failed'){await failAction(job.id,task.action,'视频平台报告生成失败');await finishVideoJob(job);return}
    if(result.status!=='completed') {
      await db.execute("UPDATE generation_actions SET poll_failures=0,error=NULL,provider_progress=COALESCE(?,provider_progress),next_poll_at=DATE_ADD(UTC_TIMESTAMP(3),INTERVAL 10 SECOND) WHERE job_id=? AND action=?",[result.progress??null,job.id,task.action])
      await db.execute('UPDATE generation_jobs SET phase=? WHERE id=?',[`${action.label}：${result.status==='queued'?'视频服务排队中':'视频生成中'}`,job.id])
      return
    }
    stage='下载'
    await db.execute("UPDATE generation_actions SET status='processing' WHERE job_id=? AND action=?",[job.id,task.action])
    await db.execute('UPDATE generation_jobs SET phase=? WHERE id=?',[`${action.label}：下载视频并抽帧`,job.id])
    scratch=await mkdtemp(path.join(tmpdir(),'petcloud-video-'))
    const file=path.join(scratch,'source.mp4')
    await services.downloadVideo(result.url!,file)
    try {
      if (supportsForegroundRemoval()) await db.execute('UPDATE generation_jobs SET phase=? WHERE id=?',[`${action.label}：抽帧并去背景`,job.id])
      const anchors = motion ? await motionAnchors(job) : undefined
      const background = job.transparent_output===0 ? 'keep' : 'prefer-transparent'
      const sheet = await services.extractVideo(file,job.duration_seconds,job.fps,background,task.action,anchors)
      const pet=await ownedPet(job.user_id,job.pet_id)
      const saved = await saveVideoSprite({
        userId:job.user_id, petId:job.pet_id, name:`${pet.name} · ${action.label}`, bytes:sheet.bytes, action:task.action, jobId:job.id,
        motion:anchors ? {fromAssetId:job.reference_asset_id!,toAssetId:job.end_asset_id!} : undefined,
      },sheet,file)
      await finishVideoStep(job,task.action,saved)
    } catch(error) {await failAction(job.id,task.action,`视频抽帧或保存失败：${readableError(error)}`)}
    await finishVideoJob(job)
  } catch(error) {
    // Query/download failures retry the existing provider task; never submit again.
    const detail=readableError(error)
    if(task.poll_failures>=11){await failAction(job.id,task.action,`视频${stage}连续失败：${detail.slice(0,220)}；原任务 ID 已保留`);await finishVideoJob(job)}
    else {
      await db.execute("UPDATE generation_actions SET poll_failures=poll_failures+1,error=?,next_poll_at=DATE_ADD(UTC_TIMESTAMP(3),INTERVAL 10 SECOND) WHERE job_id=? AND action=?",[detail,job.id,task.action])
      await db.execute('UPDATE generation_jobs SET phase=? WHERE id=?',[`${action.label}：${stage}暂时失败，等待重试`,job.id])
    }
  } finally {if(scratch)await rm(scratch,{recursive:true,force:true})}
}

async function requestImageEdit(model: string, images: Buffer[], size: string, prompt: string) {
  const form = new FormData()
  form.set('model',model)
  form.set('size',size)
  form.set('quality','medium')
  form.set('prompt',prompt)
  for (const [index,bytes] of images.entries()) {
    form.append('image',new Blob([new Uint8Array(bytes)],{type:'image/png'}),`reference-${index+1}.png`)
  }
  const response = await fetch(config.imageUrl,{method:'POST',headers:{Authorization:`Bearer ${config.imageKey}`},body:form,signal:AbortSignal.timeout(270_000)})
  if (!response.ok) throw new Error(`模型服务返回 HTTP ${response.status}`)
  const body = await response.json() as {data?:{b64_json?:string}[]}
  const encoded = body.data?.[0]?.b64_json
  if (!encoded || encoded.length > 34 * 1024 * 1024) throw new Error('模型未返回可用的图片数据')
  return Buffer.from(encoded,'base64')
}

async function processPoseJob(job: Job, poseId: CatPoseId, appearanceIds: string[]|null) {
  const pet = await ownedPet(job.user_id,job.pet_id)
  const pose = catPoses[poseId]
  if (!pose) throw new Error('姿势配置不存在')
  const sources = appearanceIds
    ? await Promise.all(appearanceIds.map(async id=>sharp(await referencePhoto(job,id)).resize({width:960,height:960,fit:'inside',withoutEnlargement:true}).png().toBuffer()))
    : [await referencePhoto(job,job.reference_asset_id)]
  await db.execute('UPDATE generation_jobs SET phase=? WHERE id=?',[`正在生成${pose.label}锚图`,job.id])
  const bytes = await requestImageEdit(job.model,sources,'1024x1024',[
    appearanceIds
      ? '每张输入是同一只宠物的外观参考。仅提取宠物主体的物种、体型、五官、眼睛颜色、毛色、花纹和毛发特征。忽略输入照片的姿势、动作、构图、视角、光照、背景、配饰、人物及其它物体。只输出一张正方形的写实宠物定格照，按下述要求重新摆姿势。'
      : '输出一张正方形的写实猫咪定格照，保持参考猫的真实品种、体型、脸部、毛色和花纹。',
    appearanceIds ? pose.pose.replace(/^猫/,'宠物') : pose.pose,
    `${pose.view==='front' ? '单一正视固定机位' : '单一侧视固定机位'}，与宠物肩同高。四肢接地线或胸腹支撑线在画布高度约 78% 处，躯干居中，保持宠物原有身体比例，全身含耳朵、脚爪和尾巴完整可见。`,
    '适度拉远取景，给完整轮廓留出边距，左右各预留约画幅 15% 的空白，供后续摆尾和转头。',
    '均匀纯浅灰背景，无其他动物、物体、文字、拼图和棋盘格。',
  ].join(''))
  const image = await saveImage({userId:job.user_id,petId:job.pet_id,name:`${pet.name} · ${pose.label}锚图`,bytes,jobId:job.id})
  if (job.batch_id) {
    await db.execute("UPDATE generation_jobs SET completed=1,status='completed',phase='姿势锚图已保存' WHERE id=?",[job.id])
    return
  }
  await transaction(async conn => {
    await conn.execute('SELECT id FROM users WHERE id=? FOR UPDATE',[job.user_id])
    await conn.execute('INSERT INTO motion_poses (pet_id,pose_key,asset_id) VALUES (?,?,?) ON DUPLICATE KEY UPDATE asset_id=?',[job.pet_id,poseId,image.id,image.id])
    await conn.execute("UPDATE generation_jobs SET completed=1,status='completed',phase='姿势锚图已保存' WHERE id=?",[job.id])
  })
}

async function runPoseJob(job: Job, appearanceIds: string[]|null = null) {
  try { await processPoseJob(job,job.motion_key as CatPoseId,appearanceIds) }
  catch (error) { await db.execute("UPDATE generation_jobs SET status='failed',error=?,phase='姿势锚图生成失败' WHERE id=?",[readableError(error),job.id]) }
}

function batchStepLabel(key: keyof typeof catClips | keyof typeof catPoses) {
  return Object.hasOwn(catPoses,key) ? `${catPoses[key as CatPoseId].label}锚图` : catClips[key as CatClipId].label
}

async function refreshMotionBatch(parent: Job) {
  const steps = await rows<{motion_key: CatPoseId|CatClipId; status: string; phase: string; error: string|null}>(
    `SELECT motion_key,status,phase,error FROM generation_jobs WHERE batch_id=? ORDER BY FIELD(motion_key,${batchOrder.map(()=>'?').join(',')})`,
    [parent.id,...batchOrder],
  )
  const completed = steps.filter(step=>step.status==='completed').length
  const active = steps.find(step=>step.status==='queued'||step.status==='running')
  if (active) {
    const phase = active.status==='running' && active.phase ? active.phase : `等待处理${batchStepLabel(active.motion_key)}`
    await db.execute('UPDATE generation_jobs SET completed=?,phase=? WHERE id=?',[completed,phase,parent.id])
    return
  }
  const errors = steps.filter(step=>step.status==='failed' && step.error)
    .map(step=>`${batchStepLabel(step.motion_key)} ${step.error}`).join('；').slice(0,500)
  const complete = completed===parent.total
  await transaction(async conn => {
    await conn.execute('SELECT id FROM users WHERE id=? FOR UPDATE',[parent.user_id])
    const published = await publishBatchPoses(conn,parent.id,parent.user_id,parent.pet_id,complete)
    const phase = complete ? '全部动作已就绪，可以连播'
      : !completed ? '本次生成未完成，可以重新提交'
      : published ? '已保存可用片段，补齐后可连播全部动作' : '已保存素材，补齐后更新动作流程'
    await conn.execute('UPDATE generation_jobs SET status=?,completed=?,phase=?,error=? WHERE id=?',[
      complete?'completed':completed?'partial':'failed',completed,phase,errors||null,parent.id,
    ])
  })
}

async function renderBatchJump(job: Job, batchId: string) {
  try {
    const [saved] = await rows('SELECT id FROM assets WHERE job_id=? AND action=?',[job.id,catJumpAction])
    if (!saved) {
      const poses = await batchAnchorOutputs(batchId)
      const anchor = poses.stand_left
      if (!anchor) throw new Error('跳跃需要全身侧身站姿锚图')
      await db.execute('UPDATE generation_jobs SET reference_asset_id=?,end_asset_id=?,phase=? WHERE id=?',[anchor,anchor,'正在合成蓄力、起跳和落地帧',job.id])
      const assets = await getMotionAssets(job.user_id,job.pet_id)
      const stand = resolveCatAction('stand_left',catDefaultAction,{poses,assets})?.clip.asset
      let texture:Buffer|undefined
      if (stand) {
        const {fileKey,columns,rows,width,height} = await ownedAsset(job.user_id,stand.id)
        texture = await sharp(storagePath(fileKey)).extract({left:0,top:0,width:width/columns,height:height/rows}).png().toBuffer().catch(()=>undefined)
      }
      const sheet = await renderJumpSprite(await referencePhoto(job,anchor),texture)
      const pet = await ownedPet(job.user_id,job.pet_id)
      await saveSprite({userId:job.user_id,petId:job.pet_id,name:`${pet.name} · 跳跃`,bytes:sheet.bytes,
        action:catJumpAction,jobId:job.id,motion:{fromAssetId:anchor,toAssetId:anchor}},sheet)
    }
    await db.execute("UPDATE generation_jobs SET status='completed',completed=1,error=NULL,phase='跳跃帧图已保存' WHERE id=?",[job.id])
  } catch(error) {
    await db.execute("UPDATE generation_jobs SET status='failed',error=?,phase='跳跃帧图合成失败' WHERE id=?",[readableError(error),job.id])
  }
}

async function renderReversedClip(job: Job, batchId: string) {
  const action = job.motion_key as CatClipId
  try {
    const [saved] = await rows('SELECT id FROM assets WHERE job_id=? AND action=?',[job.id,action])
    if (!saved) {
      const sourceAction = catReversedClips[action]
      const poses = await batchAnchorOutputs(batchId)
      const assets = await getMotionAssets(job.user_id,job.pet_id)
      const source = sourceAction && availableCatClip(sourceAction,{poses,assets},Boolean(job.transparent_output))
      if (!source?.motionFromAssetId || !source.motionToAssetId) throw new Error('缺少对应的正向过渡素材')
      const asset = await ownedAsset(job.user_id,source.id)
      const sheet = await reverseVideoSprite(storagePath(asset.fileKey),asset)
      const pet = await ownedPet(job.user_id,job.pet_id)
      await saveSprite({userId:job.user_id,petId:job.pet_id,name:`${pet.name} · ${catClips[action].label}`,bytes:sheet.bytes,action,jobId:job.id,
        motion:{fromAssetId:source.motionToAssetId,toAssetId:source.motionFromAssetId}},sheet)
    }
    await db.execute("UPDATE generation_jobs SET status='completed',completed=1,error=NULL,phase='过渡帧图已保存' WHERE id=?",[job.id])
  } catch (error) {
    await db.execute("UPDATE generation_jobs SET status='failed',error=?,phase='过渡帧图合成失败' WHERE id=?",[readableError(error),job.id])
  }
}

async function processMotionBatch(parent: Job, services: typeof videoServices) {
  const [step] = await rows<Job>(`SELECT j.* FROM generation_jobs j
    LEFT JOIN generation_actions g ON j.id=g.job_id AND j.motion_key=g.action
    CROSS JOIN (SELECT COUNT(*) AS videos FROM generation_jobs WHERE batch_id=? AND mode='video' AND status='running') inflight
    WHERE j.batch_id=? AND j.status IN ('queued','running') AND (
      j.mode='image' OR (j.mode='video' AND (j.status='running' OR inflight.videos<4)
        AND (g.next_poll_at IS NULL OR g.next_poll_at<=UTC_TIMESTAMP(3) OR g.status IN ('completed','failed')))
      OR (j.mode='motion_render' AND inflight.videos=0)
    ) ORDER BY FIELD(j.motion_key,${batchOrder.map(()=>'?').join(',')}) LIMIT 1`,[parent.id,parent.id,...batchOrder])
  if (!step) { await refreshMotionBatch(parent); return }
  await db.execute("UPDATE generation_jobs SET status='running' WHERE id=?",[step.id])
  if (step.mode === 'image') {
    if (step.status==='queued') await runPoseJob(step,parent.appearance_reference_ids)
    else {
      // Image edits are synchronous and have no upstream task ID to poll.
      const [saved] = await rows("SELECT id FROM assets WHERE job_id=? AND kind='photo' LIMIT 1",[step.id])
      if (saved) await db.execute("UPDATE generation_jobs SET status='completed',completed=1,phase='姿势锚图已保存' WHERE id=?",[step.id])
      else await db.execute("UPDATE generation_jobs SET status='failed',error='图片生成结果未确认，请检查后重试' WHERE id=?",[step.id])
    }
  }
  else if (step.mode==='motion_render') {
    if (step.motion_key===catJumpAction) await renderBatchJump(step,parent.id)
    else await renderReversedClip(step,parent.id)
  }
  else {
    if (!step.reference_asset_id || !step.end_asset_id) {
      const clip = catClips[step.motion_key as CatClipId]
      const poses = await batchAnchorOutputs(parent.id)
      const first = poses[clip.from], last = poses[clip.to]
      if (!first || !last) {
        await failAction(step.id,step.motion_key as CatClipId,'缺少起止锚图，等待补齐')
        await finishVideoJob(step)
        await refreshMotionBatch(parent)
        return
      }
      await db.execute('UPDATE generation_jobs SET reference_asset_id=?,end_asset_id=? WHERE id=?',[first,last,step.id])
      step.reference_asset_id = first
      step.end_asset_id = last
    }
    await processVideoJob(step,services)
  }
  await refreshMotionBatch(parent)
}

// Old explicitly requested image jobs remain readable and executable during migration.
async function processImageJob(job:Job) {
  let completed=0;const failures:string[]=[]
  try {
    const pet = await ownedPet(job.user_id,job.pet_id)
    const bytes = await referencePhoto(job,job.reference_asset_id)
    for(const action of actions) {
      try {
        const generated = await requestImageEdit(job.model || config.imageModel,[bytes],'1536x1024',`Create a horizontal sprite sheet with exactly four equal-width panels of the same real pet. Preserve real fur, markings, face and proportions. Action: ${action.id==='walk'?'walking in place':action.motion}. Four sequential full-body frames at the same scale, baseline and camera position. Minimize blank space; keep ears, paws and tail in each panel. Real alpha background if supported, otherwise flat pure white. Never draw a checkerboard, text, borders or imitation transparency. No extra objects or animals.`)
        await saveImage({userId:job.user_id,petId:job.pet_id,name:`${pet.name} · ${action.label}`,bytes:generated,action:action.id,jobId:job.id})
        completed++;await db.execute('UPDATE generation_jobs SET completed=? WHERE id=?',[completed,job.id])
      }catch(error){failures.push(`${action.label}：${readableError(error)}`)}
    }
  }catch(error){failures.push(readableError(error))}
  await db.execute('UPDATE generation_jobs SET status=?,error=? WHERE id=?',[completed===4?'completed':completed?'partial':'failed',failures.join('；').slice(0,500)||null,job.id])
}
export async function workerTick(overrides: Partial<typeof videoServices> = {}) {
  if(working||stopped)return
  working=true
  try {
    const [job]=await rows<Job>("SELECT * FROM generation_jobs WHERE batch_id IS NULL AND status IN ('queued','running') ORDER BY created_at LIMIT 1")
    if(!job)return
    await db.execute("UPDATE generation_jobs SET status='running' WHERE id=?",[job.id])
    if (job.mode === 'motion_batch') await processMotionBatch(job,{...videoServices,...overrides})
    else if (job.mode === 'video') await processVideoJob(job,{...videoServices,...overrides})
    else if (job.motion_key) await runPoseJob(job)
    else await processImageJob(job)
  } catch(error:any){console.error('Job worker:',error.code||error.message)}
  finally{working=false}
}
export async function recoverInterruptedJobs() {
  await db.execute(`UPDATE generation_jobs j JOIN assets a ON a.job_id=j.id AND a.kind='photo'
    SET j.status='completed',j.completed=1,j.phase='姿势锚图已保存' WHERE j.batch_id IS NOT NULL AND j.mode='image' AND j.status='running'`)
  await db.execute("UPDATE generation_jobs SET status=IF(completed>0,'partial','failed'),error='服务重启前图片生成结果未确认，已保留现有素材' WHERE status='running' AND mode='image'")
  await db.execute("UPDATE generation_actions SET status='failed',error='服务重启前提交结果未确认，请联系平台核查，未重新提交生成' WHERE status='submitting' AND provider_task_id IS NULL")
}
export async function startWorker() {
  await recoverInterruptedJobs()
  stopped=false
  timer=setInterval(()=>{if(!working&&!stopped)activeTask=workerTick()},1500)
}
export async function stopWorker(){stopped=true;clearInterval(timer);await activeTask}
