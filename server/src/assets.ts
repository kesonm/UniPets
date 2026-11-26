import { randomUUID } from 'node:crypto'
import { mkdir, writeFile, unlink, copyFile, stat } from 'node:fs/promises'
import { constants } from 'node:fs'
import path from 'node:path'
import sharp from 'sharp'
import type { CatClipId } from '../../shared/cat-motion.mjs'
import { rows, transaction } from './db.js'
import { config } from './config.js'
import { HttpError } from './errors.js'
import type { VideoSprite } from './video.js'
const STORAGE_QUOTA = 512 * 1024 * 1024
const SPRITE_LIMIT = 24 * 1024 * 1024
export const assetSelect = `id, pet_id AS petId, name, kind, action, mime_type AS mimeType, byte_size AS byteSize, width, height, frames,
  COALESCE(sprite_columns,frames) AS columns, COALESCE(sprite_rows,1) AS \`rows\`, COALESCE(fps,1000/240) AS fps,
  duration_seconds AS duration, (source_video_key IS NOT NULL) AS hasVideo, background_removed AS backgroundRemoved,
  sleep_loop AS sleepLoop, LEFT(SHA2(file_key,256),16) AS imageVersion, job_id AS jobId, created_at AS createdAt,
  motion_from_asset_id AS motionFromAssetId, motion_to_asset_id AS motionToAssetId, motion_joinable AS motionJoinable`
export type Action = 'idle' | 'happy' | 'walk' | 'sleep' | CatClipId
export interface Asset { id: string; petId: string; name: string; kind: 'photo' | 'sprite'; action: Action | null; mimeType: string; byteSize: number; width: number; height: number; frames: number; columns: number; rows: number; fps: number; duration: number|null; hasVideo: boolean; backgroundRemoved: 0 | 1; sleepLoop: 0 | 1; imageVersion: string; jobId: string | null; createdAt: string; motionFromAssetId: string | null; motionToAssetId: string | null; motionJoinable: 0 | 1 | null }
export async function ownedPet(userId: string, petId: string) {
  const [pet] = await rows<{ id: string; name: string }>('SELECT id,name FROM pets WHERE id=? AND user_id=?', [petId, userId])
  if (!pet) throw new HttpError(404, '宠物不存在'); return pet
}
export async function ownedAsset(userId: string, assetId: string) {
  const [asset] = await rows<Asset & { fileKey: string; videoKey: string|null }>(`SELECT ${assetSelect}, file_key AS fileKey, source_video_key AS videoKey FROM assets WHERE id=? AND user_id=?`, [assetId, userId])
  if (!asset) throw new HttpError(404, '素材不存在'); return asset
}
export function storagePath(key: string) {
  if (!/^[a-f0-9-]+\.(png|mp4)$/.test(key)) throw new HttpError(400, '素材路径无效')
  return path.join(config.storage, key)
}
export async function photoThumbnail(key: string|undefined, size: number) {
  if (!key) throw new HttpError(404, '暂无图片')
  try {
    return await sharp(storagePath(key), {limitInputPixels:25_000_000}).rotate()
      .resize({width:size,height:size,fit:'inside',withoutEnlargement:true}).webp({quality:83}).toBuffer()
  } catch {
    throw new HttpError(404, '图片不存在')
  }
}
export async function removeFile(key: string, videoKey?: string|null) {
  await Promise.all([key,videoKey].filter((item): item is string=>!!item).map(item=>unlink(storagePath(item)).catch(() => {})))
}
interface ImageInput {
  userId: string; petId: string; name: string; bytes: Buffer; action?: Action; jobId?: string;
  motion?: { fromAssetId: string; toAssetId: string };
}
async function persist(input: ImageInput, image: Omit<VideoSprite,'duration'|'backgroundRemoved'> & {duration:number|null;backgroundRemoved?:boolean}, videoPath?: string) {
  const {userId,petId,name,action,jobId}=input
  const id=randomUUID(),fileKey=`${id}.png`,videoKey=videoPath?`${id}.mp4`:null
  const videoBytes=videoPath?(await stat(videoPath)).size:0
  if(videoBytes>64*1024*1024 || image.bytes.length>SPRITE_LIMIT)throw new HttpError(413,'动作素材过大')
  const totalBytes=image.bytes.length+videoBytes
  await mkdir(config.storage,{recursive:true})
  await writeFile(storagePath(fileKey),image.bytes,{flag:'wx'})
  try {
    if(videoPath&&videoKey)await copyFile(videoPath,storagePath(videoKey),constants.COPYFILE_EXCL)
    await transaction(async conn=>{
      await conn.execute('SELECT id FROM users WHERE id=? FOR UPDATE',[userId])
      const [counts]=await conn.execute('SELECT COUNT(*) AS count, COALESCE(SUM(byte_size),0) AS used FROM assets WHERE user_id=?',[userId])
      const count=(counts as {count:number;used:number}[])[0]
      if(count.count>=500 || Number(count.used)+totalBytes>STORAGE_QUOTA)throw new HttpError(413,'素材空间已满（最多 500 份 / 512MB），请先清理素材')
      await conn.execute(`INSERT INTO assets
        (id,user_id,pet_id,name,kind,action,file_key,mime_type,byte_size,width,height,frames,job_id,sprite_columns,sprite_rows,fps,duration_seconds,source_video_key,background_removed,sleep_loop,motion_from_asset_id,motion_to_asset_id,motion_joinable)
        VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,[
        id,userId,petId,name,action?'sprite':'photo',action||null,fileKey,'image/png',totalBytes,image.width,image.height,image.frames,
        jobId||null,image.columns,image.rows,image.fps,image.duration,videoKey,Boolean(image.backgroundRemoved),Boolean(image.sleepLoop),
        input.motion?.fromAssetId ?? null,input.motion?.toAssetId ?? null,input.motion ? Boolean(image.motionJoinable) : null,
      ])
    })
  } catch(error) { await removeFile(fileKey,videoKey);throw error }
  return (await rows<Asset>(`SELECT ${assetSelect} FROM assets WHERE id=?`,[id]))[0]
}
export async function saveImage(input: ImageInput) {
  const {bytes,action}=input
  if(bytes.length>(action?24:8)*1024*1024)throw new HttpError(413,'图片超过大小限制')
  let image: {bytes:Buffer;width:number;height:number}
  try {
    const source=sharp(bytes,{limitInputPixels:25_000_000}),metadata=await source.metadata()
    if(!['jpeg','png','webp'].includes(metadata.format||'')||(metadata.pages||1)>1)throw new Error('format')
    const result=await source.rotate().resize({width:2048,height:2048,fit:'inside',withoutEnlargement:true}).png().toBuffer({resolveWithObject:true})
    image={bytes:result.data,width:result.info.width,height:result.info.height}
    if(action&&image.width%4!==0)throw new Error('frames')
  }catch{throw new HttpError(400,'图片无法读取，请使用有效的 JPG、PNG 或 WebP；动作图需为等宽四帧')}
  return persist(input,{...image,frames:action?4:1,columns:action?4:1,rows:1,fps:1000/240,duration:null})
}
export type DeskSpriteAction = 'desk_breathe' | 'desk_lick_paw'
export async function saveDeskSprite(input: {
  userId:string; petId:string; name:string; action:DeskSpriteAction
  bytes:Buffer; width:number; height:number; frames:number; columns:number; rows:number; fps:number
}) {
  return persist(
    { userId:input.userId, petId:input.petId, name:input.name, bytes:input.bytes, action:input.action as Action },
    {
      bytes:input.bytes, width:input.width, height:input.height, frames:input.frames,
      columns:input.columns, rows:input.rows, fps:input.fps, duration:null, backgroundRemoved:true,
    },
  )
}
export async function discardAsset(userId:string, assetId:string) {
  const asset = await ownedAsset(userId, assetId)
  await transaction(async conn=>{
    await conn.execute('DELETE FROM assets WHERE id=? AND user_id=?',[assetId,userId])
  })
  await removeFile(asset.fileKey,asset.videoKey)
}
export async function saveSprite(input: ImageInput & {action:Action;jobId:string}, sheet: VideoSprite, videoPath?:string) {
  const [existing]=await rows<Asset>(`SELECT ${assetSelect} FROM assets WHERE job_id=? AND action=? AND user_id=?`,[input.jobId,input.action,input.userId])
  if(existing)return existing
  return persist(input,sheet,videoPath)
}
export const saveVideoSprite = saveSprite

export async function saveTransparentReplacement(userId: string, assetId: string, sheet: VideoSprite, expectedFileKey?: string) {
  if (!sheet.backgroundRemoved || sheet.bytes.length>SPRITE_LIMIT) throw new Error('替换素材必须是有效的透明帧图')
  const nextKey = `${randomUUID()}.png`
  // The existing URL and desktop assignment stay valid. Switch the DB pointer only after writing the new PNG.
  let written = false
  let oldKey: string | undefined
  try {
    oldKey = await transaction(async conn=>{
      await conn.execute('SELECT id FROM users WHERE id=? FOR UPDATE',[userId])
      const [records] = await conn.execute(`SELECT action,file_key,source_video_key,byte_size,frames,sprite_columns,sprite_rows,width,height,fps,background_removed,sleep_loop,motion_joinable,motion_from_asset_id,motion_to_asset_id
        FROM assets WHERE id=? AND user_id=? AND kind='sprite' FOR UPDATE`,[assetId,userId])
      const [asset] = records as {action:Action;file_key:string;source_video_key:string|null;byte_size:number;frames:number;sprite_columns:number;sprite_rows:number;width:number;height:number;fps:number;background_removed:number;sleep_loop:number;motion_joinable:number|null;motion_from_asset_id:string|null;motion_to_asset_id:string|null}[]
      const fixesBoundary = Boolean(expectedFileKey && asset?.motion_from_asset_id && asset.motion_to_asset_id && !asset.motion_joinable && sheet.motionJoinable)
      if (!asset || (!asset.source_video_key && !fixesBoundary)) throw new HttpError(404,'找不到原视频')
      if (sheet.sleepLoop && asset.action !== 'sleep') throw new Error('睡觉循环只能替换睡觉动作')
      if (!fixesBoundary && asset.background_removed && (!sheet.sleepLoop || asset.sleep_loop)) return
      if (expectedFileKey && asset.file_key !== expectedFileKey) throw new Error('素材已更新，请读取新版后再处理')
      if (asset.sleep_loop && !sheet.sleepLoop) throw new Error('替换素材需保留睡觉循环')
      if (asset.frames!==sheet.frames || asset.sprite_columns!==sheet.columns || asset.sprite_rows!==sheet.rows || asset.fps!==sheet.fps || asset.width!==sheet.width || asset.height!==sheet.height) {
        throw new Error('透明帧图与已有动作的规格不一致')
      }
      const nextBytes = sheet.bytes.length + (asset.source_video_key ? (await stat(storagePath(asset.source_video_key))).size : 0)
      const [totals] = await conn.execute('SELECT COALESCE(SUM(byte_size),0) AS used FROM assets WHERE user_id=?',[userId])
      if (Number((totals as {used:number}[])[0].used)-asset.byte_size+nextBytes>STORAGE_QUOTA) throw new HttpError(413,'素材空间已满')
      await writeFile(storagePath(nextKey),sheet.bytes,{flag:'wx'})
      written = true
      await conn.execute('UPDATE assets SET file_key=?,byte_size=?,background_removed=TRUE,sleep_loop=?,motion_joinable=COALESCE(?,motion_joinable) WHERE id=? AND user_id=?',
        [nextKey,nextBytes,Boolean(sheet.sleepLoop),sheet.motionJoinable ?? null,assetId,userId])
      return asset.file_key
    })
  } catch(error) { if(written)await removeFile(nextKey);throw error }
  if (oldKey) await removeFile(oldKey)
  return Boolean(oldKey)
}
