<script setup lang="ts">
import { computed, reactive, ref } from 'vue'
import { onLoad } from '@dcloudio/uni-app'
import { servicePhone } from '../../../../shared/h5-discovery.mjs'
import { employmentTypes, jobCategories, jobCategoryLabel, jobCategoryMaxLength, jobCityLabel, jobStatuses, type StoreJob } from '../../../../shared/h5-jobs.mjs'
import ChoiceField from '../../components/ChoiceField.vue'
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
  <view class="screen">
    <LoginCard v-if="!user" />
    <template v-else>
      <LoadState :loading="loading" :error="error" @retry="refresh" />
      <template v-if="store">
        <view class="card store-recruiting-summary">
          <view class="store-summary-main">
            <view class="store-summary-icon"><UiIcon name="entry-jobs" :size="20" /></view>
            <view class="grow">
              <text class="store-summary-name">{{ store.name }}</text>
              <text v-if="store.phone" class="store-summary-phone">{{ store.phone }}</text>
            </view>
            <button v-if="storeReady && !showForm" id="new-store-job" class="small primary start-job" :disabled="busy || loading" @tap="startJob">
              <UiIcon name="plus" :size="13" />发布岗位
            </button>
          </view>
          <view v-if="store.cityCode || store.address" class="store-summary-address">
            <UiIcon name="location" :size="13" /><text>{{ [jobCityLabel(store.cityCode),store.address].filter(Boolean).join(' · ') }}</text>
          </view>
          <text v-if="!storeReady" class="sub">{{ store.enabled ? '请先完善门店城市、地址和联系电话' : '门店已停用' }}</text>
        </view>
        <view v-if="showForm && storeReady" class="card store-job-form">
          <text class="job-form-heading">发布岗位</text>
          <label for="store-job-title" class="label">岗位名称</label>
          <input id="store-job-title" v-model="form.title" :always-embed="true" maxlength="80" placeholder="例如宠物美容师" :disabled="busy" />
          <label for="store-job-category" class="label">岗位类别</label>
          <view class="category-entry">
            <input id="store-job-category" v-model="form.category" :always-embed="true" :maxlength="jobCategoryMaxLength"
              placeholder="输入岗位类别" :disabled="busy" />
            <picker id="store-job-category-picker" mode="selector" :range="categoryOptions" range-key="label"
              :value="categoryIndex" :disabled="busy" aria-label="选择常用岗位类别" @change="chooseCategory">
              <view class="category-trigger">常用类别 <UiIcon name="down" :size="12" /></view>
            </picker>
          </view>
          <view class="store-job-form-grid">
            <view>
              <text class="label">用工类型</text>
              <ChoiceField v-model="form.employmentType" :options="typeOptions" placeholder="请选择" :disabled="busy" />
            </view>
            <view>
              <label for="store-job-salary" class="label">薪资待遇</label>
              <input id="store-job-salary" v-model="form.salary" :always-embed="true" maxlength="40" placeholder="例如 5000 元/月" :disabled="busy" />
            </view>
          </view>
          <label for="store-job-description" class="label">岗位职责与要求</label>
          <textarea id="store-job-description" v-model="form.description" maxlength="2000"
            placeholder="填写工作内容、任职要求和工作时间" :disabled="busy" />
          <view class="job-form-photos">
            <PostPhotoPicker v-model="photos" v-model:choosing="choosingPhoto" label="招聘配图" :disabled="busy" />
          </view>
          <text v-if="actionError" class="error">{{ actionError }}</text>
          <view class="job-form-actions">
            <button :disabled="busy || choosingPhoto" @tap="showForm=false">取消</button>
            <button id="submit-store-job" class="primary" :disabled="busy || choosingPhoto || !canSubmit" :loading="busy" @tap="submit">提交审核</button>
          </view>
        </view>
        <template v-else>
          <text v-if="actionError" class="error">{{ actionError }}</text>
          <view v-for="job in jobs" :key="job.id" class="card">
            <view class="spread">
              <text class="heading">{{ job.title }}</text>
              <text :class="['recruiting-status',job.status]">{{ job.internalDemo ? '内部演示' : jobStatuses[job.status] }}</text>
            </view>
            <text class="sub">{{ jobCategoryLabel(job) }} · {{ employmentTypes[job.employmentType] }} · {{ job.salary }}</text>
            <button v-if="job.imageCount" class="small store-job-close" :disabled="busy" @tap="viewPhotos(job)">查看配图（{{ job.imageCount }}）</button>
            <button v-if="job.status==='pending' || job.status==='published'" class="small store-job-close" :disabled="busy || loading" @tap="closeJob(job)">
              {{ job.status==='pending' ? '撤回' : '关闭招聘' }}
            </button>
          </view>
          <view v-if="!jobs.length && !loading && !error" class="card empty-card">还没有发布招聘岗位</view>
          <button v-if="hasMore" class="small store-jobs-more" :loading="paging" :disabled="loading || paging" @tap="more">加载更多岗位</button>
        </template>
      </template>
    </template>
  </view>
</template>

<style scoped>
.store-recruiting-summary { padding: 12px; background: linear-gradient(125deg, #fff4c9, #fffdf7 82%); border-color: #efdfad; }
.store-summary-main, .store-summary-address { display: flex; align-items: center; gap: 8px; }
.store-summary-icon { display: grid; place-items: center; flex: none; width: 38px; height: 38px; border-radius: 12px; background: #fbe7a0; }
.store-summary-name { display: block; overflow-wrap: anywhere; color: var(--ink); font-size: 17px; font-weight: 800; }
.store-summary-phone, .store-summary-address { color: var(--muted); font-size: 12px; }
.store-summary-address { align-items: flex-start; margin-top: 8px; }
.store-summary-address text { overflow-wrap: anywhere; }
.store-recruiting-summary .sub { margin-top: 7px; }
.start-job { display: flex; align-items: center; gap: 4px; flex: none; }
.store-job-form { padding: 13px 14px 14px; }
.job-form-heading { display: block; margin-bottom: 12px; color: var(--ink); font-size: 17px; font-weight: 800; }
.store-job-form > .label:first-of-type { margin-top: 0; }
.store-job-form .label { color: #4d4434; }
.store-job-form-grid { display: grid; grid-template-columns: minmax(0,1fr) minmax(0,1fr); gap: 10px; }
.category-entry {
  display: flex;
  align-items: center;
  border: 1px solid #e7dfcb;
  border-radius: 9px;
  background: #fffdf7;
}
.category-entry input { flex: 1; min-width: 0; width: 0; border: 0; background: transparent; }
.category-entry picker { flex: none; }
.category-trigger {
  display: flex;
  align-items: center;
  gap: 5px;
  min-height: 29px;
  padding: 0 9px;
  border-left: 1px solid #ede3c8;
  color: var(--gold-ink);
  font-size: 12px;
  font-weight: 700;
}
.job-form-photos { border-top: 1px solid var(--border); margin-top: 12px; }
.job-form-actions { display: grid; grid-template-columns: minmax(72px, 1fr) minmax(0, 3fr); gap: 9px; margin-top: 14px; }
.job-form-actions button { min-height: 42px; border-radius: 22px; }
.recruiting-status { flex: none; padding: 3px 7px; border-radius: 8px; color: #66543e; background: #f1ede5; font-size: 11px; }
.recruiting-status.pending { color: #73521b; background: #fff2c9; }
.recruiting-status.published { color: #2d6949; background: #e5f2e7; }
.recruiting-status.rejected { color: #9c473c; background: #fae9e5; }
.store-job-close { margin-top: 9px; }
.store-jobs-more { width: 100%; }
</style>
