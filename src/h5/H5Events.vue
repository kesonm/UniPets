<script setup lang="ts">
import { computed, onMounted, ref, watch } from 'vue'
import { ArrowLeft, ArrowRight, Trophy } from '@element-plus/icons-vue'
import { h5Areas } from '../../shared/h5-areas.mjs'
import { api, ApiError } from '../lib/api'
import type { Pet, User } from '../lib/types'
import { formatProgramTime } from './programs'
import type { H5Event, H5EventRegistration } from './types'

const props = defineProps<{ user: User|null; pets: Pet[]; preferredPetId: string; accountLoading: boolean }>()
const emit = defineEmits<{ back: []; identity: []; login: []; create: []; market: [area: string] }>()
const registrationLabels = { upcoming: '报名未开始', open: '报名中', closed: '报名已截止' }
const speciesLabels = { dog: '犬类', cat: '猫类', other: '其他宠物' }
const events = ref<H5Event[]>([])
const loading = ref(true)
const listError = ref('')
const eventId = ref('')
const detail = ref<(H5Event & { rules: string })|null>(null)
const detailLoading = ref(false)
const detailError = ref('')
const registrations = ref<H5EventRegistration[]>([])
const registrationsLoading = ref(false)
const registrationsError = ref('')
const petId = ref('')
const submitting = ref(false)
const feedback = ref('')
const submitError = ref('')
let detailRevision = 0
let registrationRevision = 0

const venueArea = computed(() => h5Areas.find(area => area.id === detail.value?.area))
const unregisteredPets = computed(() => props.pets.filter(pet =>
  (!detail.value?.species || pet.species === detail.value.species) &&
  !registrations.value.some(registration => registration.petId === pet.id)))

async function loadEvents() {
  loading.value = true
  listError.value = ''
  try {
    const result = await api<{ events: H5Event[] }>('/h5/events')
    events.value = result.events
  } catch (cause) {
    listError.value = cause instanceof Error ? cause.message : '赛事读取失败'
  } finally {
    loading.value = false
  }
}

async function openEvent(id: string) {
  const revision = ++detailRevision
  eventId.value = id
  detail.value = null
  detailError.value = ''
  detailLoading.value = true
  feedback.value = ''
  submitError.value = ''
  window.scrollTo(0, 0)
  try {
    const result = await api<{ event: H5Event & { rules: string } }>('/h5/events/' + id)
    if (revision === detailRevision) detail.value = result.event
  } catch (cause) {
    if (revision === detailRevision) detailError.value = cause instanceof Error ? cause.message : '赛事读取失败'
  } finally {
    if (revision === detailRevision) detailLoading.value = false
  }
}

function goBack() {
  if (!eventId.value) {
    emit('back')
    return
  }
  detailRevision++
  eventId.value = ''
  detail.value = null
  window.scrollTo(0, 0)
  void loadEvents()
}

async function loadRegistrations() {
  const revision = ++registrationRevision
  const selected = detail.value?.id
  registrations.value = []
  registrationsError.value = ''
  registrationsLoading.value = Boolean(selected && props.user)
  if (!selected || !props.user) return
  try {
    const result = await api<{ registrations: H5EventRegistration[] }>('/h5/events/' + selected + '/registrations')
    if (revision === registrationRevision) registrations.value = result.registrations
  } catch (cause) {
    if (revision === registrationRevision) registrationsError.value = cause instanceof Error ? cause.message : '报名记录读取失败'
  } finally {
    if (revision === registrationRevision) registrationsLoading.value = false
  }
}

watch([() => detail.value?.id, () => props.user?.id], () => {
  petId.value = ''
  feedback.value = ''
  submitError.value = ''
  void loadRegistrations()
}, { flush: 'sync' })
watch([unregisteredPets, () => props.preferredPetId], ([pets, preferred]) => {
  if (!pets.some(pet => pet.id === petId.value)) {
    petId.value = pets.find(pet => pet.id === preferred)?.id ?? pets[0]?.id ?? ''
  }
}, { immediate: true })

async function register() {
  const event = detail.value
  const owner = props.user?.id
  if (!event || event.registrationStatus !== 'open' || !owner || submitting.value ||
      !unregisteredPets.value.some(pet => pet.id === petId.value)) return
  submitting.value = true
  feedback.value = ''
  submitError.value = ''
  try {
    const { registration } = await api<{ registration: H5EventRegistration }>('/h5/events/' + event.id + '/registrations', {
      method: 'POST', body: { petId: petId.value },
    })
    if (detail.value?.id !== event.id || props.user?.id !== owner) return
    registrations.value = [registration, ...registrations.value.filter(item => item.petId !== registration.petId)]
    feedback.value = registration.petName + '的报名已提交'
  } catch (cause) {
    if (detail.value?.id !== event.id || props.user?.id !== owner) return
    if (cause instanceof ApiError && (cause.status === 404 || cause.status === 409)) {
      const { event: updated } = await api<{ event: H5Event & { rules: string } }>('/h5/events/' + event.id).catch(() => ({ event: undefined }))
      if (updated && detail.value?.id === event.id) detail.value = updated
    }
    if (detail.value?.id === event.id && props.user?.id === owner) {
      submitError.value = cause instanceof Error ? cause.message : '报名未提交，请重试'
    }
  } finally {
    submitting.value = false
  }
}

onMounted(loadEvents)
</script>

<template>
  <header class="h5-page-head h5-page-head--yellow h5-program-head">
    <button class="h5-program-back" type="button" :aria-label="eventId ? '返回赛事列表' : '返回首页'" @click="goBack"><el-icon><ArrowLeft /></el-icon></button>
    <h1>{{ eventId ? '赛事详情' : '宠物赛事' }}</h1>
  </header>

  <div class="h5-page-content h5-program-stack">
    <template v-if="!eventId">
      <div v-if="loading" class="h5-card h5-empty" role="status">正在读取赛程…</div>
      <div v-else-if="listError" class="h5-card h5-empty" role="status">
        <strong>{{ listError }}</strong>
        <button class="h5-secondary" type="button" @click="loadEvents">重新加载</button>
      </div>
      <template v-else-if="events.length">
        <button v-for="event in events" :key="event.id" class="h5-card h5-program-card h5-event-link" type="button" @click="openEvent(event.id)">
          <span class="h5-event-heading">
            <strong>{{ event.title }}</strong>
            <span class="h5-pill" :class="{ 'h5-event-open':event.registrationStatus==='open' }">{{ registrationLabels[event.registrationStatus] }}</span>
          </span>
          <span class="h5-event-when">{{ formatProgramTime(event.startsAt) }} · {{ event.city }}</span>
          <span class="h5-event-link-text">查看赛事 <el-icon><ArrowRight /></el-icon></span>
        </button>
      </template>
      <div v-else class="h5-card h5-empty">
        <el-icon aria-hidden="true"><Trophy /></el-icon>
        <strong>暂无已发布的赛程</strong>
        <p>赛程发布后，可使用已有宠物档案报名。</p>
        <button class="h5-secondary" type="button" @click="emit('identity')">查看宠物身份证</button>
      </div>
    </template>
    <div v-else-if="detailLoading" class="h5-card h5-empty" role="status">正在读取赛事详情…</div>
    <div v-else-if="detailError" class="h5-card h5-empty" role="status">
      <strong>{{ detailError }}</strong>
      <button class="h5-secondary" type="button" @click="openEvent(eventId)">重新加载</button>
    </div>
    <template v-else-if="detail">
      <section class="h5-card h5-program-card">
        <div class="h5-event-heading">
          <h2>{{ detail.title }}</h2>
          <span class="h5-pill" :class="{ 'h5-event-open':detail.registrationStatus==='open' }">{{ registrationLabels[detail.registrationStatus] }}</span>
        </div>
        <dl class="h5-program-details">
          <dt>比赛时间</dt><dd>{{ formatProgramTime(detail.startsAt) }}</dd>
          <dt>城市与赛场</dt><dd>{{ detail.city }} · {{ detail.venue }}</dd>
          <dt>主办方</dt><dd>{{ detail.organizer }}</dd>
          <template v-if="detail.species"><dt>参赛宠物</dt><dd>{{ speciesLabels[detail.species] }}</dd></template>
          <dt>报名开始</dt><dd>{{ formatProgramTime(detail.registrationOpensAt) }}</dd>
          <dt>报名截止</dt><dd>{{ formatProgramTime(detail.registrationClosesAt) }}</dd>
        </dl>
        <button v-if="venueArea" class="h5-text-button h5-event-market" type="button" @click="emit('market',venueArea.id)">
          查看赛场周边好物 <el-icon><ArrowRight /></el-icon>
        </button>
      </section>
      <section class="h5-card h5-program-card">
        <h2>比赛规则</h2>
        <p class="h5-event-rules">{{ detail.rules }}</p>
      </section>
      <section class="h5-card h5-program-card h5-program-stack">
        <h2>参赛报名</h2>
        <ul v-if="registrations.length" class="h5-event-registrations" aria-label="已提交的报名">
          <li v-for="registration in registrations" :key="registration.petId">
            <span>{{ registration.petName }} <small>· {{ registration.petId.slice(0,8).toUpperCase() }}</small></span>
            <span class="h5-pill">已提交</span>
          </li>
        </ul>
        <p v-if="feedback" class="h5-event-success" role="status">{{ feedback }}</p>
        <p v-if="submitError" class="h5-form-error" role="alert">{{ submitError }}</p>
        <p v-if="detail.registrationStatus!=='open'" class="h5-muted">{{ registrationLabels[detail.registrationStatus] }}</p>
        <p v-else-if="accountLoading || registrationsLoading" class="h5-muted" role="status">正在读取报名信息…</p>
        <button v-else-if="!user" class="h5-primary" type="button" @click="emit('login')">登录报名</button>
        <div v-else-if="registrationsError" role="status">
          <p class="h5-form-error">{{ registrationsError }}</p>
          <button class="h5-text-button" type="button" @click="loadRegistrations">重新读取报名</button>
        </div>
        <form v-else-if="unregisteredPets.length" class="h5-form" @submit.prevent="register">
          <label>参赛宠物档案
            <select v-model="petId" :disabled="submitting" required>
              <option v-for="pet in unregisteredPets" :key="pet.id" :value="pet.id">
                {{ pet.name }} · {{ pet.breed || speciesLabels[pet.species] }} · {{ pet.id.slice(0,8).toUpperCase() }}
              </option>
            </select>
          </label>
          <button class="h5-primary" type="submit" :disabled="submitting || !petId">{{ submitting?'正在提交…':'提交报名' }}</button>
        </form>
        <button v-else-if="!registrations.length" class="h5-secondary" type="button" @click="emit('create')">新建参赛宠物档案</button>
      </section>
    </template>
  </div>
</template>
