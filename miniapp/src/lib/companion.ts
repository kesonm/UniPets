import { ref } from 'vue'
import {
  bubbleDuration,
  pickCompanionMessage,
  shanghaiHour,
  timeOfDay,
  type CompanionMessage,
} from '../../../shared/companion.mjs'
import { api, user } from './client'
import { currentDeskPet, deskPetEnabled, deskPetId } from './desk-pet'
import { browseDistrict } from './location'

export type CompanionActionState = { key: string; nonce: number }

export const companionBubble = ref('')
export const companionAction = ref<CompanionActionState | null>(null)

const blockedRoutes = new Set([
  'pages/profile/index',
  'pages/pet-edit/index',
  'pages/stores/index',
  'pages/store-jobs/index',
])

let bubbleTimer: ReturnType<typeof setTimeout> | undefined
let scheduleTimer: ReturnType<typeof setTimeout> | undefined
let started = false
let opening = false
let lastShownAt = 0
let nonce = 0

function currentRoute() {
  const pages = getCurrentPages()
  return pages[pages.length - 1]?.route || ''
}

function recentKey() {
  return 'petcloud.companion.recent.v1.' + (user.value?.id || 'guest')
}

function readRecent(): string[] {
  try {
    const raw = uni.getStorageSync(recentKey())
    if (Array.isArray(raw)) return raw.filter((id): id is string => typeof id === 'string').slice(0, 12)
  } catch {
    /* ignore storage errors */
  }
  return []
}

function remember(id: string) {
  try {
    const next = [id, ...readRecent().filter(item => item !== id)].slice(0, 12)
    uni.setStorageSync(recentKey(), next)
  } catch {
    /* ignore storage errors */
  }
}

function species() {
  return currentDeskPet.value.species === 'dog' ? 'dog' : 'cat'
}

function localMessage(scene: 'open' | 'interval' | 'tap') {
  return pickCompanionMessage({
    species: species(),
    scene,
    when: timeOfDay(shanghaiHour()),
    recentIds: readRecent(),
    weather: null,
    days: null,
    birthday: false,
  })
}

function showMessage(message: CompanionMessage) {
  companionBubble.value = message.text
  companionAction.value = { key: message.action, nonce: ++nonce }
  if (bubbleTimer) clearTimeout(bubbleTimer)
  bubbleTimer = setTimeout(() => {
    companionBubble.value = ''
    bubbleTimer = undefined
  }, bubbleDuration(message.text))
  lastShownAt = Date.now()
  remember(message.id)
}

function clearSchedule() {
  if (scheduleTimer) clearTimeout(scheduleTimer)
  scheduleTimer = undefined
}

function nextInterval() {
  return 180_000 + Math.floor(Math.random() * 120_000)
}

function schedule(delay: number) {
  clearSchedule()
  scheduleTimer = setTimeout(() => { void run() }, delay)
}

async function run() {
  if (!started) return
  if (!getCurrentPages().length) {
    schedule(500)
    return
  }
  if (!deskPetEnabled.value || blockedRoutes.has(currentRoute())) {
    schedule(30_000)
    return
  }
  const scene = opening ? 'open' : 'interval'
  opening = false
  const cityCode = browseDistrict.value?.serviceCityCode
  let response: { message: CompanionMessage; nextIntervalMs?: number } | undefined
  try {
    response = await api<{ message: CompanionMessage; nextIntervalMs?: number }>('/companion/next', 'POST', {
      petId: deskPetId.value,
      scene,
      recent: readRecent(),
      ...(cityCode ? { cityCode } : {}),
    }, 12_000)
  } catch {
    response = { message: localMessage(scene) }
  }
  if (!started) return
  if (!deskPetEnabled.value || blockedRoutes.has(currentRoute())) {
    schedule(30_000)
    return
  }
  showMessage(response.message)
  schedule(response.nextIntervalMs || nextInterval())
}

export function startCompanion() {
  if (started) return
  started = true
  opening = Date.now() - lastShownAt >= 60_000
  companionBubble.value = ''
  clearSchedule()
  schedule(opening ? 1_500 : nextInterval())
}

export function stopCompanion() {
  started = false
  opening = false
  clearSchedule()
  if (bubbleTimer) clearTimeout(bubbleTimer)
  bubbleTimer = undefined
  companionBubble.value = ''
  companionAction.value = null
}

export function tapCompanion() {
  if (!deskPetEnabled.value) return null
  const message = localMessage('tap')
  showMessage(message)
  if (started) schedule(nextInterval())
  return message
}
