<script setup lang="ts">
import { computed, ref } from 'vue'
import { onHide, onShow, onUnload } from '@dcloudio/uni-app'
import type { User } from '../../../../src/lib/types'
import { customDeskPetId, defaultDeskPetId, getSystemDeskPet, type DeskPetActionSpec } from '../../../../shared/desk-pets.mjs'
import AccountAvatar from '../../components/AccountAvatar.vue'
import DeskPetStage from '../../components/DeskPetStage.vue'
import PetImage from '../../components/PetImage.vue'
import UiIcon from '../../components/UiIcon.vue'
import { api, confirm, go, logout, message, openPrivacyGuide, speciesNames, toast, updateUser, user } from '../../lib/client'
import {
  currentDeskPet, deleteDeskPetGeneration, deskPetCapabilities, deskPetCatalog, deskPetEnabled, deskPetId,
  getDeskPetGeneration, listDeskPetProfiles, saveDeskPet, startDeskPetGeneration, syncDeskPet,
  type DeskPetGeneration, type DeskPetProfile,
} from '../../lib/desk-pet'
import { submitAction } from '../../lib/page'
import { listPets } from '../../lib/pets'
import { readPhoto } from '../../lib/photo'

const avatar = ref('')
const pageActive = ref(true)
const previewStage = ref<InstanceType<typeof DeskPetStage> | null>(null)
const currentAction = ref<DeskPetActionSpec>(currentDeskPet.value.actions[0])
const myPets = ref<DeskPetProfile[]>([])
const petPickerOpen = ref(false)
const generatingPet = ref<DeskPetProfile | null>(null)
const generation = ref<DeskPetGeneration | null>(null)
const generationBusy = ref(false)
const generationError = ref('')
const petsLoading = ref(false)
const petsError = ref('')

const { run, busy, error } = submitAction()
const { run: runLogout, busy: signingOut, error: logoutError } = submitAction()
const { run: runDeskPet, busy: savingDeskPet, error: deskPetError } = submitAction()

let active = true
let petLoadVersion = 0
let pollTimer: ReturnType<typeof setTimeout> | undefined
let pollStartedAt = 0

const stageSteps: Record<string, number> = { queued: 0, anchor: 1, actions: 2, compose: 3, completed: 3, failed: 0 }
const stagePercent: Record<string, number> = { queued: 6, anchor: 32, actions: 64, compose: 90, completed: 100, failed: 100 }
const stageLabels: Record<string, string> = {
  queued: '正在排队…',
  anchor: '正在生成正面坐姿…',
  actions: '正在生成两组动作…',
  compose: '正在处理透明帧…',
  completed: '生成完成',
  failed: '生成未完成',
}
const generationStep = computed(() => (generation.value ? stageSteps[generation.value.stage] ?? 0 : 0))
const generationPercent = computed(() => (generation.value ? stagePercent[generation.value.stage] ?? 6 : 0))
const generationStageText = computed(() => (generation.value ? stageLabels[generation.value.stage] || '正在生成…' : ''))
const canAddPet = computed(() => myPets.value.length < 3)
const generatedPets = computed(() => myPets.value.filter(pet => pet.deskPet?.status === 'completed'))

function clearPoll() {
  if (pollTimer) clearTimeout(pollTimer)
  pollTimer = undefined
}

async function loadMyPetDeskOptions() {
  const owner = user.value?.id
  const version = ++petLoadVersion
  if (!owner) {
    myPets.value = []
    petsError.value = ''
    petsLoading.value = false
    return
  }
  petsLoading.value = true
  petsError.value = ''
  try {
    const result = await listDeskPetProfiles()
    if (version !== petLoadVersion || user.value?.id !== owner) return
    myPets.value = result.pets
  } catch (cause) {
    if (version !== petLoadVersion || user.value?.id !== owner) return
    // Older deployments do not expose the desk-pet profile endpoint yet.
    // Fall back to the existing pet list so the picker still shows the profiles.
    try {
      const pets = await listPets()
      if (version === petLoadVersion && user.value?.id === owner) {
        myPets.value = pets.map(pet => ({
          id: pet.id,
          name: pet.name,
          species: pet.species,
          breed: pet.breed,
          avatarAssetId: pet.avatarAssetId,
          deskPet: null,
        }))
      }
    } catch {
      /* the retry action will try the desk-pet endpoint again */
    }
    if (version === petLoadVersion && user.value?.id === owner) {
      petsError.value = message(cause)
    }
  } finally {
    if (version === petLoadVersion && user.value?.id === owner) petsLoading.value = false
  }
}

onShow(() => {
  pageActive.value = true
  void syncDeskPet()
  void loadMyPetDeskOptions()
  if (generation.value &&
    (generation.value.status === 'queued' || generation.value.status === 'running') && !pollTimer) {
    schedulePoll(generation.value.id)
  }
})
onHide(() => {
  pageActive.value = false
  clearPoll()
})
onUnload(() => {
  active = false
  pageActive.value = false
  clearPoll()
})

function chooseAvatar(event: { detail: { avatarUrl?: string } }) {
  if (!busy.value && event.detail.avatarUrl) avatar.value = event.detail.avatarUrl
}

function close() {
  uni.navigateBack({ fail: () => go('account') })
}

function save(event: Event) {
  const account = user.value
  if (!account || signingOut.value) return
  const form = (event as CustomEvent<{ value?: { nickname?: string } }>).detail
  const nickname = form?.value?.nickname?.trim()
  const avatarPath = avatar.value
  return run(async () => {
    if (!nickname && !avatarPath) throw new Error('请选择头像或填写昵称')
    const avatarImage = avatarPath ? await readPhoto(avatarPath) : undefined
    if (user.value?.id !== account.id) throw new Error('登录已变更，请重新打开资料页')
    const result = avatarImage
      ? await api<{ user: User }>('/auth/profile/avatar', 'PUT', {
        avatarImage,
        ...(nickname && nickname !== account.displayName ? { displayName: nickname } : {}),
      })
      : await api<{ user: User }>('/auth/profile', 'PUT', { displayName: nickname })
    updateUser(result.user)
    if (active) {
      toast('资料已保存')
      close()
    }
  })
}

function selectSystemDeskPet(id: string) {
  if (savingDeskPet.value || busy.value || signingOut.value) return
  if (deskPetId.value === id) {
    previewStage.value?.triggerAction()
    return
  }
  return runDeskPet(async () => {
    await saveDeskPet({ petId: id })
    if (active) toast(`已切换为「${getSystemDeskPet(id).name}」`)
  })
}

function openPetPicker() {
  if (savingDeskPet.value || busy.value || signingOut.value) return
  petPickerOpen.value = true
  void loadMyPetDeskOptions()
}

function deskStatusLabel(pet: DeskPetProfile) {
  const status = pet.deskPet?.status
  if (status === 'completed') return deskPetId.value === customDeskPetId(pet.id) ? '使用中' : '可切换'
  if (status === 'running' || status === 'queued') return '生成中'
  if (status === 'failed') return '重试'
  return pet.avatarAssetId ? '生成' : '需封面'
}

function deskStatusClass(pet: DeskPetProfile) {
  const status = pet.deskPet?.status
  if (status === 'completed') return 'ready'
  if (status === 'running' || status === 'queued') return 'busy'
  if (status === 'failed') return 'generate'
  return pet.avatarAssetId ? 'generate' : 'muted'
}

function removeGeneratedDeskPet(pet: DeskPetProfile) {
  const job = pet.deskPet
  if (!job || job.status !== 'completed') return
  if (savingDeskPet.value || busy.value || signingOut.value || generationBusy.value) return
  return runDeskPet(async () => {
    if (!await confirm('删除桌宠动作', `删除「${pet.name}」的桌宠动作？宠物档案和照片会保留。`)) return
    await deleteDeskPetGeneration(job.id)
    await syncDeskPet()
    await loadMyPetDeskOptions()
    if (active) toast('桌宠动作已删除')
  })
}

function pickPet(pet: DeskPetProfile) {
  if (savingDeskPet.value || busy.value || signingOut.value || generationBusy.value) return
  petPickerOpen.value = false
  generationError.value = ''
  const status = pet.deskPet?.status
  if (status === 'completed') {
    return runDeskPet(async () => {
      await saveDeskPet({ petId: customDeskPetId(pet.id) })
      if (active) toast(`已切换为「${pet.name}」`)
    })
  }
  generatingPet.value = pet
  generation.value = null
  if (status === 'failed' && pet.deskPet?.error) generationError.value = pet.deskPet.error
  if ((status === 'running' || status === 'queued') && pet.deskPet) {
    generation.value = {
      id: pet.deskPet.id,
      petId: pet.id,
      status: pet.deskPet.status,
      stage: pet.deskPet.stage,
      error: pet.deskPet.error,
      createdAt: '',
      completedAt: null,
    }
    void resumeGeneration(pet.deskPet.id)
    return
  }
  if (!pet.avatarAssetId) {
    generationError.value = '这只宠物还没有封面照。请先在宠物手帐上传一张正面照，再生成桌宠。'
  }
}

async function startGeneration() {
  const pet = generatingPet.value
  if (!pet || generationBusy.value) return
  if (!deskPetCapabilities.value.generate) {
    generationError.value = '桌宠生图服务暂未开放，请稍后再试。'
    return
  }
  generationBusy.value = true
  generationError.value = ''
  try {
    const job = await startDeskPetGeneration(pet.id)
    generation.value = job
    if (job.status === 'completed') return finishGeneration(job)
    if (job.status === 'failed') {
      generationError.value = job.error || '生成未完成，请重试'
      return
    }
    pollStartedAt = Date.now()
    schedulePoll(job.id)
  } catch (cause) {
    generationError.value = message(cause)
  } finally {
    generationBusy.value = false
  }
}

function retryGeneration() {
  generation.value = null
  generationError.value = ''
  return startGeneration()
}

async function resumeGeneration(id: string) {
  generationBusy.value = true
  try {
    const job = await getDeskPetGeneration(id)
    if (!generatingPet.value) return
    generation.value = job
    if (job.status === 'completed') return finishGeneration(job)
    if (job.status === 'failed') {
      generationError.value = job.error || '生成未完成，请重试'
      return
    }
    pollStartedAt = Date.now()
    schedulePoll(job.id)
  } catch (cause) {
    generationError.value = message(cause)
  } finally {
    generationBusy.value = false
  }
}

function schedulePoll(id: string) {
  clearPoll()
  pollTimer = setTimeout(() => { void pollGeneration(id) }, 2500)
}

async function pollGeneration(id: string) {
  pollTimer = undefined
  if (!generation.value || generation.value.id !== id) return
  if (Date.now() - pollStartedAt > 12 * 60_000) {
    generationError.value = '生成时间较长，请稍后重新打开页面查看。'
    return
  }
  try {
    const job = await getDeskPetGeneration(id)
    if (!generation.value || generation.value.id !== id) return
    generation.value = job
    if (job.status === 'completed') return finishGeneration(job)
    if (job.status === 'failed') {
      generationError.value = job.error || '生成未完成，请重试'
      if (!generatingPet.value) toast(generationError.value)
      return
    }
    schedulePoll(id)
  } catch (cause) {
    generationError.value = message(cause)
    schedulePoll(id)
  }
}

async function finishGeneration(job: DeskPetGeneration) {
  clearPoll()
  try {
    await saveDeskPet({ petId: customDeskPetId(job.petId) })
    const name = generatingPet.value?.name || myPets.value.find(pet => pet.id === job.petId)?.name || '专属桌宠'
    if (active) toast(`「${name}」已生成`)
  } catch (cause) {
    generationError.value = message(cause)
    return
  }
  await loadMyPetDeskOptions()
  generatingPet.value = null
  generation.value = null
  generationError.value = ''
}

function closeGeneration() {
  const running = generation.value?.status === 'queued' || generation.value?.status === 'running'
  generatingPet.value = null
  generationError.value = ''
  if (running) return
  clearPoll()
  generation.value = null
}

function toggleDeskPet(event: Event) {
  if (savingDeskPet.value || busy.value || signingOut.value) return
  const enabled = Boolean((event as CustomEvent<{ value?: boolean }>).detail?.value)
  return runDeskPet(async () => {
    await saveDeskPet({ enabled })
    if (active) toast(enabled ? '已开启悬浮桌宠' : '已隐藏悬浮桌宠')
  })
}

function previewAction(key: string) {
  previewStage.value?.triggerAction(key)
}

function openPetArchive(petId: string) {
  generatingPet.value = null
  go('pet', { id: petId })
}

function signOut() {
  if (busy.value) return
  return runLogout(async () => {
    if (!await confirm('退出登录', '下次可用同一微信找回档案。')) return
    await logout()
    if (active) close()
  })
}
</script>

<template>
  <view class="screen profile-screen">
    <view v-if="user" class="card profile-card">
      <form @submit="save">
        <button id="choose-profile-avatar" class="avatar-picker" open-type="chooseAvatar" :disabled="busy || signingOut" @chooseavatar="chooseAvatar">
          <AccountAvatar :size="76" :preview="avatar" />
          <text>{{ avatar || user.avatarVersion ? '更换头像' : '选择头像' }}</text>
        </button>
        <text class="label">昵称</text>
        <input
          :always-embed="true"
          id="profile-nickname"
          name="nickname"
          type="nickname"
          :value="user.displayName"
          maxlength="40"
          aria-label="昵称"
          placeholder="使用微信昵称或自行填写"
          :disabled="busy || signingOut"
        />
        <text v-if="error" class="error" role="status">{{ error }}</text>
        <view class="profile-actions">
          <button id="save-profile" class="primary" form-type="submit" :disabled="busy || signingOut" :loading="busy">保存资料</button>
        </view>
      </form>
    </view>

    <view v-if="user" class="card desk-pet-card">
      <view class="desk-pet-head">
        <text class="heading desk-pet-title">我的桌宠</text>
        <view class="desk-pet-switch">
          <text class="desk-pet-switch-label">{{ deskPetEnabled ? '悬浮开启' : '已隐藏' }}</text>
          <switch
            id="toggle-desk-pet"
            class="desk-pet-native-switch"
            :checked="deskPetEnabled"
            color="#ffdc36"
            :disabled="savingDeskPet || busy || signingOut"
            @change="toggleDeskPet"
          />
        </view>
      </view>

      <view class="desk-pet-showcase">
        <view class="desk-pet-stage-wrap">
          <view class="desk-pet-stage-shadow" />
          <DeskPetStage
            ref="previewStage"
            :pet="currentDeskPet"
            :size="102"
            :paused="!pageActive"
            @action-change="currentAction = $event"
          />
        </view>
        <view class="desk-pet-info">
          <view class="desk-pet-name-row">
            <text class="desk-pet-name">{{ currentDeskPet.name }}</text>
            <text class="desk-pet-badge">{{ currentDeskPet.badge }}</text>
          </view>
          <view class="desk-pet-status-row">
            <view class="desk-pet-live-dot" />
            <text class="desk-pet-status-text">{{ currentAction.label }}</text>
          </view>
          <view class="desk-pet-action-pills">
            <button
              v-for="action in currentDeskPet.actions"
              :key="action.key"
              :class="['desk-pet-pill', { active: currentAction.key === action.key }]"
              @tap="previewAction(action.key)"
            >
              {{ action.shortLabel || action.label }}
            </button>
          </view>
        </view>
      </view>

      <view class="desk-pet-picker-head">
        <text class="desk-pet-section-label">选择或生成专属桌宠</text>
        <button class="text-button desk-pet-manage" @tap="go('pets')">
          <text>宠物档案</text><UiIcon name="right" :size="11" />
        </button>
      </view>

      <view class="desk-pet-grid">
        <button
          v-for="item in deskPetCatalog"
          :id="'select-desk-pet-' + item.id"
          :key="item.id"
          :class="['desk-pet-tile', { selected: deskPetId === item.id }]"
          :aria-pressed="deskPetId === item.id"
          :disabled="savingDeskPet || busy || signingOut"
          @tap="selectSystemDeskPet(item.id)"
        >
          <view class="desk-pet-tile-avatar">
            <image class="desk-pet-tile-img" :src="item.avatar" mode="aspectFit" />
          </view>
          <text class="desk-pet-tile-name">{{ item.name }}</text>
          <text :class="['desk-pet-tile-pill', { active: deskPetId === item.id }]">
            {{ deskPetId === item.id ? '使用中' : item.id === defaultDeskPetId ? '默认' : '可选' }}
          </text>
        </button>

        <view
          v-for="pet in generatedPets"
          :id="'select-generated-pet-' + pet.id"
          :key="'generated-' + pet.id"
          :class="['desk-pet-tile', 'desk-pet-tile-custom', { selected: deskPetId === customDeskPetId(pet.id) }]"
          :aria-pressed="deskPetId === customDeskPetId(pet.id)"
          role="button"
          @tap="pickPet(pet)"
        >
          <button
            class="desk-pet-delete"
            :disabled="savingDeskPet || busy || signingOut"
            aria-label="删除桌宠动作"
            @tap.stop="removeGeneratedDeskPet(pet)"
          >×</button>
          <view class="desk-pet-tile-avatar user-pet">
            <PetImage :asset-id="pet.avatarAssetId" :size="48" :previewable="false" />
          </view>
          <text class="desk-pet-tile-name">{{ pet.name }}</text>
          <text :class="['desk-pet-tile-pill', deskPetId === customDeskPetId(pet.id) ? 'active' : 'ready']">
            {{ deskPetId === customDeskPetId(pet.id) ? '使用中' : '可切换' }}
          </text>
        </view>

        <button
          id="add-pet-for-desk-pet"
          class="desk-pet-tile desk-pet-tile-add"
          :disabled="savingDeskPet || busy || signingOut"
          @tap="openPetPicker"
        >
          <view class="desk-pet-tile-avatar add-icon">
            <UiIcon name="plus" :size="18" />
          </view>
          <text class="desk-pet-tile-name">添加桌宠</text>
          <text class="desk-pet-tile-pill add-tag">选择宠物</text>
        </button>
      </view>
      <text v-if="currentDeskPet.badge === '我的宠物'" class="desk-pet-current">当前：{{ currentDeskPet.name }}</text>
      <text v-if="deskPetError" class="error" role="status">{{ deskPetError }}</text>
    </view>

    <view v-if="user" class="card privacy-card">
      <text class="heading">账号与隐私</text>
      <button id="profile-privacy-guide" class="privacy-link" @tap="openPrivacyGuide">
        <text>小程序用户隐私保护指引</text><UiIcon name="right" :size="13" />
      </button>
      <button id="profile-logout" class="privacy-link logout-link" :disabled="busy || signingOut" @tap="signOut">退出登录</button>
      <text v-if="logoutError" class="error" role="status">{{ logoutError }}</text>
    </view>
    <view v-else class="card empty-card">
      <text>请先登录微信账号</text>
      <button class="small primary" @tap="go('account')">返回我的</button>
    </view>

    <view v-if="petPickerOpen && user" class="modal-scrim" @tap="petPickerOpen = false" @touchmove.stop.prevent>
      <view class="modal-panel desk-pet-picker-panel" role="dialog" aria-label="选择宠物档案" @tap.stop>
        <view class="spread">
          <text class="heading">选择宠物档案</text>
          <button class="text-button" @tap="petPickerOpen = false">关闭</button>
        </view>
        <text class="sub desk-pet-picker-tip">用档案封面照生成专属桌宠；同一只宠物生成一次即可反复切换。</text>
        <view v-if="petsError" class="desk-pet-service-error">
          <text class="desk-pet-load-error">{{ petsError }}</text>
          <button class="small" @tap="loadMyPetDeskOptions">重试</button>
        </view>
        <view v-if="petsLoading && !myPets.length" class="desk-pet-empty">
          <text class="sub">正在读取宠物档案…</text>
        </view>
        <view v-else-if="!myPets.length && !petsError" class="desk-pet-empty">
          <text class="sub">还没有宠物档案</text>
          <button class="small primary" @tap="go('pet-edit')">新建宠物档案</button>
        </view>
        <button
          v-for="pet in myPets"
          :id="'desk-pet-profile-' + pet.id"
          :key="pet.id"
          class="desk-pet-profile"
          :disabled="savingDeskPet || busy || signingOut || generationBusy"
          @tap="pickPet(pet)"
        >
          <view class="desk-pet-profile-avatar">
            <PetImage :asset-id="pet.avatarAssetId" :size="46" :previewable="false" />
          </view>
          <view class="grow">
            <text class="desk-pet-profile-name">{{ pet.name }}</text>
            <text class="sub">{{ speciesNames[pet.species] }}{{ pet.breed ? ' · ' + pet.breed : '' }}</text>
            <text v-if="pet.deskPet?.status === 'failed'" class="sub desk-pet-profile-error">
              {{ pet.deskPet.error || '上次生成未完成' }}
            </text>
          </view>
          <text :class="['desk-pet-tile-pill', deskStatusClass(pet)]">{{ deskStatusLabel(pet) }}</text>
        </button>
        <button v-if="canAddPet" class="text-button desk-pet-add-link" @tap="go('pet-edit')">+ 添加宠物档案</button>
      </view>
    </view>

    <view v-if="generatingPet" class="modal-scrim" @tap="closeGeneration" @touchmove.stop.prevent>
      <view class="modal-panel generate-pet-modal" role="dialog" aria-label="生成专属桌宠" @tap.stop>
        <view class="spread">
          <text class="heading generate-modal-title">
            {{ generation?.status === 'failed' ? '生成未完成' : generation ? '正在生成桌宠' : '生成专属桌宠' }}
          </text>
          <button class="text-button" @tap="closeGeneration">关闭</button>
        </view>
        <view class="generate-pet-summary">
          <PetImage :asset-id="generatingPet.avatarAssetId" :size="58" :previewable="false" />
          <view class="grow">
            <text class="generate-pet-name">{{ generatingPet.name }}</text>
            <text class="sub">
              {{ speciesNames[generatingPet.species] }}{{ generatingPet.breed ? ' · ' + generatingPet.breed : '' }}
            </text>
            <text class="sub generate-pet-photo-state">
              {{ generatingPet.avatarAssetId ? '将以档案封面照为参考生成' : '尚未上传宠物正面封面照' }}
            </text>
          </view>
        </view>

        <view v-if="!generation" class="generate-pet-steps">
          <text class="generate-step-line">将生成「正面坐着呼吸」与「坐着舔前爪」两套 6 帧动作，约需 1–3 分钟。</text>
          <text class="generate-step-tip">档案封面照会发送给生图服务用于本次生成，生成的动作图保存在你的账号素材中。</text>
          <text v-if="!deskPetCapabilities.generate" class="generate-step-tip">桌宠生图服务暂未开放，请稍后再试。</text>
          <text v-else class="generate-step-tip">
            今日还可生成 {{ Math.max(0, deskPetCapabilities.dailyLimit - (deskPetCapabilities.used || 0)) }} 次
          </text>
          <text v-if="generationError" class="error" role="status">{{ generationError }}</text>
        </view>

        <view v-else class="generate-progress">
          <view class="generate-progress-head">
            <text>{{ generationStageText }}</text>
            <text v-if="generation.status !== 'failed'" class="sub">{{ generationStep }}/3</text>
          </view>
          <view v-if="generation.status !== 'failed'" class="generate-progress-bar">
            <view :style="{ width: generationPercent + '%' }" />
          </view>
          <text v-if="generation.status === 'failed'" class="error" role="status">
            {{ generationError || generation.error }}
          </text>
          <text v-else class="sub generate-progress-hint">生成期间可以关闭窗口，完成后会自动切换为这只宠物的桌宠。</text>
        </view>

        <view class="generate-modal-actions">
          <template v-if="!generation">
            <button v-if="!generatingPet.avatarAssetId" class="primary" @tap="openPetArchive(generatingPet.id)">
              去宠物手帐上传封面照
            </button>
            <button
              v-else
              class="primary"
              :disabled="!deskPetCapabilities.generate || generationBusy"
              :loading="generationBusy"
              @tap="startGeneration"
            >
              开始生成
            </button>
            <button class="small" @tap="closeGeneration">先用默认橘猫</button>
          </template>
          <template v-else>
            <button v-if="generation.status === 'completed'" class="primary" @tap="finishGeneration(generation)">
              使用这只桌宠
            </button>
            <button v-else-if="generation.status === 'failed'" class="primary" :disabled="generationBusy" @tap="retryGeneration">
              重新生成
            </button>
            <button v-else class="small" @tap="closeGeneration">后台生成，先关闭</button>
          </template>
        </view>
      </view>
    </view>
  </view>
</template>

<style scoped>
.profile-screen { padding-top: 12px; }
.profile-card { padding: 18px 16px 14px; }
.avatar-picker {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 7px;
  margin: 0 auto 16px;
  padding: 0 9px;
  border: 0;
  background: transparent;
  color: var(--gold-ink);
}
.profile-actions { display: flex; flex-direction: column; gap: 5px; margin-top: 15px; }

.desk-pet-card { padding: 14px 14px 15px; }
.desk-pet-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
}
.desk-pet-title { margin-bottom: 0; }
.desk-pet-switch { display: flex; align-items: center; gap: 4px; flex: none; }
.desk-pet-switch-label { color: var(--muted); font-size: 12px; font-weight: 600; }
.desk-pet-native-switch { transform: scale(0.78); transform-origin: right center; margin-right: -4px; }

.desk-pet-showcase {
  display: flex;
  align-items: center;
  gap: 12px;
  margin-top: 11px;
  padding: 11px 12px;
  border: 1px solid #f2e5bd;
  border-radius: 15px;
  background: linear-gradient(135deg, #fffdf6 0%, #fff6d8 100%);
}
.desk-pet-stage-wrap {
  position: relative;
  display: flex;
  align-items: center;
  justify-content: center;
  flex: none;
  width: 102px;
  height: 102px;
  border-radius: 14px;
  background: radial-gradient(circle at 50% 45%, rgba(255, 255, 255, 0.92), rgba(255, 250, 234, 0.55));
}
.desk-pet-stage-shadow {
  position: absolute;
  bottom: 6px;
  left: 50%;
  width: 56px;
  height: 10px;
  border-radius: 50%;
  background: radial-gradient(ellipse at center, rgba(110, 78, 22, 0.18), rgba(110, 78, 22, 0) 72%);
  transform: translateX(-50%);
}
.desk-pet-info { flex: 1; min-width: 0; }
.desk-pet-name-row { display: flex; align-items: center; gap: 6px; min-width: 0; }
.desk-pet-name {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  color: var(--ink);
  font-size: 16px;
  font-weight: 800;
}
.desk-pet-badge {
  flex: none;
  padding: 1px 7px;
  border-radius: 999px;
  background: #ffe36e;
  color: #5c400b;
  font-size: 10px;
  font-weight: 750;
}
.desk-pet-status-row {
  display: flex;
  align-items: center;
  gap: 5px;
  margin-top: 5px;
}
.desk-pet-live-dot {
  flex: none;
  width: 6px;
  height: 6px;
  border-radius: 50%;
  background: #e2a418;
}
.desk-pet-status-text {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  color: #6b5626;
  font-size: 12px;
  font-weight: 600;
}
.desk-pet-action-pills {
  display: flex;
  flex-wrap: nowrap;
  gap: 6px;
  margin-top: 10px;
}
.desk-pet-pill {
  flex: none;
  min-height: 28px;
  padding: 3px 11px;
  border: 1px solid #eadbb2;
  border-radius: 999px;
  background: rgba(255, 255, 255, 0.88);
  color: #5d491c;
  font-size: 11px;
  font-weight: 700;
  line-height: 1.4;
}
.desk-pet-pill.active {
  border-color: #f0ca4a;
  background: #ffdc36;
  color: #2f2205;
}

.desk-pet-picker-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin: 12px 0 8px;
}
.desk-pet-section-label { color: var(--muted); font-size: 12px; font-weight: 650; }
.desk-pet-manage { min-height: 24px; padding: 0; font-size: 12px; font-weight: 650; }

.desk-pet-grid {
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  gap: 8px;
}
.desk-pet-tile {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 5px;
  min-width: 0;
  padding: 10px 6px 9px;
  border: 1px solid var(--border);
  border-radius: 13px;
  background: #fffdf9;
  line-height: 1.25;
}
.desk-pet-tile.selected {
  border-color: #f0cb4d;
  background: #fff8dc;
  box-shadow: 0 2px 8px rgba(176, 134, 24, 0.08);
}
.desk-pet-tile-add {
  border-style: dashed;
  border-color: #dfd4b6;
  background: #fdfbf5;
}
.desk-pet-tile-custom { position: relative; }
.desk-pet-delete {
  position: absolute;
  top: 4px;
  right: 4px;
  z-index: 1;
  display: flex;
  align-items: center;
  justify-content: center;
  width: 20px;
  height: 20px;
  min-height: 0;
  padding: 0;
  border: 0;
  border-radius: 50%;
  background: #fff0ee;
  color: #a03b2d;
  font-size: 13px;
  font-weight: 700;
  line-height: 1;
}
.desk-pet-tile-avatar {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 48px;
  height: 48px;
  overflow: hidden;
  border-radius: 12px;
  background: #fff;
}
.desk-pet-tile-avatar.user-pet { background: #f8eed4; }
.desk-pet-tile-avatar.add-icon { background: #f5efe0; color: var(--gold-ink); }
.desk-pet-tile-img { width: 46px; height: 46px; }
.desk-pet-tile-name {
  width: 100%;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  text-align: center;
  color: var(--ink);
  font-size: 12px;
  font-weight: 750;
}
.desk-pet-tile-pill {
  padding: 2px 7px;
  border-radius: 999px;
  background: #f2eee4;
  color: #6b614d;
  font-size: 10px;
  font-weight: 700;
}
.desk-pet-tile-pill.active {
  background: #ffdc36;
  color: #3a2805;
}
.desk-pet-tile-pill.ready {
  background: #e9f4e6;
  color: #2f6132;
}
.desk-pet-tile-pill.generate {
  background: #fff1c2;
  color: #775412;
}
.desk-pet-tile-pill.add-tag {
  background: transparent;
  color: var(--muted);
  font-weight: 600;
}
.desk-pet-tile-pill.busy { background: #fff1c2; color: #775412; }
.desk-pet-tile-pill.muted { background: #f2eee4; color: #8a8171; }
.desk-pet-current { display: block; margin-top: 7px; color: var(--muted); font-size: 11px; }

.desk-pet-picker-panel { max-height: 80vh; overflow-y: auto; }
.desk-pet-picker-tip { margin: 6px 0 8px; line-height: 1.5; }
.desk-pet-empty {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 9px;
  padding: 18px 0 12px;
}
.desk-pet-profile {
  display: flex;
  align-items: center;
  gap: 10px;
  width: 100%;
  padding: 10px 0;
  border: 0;
  border-top: 1px solid var(--border);
  border-radius: 0;
  background: transparent;
  text-align: left;
}
.desk-pet-profile-avatar {
  display: flex;
  flex: none;
  align-items: center;
  justify-content: center;
  width: 46px;
  height: 46px;
  overflow: hidden;
  border-radius: 12px;
  background: #f8eed4;
}
.desk-pet-profile-name { display: block; color: var(--ink); font-size: 14px; font-weight: 750; }
.desk-pet-profile-error { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; color: #a03b2d; }
.desk-pet-service-error {
  display: flex;
  align-items: center;
  gap: 8px;
  margin: 0 0 4px;
  padding: 8px 10px;
  border-radius: 10px;
  background: #fdf1ee;
}
.desk-pet-load-error { flex: 1; min-width: 0; line-height: 1.45; color: #a03b2d; font-size: 12px; }
.desk-pet-add-link { display: flex; width: 100%; margin-top: 7px; justify-content: center; }

.generate-progress { margin-top: 12px; }
.generate-progress-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
  color: var(--ink);
  font-size: 13px;
  font-weight: 700;
}
.generate-progress-bar {
  height: 6px;
  margin-top: 8px;
  overflow: hidden;
  border-radius: 999px;
  background: #f0ead9;
}
.generate-progress-bar > view {
  height: 100%;
  border-radius: 999px;
  background: #ffcf2e;
  transition: width .3s ease;
}
.generate-progress-hint { margin-top: 8px; line-height: 1.5; }

.generate-pet-modal { max-width: 360px; padding: 16px; border-radius: 18px; }
.generate-modal-title { margin: 0; font-size: 17px; }
.generate-pet-summary {
  display: flex;
  align-items: center;
  gap: 12px;
  margin-top: 12px;
  padding: 10px 12px;
  border: 1px solid #efe4c4;
  border-radius: 13px;
  background: #fffdf6;
}
.generate-pet-name { display: block; color: var(--ink); font-size: 15px; font-weight: 800; }
.generate-pet-photo-state { margin-top: 3px; color: var(--gold-ink); }
.generate-pet-steps { margin-top: 11px; display: flex; flex-direction: column; gap: 6px; }
.generate-step-line { color: var(--ink); font-size: 13px; line-height: 1.5; }
.generate-step-tip {
  padding: 8px 10px;
  border-radius: 10px;
  background: #faf6eb;
  color: var(--muted);
  font-size: 12px;
  line-height: 1.45;
}
.generate-modal-actions {
  display: flex;
  flex-direction: column;
  gap: 8px;
  margin-top: 14px;
}
.generate-modal-actions button { width: 100%; }

.privacy-card { padding-block: 12px 4px; }
.privacy-link { display: flex; align-items: center; justify-content: space-between; width: 100%; min-height: 44px; padding: 7px 0; border: 0; border-radius: 0; background: transparent; text-align: left; }
.logout-link { border-top: 1px solid var(--border); color: #a03b2d; }
</style>
