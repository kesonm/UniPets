<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import { ArrowLeft, ArrowRight, Document, Location, Menu, Plus, Refresh, Search, SwitchButton } from '@element-plus/icons-vue'
import { ElMessage, ElMessageBox } from 'element-plus'
import { api, ApiError } from '../lib/api'
import type { User } from '../lib/types'
import AdminEditor from './AdminEditor.vue'
import AdminServiceCategories from './AdminServiceCategories.vue'
import AdminStoreCodes from './AdminStoreCodes.vue'
import AdminStoreMap from './AdminStoreMap.vue'
import { canReview, detailTitle, recordAction, sections, tableCells, type AdminRecord, type Store, type StoreOnMap } from './admin'
import './admin.css'

const logo = import.meta.env.BASE_URL + 'assets/brand-mark.png'
const fromHash = () => sections.find(section => location.hash === '#'+section.id) ?? sections[0]
const active = ref(fromHash())
const user = ref<User|null>(null)
const restoring = ref(true)
const sessionBusy = ref(false)
const username = ref('')
const password = ref('')
const loginError = ref('')
const navigationOpen = ref(false)
const records = ref<AdminRecord[]>([])
const loading = ref(false)
const listError = ref('')
const search = ref('')
const keyword = ref('')
const state = ref('')
const page = ref(1)
const hasMore = ref(false)
const working = ref('')
const drawer = ref<{record?:AdminRecord}|null>(null)
const categoryManager = ref(false)
const storeMapOpen = ref(false)
const focusStoreId = ref('')
const rows = computed(() => records.value.map(record => ({record,cells:tableCells(record),action:recordAction(record)})))
const storesOnMap = computed(() => records.value.filter((record):record is StoreOnMap => 'mapPoint' in record))
const createLabel = computed(() => 'create' in active.value ? active.value.create : '')
const drawerTitle = computed(() => {
  if (!drawer.value?.record) return createLabel.value
  if ('hidden' in drawer.value.record) return active.value.id==='posts' ? '查看动态' : '查看作品'
  return '编辑'+active.value.title.slice(0,-2)
})
const errorMessage = (cause: unknown, fallback: string) => cause instanceof Error ? cause.message : fallback
let revision = 0

async function load() {
  if (!user.value) return
  const current = ++revision
  loading.value = true
  listError.value = ''
  const section = active.value.id
  const showingMap = section === 'stores' && storeMapOpen.value
  const filter = new URLSearchParams({q:keyword.value})
  if (!showingMap) filter.set('page',String(page.value))
  if (state.value) filter.set('state',state.value)
  try {
    const result = await api<{items:AdminRecord[];hasMore?:boolean}>('/admin/'+section+(showingMap ? '/map' : '')+'?'+filter)
    if (current !== revision) return
    if (!result.items.length && page.value > 1) {
      page.value--
      return void load()
    }
    records.value = result.items
    hasMore.value = Boolean(result.hasMore)
  } catch (cause) {
    if (current === revision) {
      listError.value = errorMessage(cause,'读取失败')
      records.value = []
      hasMore.value = false
    }
  } finally {
    if (current === revision) loading.value = false
  }
}

function filterRecords() {
  keyword.value = search.value.trim()
  page.value = 1
  void load()
}

function movePage(offset: number) {
  page.value += offset
  void load()
}

function showStoreMap(open: boolean, storeId = '') {
  storeMapOpen.value = open
  focusStoreId.value = storeId
  records.value = []
  filterRecords()
}

function storeHasCoordinates(store: Store) {
  return store.latitude != null && store.longitude != null
}

function navigate() {
  active.value = fromHash()
  navigationOpen.value = false
}
watch(active,() => {
  drawer.value = null
  categoryManager.value = false
  storeMapOpen.value = false
  focusStoreId.value = ''
  records.value = []
  search.value = ''
  state.value = ''
  filterRecords()
})
watch(active,section => { document.title = section.title+' · 宠云管理后台' },{immediate:true})

async function login() {
  if (sessionBusy.value) return
  sessionBusy.value = true
  loginError.value = ''
  try {
    user.value = (await api<{user:User}>('/admin/login',{method:'POST',body:{username:username.value,password:password.value}})).user
    password.value = ''
    void load()
  } catch (cause) {
    loginError.value = errorMessage(cause,'登录失败，请重试')
  } finally {
    sessionBusy.value = false
  }
}

function clearSession() {
  revision++
  user.value = null
  records.value = []
  drawer.value = null
  categoryManager.value = false
  storeMapOpen.value = false
  focusStoreId.value = ''
  loading.value = false
  hasMore.value = false
  password.value = ''
}

function expired() {
  if (!user.value) return
  clearSession()
  loginError.value = '登录已过期，请重新登录'
}

async function logout() {
  if (sessionBusy.value) return
  sessionBusy.value = true
  try {
    await api('/auth/logout',{method:'POST',body:{}})
    clearSession()
    loginError.value = ''
  } catch (cause) {
    if (!(cause instanceof ApiError && cause.status===401)) ElMessage.error(errorMessage(cause,'退出失败'))
  } finally {
    sessionBusy.value = false
  }
}

async function applyAction(record: AdminRecord) {
  const action = recordAction(record)
  if (!action || working.value) return
  const section = active.value.id
  working.value = record.id
  try {
    if (action.notice) {
      await ElMessageBox.confirm(action.notice,action.label+'「'+detailTitle(record)+'」？',{
        confirmButtonText:'确认'+action.label,cancelButtonText:'取消',type:'warning',customClass:'admin-confirm',
      })
    }
    await api('/admin/'+section+'/'+record.id,{method:'PATCH',body:action.body})
    ElMessage.success('已'+action.label)
    if (active.value.id===section) void load()
  } catch (cause) {
    if (cause!=='cancel' && cause!=='close') ElMessage.error(errorMessage(cause,'操作失败'))
  } finally {
    working.value = ''
  }
}

function saved() {
  drawer.value = null
  void load()
  ElMessage.success('已保存')
}

onMounted(async () => {
  window.addEventListener('hashchange',navigate)
  window.addEventListener('petcloud:unauthorized',expired)
  try {
    user.value = (await api<{user:User}>('/admin/me')).user
    void load()
  } catch (cause) {
    if (!(cause instanceof ApiError && cause.status===401)) loginError.value = errorMessage(cause,'读取登录状态失败')
  } finally {
    restoring.value = false
  }
})
onBeforeUnmount(() => {
  window.removeEventListener('hashchange',navigate)
  window.removeEventListener('petcloud:unauthorized',expired)
})
</script>

<template>
  <div v-if="restoring" class="admin-login"><p role="status">正在读取登录状态…</p></div>
  <main v-else-if="!user" class="admin-login">
    <form class="admin-login-card" @submit.prevent="login">
      <span class="admin-logo admin-login-logo"><img :src="logo" alt=""></span>
      <h1>宠云管理后台</h1>
      <label for="admin-username">管理员账号</label>
      <input id="admin-username" v-model.trim="username" autocomplete="username" maxlength="32" required>
      <label for="admin-password">密码</label>
      <input id="admin-password" v-model="password" type="password" autocomplete="current-password" maxlength="128" required>
      <p v-if="loginError" class="admin-error" role="alert">{{ loginError }}</p>
      <button class="admin-button admin-primary" type="submit" :disabled="sessionBusy">{{ sessionBusy ? '正在登录…' : '登录' }}</button>
    </form>
  </main>
  <div v-else class="admin-shell">
    <aside class="admin-sidebar" :class="{'admin-nav-open':navigationOpen}">
      <div class="admin-brand">
        <span class="admin-logo"><img :src="logo" alt=""></span>
        <span><strong>宠云</strong><small>管理后台</small></span>
      </div>
      <nav id="admin-navigation" aria-label="管理模块">
        <a v-for="section in sections" :key="section.id" :href="'#'+section.id"
          :aria-current="active.id===section.id ? 'page' : undefined" @click="navigationOpen=false">
          <el-icon><component :is="section.icon" /></el-icon>
          <span>{{ section.title }}</span>
          <el-icon v-if="active.id===section.id" class="admin-nav-chevron"><ArrowRight /></el-icon>
        </a>
      </nav>
    </aside>

    <div class="admin-workspace">
      <header class="admin-topbar">
        <button class="admin-button admin-nav-toggle admin-icon-button" type="button" aria-label="管理菜单"
          aria-controls="admin-navigation" :aria-expanded="navigationOpen" @click="navigationOpen=!navigationOpen"><el-icon><Menu /></el-icon></button>
        <div class="admin-session">
          <span class="admin-session-avatar" aria-hidden="true">{{ user.displayName.slice(0,1).toUpperCase() }}</span>
          <span class="admin-session-name">{{ user.displayName }}</span>
          <button class="admin-button admin-logout" type="button" :disabled="sessionBusy" @click="logout"><el-icon><SwitchButton /></el-icon>退出</button>
        </div>
      </header>

      <main class="admin-main">
        <header class="admin-page-title">
          <h1>{{ active.title }}</h1>
          <div v-if="createLabel || active.id==='stores'" class="admin-title-actions">
            <button v-if="active.id==='services'" class="admin-button" type="button" @click="categoryManager=true">管理分类</button>
            <button v-if="active.id==='stores'" class="admin-button" type="button" @click="showStoreMap(!storeMapOpen)">
              <el-icon><component :is="storeMapOpen ? Menu : Location" /></el-icon>{{ storeMapOpen ? '门店列表' : '门店地图' }}
            </button>
            <button v-if="createLabel" class="admin-button admin-primary" type="button" @click="drawer={}"><el-icon><Plus /></el-icon>{{ createLabel }}</button>
          </div>
        </header>
        <AdminStoreCodes v-if="active.id==='stores'" @redeemed="load" />
        <section class="admin-panel" :aria-label="storeMapOpen ? '门店地图与筛选' : active.title+'列表'" :aria-busy="loading">
          <form class="admin-toolbar" role="search" @submit.prevent="filterRecords">
            <div class="admin-search">
              <el-icon aria-hidden="true"><Search /></el-icon>
              <input v-model="search" type="search" maxlength="120" :aria-label="active.search" :placeholder="active.search" @search="!search && keyword && filterRecords()">
            </div>
            <select v-model="state" :aria-label="active.id==='pets' ? '宠物种类' : '状态'" @change="filterRecords">
              <option value="">{{ active.id==='pets' ? '全部种类' : '全部状态' }}</option>
              <option v-for="choice in active.filters" :key="choice.id" :value="choice.id">{{ choice.label }}</option>
            </select>
            <button class="admin-button admin-search-submit" type="submit">搜索</button>
            <button class="admin-button admin-icon-button admin-reload" type="button" title="刷新" aria-label="刷新" :disabled="loading"
              @click="load"><el-icon><Refresh /></el-icon></button>
          </form>
          <template v-if="storeMapOpen">
            <div v-if="listError" class="admin-empty" role="alert">
              <p>{{ listError }}</p><button class="admin-button" type="button" @click="load">重试</button>
            </div>
            <AdminStoreMap v-else :stores="storesOnMap" :focus-id="focusStoreId" :loading="loading" />
          </template>
          <template v-else>
          <div class="admin-table-scroll" tabindex="0" :aria-label="active.title+'表格'">
            <table>
              <thead><tr><th v-for="column in active.columns" :key="column" scope="col">{{ column }}</th><th scope="col">操作</th></tr></thead>
              <tbody v-if="rows.length">
                <tr v-for="{record,cells,action} in rows" :key="record.id">
                  <td v-for="(value,index) in cells" :key="index">
                    <span v-if="value.tone" :class="['admin-status','admin-status-'+value.tone]">{{ value.title }}</span>
                    <template v-else>
                      <span :class="{'admin-record-title':index===0}" :title="value.title">{{ value.title }}</span>
                      <small v-if="value.detail" :title="value.detail">{{ value.detail }}</small>
                    </template>
                  </td>
                  <td class="admin-actions">
                    <button v-if="!('bound' in record) && (!('hidden' in record) || canReview(record))" class="admin-text-button" type="button"
                      @click="drawer={record}">{{ 'hidden' in record ? '查看' : '编辑' }}</button>
                    <button v-if="'bound' in record && storeHasCoordinates(record)" class="admin-text-button" type="button"
                      @click="showStoreMap(true,record.id)">查看位置</button>
                    <button v-if="action" class="admin-text-button" :class="{'admin-text-danger':action.notice}" type="button"
                      :disabled="Boolean(working) || loading" @click="applyAction(record)">{{ working===record.id ? '处理中…' : action.label }}</button>
                    <span v-if="'hidden' in record && !canReview(record)" class="admin-muted">—</span>
                  </td>
                </tr>
              </tbody>
            </table>
          </div>
          <div v-if="loading && !rows.length" class="admin-empty" role="status">正在读取…</div>
          <div v-else-if="listError" class="admin-empty" role="alert">
            <p>{{ listError }}</p><button class="admin-button" type="button" @click="load">重试</button>
          </div>
          <div v-else-if="!rows.length" class="admin-empty">
            <span class="admin-empty-icon"><el-icon><Document /></el-icon></span>
            <p>{{ keyword || state ? '没有符合条件的记录' : '暂无记录' }}</p>
          </div>
          <footer class="admin-pagination">
            <span>本页 {{ rows.length }} 条</span>
            <div>
              <button class="admin-button admin-icon-button" type="button" :disabled="page===1 || loading" title="上一页" aria-label="上一页" @click="movePage(-1)"><el-icon><ArrowLeft /></el-icon></button>
              <span>第 {{ page }} 页</span>
              <button class="admin-button admin-icon-button" type="button" :disabled="!hasMore || loading" title="下一页" aria-label="下一页" @click="movePage(1)"><el-icon><ArrowRight /></el-icon></button>
            </div>
          </footer>
          </template>
        </section>
      </main>
    </div>
    <el-drawer :model-value="Boolean(drawer)" :title="drawerTitle" class="admin-drawer" size="min(500px, 100%)" :close-on-click-modal="false"
      @update:model-value="(open: boolean) => { if (!open) drawer=null }">
      <AdminEditor v-if="drawer" :section="active.id" :record="drawer.record"
        @saved="saved" @close="drawer=null" @stale="load" />
    </el-drawer>
    <el-dialog v-model="categoryManager" title="服务分类" width="min(460px, 94vw)" destroy-on-close>
      <AdminServiceCategories @saved="load" />
    </el-dialog>
  </div>
</template>
