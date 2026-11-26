import { computed, ref, watch } from 'vue'
import {
  customDeskPetId,
  defaultDeskPetId,
  getSystemDeskPet,
  isSystemDeskPetId,
  parseCustomDeskPetId,
  systemDeskPets,
  type DeskPetActionSpec,
  type SystemDeskPetSpec,
} from '../../../shared/desk-pets.mjs'
import { api, downloadAsset, user } from './client'

export type DeskPetState = { petId: string; enabled: boolean }
export type DeskPetPosition = { x: number; y: number }
export type DeskPetGenerationStatus = 'queued' | 'running' | 'completed' | 'failed'
export type DeskPetGenerationStage = 'queued' | 'anchor' | 'actions' | 'compose' | 'completed' | 'failed'

export type GeneratedDeskPetAction = {
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

export type DeskPetGeneration = {
  id: string
  petId: string
  status: DeskPetGenerationStatus
  stage: DeskPetGenerationStage
  error: string | null
  createdAt: string
  completedAt: string | null
  actions?: GeneratedDeskPetAction[]
}

export type DeskPetProfile = {
  id: string
  name: string
  species: 'cat' | 'dog' | 'other'
  breed: string
  avatarAssetId: string | null
  deskPet: { id: string; status: DeskPetGenerationStatus; stage: DeskPetGenerationStage; error: string | null } | null
}

export type DeskPetCapabilities = { generate: boolean; dailyLimit: number; used?: number }

const positionStorageKey = 'petcloud.wx.deskpet.pos.v1'
const stateStoragePrefix = 'petcloud.wx.deskpet.state.v1.'

function isValidDeskPetId(id: unknown): id is string {
  return isSystemDeskPetId(id) || Boolean(parseCustomDeskPetId(id))
}

function readStoredPosition(): DeskPetPosition | null {
  try {
    const raw = uni.getStorageSync(positionStorageKey) as Partial<DeskPetPosition> | ''
    if (raw && typeof raw.x === 'number' && typeof raw.y === 'number' && Number.isFinite(raw.x) && Number.isFinite(raw.y)) {
      return { x: raw.x, y: raw.y }
    }
  } catch {
    /* ignore storage errors */
  }
  return null
}

function readStoredState(ownerId?: string | null): DeskPetState {
  if (!ownerId) return { petId: defaultDeskPetId, enabled: true }
  try {
    const raw = uni.getStorageSync(stateStoragePrefix + ownerId) as Partial<DeskPetState> | ''
    if (raw && typeof raw === 'object') {
      return {
        petId: isValidDeskPetId(raw.petId) ? raw.petId : defaultDeskPetId,
        enabled: typeof raw.enabled === 'boolean' ? raw.enabled : true,
      }
    }
  } catch {
    /* ignore storage errors */
  }
  return { petId: defaultDeskPetId, enabled: true }
}

function writeStoredState(ownerId: string | undefined | null, state: DeskPetState) {
  if (!ownerId) return
  try {
    uni.setStorageSync(stateStoragePrefix + ownerId, state)
  } catch {
    /* ignore storage errors */
  }
}

const initial = readStoredState(user.value?.id)
export const deskPetId = ref<string>(initial.petId)
export const deskPetEnabled = ref<boolean>(initial.enabled)
export const deskPetPosition = ref<DeskPetPosition | null>(readStoredPosition())
export const deskPetCatalog = systemDeskPets
export const deskPetCapabilities = ref<DeskPetCapabilities>({ generate: false, dailyLimit: 2 })
const customDeskPetSpec = ref<SystemDeskPetSpec | null>(null)
const spritePathCache = new Map<string, string>()

export const currentDeskPet = computed<SystemDeskPetSpec>(() => {
  if (customDeskPetSpec.value && customDeskPetSpec.value.id === deskPetId.value) {
    return customDeskPetSpec.value
  }
  return getSystemDeskPet(deskPetId.value)
})

let syncVersion = 0
let resolveVersion = 0

async function resolveCustomDeskPet(selectedId: string, ownerId?: string | null) {
  const version = ++resolveVersion
  const petUuid = parseCustomDeskPetId(selectedId)
  if (!petUuid || !ownerId) {
    customDeskPetSpec.value = null
    return
  }
  try {
    const result = await api<{ deskPet: { petId: string; name: string; species: 'cat' | 'dog'; generationId: string; actions: GeneratedDeskPetAction[] } }>(
      '/desktop/miniapp/pet/' + encodeURIComponent(petUuid),
    )
    if (version !== resolveVersion || user.value?.id !== ownerId || deskPetId.value !== selectedId) return
    if (!result.deskPet?.actions?.length) {
      customDeskPetSpec.value = null
      return
    }
    const actions: DeskPetActionSpec[] = []
    for (const action of result.deskPet.actions) {
      const cacheKey = ownerId + ':' + result.deskPet.generationId + ':' + action.assetId
      let localPath = spritePathCache.get(cacheKey)
      if (!localPath) {
        localPath = await downloadAsset(action.assetId)
        spritePathCache.set(cacheKey, localPath)
      }
      if (version !== resolveVersion || user.value?.id !== ownerId || deskPetId.value !== selectedId) return
      actions.push({
        key: action.key,
        label: action.label,
        shortLabel: action.shortLabel,
        sheet: localPath,
        frames: Math.max(1, action.frames || 1),
        columns: Math.max(1, action.columns || 1),
        rows: Math.max(1, action.rows || 1),
        fps: Math.max(1, Math.min(24, action.fps || 4)),
        repeats: Math.max(1, action.repeats || 1),
      })
    }
    customDeskPetSpec.value = {
      id: customDeskPetId(result.deskPet.petId),
      name: result.deskPet.name,
      species: result.deskPet.species,
      badge: '我的宠物',
      description: `已生成 ${actions.length} 套动作`,
      avatar: '',
      actions,
    }
  } catch {
    if (version === resolveVersion) customDeskPetSpec.value = null
  }
}

export async function listDeskPetProfiles() {
  const result = await api<{ pets: DeskPetProfile[]; capabilities: DeskPetCapabilities }>('/desktop/miniapp/pets')
  deskPetCapabilities.value = result.capabilities
  return result
}

export async function startDeskPetGeneration(petId: string) {
  const result = await api<{ generation: DeskPetGeneration }>('/desktop/miniapp/generations', 'POST', { petId }, 30000)
  return result.generation
}

export async function getDeskPetGeneration(id: string) {
  const result = await api<{ generation: DeskPetGeneration }>('/desktop/miniapp/generations/' + encodeURIComponent(id))
  return result.generation
}

export async function deleteDeskPetGeneration(id: string) {
  await api<{ ok: boolean }>('/desktop/miniapp/generations/' + encodeURIComponent(id), 'DELETE', {}, 10000)
}

export async function syncDeskPet() {
  const version = ++syncVersion
  const ownerId = user.value?.id
  const cached = readStoredState(ownerId)
  deskPetId.value = cached.petId
  deskPetEnabled.value = cached.enabled
  if (!ownerId) {
    customDeskPetSpec.value = null
    return
  }
  void resolveCustomDeskPet(cached.petId, ownerId)
  try {
    const result = await api<{ deskPet: DeskPetState; capabilities?: DeskPetCapabilities }>('/desktop/miniapp')
    if (version !== syncVersion || user.value?.id !== ownerId) return
    const next: DeskPetState = {
      petId: isValidDeskPetId(result.deskPet?.petId) ? result.deskPet.petId : defaultDeskPetId,
      enabled: typeof result.deskPet?.enabled === 'boolean' ? result.deskPet.enabled : true,
    }
    if (result.capabilities) deskPetCapabilities.value = { ...deskPetCapabilities.value, ...result.capabilities }
    deskPetId.value = next.petId
    deskPetEnabled.value = next.enabled
    writeStoredState(ownerId, next)
    void resolveCustomDeskPet(next.petId, ownerId)
  } catch {
    /* keep default or cached desk pet when offline */
  }
}

export async function saveDeskPet(patch: Partial<DeskPetState>) {
  const ownerId = user.value?.id
  const previous: DeskPetState = { petId: deskPetId.value, enabled: deskPetEnabled.value }
  const next: DeskPetState = {
    petId: patch.petId && isValidDeskPetId(patch.petId) ? patch.petId : previous.petId,
    enabled: typeof patch.enabled === 'boolean' ? patch.enabled : previous.enabled,
  }
  deskPetId.value = next.petId
  deskPetEnabled.value = next.enabled
  writeStoredState(ownerId, next)
  if (!ownerId) return next
  try {
    const result = await api<{ deskPet: DeskPetState }>('/desktop/miniapp', 'PUT', next)
    if (user.value?.id !== ownerId) return next
    const saved: DeskPetState = {
      petId: isValidDeskPetId(result.deskPet?.petId) ? result.deskPet.petId : defaultDeskPetId,
      enabled: typeof result.deskPet?.enabled === 'boolean' ? result.deskPet.enabled : true,
    }
    deskPetId.value = saved.petId
    deskPetEnabled.value = saved.enabled
    writeStoredState(ownerId, saved)
    void resolveCustomDeskPet(saved.petId, ownerId)
    return saved
  } catch (error) {
    if (user.value?.id === ownerId) {
      deskPetId.value = previous.petId
      deskPetEnabled.value = previous.enabled
      writeStoredState(ownerId, previous)
      void resolveCustomDeskPet(previous.petId, ownerId)
    }
    throw error
  }
}

export function saveDeskPetPosition(pos: DeskPetPosition) {
  const clean = { x: Math.round(pos.x), y: Math.round(pos.y) }
  deskPetPosition.value = clean
  try {
    uni.setStorageSync(positionStorageKey, clean)
  } catch {
    /* ignore storage errors */
  }
}

watch(
  () => user.value?.id,
  () => {
    void syncDeskPet()
  },
  { immediate: true },
)
