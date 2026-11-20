import { Router } from 'express'
import { randomUUID } from 'node:crypto'
import { z } from 'zod'
import { catClips, catJumpAction, catPoses, type CatClipId, type CatPoseId } from '../../shared/cat-motion.mjs'
import { jumpFps } from '../../shared/jump-motion.mjs'
import { config } from './config.js'
import { rows, transaction } from './db.js'
import { HttpError } from './errors.js'
import { ownedAsset, ownedPet } from './assets.js'
import { actions, jobSelect, reserveGeneration } from './jobs.js'
import { checkVideoTools, supportsMotionVideo, VIDEO_FPS } from './video.js'
import { clipOrder, getAppearanceReferences, getMotionPoses, planFromUploadedPhotos, planMotionBatch, poseOrder } from './motion-batches.js'

const uuid = z.string().uuid()
export const generationRouter = Router()
generationRouter.use((_req, res, next) => {
  res.locals.generationEnabled = true
  next()
})

generationRouter.get('/jobs', async (req, res) => res.json({ jobs: await rows(`SELECT ${jobSelect} FROM generation_jobs WHERE user_id=? AND batch_id IS NULL ORDER BY created_at DESC,id DESC LIMIT 50`, [req.user.id]) }))
generationRouter.post('/jobs', async (req, res) => {
  const data = z.object({ petId: uuid, referenceAssetId: uuid, mode: z.enum(['image','video']).default('video'), duration: z.union([z.literal(2),z.literal(3),z.literal(4)]).default(3) }).parse(req.body)
  if (!(data.mode==='video' ? config.videoKey : config.imageKey)) throw new HttpError(503, '生成服务尚未配置，请联系管理员设置 UNIWORK_KEY')
  if (data.mode==='video' && !await checkVideoTools()) throw new HttpError(503, '后端未安装 FFmpeg / FFprobe，暂时无法抽帧')
  if (data.mode==='video' && /seedance/.test(config.videoModel) && data.duration<4) throw new HttpError(400, '当前 Seedance 模型最短为 4 秒，请选择 4 秒')
  const id = randomUUID()
  await transaction(async conn => {
    await reserveGeneration(conn,req.user.id,actions.length,true)
    await ownedPet(req.user.id, data.petId)
    const source = await ownedAsset(req.user.id, data.referenceAssetId)
    if (source.petId !== data.petId || source.kind !== 'photo') throw new HttpError(400, '请选择该宠物的一张原始照片')
    await conn.execute('INSERT INTO generation_jobs (id,user_id,pet_id,reference_asset_id,mode,duration_seconds,fps,model) VALUES (?,?,?,?,?,?,?,?)', [id,req.user.id,data.petId,data.referenceAssetId,data.mode,data.duration,VIDEO_FPS,data.mode==='video'?config.videoModel:config.imageModel])
    if (data.mode==='video') for (const action of actions) await conn.execute('INSERT INTO generation_actions (job_id,action) VALUES (?,?)',[id,action.id])
  })
  res.status(202).json({ job: (await rows(`SELECT ${jobSelect} FROM generation_jobs WHERE id=?`, [id]))[0] })
})

const motionPose = z.string().refine((value): value is CatPoseId => Object.hasOwn(catPoses,value),'姿势不存在')
const motionClip = z.string().refine((value): value is CatClipId => value!==catJumpAction && Object.hasOwn(catClips,value),'视频动作片段不存在')

const batchApproval = z.object({poses:z.number().int().min(0).max(poseOrder.length),clips:z.number().int().min(0).max(clipOrder.length)})
const batchRequest = z.object({
  kind:z.literal('batch'), referenceAssetId:uuid.optional(), referenceAssetIds:z.array(uuid).min(1).max(5).optional(), approved:batchApproval,
})
const motionGenerate = z.discriminatedUnion('kind',[
  z.object({kind:z.literal('pose'), key:motionPose, referenceAssetId:uuid}),
  z.object({kind:z.literal('clip'), key:motionClip}),
  batchRequest,
]).refine(input=>input.kind!=='batch' || Boolean(input.referenceAssetId)!==Boolean(input.referenceAssetIds),'请选择一组有效的参考照片')

async function checkMotionPhoto(owner: string, petId: string, photo: string) {
  const source = await ownedAsset(owner,photo)
  if (source.petId !== petId || source.kind !== 'photo') throw new HttpError(400,'请选择该宠物的一张参考照片')
  return source
}

generationRouter.get('/motions/:petId/batch-plan', async (req,res) => {
  const petId = uuid.parse(req.params.petId)
  await ownedPet(req.user.id,petId)
  res.json(await planFromUploadedPhotos(req.user.id,petId))
})

generationRouter.get('/motions/:petId/batch-plan/:photoId', async (req,res) => {
  const petId = uuid.parse(req.params.petId), photoId = uuid.parse(req.params.photoId)
  await ownedPet(req.user.id,petId)
  await checkMotionPhoto(req.user.id,petId,photoId)
  const {quote} = await planMotionBatch(req.user.id,petId,photoId)
  res.json(quote)
})

generationRouter.put('/motions/:petId/poses/:poseKey', async (req,res) => {
  const petId = uuid.parse(req.params.petId)
  const key = motionPose.parse(req.params.poseKey)
  const {assetId} = z.object({assetId:uuid.nullable()}).parse(req.body)
  await transaction(async conn => {
    await conn.execute('SELECT id FROM users WHERE id=? FOR UPDATE',[req.user.id])
    await ownedPet(req.user.id,petId)
    const [active] = await conn.execute(`SELECT id FROM generation_jobs WHERE pet_id=? AND status IN ('queued','running')
      AND (mode='motion_batch' OR (motion_key=? AND mode='image'))`,[petId,key])
    if ((active as unknown[]).length) throw new HttpError(409,'请等待当前生成完成后再更换锚图')
    if (assetId) {
      const asset = await ownedAsset(req.user.id,assetId)
      if (asset.petId !== petId || asset.kind !== 'photo') throw new HttpError(400,'请选择该宠物的一张照片')
      await conn.execute('INSERT INTO motion_poses (pet_id,pose_key,asset_id) VALUES (?,?,?) ON DUPLICATE KEY UPDATE asset_id=?',[petId,key,assetId,assetId])
    } else await conn.execute('DELETE FROM motion_poses WHERE pet_id=? AND pose_key=?',[petId,key])
  })
  res.json({poses:await getMotionPoses(petId)})
})

export async function enqueueMotionBatch(owner: string, petId: string, request: z.infer<typeof batchRequest>) {
  const id = randomUUID()
  await transaction(async conn => {
    await conn.execute('SELECT id FROM users WHERE id=? FOR UPDATE',[owner])
    await ownedPet(owner,petId)
    let sourceId = request.referenceAssetId
    let appearanceIds: string[] | undefined
    if (request.referenceAssetIds) {
      appearanceIds = (await getAppearanceReferences(owner,petId,conn)).map(photo=>photo.id)
      if (!appearanceIds.length) throw new HttpError(400,'请先在宠物资产上传至少一张宠物照片')
      if (appearanceIds.length !== request.referenceAssetIds.length || appearanceIds.some((photo,index)=>photo !== request.referenceAssetIds?.[index])) {
        throw new HttpError(409,'参考照片已变化，刷新后请重新点击生成')
      }
      sourceId = appearanceIds[0]
    } else if (sourceId) await checkMotionPhoto(owner,petId,sourceId)
    if (!sourceId) throw new HttpError(400,'请选择有效的参考照片')
    const {poseSteps,clipSteps,localSteps,quote,transparent} = await planMotionBatch(owner,petId,sourceId,conn,appearanceIds)
    if (quote.poses > request.approved.poses || quote.clips > request.approved.clips) throw new HttpError(409,'可复用素材已变化，请重新确认生成数量')
    const units = quote.poses+quote.clips
    await reserveGeneration(conn,owner,units)
    if (quote.poses && !config.imageKey) throw new HttpError(503,'生图服务尚未配置')
    if (quote.clips && (!config.videoKey || !supportsMotionVideo(config.videoModel))) throw new HttpError(503,'连续动作需要支持首尾帧的 Wan 3.0 视频服务')
    if (quote.clips && !await checkVideoTools()) throw new HttpError(503,'后端未安装 FFmpeg / FFprobe')
    await conn.execute(`INSERT INTO generation_jobs
      (id,user_id,pet_id,reference_asset_id,mode,model,total,completed,planned_units,transparent_output,phase,appearance_reference_ids)
      VALUES (?,?,?,?,'motion_batch',?,?,?,?,?,?,?)`,[
      id,owner,petId,sourceId,config.videoModel,quote.total,quote.total-units-quote.local,units,transparent,
      units || quote.local ? '已排队生成全部动作' : '等待同步已生成的动作',
      appearanceIds?JSON.stringify(appearanceIds):null,
    ])
    for (const {key,reuse} of poseSteps) {
      await conn.execute(`INSERT INTO generation_jobs
        (id,user_id,pet_id,reference_asset_id,mode,model,total,completed,status,motion_key,batch_id,reused_asset_id)
        VALUES (?,?,?,?,'image',?,1,?,?,?,?,?)`,[randomUUID(),owner,petId,sourceId,config.imageModel,reuse?1:0,reuse?'completed':'queued',key,id,reuse])
    }
    for (const {key,reuse} of clipSteps) {
      const stepId = randomUUID()
      await conn.execute(`INSERT INTO generation_jobs
        (id,user_id,pet_id,mode,model,duration_seconds,fps,total,completed,status,motion_key,batch_id,reused_asset_id,transparent_output)
        VALUES (?,?,?,'video',?,?,?,1,?,?,?,?,?,?)`,[stepId,owner,petId,config.videoModel,catClips[key].duration,VIDEO_FPS,reuse?1:0,reuse?'completed':'queued',key,id,reuse,transparent])
      if (!reuse) await conn.execute('INSERT INTO generation_actions (job_id,action) VALUES (?,?)',[stepId,key])
    }
    for (const {key,reuse} of localSteps) {
      await conn.execute(`INSERT INTO generation_jobs
        (id,user_id,pet_id,mode,model,duration_seconds,fps,total,completed,status,motion_key,batch_id,reused_asset_id,transparent_output)
        VALUES (?,?,?,'motion_render','local',?,?,1,?,?,?,?,?,?)`,[randomUUID(),owner,petId,catClips[key].duration,
        key===catJumpAction ? jumpFps : VIDEO_FPS,reuse?1:0,reuse?'completed':'queued',key,id,reuse,key===catJumpAction || transparent])
    }
  })
  return id
}

generationRouter.post('/motions/:petId/generate', async (req,res) => {
  const petId = uuid.parse(req.params.petId)
  const request = motionGenerate.parse(req.body)
  if (request.kind === 'batch') {
    const id = await enqueueMotionBatch(req.user.id,petId,request)
    res.status(202).json({job:(await rows(`SELECT ${jobSelect} FROM generation_jobs WHERE id=?`,[id]))[0]})
    return
  }
  if (request.kind === 'pose' && !config.imageKey) throw new HttpError(503,'生图服务尚未配置')
  if (request.kind === 'clip') {
    if (!config.videoKey || !supportsMotionVideo(config.videoModel)) throw new HttpError(503,'连续动作需要支持首尾帧的 Wan 3.0 视频服务')
    if (!await checkVideoTools()) throw new HttpError(503,'后端未安装 FFmpeg / FFprobe')
  }
  const id = randomUUID()
  await transaction(async conn => {
    await reserveGeneration(conn,req.user.id,1)
    await ownedPet(req.user.id,petId)
    if (request.kind === 'pose') {
      const source = await checkMotionPhoto(req.user.id,petId,request.referenceAssetId)
      await conn.execute(`INSERT INTO generation_jobs (id,user_id,pet_id,reference_asset_id,mode,model,total,motion_key)
        VALUES (?,?,?,?,'image',?,1,?)`,[id,req.user.id,petId,source.id,config.imageModel,request.key])
      return
    }
    const clip = catClips[request.key]
    const poses = await getMotionPoses(petId)
    const from = poses[clip.from], to = poses[clip.to]
    if (!from || !to) throw new HttpError(409,'请先准备该片段的起止姿势锚图')
    if (clip.from !== clip.to && from === to) throw new HttpError(400,'这段过渡的两个姿势需要分别选择锚图')
    await conn.execute(`INSERT INTO generation_jobs (id,user_id,pet_id,reference_asset_id,end_asset_id,mode,duration_seconds,fps,model,total,motion_key)
      VALUES (?,?,?,?,?,'video',?,?,?,1,?)`,[id,req.user.id,petId,from,to,clip.duration,VIDEO_FPS,config.videoModel,request.key])
    await conn.execute('INSERT INTO generation_actions (job_id,action) VALUES (?,?)',[id,request.key])
  })
  res.status(202).json({job:(await rows(`SELECT ${jobSelect} FROM generation_jobs WHERE id=?`,[id]))[0]})
})
