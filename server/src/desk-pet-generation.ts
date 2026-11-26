import { execFile } from 'node:child_process'
import { randomUUID } from 'node:crypto'
import { mkdtemp, readFile, rm, stat, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { promisify } from 'node:util'
import type { ResultSetHeader, RowDataPacket } from 'mysql2/promise'
import sharp from 'sharp'
import { discardAsset, ownedAsset, ownedPet, removeFile, saveDeskSprite, storagePath } from './assets.js'
import { customDeskPetId, defaultDeskPetId } from '../../shared/desk-pets.mjs'
import { config, projectRoot } from './config.js'
import { db, rows, transaction } from './db.js'
import { HttpError } from './errors.js'

const execFileAsync = promisify(execFile)
const frameCount = 6
const columns = 3
const rowCount = 2
const fps = 4

export type DeskPetGenerationStatus = 'queued' | 'running' | 'completed' | 'failed'
export type DeskPetGenerationStage = 'queued' | 'anchor' | 'actions' | 'compose' | 'completed' | 'failed'
export type DeskPetSpecies = 'cat' | 'dog'

interface GenerationRow {
  id: string
  petId: string
  userId: string
  referenceAssetId: string
  referenceVersion: string
  status: DeskPetGenerationStatus
  stage: DeskPetGenerationStage
  error: string | null
  breatheAssetId: string | null
  lickAssetId: string | null
  species: string
  createdAt: Date
  updatedAt: Date
  completedAt: Date | null
}

export interface GeneratedDeskPetAction {
  key: 'breathe' | 'lick_paw'
  label: string
  shortLabel: string
  assetId: string
  frames: number
  columns: number
  rows: number
  fps: number
  repeats: number
}

export interface DeskPetGeneration {
  id: string
  petId: string
  status: DeskPetGenerationStatus
  stage: DeskPetGenerationStage
  error: string | null
  createdAt: string
  completedAt: string | null
  actions?: GeneratedDeskPetAction[]
}

const generationSelect = `g.id,g.pet_id AS petId,g.user_id AS userId,g.reference_asset_id AS referenceAssetId,
  g.reference_version AS referenceVersion,g.status,g.stage,g.error,
  g.breathe_asset_id AS breatheAssetId,g.lick_asset_id AS lickAssetId,p.species,
  g.created_at AS createdAt,g.updated_at AS updatedAt,g.completed_at AS completedAt`
const generationFrom = 'FROM desk_pet_generations g JOIN pets p ON p.id=g.pet_id'

function actionsFor(row: GenerationRow): GeneratedDeskPetAction[] {
  if (!row.breatheAssetId || !row.lickAssetId) return []
  return [
    { key: 'breathe', label: '正面坐着呼吸', shortLabel: '呼吸', assetId: row.breatheAssetId,
      frames: frameCount, columns, rows: rowCount, fps, repeats: 2 },
    { key: 'lick_paw', label: '坐着舔前爪', shortLabel: '舔前爪', assetId: row.lickAssetId,
      frames: frameCount, columns, rows: rowCount, fps, repeats: 1 },
  ]
}

function serialize(row: GenerationRow): DeskPetGeneration {
  const generation: DeskPetGeneration = {
    id: row.id,
    petId: row.petId,
    status: row.status,
    stage: row.stage,
    error: row.error,
    createdAt: new Date(row.createdAt).toISOString(),
    completedAt: row.completedAt ? new Date(row.completedAt).toISOString() : null,
  }
  if (row.status === 'completed') generation.actions = actionsFor(row)
  return generation
}

export function deskPetGenerationAvailable() {
  return config.deskPetGeneration && Boolean(config.imageKey)
}

export function deskPetCapabilities() {
  return {
    generate: deskPetGenerationAvailable(),
    dailyLimit: config.deskPetDailyLimit,
  }
}

async function generationRow(userId: string, id: string) {
  const [row] = await rows<GenerationRow>(`SELECT ${generationSelect} ${generationFrom}
    WHERE g.id=? AND g.user_id=?`, [id, userId])
  return row
}

export async function getDeskPetGeneration(userId: string, id: string): Promise<DeskPetGeneration> {
  const row = await generationRow(userId, id)
  if (!row) throw new HttpError(404, '桌宠生成记录不存在')
  return serialize(row)
}

export async function getPetDeskSpec(userId: string, petId: string) {
  const pet = await ownedPet(userId, petId)
  const [row] = await rows<GenerationRow>(`SELECT ${generationSelect} ${generationFrom}
    WHERE g.user_id=? AND g.pet_id=? AND g.status='completed'
    ORDER BY g.completed_at DESC,g.created_at DESC LIMIT 1`, [userId, petId])
  if (!row) throw new HttpError(404, '这只宠物还没有生成桌宠')
  return {
    petId,
    name: pet.name,
    species: row.species === 'dog' ? 'dog' : 'cat',
    generationId: row.id,
    actions: actionsFor(row),
  }
}

export async function deleteDeskPetGeneration(userId: string, id: string) {
  const files = await transaction(async conn => {
    const [targets] = await conn.execute<(RowDataPacket & { petId:string })[]>(
      'SELECT pet_id AS petId FROM desk_pet_generations WHERE id=? AND user_id=? FOR UPDATE', [id, userId])
    const target = targets[0]
    if (!target) throw new HttpError(404, '桌宠生成记录不存在')
    const [records] = await conn.execute<(RowDataPacket & {
      status:string; breatheAssetId:string|null; lickAssetId:string|null
    })[]>(`SELECT status,breathe_asset_id AS breatheAssetId,lick_asset_id AS lickAssetId
      FROM desk_pet_generations WHERE user_id=? AND pet_id=? FOR UPDATE`, [userId, target.petId])
    if (records.some(record => record.status === 'queued' || record.status === 'running')) {
      throw new HttpError(409, '桌宠正在生成，暂时不能删除')
    }
    const [profiles] = await conn.execute<(RowDataPacket & { petId:string })[]>(
      'SELECT miniapp_pet_id AS petId FROM desktop_profiles WHERE user_id=? FOR UPDATE', [userId])
    if (profiles[0]?.petId === customDeskPetId(target.petId)) {
      await conn.execute('UPDATE desktop_profiles SET miniapp_pet_id=? WHERE user_id=?', [defaultDeskPetId, userId])
    }
    const assets: { fileKey:string; videoKey:string|null }[] = []
    const assetIds = new Set<string>()
    for (const record of records) {
      if (record.breatheAssetId) assetIds.add(record.breatheAssetId)
      if (record.lickAssetId) assetIds.add(record.lickAssetId)
    }
    for (const assetId of assetIds) {
      const [assetRecords] = await conn.execute<(RowDataPacket & { fileKey:string; videoKey:string|null })[]>(
        'SELECT file_key AS fileKey,source_video_key AS videoKey FROM assets WHERE id=? AND user_id=? FOR UPDATE',
        [assetId, userId])
      const asset = assetRecords[0]
      if (!asset) continue
      await conn.execute('DELETE FROM assets WHERE id=? AND user_id=?', [assetId, userId])
      assets.push(asset)
    }
    await conn.execute('DELETE FROM desk_pet_generations WHERE user_id=? AND pet_id=?', [userId, target.petId])
    return assets
  })
  await Promise.all(files.map(file => removeFile(file.fileKey, file.videoKey)))
  return { ok: true }
}

export async function listDeskPetProfiles(userId: string) {
  const [pets, generations, used] = await Promise.all([
    rows<{ id:string; name:string; species:string; breed:string; avatarAssetId:string|null; createdAt:Date }>(
      `SELECT id,name,species,breed,avatar_asset_id AS avatarAssetId,created_at AS createdAt
       FROM pets WHERE user_id=? ORDER BY created_at DESC,id DESC`, [userId]),
    rows<{ id:string; petId:string; status:DeskPetGenerationStatus; stage:DeskPetGenerationStage; error:string|null; createdAt:Date }>(
      `SELECT id,pet_id AS petId,status,stage,error,created_at AS createdAt
       FROM desk_pet_generations WHERE user_id=? ORDER BY created_at DESC LIMIT 100`, [userId]),
    rows<{ count:number }>(
      'SELECT COUNT(*) AS count FROM desk_pet_generations WHERE user_id=? AND created_at>=UTC_TIMESTAMP(3)-INTERVAL 1 DAY',
      [userId]),
  ])
  const latest = new Map<string, (typeof generations)[number]>()
  for (const item of generations) if (!latest.has(item.petId)) latest.set(item.petId, item)
  return {
    pets: pets.map(pet => {
      const current = latest.get(pet.id)
      return {
        ...pet,
        deskPet: current ? {
          id: current.id,
          status: current.status,
          stage: current.stage,
          error: current.error,
        } : null,
      }
    }),
    capabilities: {
      ...deskPetCapabilities(),
      used: Number(used[0]?.count ?? 0),
    },
  }
}

function fail(userId: string, id: string, message: string) {
  return db.execute(`UPDATE desk_pet_generations SET status='failed',stage='failed',error=?,updated_at=UTC_TIMESTAMP(3)
    WHERE id=? AND user_id=?`, [message.slice(0,500), id, userId])
}

function setStage(id: string, stage: DeskPetGenerationStage) {
  return db.execute('UPDATE desk_pet_generations SET stage=?,updated_at=UTC_TIMESTAMP(3) WHERE id=?', [stage, id])
}

export async function createDeskPetGeneration(userId: string, petId: string, assetId?: string | null) {
  if (!config.deskPetGeneration) throw new HttpError(503, '桌宠生成暂未开放')
  if (!config.imageKey) throw new HttpError(503, '桌宠生图服务尚未配置')
  const [pet] = await rows<{ id:string; species:string; avatarAssetId:string|null }>(
    'SELECT id,species,avatar_asset_id AS avatarAssetId FROM pets WHERE id=? AND user_id=?', [petId, userId])
  if (!pet) throw new HttpError(404, '宠物不存在')
  if (pet.species !== 'cat' && pet.species !== 'dog') throw new HttpError(422, '目前仅支持猫和狗生成桌宠')
  const referenceId = assetId || pet.avatarAssetId
  if (!referenceId) throw new HttpError(409, '请先在宠物手帐上传一张正面封面照')
  const reference = await ownedAsset(userId, referenceId)
  if (reference.kind !== 'photo' || reference.petId !== petId) throw new HttpError(400, '请选择这只宠物的照片')

  const [existing] = await rows<GenerationRow>(`SELECT ${generationSelect} ${generationFrom}
    WHERE g.user_id=? AND g.pet_id=? AND g.reference_asset_id=? AND g.reference_version=? AND g.status='completed'
    ORDER BY g.completed_at DESC LIMIT 1`, [userId, petId, referenceId, reference.imageVersion])
  if (existing) return serialize(existing)

  const [active] = await rows<{ id:string; status:string }>(
    `SELECT id,status FROM desk_pet_generations WHERE user_id=? AND status IN ('queued','running')
     ORDER BY created_at DESC LIMIT 1`, [userId])
  if (active) throw new HttpError(409, active.status === 'running' ? '桌宠正在生成，请稍候' : '桌宠已排队，请稍候')

  const [used] = await rows<{ count:number }>(
    'SELECT COUNT(*) AS count FROM desk_pet_generations WHERE user_id=? AND created_at>=UTC_TIMESTAMP(3)-INTERVAL 1 DAY',
    [userId])
  if (Number(used.count) >= config.deskPetDailyLimit) {
    throw new HttpError(429, `24 小时内最多生成 ${config.deskPetDailyLimit} 次，请稍后再试`)
  }

  const id = randomUUID()
  await db.execute(`INSERT INTO desk_pet_generations
    (id,user_id,pet_id,reference_asset_id,reference_version,status,stage,created_at,updated_at)
    VALUES (?,?,?,?,?,'queued','queued',UTC_TIMESTAMP(3),UTC_TIMESTAMP(3))`,
    [id, userId, petId, referenceId, reference.imageVersion])
  void processQueue()
  return getDeskPetGeneration(userId, id)
}

function buildPrompts(species: DeskPetSpecies) {
  const animal = species === 'dog' ? 'dog' : 'cat'
  const animalZh = species === 'dog' ? '狗狗' : '猫咪'
  const secondActionEn = species === 'dog'
    ? 'gently raising one front paw to wave/give-paw and lowering it back to the floor'
    : 'gently lifting its viewer-left front paw up to its mouth to lick it twice with a tiny pink tongue, then lowering it cleanly back onto the floor'
  const anchor = [
    `Create a single 1:1 square crisp 2D realistic studio photograph of this EXACT ${animal} (${animalZh}) from the reference photo, faithfully preserving its exact breed, face shape, eye color, fur markings, ear shape, and coat texture.`,
    `Ignore the input photo's original pose, background, collar, leash, clothes, furniture, or props.`,
    `Pose: sitting neatly upright facing directly straight at the camera (strict eye-level front view), buttocks resting on the ground, both front paws placed neatly together side-by-side right in front of its chest, tail curled naturally beside the body, looking straight ahead with bright clear eyes, mouth gently closed in a relaxed sweet neutral expression.`,
    `Composition: full body completely visible from ear tips to paws and tail with generous clean empty margin on all four sides (~15% padding around the whole silhouette) so nothing is clipped.`,
    `Background: completely flat uniform pure solid white (#FFFFFF) studio background, soft even studio lighting, NO floor seam line, NO heavy shadow, NO props, NO text, NO borders, NO collage.`,
  ].join(' ')
  const breathe = [
    `Using the reference image of this EXACT sitting ${animal}, generate a single 3:2 landscape sprite sheet arranged as a strict 3 columns × 2 rows grid (6 equal-sized frames) showing a gentle, seamless "front-sitting breathing" idle loop.`,
    `CRITICAL CONSISTENCY & LAYOUT RULES:`,
    `- Exact same ${animal} identity across all 6 frames: identical face, markings, fur length, ear shape, paws, curled tail, and crisp realistic studio 2D photographic style.`,
    `- Strict 3×2 grid: 3 evenly spaced columns across, 2 evenly spaced rows down. Every frame sits on the exact same horizontal baseline inside its cell at the exact same scale and straight-on front eye-level camera angle.`,
    `- Completely flat uniform pure white (#FFFFFF) background everywhere. NO grid lines, NO borders, NO numbers, NO text, NO props, NO floor shadows. Leave generous white space between every figure so adjacent frames never touch.`,
    `6-frame sequence (left-to-right, top row then bottom row):`,
    `Frame 1 (top-left): exact neutral sitting upright pose matching reference, eyes fully open looking straight ahead, both front paws neatly together.`,
    `Frame 2 (top-center): gentle inhale — chest expands slightly fuller, shoulders lift very slightly, ears perk softly, eyes open.`,
    `Frame 3 (top-right): peak calm inhale — chest gently full, eyelids softly half-closed in a relaxed slow blink.`,
    `Frame 4 (bottom-left): cozy peaceful slow blink — eyes gently closed, calm upright sitting posture.`,
    `Frame 5 (bottom-center): gentle exhale — eyes opening halfway back up, chest softly relaxing downward.`,
    `Frame 6 (bottom-right): exhale complete — eyes fully open looking straight forward, returned smoothly to the exact neutral pose of Frame 1 for a seamless loop.`,
  ].join(' ')
  const lickPaw = [
    `Using the reference image of this EXACT sitting ${animal}, generate a single 3:2 landscape sprite sheet arranged as a strict 3 columns × 2 rows grid (6 equal-sized frames) showing a cute, seamless front-sitting action cycle: ${secondActionEn}.`,
    `CRITICAL CONSISTENCY & LAYOUT RULES:`,
    `- Exact same ${animal} identity across all 6 frames: identical face, markings, fur texture, ear shape, paws, curled tail, and crisp realistic studio 2D photographic style.`,
    `- Strict 3×2 grid: 3 evenly spaced columns across, 2 evenly spaced rows down. Every frame sits on the exact same horizontal baseline inside its cell at the exact same scale and straight-on front eye-level camera angle. The sitting lower body, hind legs, and curled tail remain planted in place throughout.`,
    `- Completely flat uniform pure white (#FFFFFF) background everywhere. NO grid lines, NO borders, NO numbers, NO text, NO props, NO floor shadows. Leave generous white space between every figure so adjacent frames never touch.`,
    `6-frame sequence (left-to-right, top row then bottom row):`,
    species === 'dog'
      ? `Frame 1 (top-left): exact neutral front-sitting pose matching reference, both front paws on the ground. Frame 2 (top-center): starting to lift viewer-left front paw off the floor. Frame 3 (top-right): front paw raised happily at chest level with a gentle smile. Frame 4 (bottom-left): holding paw raised with a slight cute head tilt. Frame 5 (bottom-center): gently lowering front paw halfway back toward the ground. Frame 6 (bottom-right): both front paws neatly back on the floor, matching Frame 1 seamlessly.`
      : `Frame 1 (top-left): exact neutral front-sitting pose matching reference, both front paws neatly on the ground looking straight ahead. Frame 2 (top-center): lifting viewer-left front paw halfway up toward its chest while glancing slightly down toward the paw; the other front paw stays planted firmly on the ground. Frame 3 (top-right): lifted front paw held right beside its mouth, head slightly lowered, small pink tongue clearly visible licking the paw, eyes gently half-closed. Frame 4 (bottom-left): second paw lick — keeping the same front paw raised near its mouth, head angled slightly as its small pink tongue licks the side of the paw, eyes softly squinting happily. Frame 5 (bottom-center): tongue tucked back in, lowering the front paw halfway back down toward the ground while raising head and opening eyes. Frame 6 (bottom-right): both front paws neatly planted side-by-side on the floor, head upright looking straight forward, matching Frame 1 seamlessly.`,
  ].join(' ')
  return { anchor, breathe, lickPaw }
}

async function imageBytes(response: Response) {
  const text = await response.text()
  if (!response.ok) throw new Error(`生图服务返回 ${response.status}`)
  let payload: { data?: Array<{ b64_json?: string; url?: string }> }
  try {
    payload = JSON.parse(text)
  } catch {
    throw new Error('生图服务返回了无法解析的内容')
  }
  const item = payload.data?.[0]
  if (item?.b64_json) return Buffer.from(item.b64_json, 'base64')
  if (item?.url) {
    const download = await fetch(item.url, { signal: AbortSignal.timeout(120_000), redirect: 'error' })
    if (!download.ok) throw new Error(`生图结果下载失败（${download.status}）`)
    return Buffer.from(await download.arrayBuffer())
  }
  throw new Error('生图服务没有返回图片')
}

async function callImageEdit(input: {
  model: string
  size: string
  quality: string
  images: Buffer[]
  prompt: string
  label: string
}) {
  if (!config.imageKey) throw new HttpError(503, '桌宠生图服务尚未配置')
  const form = new FormData()
  form.set('model', input.model)
  form.set('size', input.size)
  if (input.quality) form.set('quality', input.quality)
  form.set('prompt', input.prompt)
  for (const [index, bytes] of input.images.entries()) {
    form.append('image', new Blob([new Uint8Array(bytes)], { type: 'image/png' }), `reference-${index + 1}.png`)
  }
  let response: Response
  try {
    response = await fetch(config.imageUrl, {
      method: 'POST',
      headers: { Authorization: `Bearer ${config.imageKey}` },
      body: form,
      signal: AbortSignal.timeout(270_000),
      redirect: 'error',
    })
  } catch {
    throw new Error(`[${input.label}] 连接生图服务失败`)
  }
  const bytes = await imageBytes(response)
  const meta = await sharp(bytes, { limitInputPixels: 25_000_000 }).metadata()
  if (!meta.width || !meta.height) throw new Error(`[${input.label}] 生图结果无法读取`)
  return bytes
}

function normalizeReference(bytes: Buffer) {
  return sharp(bytes, { limitInputPixels: 25_000_000 })
    .rotate()
    .flatten({ background: '#ffffff' })
    .resize({ width: 1024, height: 1024, fit: 'inside', withoutEnlargement: true })
    .png()
    .toBuffer()
}

async function optimizeSheet(file: string) {
  const bytes = await sharp(file, { limitInputPixels: 25_000_000 })
    .png({ palette: true, quality: 92, compressionLevel: 9, effort: 10 })
    .toBuffer()
  const meta = await sharp(bytes).metadata()
  if (!meta.width || !meta.height) throw new Error('桌宠动作图无法读取')
  return { bytes, width: meta.width, height: meta.height }
}

async function runGeneration(row: GenerationRow) {
  const created: string[] = []
  const startedAt = Date.now()
  try {
    const reference = await ownedAsset(row.userId, row.referenceAssetId)
    const source = await readFile(storagePath(reference.fileKey))
    const anchorInput = await normalizeReference(source)
    const prompts = buildPrompts(row.species === 'dog' ? 'dog' : 'cat')
    const model = config.deskPetImageModel

    await setStage(row.id, 'anchor')
    const anchor = await callImageEdit({
      model,
      size: '1024x1024',
      quality: config.deskPetImageQuality,
      images: [anchorInput],
      prompt: prompts.anchor,
      label: 'anchor',
    })
    const anchorPng = await sharp(anchor, { limitInputPixels: 25_000_000 })
      .resize({ width: 1024, height: 1024, fit: 'inside', withoutEnlargement: true })
      .png()
      .toBuffer()

    await setStage(row.id, 'actions')
    const [breatheRaw, lickRaw] = await Promise.all([
      callImageEdit({ model, size: '1536x1024', quality: config.deskPetImageQuality, images: [anchorPng], prompt: prompts.breathe, label: 'breathe' }),
      callImageEdit({ model, size: '1536x1024', quality: config.deskPetImageQuality, images: [anchorPng], prompt: prompts.lickPaw, label: 'lick-paw' }),
    ])

    await setStage(row.id, 'compose')
    const work = await mkdtemp(path.join(tmpdir(), 'petcloud-desk-pet-'))
    try {
      const breathePath = path.join(work, 'raw-breathe.png')
      const lickPath = path.join(work, 'raw-lick-paw.png')
      await Promise.all([writeFile(breathePath, breatheRaw), writeFile(lickPath, lickRaw)])
      const script = config.deskPetComposeScript || path.join(projectRoot, 'scripts', 'desk-pet-ai', 'compose-sprites.py')
      try {
        await stat(script)
      } catch {
        throw new Error('桌宠合成脚本未部署')
      }
      await execFileAsync(config.deskPetPython || config.nosePrintPython, [
        '-B', script,
        '--breathe', breathePath,
        '--lick', lickPath,
        '--out', work,
        '--cell', String(config.deskPetCellSize),
      ], { timeout: 120_000, maxBuffer: 2 * 1024 * 1024 })

      const [breathe, lick] = await Promise.all([
        optimizeSheet(path.join(work, 'composed-breathe.png')),
        optimizeSheet(path.join(work, 'composed-lick-paw.png')),
      ])
      const breatheAsset = await saveDeskSprite({
        userId: row.userId, petId: row.petId, name: '桌宠·正面坐着呼吸', action: 'desk_breathe',
        bytes: breathe.bytes, width: breathe.width, height: breathe.height,
        frames: frameCount, columns, rows: rowCount, fps,
      })
      created.push(breatheAsset.id)
      const lickAsset = await saveDeskSprite({
        userId: row.userId, petId: row.petId, name: '桌宠·坐着舔前爪', action: 'desk_lick_paw',
        bytes: lick.bytes, width: lick.width, height: lick.height,
        frames: frameCount, columns, rows: rowCount, fps,
      })
      created.push(lickAsset.id)
      await db.execute(`UPDATE desk_pet_generations SET status='completed',stage='completed',error=NULL,
        breathe_asset_id=?,lick_asset_id=?,completed_at=UTC_TIMESTAMP(3),updated_at=UTC_TIMESTAMP(3)
        WHERE id=? AND user_id=?`, [breatheAsset.id, lickAsset.id, row.id, row.userId])
      console.log(`[desk-pet] completed ${row.id} in ${Math.round((Date.now() - startedAt) / 1000)}s`)
    } finally {
      await rm(work, { recursive: true, force: true }).catch(() => undefined)
    }
  } catch (error) {
    for (const assetId of created) await discardAsset(row.userId, assetId).catch(() => undefined)
    const message = error instanceof HttpError ? error.message : '桌宠生成失败，请稍后重试'
    console.error('[desk-pet] generation failed', row.id, error instanceof Error ? error.message : error)
    await fail(row.userId, row.id, message)
  }
}

let pumping = false

export async function processQueue() {
  if (pumping || !config.deskPetGeneration) return
  pumping = true
  try {
    for (;;) {
      const [next] = await rows<GenerationRow>(`SELECT ${generationSelect} ${generationFrom}
        WHERE g.status='queued' ORDER BY g.created_at,g.id LIMIT 1`)
      if (!next) return
      const [claim] = await db.execute<ResultSetHeader>(`UPDATE desk_pet_generations
        SET status='running',stage='anchor',started_at=UTC_TIMESTAMP(3),updated_at=UTC_TIMESTAMP(3)
        WHERE id=? AND status='queued'`, [next.id])
      if (!claim.affectedRows) continue
      await runGeneration({ ...next, status: 'running', stage: 'anchor' })
    }
  } finally {
    pumping = false
  }
}

export async function initializeDeskPetGeneration() {
  if (!config.deskPetGeneration) return
  await db.execute(`UPDATE desk_pet_generations
    SET status='failed',stage='failed',error='生成服务重启，请重新生成',updated_at=UTC_TIMESTAMP(3)
    WHERE status='running' AND started_at<UTC_TIMESTAMP(3)-INTERVAL 20 MINUTE`)
  void processQueue()
}
