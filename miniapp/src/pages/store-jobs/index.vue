<script setup lang="ts">
import { computed, reactive, ref } from 'vue'
import { onLoad } from '@dcloudio/uni-app'
import { servicePhone } from '../../../../shared/h5-discovery.mjs'
import { employmentTypes, jobCategories, jobCategoryLabel, jobCategoryMaxLength, jobCityLabel, jobStatuses, type StoreJob } from '../../../../shared/h5-jobs.mjs'
import LoadState from '../../components/LoadState.vue'
import LoginCard from '../../components/LoginCard.vue'
import PostPhotoPicker from '../../components/PostPhotoPicker.vue'
import UiIcon from '../../components/UiIcon.vue'
import { api, confirm, downloadJobImage, message, toast, user } from '../../lib/client'
import { pageLoad, submitAction } from '../../lib/page'
import { postPhotoLimitMb, readPhoto } from '../../lib/photo'

type Store = {name:string;address:string;phone:string;cityCode:string|null;enabled:boolean}
const storeId = ref('')
const endpoint = computed(() => '/h5/jobs/mine/'+storeId.value)
const store = ref<Store>()
const jobs = ref<StoreJob[]>([])
const showForm = ref(false)
const categoryOptions = [{id:'',label:'选择常用类别'}, ...Object.entries(jobCategories).map(([id,label]) => ({id,label}))]
const typeOptions = Object.entries(employmentTypes).map(([id,label]) => ({id,label}))
const emptyForm = () => ({title:'',category:'',employmentType:'',salary:'',description:''})
const form = reactive(emptyForm())
const categoryIndex = computed(() => Math.max(0, categoryOptions.findIndex(option => option.id && option.label === form.category.trim())))
const photos = ref<string[]>([])
const choosingPhoto = ref(false)
const storeReady = computed(() => Boolean(store.value?.enabled && store.value.address.trim() &&
  jobCityLabel(store.value.cityCode) && servicePhone(store.value.phone)))
const canSubmit = computed(() => storeReady.value && form.title.trim() && form.category.trim() &&
  form.employmentType && form.salary.trim() && form.description.trim())
const page = ref(1)
const hasMore = ref(false)
const paging = ref(false)
let revision = 0

onLoad(options => { storeId.value = options?.storeId || '' })

async function loadJobs(next: number) {
  const current = ++revision
  const result = await api<{store:Store;items:StoreJob[];hasMore:boolean}>(endpoint.value+'?page='+next)
  if (current !== revision) return
  store.value = result.store
  const existing = new Set(jobs.value.map(job => job.id))
  jobs.value = next === 1 ? result.items : [...jobs.value,...result.items.filter(job => !existing.has(job.id))]
  page.value = next
  hasMore.value = result.hasMore
}

const {loading,error,refresh} = pageLoad(async () => {
  if (!user.value) return
  if (!storeId.value) throw new Error('请从我的门店打开招聘管理')
  await loadJobs(1)
}, () => {
  revision++
  store.value = undefined
  jobs.value = []
  hasMore.value = false
  showForm.value = false
  photos.value = []
  Object.assign(form,emptyForm())
})

const {run,busy,error:actionError} = submitAction()

function startJob() {
  Object.assign(form,emptyForm())
  photos.value = []
  actionError.value = ''
  showForm.value = true
}

function chooseCategory(event: {detail:{value:number|string}}) {
  const option = categoryOptions[Number(event.detail.value)]
  if (option?.id) form.category = option.label
}

function viewPhotos(job: StoreJob) {
  void run(async () => {
    const urls = await Promise.all(Array.from({length:job.imageCount}, (_,index) => downloadJobImage(job.storeId,job.id,index+1)))
    uni.previewImage({urls})
  })
}

function submit() {
  if (!canSubmit.value || choosingPhoto.value) return
  void run(async () => {
    const owner = user.value?.id
    const selected = categoryOptions[categoryIndex.value]
    const payload = { ...form, category: selected.id || 'other',
      ...(selected.id ? {} : {customCategory: form.category.trim()}) }
    const images = await Promise.all(photos.value.map(path => readPhoto(path,postPhotoLimitMb)))
    if (!owner || user.value?.id !== owner) return
    await api(endpoint.value,'POST',{...payload,images},35000)
    if (user.value?.id !== owner) return
    Object.assign(form,emptyForm())
    photos.value = []
    showForm.value = false
    toast('岗位已提交审核')
    await refresh()
  })
}

function closeJob(job: StoreJob) {
  const pending = job.status === 'pending'
  const label = pending ? '撤回' : '关闭招聘'
  void run(async () => {
    const owner = user.value?.id
    if (!await confirm(label,'确认'+label+'「'+job.title+'」？') || !owner || user.value?.id !== owner) return
    await api(endpoint.value+'/'+job.id+'/close','PUT',{})
    if (user.value?.id !== owner) return
    toast(pending ? '已撤回' : '招聘已关闭')
    await refresh()
  })
}

async function more() {
  if (paging.value || loading.value || !hasMore.value) return
  paging.value = true
  try {
    await loadJobs(page.value+1)
  } catch (cause) {
    toast(message(cause))
  } finally {
    paging.value = false
  }
}
</script>

<template>
  <view class="screen recruiting-page">
    <LoginCard v-if="!user" />
    <template v-else>
      <LoadState :loading="loading" :error="error" @retry="refresh" />
      <template v-if="store">
        <view class="store-recruiting-summary">
          <view class="store-summary-main">
            <text class="store-summary-name grow">{{ store.name }}</text>
            <button v-if="storeReady && !showForm" id="new-store-job" class="small primary start-job" :disabled="busy || loading" @tap="startJob">
              <UiIcon name="plus" :size="13" />发布岗位
            </button>
          </view>
          <view v-if="store.cityCode || store.address" class="store-summary-address">
            <UiIcon name="location" :size="13" /><text>{{ [jobCityLabel(store.cityCode),store.address].filter(Boolean).join(' · ') }}</text>
          </view>
          <text v-if="store.phone" class="store-summary-phone">{{ store.phone }}</text>
          <text v-if="!storeReady" class="sub">{{ store.enabled ? '请先完善门店城市、地址和联系电话' : '门店已停用' }}</text>
        </view>
        <view v-if="showForm && storeReady" class="store-job-form">
          <text class="job-form-heading">发布岗位</text>
          <view class="job-field">
            <label for="store-job-title" class="label">岗位名称</label>
            <input id="store-job-title" v-model="form.title" :always-embed="true" maxlength="80" placeholder="例如宠物美容师" :disabled="busy" />
          </view>
          <view class="job-field">
            <label for="store-job-category" class="label">岗位类别</label>
            <view class="category-entry">
              <input id="store-job-category" v-model="form.category" :always-embed="true" :maxlength="jobCategoryMaxLength"
                placeholder="输入或选择类别" :disabled="busy" />
              <picker id="store-job-category-picker" mode="selector" :range="categoryOptions" range-key="label"
                :value="categoryIndex" :disabled="busy" aria-label="选择常用岗位类别" @change="chooseCategory">
                <view class="category-trigger">常用类别 <UiIcon name="down" :size="12" /></view>
              </picker>
            </view>
          </view>
          <view class="job-field store-job-form-grid">
            <view>
              <text class="label">用工类型</text>
              <view class="employment-options" role="group" aria-label="用工类型">
                <button v-for="option in typeOptions" :id="'store-job-type-'+option.id" :key="option.id"
                  :class="['employment-option', { selected: form.employmentType === option.id }]"
                  :aria-pressed="form.employmentType === option.id" :disabled="busy" @tap="form.employmentType = option.id">
                  {{ option.label }}
                </button>
              </view>
            </view>
            <view>
              <label for="store-job-salary" class="label">薪资待遇</label>
              <input id="store-job-salary" v-model="form.salary" :always-embed="true" maxlength="40" placeholder="例如 5000 元/月" :disabled="busy" />
            </view>
          </view>
          <view class="job-field job-description-field">
            <label for="store-job-description" class="label">岗位职责与要求</label>
            <textarea id="store-job-description" v-model="form.description" maxlength="2000"
              placeholder="填写工作内容、任职要求和工作时间" :disabled="busy" />
          </view>
          <view class="job-form-photos">
            <PostPhotoPicker v-model="photos" v-model:choosing="choosingPhoto" label="招聘配图" appearance="plain" :disabled="busy" />
          </view>
          <text v-if="actionError" class="error">{{ actionError }}</text>
          <view class="job-form-actions">
            <button class="text-button job-form-cancel" :disabled="busy || choosingPhoto" @tap="showForm=false">取消</button>
            <button id="submit-store-job" class="primary" :disabled="busy || choosingPhoto || !canSubmit" :loading="busy" @tap="submit">提交审核</button>
          </view>
        </view>
        <template v-else>
          <text v-if="actionError" class="error">{{ actionError }}</text>
          <view v-for="job in jobs" :key="job.id" class="recruiting-job">
            <view class="spread">
              <text class="heading grow">{{ job.title }}</text>
              <text :class="['recruiting-status',job.status]">{{ job.internalDemo ? '内部演示' : jobStatuses[job.status] }}</text>
            </view>
            <text class="sub">{{ jobCategoryLabel(job) }} · {{ employmentTypes[job.employmentType] }} · {{ job.salary }}</text>
            <view v-if="job.imageCount || job.status==='pending' || job.status==='published'" class="recruiting-job-actions">
              <button v-if="job.imageCount" class="text-button" :disabled="busy" @tap="viewPhotos(job)">查看配图（{{ job.imageCount }}）</button>
              <button v-if="job.status==='pending' || job.status==='published'" class="text-button" :disabled="busy || loading" @tap="closeJob(job)">
                {{ job.status==='pending' ? '撤回' : '关闭招聘' }}
              </button>
            </view>
          </view>
          <view v-if="!jobs.length && !loading && !error" class="recruiting-empty">还没有发布招聘岗位</view>
          <button v-if="hasMore" class="text-button store-jobs-more" :loading="paging" :disabled="loading || paging" @tap="more">加载更多岗位</button>
        </template>
      </template>
    </template>
  </view>
</template>

<style>
page { background: #fff; }
</style>

<style scoped>
.recruiting-page { padding: 14px 20px calc(22px + env(safe-area-inset-bottom, 0px)); }
.store-recruiting-summary { padding-bottom: 14px; border-bottom: 1px solid var(--border); }
.store-summary-main, .store-summary-address { display: flex; align-items: center; gap: 6px; }
.store-summary-name { display: block; overflow-wrap: anywhere; font-size: 18px; font-weight: 800; }
.store-summary-phone, .store-summary-address { color: var(--muted); font-size: 12px; }
.store-summary-address { align-items: flex-start; margin-top: 6px; }
.store-summary-address text { overflow-wrap: anywhere; }
.store-summary-phone { display: block; margin-top: 3px; }
.store-recruiting-summary .sub { margin-top: 6px; }
.start-job { display: flex; align-items: center; gap: 4px; flex: none; }

.job-form-heading { display: block; margin: 14px 0 3px; font-size: 21px; font-weight: 800; }
.job-field { padding-top: 11px; border-bottom: 1px solid var(--border); }
.job-field .label { margin: 0; color: #4d4434; }
.job-field input, .job-field textarea {
  padding: 0;
  border: 0;
  border-radius: 0;
  background: transparent;
}
.job-field input { height: 41px; }
.job-description-field textarea { height: 78px; margin-top: 8px; line-height: 1.5; }
.store-job-form-grid { display: grid; grid-template-columns: minmax(0,1fr) minmax(0,1fr); gap: 14px; }
.employment-options {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 6px;
}
.employment-option {
  display: flex;
  align-items: center;
  justify-content: center;
  height: 41px;
  padding: 0;
  border: 0;
  border-bottom: 2px solid transparent;
  border-radius: 0;
  background: transparent;
  color: var(--muted);
  font-size: 14px;
}
.employment-option.selected { border-bottom-color: #e0b420; color: var(--gold-ink); }
.category-entry { display: flex; align-items: center; gap: 8px; }
.category-entry input { flex: 1; min-width: 0; width: 0; }
.category-entry picker { flex: none; }
.category-trigger {
  display: flex;
  align-items: center;
  gap: 4px;
  min-height: 40px;
  color: var(--gold-ink);
  font-size: 12px;
  font-weight: 700;
}
.job-form-photos { margin-top: 8px; }
.job-form-actions { display: grid; grid-template-columns: minmax(64px,1fr) minmax(0,3fr); gap: 10px; margin-top: 14px; }
.job-form-actions button { min-height: 44px; border-radius: 22px; }
.job-form-actions .job-form-cancel { color: var(--muted); }

.recruiting-job { padding: 13px 0; border-bottom: 1px solid var(--border); }
.recruiting-job .heading { margin: 0; font-size: 16px; overflow-wrap: anywhere; }
.recruiting-job .sub { margin-top: 5px; }
.recruiting-status { flex: none; color: var(--muted); font-size: 12px; }
.recruiting-status.pending { color: var(--gold-ink); }
.recruiting-status.published { color: #2d6949; }
.recruiting-status.rejected { color: #9c473c; }
.recruiting-job-actions { display: flex; flex-wrap: wrap; gap: 6px 12px; margin-top: 4px; }
.recruiting-job-actions button { padding-left: 0; }
.recruiting-empty { padding: 36px 0; text-align: center; color: var(--muted); }
.store-jobs-more { display: flex; margin: 8px auto 0; }
</style>
