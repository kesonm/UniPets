<script setup lang="ts">
import { onBeforeUnmount, onMounted, ref } from 'vue'
import { ArrowLeft, ArrowRight, Search } from '@element-plus/icons-vue'
import { ElMessage, ElMessageBox } from 'element-plus'
import { employmentTypes, jobCategories, jobCityLabel, jobStatuses, type JobStatus, type StoreJob } from '../../shared/h5-jobs.mjs'
import { api } from '../lib/api'

const endpoint = '/admin/stores/jobs'
const search = ref('')
const keyword = ref('')
const filter = ref('')
const page = ref(1)
const hasMore = ref(false)
const items = ref<StoreJob[]>([])
const loading = ref(false)
const error = ref('')
const working = ref('')
const detail = ref<StoreJob>()
const actionLabels = {published:'审核通过',rejected:'驳回',closed:'下架'}
const statusTones = {pending:'warning',published:'positive',rejected:'warning',closed:'muted'}
let revision = 0
let active = true

async function load() {
  const current = ++revision
  loading.value = true
  error.value = ''
  const query = new URLSearchParams({q:keyword.value,page:String(page.value)})
  if (filter.value) query.set('state',filter.value)
  try {
    const result = await api<{items:StoreJob[];hasMore:boolean}>(endpoint+'?'+query)
    if (current !== revision) return
    if (!result.items.length && page.value > 1) {
      page.value--
      await load()
      return
    }
    items.value = result.items
    hasMore.value = result.hasMore
  } catch (cause) {
    if (current !== revision) return
    items.value = []
    hasMore.value = false
    error.value = cause instanceof Error ? cause.message : '读取岗位失败'
  } finally {
    if (current === revision) loading.value = false
  }
}

function findJobs() {
  keyword.value = search.value.trim()
  page.value = 1
  void load()
}

function movePage(offset: number) {
  page.value += offset
  void load()
}

async function review(job: StoreJob, status: Exclude<JobStatus,'pending'>) {
  if (working.value) return
  working.value = job.id
  const action = actionLabels[status]
  try {
    if (status !== 'published') {
      await ElMessageBox.confirm('确认'+action+'「'+job.title+'」？',action+'岗位',{
        confirmButtonText:action,cancelButtonText:'取消',type:'warning',customClass:'admin-confirm',
      })
    }
    if (!active) return
    await api(endpoint+'/'+job.id,{method:'PATCH',body:{status}})
    if (!active) return
    if (detail.value?.id === job.id) detail.value = undefined
    ElMessage.success(status === 'published' ? '岗位已审核发布' : '岗位已'+action)
    await load()
  } catch (cause) {
    if (active && cause !== 'cancel' && cause !== 'close') {
      ElMessage.error(cause instanceof Error ? cause.message : '操作失败')
      void load()
    }
  } finally {
    working.value = ''
  }
}

onMounted(load)
onBeforeUnmount(() => { active = false; revision++ })
</script>

<template>
  <section class="admin-panel admin-store-jobs" aria-label="招聘岗位" :aria-busy="loading">
    <form class="admin-toolbar" role="search" @submit.prevent="findJobs">
      <div class="admin-search">
        <el-icon aria-hidden="true"><Search /></el-icon>
        <input v-model="search" type="search" maxlength="120" aria-label="搜索岗位、门店或地址" placeholder="搜索岗位、门店或地址"
          @search="!search && keyword && findJobs()">
      </div>
      <select v-model="filter" aria-label="岗位状态" @change="findJobs">
        <option value="">全部状态</option>
        <option v-for="(label,status) in jobStatuses" :key="status" :value="status">{{ label }}</option>
      </select>
      <button class="admin-button" type="submit">搜索</button>
    </form>
    <div v-if="items.length" class="admin-table-scroll" tabindex="0" aria-label="招聘岗位列表">
      <table class="admin-table">
        <thead><tr><th>岗位</th><th>门店</th><th>城市</th><th>薪资</th><th>状态</th><th>操作</th></tr></thead>
        <tbody>
          <tr v-for="job in items" :key="job.id">
            <td><strong>{{ job.title }}</strong><small>{{ jobCategories[job.category] }} · {{ employmentTypes[job.employmentType] }}</small></td>
            <td>{{ job.storeName }}</td>
            <td>{{ jobCityLabel(job.cityCode) || '—' }}</td>
            <td>{{ job.salary }}</td>
            <td><span :class="['admin-status','admin-status-'+statusTones[job.status]]">{{ jobStatuses[job.status] }}</span></td>
            <td>
            <div class="admin-actions">
              <button class="admin-text-button" type="button" @click="detail=job">查看</button>
                <template v-if="job.status==='pending'">
                <button class="admin-text-button" type="button" :disabled="!!working || loading" @click="review(job,'published')">通过</button>
                <button class="admin-text-button admin-text-danger" type="button" :disabled="!!working || loading" @click="review(job,'rejected')">驳回</button>
                </template>
              <button v-if="job.status==='published'" class="admin-text-button admin-text-danger" type="button" :disabled="!!working || loading"
                  @click="review(job,'closed')">下架</button>
              </div>
            </td>
          </tr>
        </tbody>
      </table>
    </div>
    <div v-if="loading && !items.length" class="admin-empty" role="status">正在读取…</div>
    <div v-else-if="error" class="admin-empty" role="alert"><p>{{ error }}</p><button class="admin-button" type="button" @click="load">重试</button></div>
    <div v-else-if="!items.length" class="admin-empty">{{ keyword || filter ? '没有符合条件的岗位' : '暂无招聘岗位' }}</div>
    <footer v-if="items.length" class="admin-pagination">
      <span>本页 {{ items.length }} 条</span>
      <div v-if="page>1 || hasMore">
        <button class="admin-button admin-icon-button" type="button" aria-label="上一页" :disabled="page===1 || loading" @click="movePage(-1)"><el-icon><ArrowLeft /></el-icon></button>
        <span>第 {{ page }} 页</span>
        <button class="admin-button admin-icon-button" type="button" aria-label="下一页" :disabled="!hasMore || loading" @click="movePage(1)"><el-icon><ArrowRight /></el-icon></button>
      </div>
    </footer>
  </section>
  <el-dialog :model-value="Boolean(detail)" title="岗位详情" width="min(540px, 94vw)" @update:model-value="(open: boolean) => { if (!open) detail=undefined }">
    <div v-if="detail" class="admin-job-detail">
      <h3>{{ detail.title }}</h3>
      <p>{{ jobCategories[detail.category] }} · {{ employmentTypes[detail.employmentType] }} · {{ detail.salary }}</p>
      <p>{{ detail.storeName }} · {{ detail.address }} · {{ detail.phone }}</p>
      <p class="admin-job-description">{{ detail.description }}</p>
    </div>
    <template v-if="detail?.status==='pending'" #footer>
      <button class="admin-button" type="button" :disabled="!!working || loading" @click="review(detail,'rejected')">驳回</button>
      <button class="admin-button admin-primary" type="button" :disabled="!!working || loading" @click="review(detail,'published')">审核通过</button>
    </template>
  </el-dialog>
</template>

<style scoped>
.admin-store-jobs { align-self: start; min-width: 0; }
.admin-store-jobs .admin-table-scroll { max-height: 58dvh; }
.admin-store-jobs td:first-child { min-width: 145px; }
.admin-job-detail h3 { margin: 0 0 10px; color: var(--admin-ink); }
.admin-job-detail p { margin: 0 0 8px; }
.admin-job-description { max-height: 42vh; overflow: auto; white-space: pre-wrap; overflow-wrap: anywhere; }
</style>
