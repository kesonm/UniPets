import type { Pool, PoolConnection, RowDataPacket } from 'mysql2/promise'
import { availableCatClip, catClips, catDefaultAction, catFlows, catGenerationClips, catJumpAction, catPoses, catReversedClips, legacyPetGenerationClips, matchingCatClip, resolveCatAction, type CatClipId, type CatPoseId } from '../../shared/cat-motion.mjs'
import { assetSelect, type Asset } from './assets.js'
import { db } from './db.js'
import { supportsForegroundRemoval } from './foreground.js'

export const poseOrder = Object.keys(catPoses) as CatPoseId[]
export const clipOrder = [...catGenerationClips]
const reverseOrder = Object.keys(catReversedClips) as CatClipId[]
export const batchOrder = [...poseOrder,catDefaultAction,...Object.keys(catClips).filter(key=>key!==catDefaultAction && key!==catJumpAction && !Object.hasOwn(catReversedClips,key)),...reverseOrder,catJumpAction]
const otherPoseOrder = poseOrder.filter(key=>catPoses[key].view!=='front')
const existingClips = new Set(Object.values(catFlows).flatMap(flow=>flow.clips))
type DbExecutor = Pool | PoolConnection

async function isCat(owner: string, petId: string, executor: DbExecutor) {
  const [[pet]] = await executor.execute<RowDataPacket[]>('SELECT species FROM pets WHERE user_id=? AND id=?',[owner,petId])
  return pet?.species==='cat'
}

export async function getAppearanceReferences(owner: string, petId: string, executor: DbExecutor = db) {
  const [records] = await executor.execute<(RowDataPacket & Pick<Asset,'id'|'name'>)[]>(`SELECT id,name FROM assets
    WHERE user_id=? AND pet_id=? AND kind='photo' AND job_id IS NULL
    ORDER BY created_at DESC,id DESC LIMIT 5`,[owner,petId])
  return records
}

export async function getMotionPoses(petId: string, executor: Pool|PoolConnection = db) {
  const [records] = await executor.execute<RowDataPacket[]>('SELECT pose_key,asset_id FROM motion_poses WHERE pet_id=?',[petId])
  return Object.fromEntries(records.map(record => [record.pose_key,record.asset_id])) as Partial<Record<CatPoseId,string>>
}

export async function getMotionAssets(owner: string, petId: string, executor: Pool|PoolConnection = db) {
  const [records] = await executor.execute<(RowDataPacket & Asset)[]>(`SELECT ${assetSelect} FROM assets
    WHERE user_id=? AND pet_id=? AND motion_from_asset_id IS NOT NULL ORDER BY created_at DESC,id DESC`,[owner,petId])
  return records
}

export async function getMotionClipSteps(owner: string, petId: string) {
  const [records] = await db.execute<RowDataPacket[]>(`SELECT j.motion_key AS action,
    COALESCE(g.status,IF(j.mode='motion_render' AND j.status='running','processing',j.status)) AS status,
    g.provider_progress AS progress, g.poll_failures>0 AS retrying, COALESCE(g.error,j.error) AS error,
    COALESCE(j.reused_asset_id,s.id) AS assetId
    FROM generation_jobs j LEFT JOIN generation_actions g ON g.job_id=j.id AND g.action=j.motion_key
    LEFT JOIN assets s ON s.job_id=j.id AND s.action=j.motion_key
    WHERE j.mode IN ('video','motion_render') AND j.batch_id=(SELECT id FROM generation_jobs
      WHERE user_id=? AND pet_id=? AND mode='motion_batch' ORDER BY created_at DESC,id DESC LIMIT 1)`,[owner,petId])
  return records
}

export async function planMotionBatch(owner: string, petId: string, photoId: string, executor: DbExecutor = db, appearanceIds?: string[]) {
  const includeJump = await isCat(owner,petId,executor)
  const sourceCondition = appearanceIds ? 'b.appearance_reference_ids=CAST(? AS JSON)' : 'b.appearance_reference_ids IS NULL'
  const [records] = await executor.execute<RowDataPacket[]>(`SELECT a.id,j.motion_key
    FROM generation_jobs j JOIN assets a ON a.id=j.reused_asset_id OR a.job_id=j.id
    LEFT JOIN generation_jobs b ON b.id=j.batch_id
    LEFT JOIN motion_poses p ON p.pet_id=a.pet_id AND p.pose_key=j.motion_key AND p.asset_id=a.id
    WHERE a.user_id=? AND a.pet_id=? AND a.kind='photo' AND j.mode='image' AND j.reference_asset_id=?
      AND ${sourceCondition}
    ORDER BY (p.asset_id IS NOT NULL) DESC,a.created_at DESC,a.id DESC`,
    [owner,petId,photoId,...(appearanceIds ? [JSON.stringify(appearanceIds)] : [])])
  const transparent = supportsForegroundRemoval()
  const assets = await getMotionAssets(owner,petId,executor)
  const published = await getMotionPoses(petId,executor)
  const poses: Partial<Record<CatPoseId,string>> = {}
  if (appearanceIds && !records.length && resolveCatAction('stand_left',catDefaultAction,{poses:published,assets})) {
    const [[prior]] = await executor.execute<RowDataPacket[]>(`SELECT id FROM generation_jobs
      WHERE user_id=? AND pet_id=? AND mode='motion_batch' AND appearance_reference_ids IS NOT NULL LIMIT 1`,[owner,petId])
    // Extend a legacy library in place on its first photo-based batch.
    if (!prior) Object.assign(poses,published)
  }
  for (const record of records) poses[record.motion_key as CatPoseId] ??= record.id
  const poseSteps = (includeJump ? poseOrder : otherPoseOrder).map(key => ({key,reuse:poses[key] ?? null}))
  const manifest = {poses,assets}
  const clipSteps = (includeJump ? clipOrder : legacyPetGenerationClips).map(key => {
    const {from,to,loop} = catClips[key]
    const publishedTransition = transparent && !loop && existingClips.has(key) && poses[from]===published[from] && poses[to]===published[to]
    const reusableWalk = includeJump && transparent && (key==='walk_left'||key==='walk_right') && poses[from]===published[from]
    const asset = publishedTransition || reusableWalk ? availableCatClip(key,manifest,true) : matchingCatClip(key,manifest,transparent)
    return {key,reuse:asset?.id ?? null}
  })
  const localSteps = includeJump ? [...reverseOrder,catJumpAction].map(key=>({
    key,reuse:(key===catJumpAction ? matchingCatClip(key,manifest,true) : availableCatClip(key,manifest,transparent))?.id ?? null,
  })) : []
  const quote = {
    poses:poseSteps.filter(step=>!step.reuse).length, clips:clipSteps.filter(step=>!step.reuse).length,
    jump:localSteps.some(step=>step.key===catJumpAction && !step.reuse),local:localSteps.filter(step=>!step.reuse).length,
    total:poseSteps.length+clipSteps.length+localSteps.length,
  }
  return {poseSteps,clipSteps,localSteps,quote,transparent}
}

export async function planFromUploadedPhotos(owner: string, petId: string) {
  const references = await getAppearanceReferences(owner,petId)
  if (!references.length) {
    const cat = await isCat(owner,petId,db)
    return {references,poses:0,clips:0,jump:false,local:0,total:cat ? poseOrder.length+clipOrder.length+reverseOrder.length+1 : otherPoseOrder.length+legacyPetGenerationClips.length}
  }
  const {quote} = await planMotionBatch(owner,petId,references[0].id,db,references.map(photo=>photo.id))
  return {references,...quote}
}

export async function batchAnchorOutputs(batchId: string, executor: Pool|PoolConnection = db) {
  const [records] = await executor.execute<RowDataPacket[]>(`SELECT j.motion_key,COALESCE(j.reused_asset_id,a.id) AS asset_id
    FROM generation_jobs j LEFT JOIN assets a ON a.job_id=j.id AND a.kind='photo'
    WHERE j.batch_id=? AND j.mode='image' AND j.status='completed'`,[batchId])
  return Object.fromEntries(records.filter(row=>row.asset_id).map(row=>[row.motion_key,row.asset_id])) as Partial<Record<CatPoseId,string>>
}

export async function publishBatchPoses(conn: PoolConnection, batchId: string, owner: string, petId: string, complete: boolean) {
  const poses = await batchAnchorOutputs(batchId,conn)
  const [steps] = await conn.execute<(RowDataPacket & {motion_key:CatPoseId})[]>(`SELECT motion_key FROM generation_jobs
    WHERE batch_id=? AND mode='image'`,[batchId])
  if (!steps.length || steps.some(step=>!poses[step.motion_key])) return false
  if (!complete) {
    const published = await getMotionPoses(petId,conn)
    const replaces = steps.some(({motion_key:key})=>published[key] && published[key]!==poses[key])
    if (replaces && resolveCatAction('stand_left',catDefaultAction,{poses:published,assets:await getMotionAssets(owner,petId,conn)})) return false
  }
  for (const {motion_key:key} of steps) {
    const assetId = poses[key]!
    await conn.execute('INSERT INTO motion_poses (pet_id,pose_key,asset_id) VALUES (?,?,?) ON DUPLICATE KEY UPDATE asset_id=?',[petId,key,assetId,assetId])
  }
  return true
}
