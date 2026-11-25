<script setup lang="ts">
import { computed, reactive, ref } from 'vue'
import { onLoad } from '@dcloudio/uni-app'
import { servicePhone } from '../../../../shared/h5-discovery.mjs'
import { employmentTypes, jobCategories, jobCityLabel, jobStatuses, type StoreJob } from '../../../../shared/h5-jobs.mjs'
import ChoiceField from '../../components/ChoiceField.vue'
import LoadState from '../../components/LoadState.vue'
import LoginCard from '../../components/LoginCard.vue'
import { api, confirm, message, toast, user } from '../../lib/client'
import { pageLoad, submitAction } from '../../lib/page'

type Store = {name:string;address:string;phone:string;cityCode:string|null;enabled:boolean}
const storeId = ref('')
const endpoint = computed(() => '/h5/jobs/mine/'+storeId.value)
const store = ref<Store>()
const jobs = ref<StoreJob[]>([])
const showForm = ref(false)
const categoryOptions = Object.entries(jobCategories).map(([id,label]) => ({id,label}))
const typeOptions = Object.entries(employmentTypes).map(([id,label]) => ({id,label}))
const emptyForm = () => ({title:'',category:'',employmentType:'',salary:'',description:''})
const form = reactive(emptyForm())
const storeReady = computed(() => Boolean(store.value?.enabled && store.value.address.trim() &&
  jobCityLabel(store.value.cityCode) && servicePhone(store.value.phone)))
const canSubmit = computed(() => storeReady.value && form.title.trim() && form.category &&
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
  Object.assign(form,emptyForm())
})

const {run,busy,error:actionError} = submitAction()

function submit() {
  if (!canSubmit.value) return
  void run(async () => {
    const owner = user.value?.id
    await api(endpoint.value,'POST',{...form})
    if (!owner || user.value?.id !== owner) return
    Object.assign(form,emptyForm())
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
          <view class="spread">
            <text class="heading">{{ store.name }}</text>
            <button v-if="storeReady && !showForm" id="new-store-job" class="small primary" :disabled="busy || loading" @tap="showForm=true">发布岗位</button>
          </view>
          <text class="sub">{{ [jobCityLabel(store.cityCode),store.address,store.phone].filter(Boolean).join(' · ') }}</text>
          <text v-if="!storeReady" class="sub">{{ store.enabled ? '请先完善门店城市、地址和联系电话' : '门店已停用' }}</text>
        </view>
        <view v-if="showForm && storeReady" class="card">
          <text class="label">岗位名称</text>
          <input id="store-job-title" v-model="form.title" :always-embed="true" maxlength="80" placeholder="例如宠物美容师" />
          <view class="store-job-form-grid">
            <view>
              <text class="label">岗位类别</text>
              <ChoiceField v-model="form.category" :options="categoryOptions" placeholder="选择岗位类别" />
            </view>
            <view>
              <text class="label">用工类型</text>
              <ChoiceField v-model="form.employmentType" :options="typeOptions" placeholder="选择用工类型" />
            </view>
          </view>
          <text class="label">薪资待遇</text>
          <input id="store-job-salary" v-model="form.salary" :always-embed="true" maxlength="40" placeholder="例如 5000–7000 元/月" />
          <text class="label">岗位职责与要求</text>
          <textarea id="store-job-description" v-model="form.description" maxlength="2000" placeholder="填写工作内容、任职要求和工作时间" />
          <text v-if="actionError" class="error">{{ actionError }}</text>
          <view class="actions">
            <button :disabled="busy" @tap="showForm=false">取消</button>
            <button id="submit-store-job" class="primary" :disabled="busy || !canSubmit" :loading="busy" @tap="submit">提交审核</button>
          </view>
        </view>
        <template v-else>
          <text v-if="actionError" class="error">{{ actionError }}</text>
          <view v-for="job in jobs" :key="job.id" class="card">
            <view class="spread">
              <text class="heading">{{ job.title }}</text>
              <text :class="['recruiting-status',job.status]">{{ jobStatuses[job.status] }}</text>
            </view>
            <text class="sub">{{ jobCategories[job.category] }} · {{ employmentTypes[job.employmentType] }} · {{ job.salary }}</text>
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
.store-recruiting-summary .sub { margin-top: 6px; }
.store-job-form-grid { display: grid; grid-template-columns: minmax(0,1fr) minmax(0,1fr); gap: 8px; }
.recruiting-status { flex: none; padding: 3px 7px; border-radius: 8px; color: #66543e; background: #f1ede5; font-size: 11px; }
.recruiting-status.pending { color: #73521b; background: #fff2c9; }
.recruiting-status.published { color: #2d6949; background: #e5f2e7; }
.recruiting-status.rejected { color: #9c473c; background: #fae9e5; }
.store-job-close { margin-top: 9px; }
.store-jobs-more { width: 100%; }
</style>
