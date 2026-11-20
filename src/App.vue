<script setup lang="ts">
import { ref, onMounted, onBeforeUnmount } from 'vue'
import { ArrowDown, ArrowRight, CollectionTag, Cpu, Headset, MagicStick, Menu } from '@element-plus/icons-vue'
import { api, ApiError } from './lib/api'
import { ElMessage } from 'element-plus'
import type { User } from './lib/types'
import Workspace from './components/Workspace.vue'
const activeMenu = ref('')
const dialogVisible = ref(false)
const mobileMenuOpen = ref(false)
const username = ref('')
const password = ref('')
const confirmPassword = ref('')
const notice = ref('')
const serverNotice = ref('')
const authMode = ref<'login'|'register'>('login')
const user = ref<User|null>(null)
const authBusy = ref(false)
const restoring = ref(true)
const workspaceKey = ref(0)
const workspaceTarget = ref('overview')
const assetBase = import.meta.env.BASE_URL
const productItems = [
  { title: '宠物动作素材', desc: '查看已保存的宠物动作', target: '#feature-digital' },
  { title: '云上记忆空间', desc: '珍藏照片、视频与成长档案', target: '#feature-memory' },
  { title: '虚拟互动体验', desc: '让数字宠物拥有更多陪伴方式', target: '#services' },
]

const creationItems = [
  { title: '动作素材预览', desc: '查看爱宠的日常动作', target: '#feature-digital' },
  { title: '宠物故事工坊', desc: '创作漫画、影像与成长故事', target: '#feature-story' },
  { title: '云端记忆整理', desc: '把重要时刻归档成宠物记忆', target: '#feature-memory' },
]

const shopItems = [
  { title: '数字创作服务', desc: '查看宠物影像与故事服务', target: '#marketplace' },
  { title: '会员成长权益', desc: '查看云空间与创作会员方案', target: '#marketplace' },
  { title: '宠物友好体验', desc: '预约线下空间与主题活动', target: '#marketplace' },
]


function goTo(id: string) {
  activeMenu.value = ''; mobileMenuOpen.value = false
  const target: Record<string,string> = { '#home':'overview', '#feature-digital':'creation', '#feature-memory':'memories' }
  if(id in target) { workspaceTarget.value=target[id]; workspaceKey.value++; if(!user.value&&id!=='#home')openAuth('register'); return }
  ElMessage.info('这项服务正在筹备中，请先体验宠物档案和动作素材。')
}
function openAuth(mode: 'login'|'register') {
  authMode.value = mode; notice.value = ''; dialogVisible.value = true
}
async function submitSignup() {
  if(authBusy.value)return
  if(authMode.value==='register' && password.value!==confirmPassword.value) { notice.value='两次输入的密码不一致'; return }
  authBusy.value=true; notice.value=''
  try {
    const result = await api<{user:User}>(`/auth/${authMode.value}`, { method:'POST',body:{username:username.value,password:password.value} })
    user.value=result.user; dialogVisible.value=false; password.value=''; confirmPassword.value=''; serverNotice.value=''
  } catch(error) { notice.value=error instanceof Error ? error.message : '登录失败' }
  finally { authBusy.value=false }
}
function clearSession() { user.value=null; password.value=''; dialogVisible.value=false }
async function logout() {
  try { await api('/auth/logout',{method:'POST',body:{}}); clearSession() }
  catch(error) { if(error instanceof ApiError && error.status===401)clearSession(); else serverNotice.value=error instanceof Error ? error.message : '退出失败，请重试' }
}
function escape(event: KeyboardEvent) { if(event.key==='Escape')dialogVisible.value=false }
onMounted(async()=>{
  window.addEventListener('petcloud:unauthorized',clearSession); window.addEventListener('keydown',escape)
  try { user.value=(await api<{user:User}>('/auth/me')).user }
  catch(error) { if(!(error instanceof ApiError) || error.status!==401)serverNotice.value=error instanceof Error ? error.message : '服务不可用' }
  finally { restoring.value=false }
})
onBeforeUnmount(()=>{window.removeEventListener('petcloud:unauthorized',clearSession);window.removeEventListener('keydown',escape)})
</script>
<template>
  <div class="site-shell">
    <header class="topbar">
      <div class="nav-inner">
        <a class="brand" href="#home" aria-label="宠物数字永生•云上空间首页" @click.prevent="goTo('#home')">
          <span class="brand-mark"><img :src="`${assetBase}assets/brand-mark.png`" alt="" /></span>
          <span class="brand-name">宠物数字永生•云上空间</span>
        </a>

        <button class="mobile-toggle" aria-label="打开菜单" @click="mobileMenuOpen = !mobileMenuOpen">
          <el-icon><Menu /></el-icon>
        </button>

        <nav class="main-nav" :class="{ 'is-open': mobileMenuOpen }" aria-label="主导航">
          <el-dropdown trigger="click" @command="goTo">
            <button class="nav-link">产品功能 <el-icon><ArrowDown /></el-icon></button>
            <template #dropdown>
              <el-dropdown-menu class="nav-dropdown">
                <el-dropdown-item v-for="item in productItems" :key="item.title" :command="item.target"><span class="dropdown-copy"><strong>{{ item.title }}</strong><small>{{ item.desc }}</small></span></el-dropdown-item>
              </el-dropdown-menu>
            </template>
          </el-dropdown>
          <el-dropdown trigger="click" @command="goTo">
            <button class="nav-link">宠物创作 <el-icon><ArrowDown /></el-icon></button>
            <template #dropdown>
              <el-dropdown-menu class="nav-dropdown">
                <el-dropdown-item v-for="item in creationItems" :key="item.title" :command="item.target"><span class="dropdown-copy"><strong>{{ item.title }}</strong><small>{{ item.desc }}</small></span></el-dropdown-item>
              </el-dropdown-menu>
            </template>
          </el-dropdown>
          <el-dropdown trigger="click" @command="goTo">
            <button class="nav-link">宠物服务 <el-icon><ArrowDown /></el-icon></button>
            <template #dropdown>
              <el-dropdown-menu class="nav-dropdown">
                <el-dropdown-item command="#services"><span class="dropdown-copy"><strong>线下体验服务</strong><small>预约宠物友好空间与活动</small></span></el-dropdown-item>
                <el-dropdown-item command="#services"><span class="dropdown-copy"><strong>门店服务网络</strong><small>连接身边的宠物友好商家</small></span></el-dropdown-item>
              </el-dropdown-menu>
            </template>
          </el-dropdown>
          <el-dropdown trigger="click" @command="goTo">
            <button class="nav-link">商城 <el-icon><ArrowDown /></el-icon></button>
            <template #dropdown>
              <el-dropdown-menu class="nav-dropdown">
                <el-dropdown-item v-for="item in shopItems" :key="item.title" :command="item.target"><span class="dropdown-copy"><strong>{{ item.title }}</strong><small>{{ item.desc }}</small></span></el-dropdown-item>
              </el-dropdown-menu>
            </template>
          </el-dropdown>
          <el-dropdown trigger="click" @command="goTo">
            <button class="nav-link">合作计划 <el-icon><ArrowDown /></el-icon></button>
            <template #dropdown>
              <el-dropdown-menu>
                <el-dropdown-item command="#partners">门店合作</el-dropdown-item>
                <el-dropdown-item command="#partners">达人计划</el-dropdown-item>
              </el-dropdown-menu>
            </template>
          </el-dropdown>
        </nav>

        <div class="nav-actions">
          <span class="nav-divider"></span>
          <template v-if="user">
            <button class="nav-link" @click="goTo('#home')">{{ user.displayName }} 的工作台</button>
            <el-button class="register-button" @click="logout">退出</el-button>
          </template>
          <template v-else>
            <button class="nav-link login-link" @click="openAuth('login')">登录</button>
            <el-button class="register-button" @click="openAuth('register')">注册</el-button>
          </template>
        </div>
      </div>
    </header>

    <main id="home">
      <div v-if="serverNotice" class="service-notice" role="alert">{{ serverNotice }} <button @click="serverNotice = ''">关闭</button></div>
      <div v-if="restoring" class="session-restoring">正在恢复登录状态…</div>
      <section v-if="!user" class="hero">
        <div class="hero-image" role="img" aria-label="黄白色渐变背景"></div>
        <div class="hero-shade"></div>
        <div class="hero-content">
          <div class="hero-feature-grid" aria-label="宠物云档案功能">
            <button class="hero-feature-card" @click="openAuth('register')">
              <span class="hero-feature-icon"><el-icon><CollectionTag /></el-icon></span>
              <span class="hero-feature-copy"><strong>创建宠物档案</strong><small>资料与健康信息集中管理</small></span>
              <span class="hero-feature-route" aria-hidden="true"><i></i></span><el-icon class="hero-feature-arrow"><ArrowDown /></el-icon>
            </button>
            <button class="hero-feature-card" @click="openAuth('register')">
              <span class="hero-feature-icon"><el-icon><MagicStick /></el-icon></span>
              <span class="hero-feature-copy"><strong>预览动作素材</strong><small>查看已保存的宠物动作</small></span>
              <span class="hero-feature-route" aria-hidden="true"><i></i></span><el-icon class="hero-feature-arrow"><ArrowDown /></el-icon>
            </button>
            <button class="hero-feature-card" @click="openAuth('register')">
              <span class="hero-feature-icon"><el-icon><Cpu /></el-icon></span>
              <span class="hero-feature-copy"><strong>珍藏成长记忆</strong><small>照片、视频与重要日期归档</small></span>
              <span class="hero-feature-route" aria-hidden="true"><i></i></span><el-icon class="hero-feature-arrow"><ArrowDown /></el-icon>
            </button>
            <button class="hero-feature-card" @click="openAuth('register')">
              <span class="hero-feature-icon"><el-icon><Headset /></el-icon></span>
              <span class="hero-feature-copy"><strong>宠物友好服务</strong><small>发现周边体验与线下服务</small></span>
              <span class="hero-feature-route" aria-hidden="true"><i></i></span><el-icon class="hero-feature-arrow"><ArrowDown /></el-icon>
            </button>
          </div>
        </div>
      </section>

      <Workspace v-else :key="workspaceKey" :user="user" :initial-section="workspaceTarget" @user-update="user = $event" @logout="clearSession" />

    </main>

    <Teleport to="body">
      <Transition name="auth-slide"><div v-if="dialogVisible" class="auth-overlay" @click.self="dialogVisible = false">
      <form class="auth-panel" aria-label="用户登录注册" @submit.prevent="submitSignup">
        <div class="auth-panel-top">
          <div class="auth-brand-mark"><img :src="`${assetBase}assets/brand-mark.png`" alt="" /></div>
          <button type="button" class="auth-close" aria-label="关闭登录面板" @click="dialogVisible = false">×</button>
        </div>
        <div class="auth-switch"><button type="button" :class="{ active: authMode === 'login' }" @click="openAuth('login')">登录</button><button type="button" :class="{ active: authMode === 'register' }" @click="openAuth('register')">注册</button></div>
        <div class="auth-fields">
          <el-input v-model="username" aria-label="账号" placeholder="账号：3–32 位字母、数字或下划线" autocomplete="username" maxlength="32" size="large" />
          <el-input v-model="password" aria-label="密码" type="password" show-password placeholder="请输入密码（至少 8 位）" :autocomplete="authMode === 'login' ? 'current-password' : 'new-password'" maxlength="128" size="large" />
          <el-input v-if="authMode === 'register'" v-model="confirmPassword" aria-label="确认密码" type="password" show-password placeholder="再次输入密码" autocomplete="new-password" maxlength="128" size="large" />
        </div>
        <p v-if="notice" class="form-notice" role="alert">{{ notice }}</p>
        <el-button native-type="submit" class="gold-button dialog-submit" :loading="authBusy">{{ authMode === 'login' ? '登录并进入工作台' : '注册并进入工作台' }} <el-icon><ArrowRight /></el-icon></el-button>
        <p class="auth-footnote">宠物档案与素材将保存在你的专属账号中</p>
      </form>
      </div></Transition>
    </Teleport>
  </div>
</template>
