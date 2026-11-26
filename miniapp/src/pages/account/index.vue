<script setup lang="ts">
import { computed, ref } from 'vue'
import { onHide, onShareAppMessage } from '@dcloudio/uni-app'
import type { H5Order, WalletSummary } from '../../../../src/h5/business'
import type { PersonalContentCounts, PersonalContentTab } from '../../../../src/h5/types'
import { api, go, user } from '../../lib/client'
import { listPets } from '../../lib/pets'
import { pageLoad } from '../../lib/page'
import { useTabPage } from '../../lib/tab-page'
import { orderPanel } from '../../lib/cart'
import AccountAvatar from '../../components/AccountAvatar.vue'
import LoginDialog from '../../components/LoginDialog.vue'
import UiIcon from '../../components/UiIcon.vue'

type StatItem = { id: string; label: string; value: number; icon?: string; heart?: boolean; run: () => void }
type FunctionItem = { id: string; title: string; sub: string; icon: string; share?: boolean }

const tabLayout = useTabPage('pages/account/index')
const loginDialog = ref(false)
const help = ref(false)
const petCount = ref(0)
const points = ref(0)
const orders = ref<H5Order[]>([])
const emptyCounts: PersonalContentCounts = { published: 0, likes: 0, favorites: 0 }
const counts = ref<PersonalContentCounts>(emptyCounts)

const quickItems = computed(() => [
  { id: 'pets', title: '我的宠物', sub: `${petCount.value} 只`, icon: 'account-pets' },
  { id: 'published', title: '我的发布', sub: `${counts.value.published} 条`, icon: 'account-published' },
  { id: 'orders', title: '我的订单', sub: `${orders.value.length} 笔`, icon: 'account-orders' },
])

const statItems = computed<StatItem[]>(() => [
  { id: 'pets', label: '宠物', value: petCount.value, icon: 'account-pets-white', run: openPets },
  { id: 'published', label: '发布', value: counts.value.published, icon: 'account-published-white', run: () => openContent('published') },
  { id: 'likes', label: '点赞', value: counts.value.likes, heart: true, run: () => openContent('likes') },
  { id: 'favorites', label: '收藏', value: counts.value.favorites, icon: 'account-favorites-white', run: () => openContent('favorites') },
  { id: 'points', label: '积分', value: points.value, icon: 'account-assets-white', run: () => openActivity('assets') },
])

const orderItems = computed(() => {
  const totals = { submitted: 0, confirmed: 0, completed: 0, support: 0 }
  for (const order of orders.value) {
    if (order.status === 'submitted') totals.submitted++
    else if (order.status === 'confirmed') totals.confirmed++
    else if (order.status === 'completed') totals.completed++
    if (order.status !== 'cancelled' && order.supportMessage && !order.supportResolved) totals.support++
  }
  return [
    { id: 'submitted', label: '待确认', icon: 'account-orders', count: totals.submitted },
    { id: 'confirmed', label: '已确认', icon: 'account-appointments', count: totals.confirmed },
    { id: 'completed', label: '已完成', icon: 'account-published', count: totals.completed },
    { id: 'support', label: '售后', icon: 'account-help', count: totals.support },
  ]
})

const functionItems: FunctionItem[] = [
  { id: 'stores', title: '我的门店', sub: '管理绑定门店', icon: 'entry-services' },
  { id: 'appointments', title: '预约记录', sub: '服务与活动', icon: 'account-appointments' },
  { id: 'learning', title: '我的课程', sub: '学习与考证', icon: 'account-learning' },
  { id: 'assets', title: '资产中心', sub: '积分与素材', icon: 'account-assets' },
  { id: 'share', title: '推荐给好友', sub: '一起记录日常', icon: 'entry-friends', share: true },
  { id: 'help', title: '帮助与客服', sub: '使用与售后', icon: 'account-help' },
]

const { error: loadError, refresh } = pageLoad(async () => {
  const owner = user.value?.id
  if (!owner) {
    petCount.value = 0
    points.value = 0
    orders.value = []
    counts.value = emptyCounts
    return
  }
  const [pets, content, orderResult, wallet] = await Promise.all([
    listPets(),
    api<{ counts: PersonalContentCounts }>('/h5/posts/mine/counts'),
    api<{ orders: H5Order[] }>('/h5/orders').catch(() => ({ orders: [] as H5Order[] })),
    api<WalletSummary>('/h5/wallet').catch(() => null),
  ])
  if (user.value?.id !== owner) return
  petCount.value = pets.length
  counts.value = content.counts
  orders.value = orderResult.orders
  points.value = wallet?.balances.points || 0
}, () => {
  petCount.value = 0
  points.value = 0
  orders.value = []
  counts.value = emptyCounts
})

function requireLogin() {
  if (user.value) return true
  loginDialog.value = true
  return false
}

function editProfile() {
  if (requireLogin()) go('profile')
}

function openPets() {
  if (requireLogin()) go('pets')
}

function openContent(tab: PersonalContentTab) {
  if (requireLogin()) go('my-content', { tab })
}

function openOrders() {
  if (!requireLogin()) return
  orderPanel.value = 'orders'
  go('orders')
}

function openStores() {
  if (requireLogin()) go('stores')
}

function openActivity(panel: 'appointments' | 'learning' | 'assets') {
  if (requireLogin()) go('activity', { panel })
}

function openQuick(id: string) {
  if (id === 'pets') return openPets()
  if (id === 'published') return openContent('published')
  return openOrders()
}

function openFunction(item: FunctionItem) {
  if (item.share) return
  if (item.id === 'stores') return openStores()
  if (item.id === 'appointments') return openActivity('appointments')
  if (item.id === 'learning') return openActivity('learning')
  if (item.id === 'assets') return openActivity('assets')
  if (item.id === 'help') {
    help.value = true
  }
}

function openBanner() {
  if (requireLogin()) go('profile')
}

onHide(() => {
  help.value = false
})
onShareAppMessage(() => ({
  title: '拼宠宠 · 记录和宠物的每一天',
  path: '/pages/home/index',
}))
</script>

<template>
  <view class="account-page tab-screen" :style="tabLayout">
    <view class="account-head">
      <view class="tab-leading account-profile">
        <button id="account-avatar" class="account-avatar-button" :aria-label="user ? '编辑资料' : '点击登录'" @tap="editProfile">
          <AccountAvatar :size="68" />
          <view class="account-avatar-plus"><UiIcon name="plus" :size="10" /></view>
        </button>
        <view class="account-identity" @tap="editProfile">
          <view class="account-name-row">
            <text class="account-name">{{ user?.displayName || '未登录' }}</text>
            <text v-if="user" class="account-badge">铲屎官</text>
          </view>
          <text v-if="user?.publicId" class="account-id">ID {{ user.publicId }}</text>
          <text class="account-caption">{{ user ? '记录和宠物的每一天' : '登录后保存宠物档案和创作' }}</text>
        </view>
        <button v-if="!user" id="open-wechat-login" class="small primary account-login" @tap="loginDialog = true">登录 / 注册</button>
        <button v-else id="edit-account-profile" class="account-settings" aria-label="设置" @tap="editProfile">
          <UiIcon name="account-settings" :size="20" />
        </button>
      </view>

      <view class="account-stats">
        <button v-for="item in statItems" :id="'account-stat-' + item.id" :key="item.id" class="account-stat" :aria-label="item.label + ' ' + item.value" @tap="item.run">
          <text v-if="item.heart" class="account-stat-heart" aria-hidden="true">♡</text>
          <UiIcon v-else :name="item.icon || 'account-assets-white'" :size="16" />
          <text class="account-stat-value">{{ item.value }}</text>
          <text class="account-stat-label">{{ item.label }}</text>
        </button>
      </view>
    </view>

    <view class="account-content">
      <view v-if="loadError" class="account-error">
        <text class="error">{{ loadError }}</text>
        <button class="text-button" @tap="refresh">重试</button>
      </view>

      <button class="account-banner" @tap="openBanner">
        <view class="account-banner-copy">
          <text class="account-banner-kicker">专属桌宠</text>
          <text class="account-banner-title">给爱宠做一个会呼吸的桌宠</text>
          <text class="account-banner-sub">用档案封面生成，陪在你身边</text>
          <text class="account-banner-cta">去看看 →</text>
        </view>
        <image class="account-banner-pet" src="/static/desk-pets/system-ragdoll-cat-avatar.png" mode="aspectFit" />
      </button>

      <view class="account-quick">
        <button v-for="item in quickItems" :id="'account-quick-' + item.id" :key="item.id" class="account-quick-item" @tap="openQuick(item.id)">
          <view class="account-quick-icon"><UiIcon :name="item.icon" :size="18" /></view>
          <text class="account-quick-title">{{ item.title }}</text>
          <text class="account-quick-sub">{{ item.sub }}</text>
        </button>
      </view>

      <view class="account-card account-orders">
        <view class="account-section-head">
          <text class="account-section-title">我的订单</text>
          <button class="text-button account-section-more" @tap="openOrders">全部订单 <UiIcon name="right" :size="11" /></button>
        </view>
        <view class="account-order-grid">
          <button v-for="item in orderItems" :id="'account-order-' + item.id" :key="item.id" class="account-order-item" @tap="openOrders">
            <view class="account-order-icon"><UiIcon :name="item.icon" :size="21" /></view>
            <text class="account-order-count">{{ item.count }}</text>
            <text class="account-order-label">{{ item.label }}</text>
          </button>
        </view>
      </view>

      <view class="account-card account-functions">
        <view class="account-section-head">
          <text class="account-section-title">其他功能</text>
        </view>
        <view class="account-function-grid">
          <template v-for="item in functionItems" :key="item.id">
            <button
              v-if="item.share"
              :id="'account-function-' + item.id"
              class="account-function-item"
              open-type="share"
            >
              <view class="account-function-icon"><UiIcon :name="item.icon" :size="17" /></view>
              <view class="account-function-copy">
                <text class="account-function-title">{{ item.title }}</text>
                <text class="account-function-sub">{{ item.sub }}</text>
              </view>
              <UiIcon name="right" :size="11" />
            </button>
            <button
              v-else
              :id="'account-function-' + item.id"
              class="account-function-item"
              @tap="openFunction(item)"
            >
              <view class="account-function-icon"><UiIcon :name="item.icon" :size="17" /></view>
              <view class="account-function-copy">
                <text class="account-function-title">{{ item.title }}</text>
                <text class="account-function-sub">{{ item.sub }}</text>
              </view>
              <UiIcon name="right" :size="11" />
            </button>
          </template>
        </view>
      </view>
    </view>

    <LoginDialog v-if="loginDialog" @close="loginDialog = false" />
    <view v-if="help" class="modal-scrim" @tap="help = false">
      <view class="modal-panel" role="dialog" aria-label="帮助与客服" @tap.stop>
        <view class="spread"><text class="heading">帮助与客服</text><button class="text-button" @tap="help = false">关闭</button></view>
        <text class="label">购物和售后</text>
        <text class="body">平台订单可在「我的订单」查询，商家外链的订单由商家处理。</text>
        <text class="label">宠物资料</text>
        <text class="body">上传的照片、健康记录和纪念馆默认仅账号内可见。公开动态、交友档案和创作由你确认发布。</text>
      </view>
    </view>
  </view>
</template>

<style scoped>
.account-page { max-width: 500px; margin: auto; background: var(--canvas); }
.account-head {
  position: relative;
  overflow: hidden;
  padding: var(--tab-start, 8px) 14px 14px;
  background: linear-gradient(160deg, #ffe36a 0%, #fff0a8 52%, #f7f2e4 100%);
  border-radius: 0 0 26px 26px;
}
.account-head::after {
  content: '';
  position: absolute;
  top: -72px;
  right: -54px;
  width: 190px;
  height: 190px;
  border-radius: 50%;
  background: rgba(255, 255, 255, .28);
  pointer-events: none;
}
.account-profile { position: relative; z-index: 1; display: flex; align-items: center; gap: 11px; }
.account-avatar-button { position: relative; flex: none; padding: 0; border: 0; border-radius: 50%; background: transparent; }
.account-avatar-plus {
  position: absolute;
  right: -1px;
  bottom: 1px;
  display: flex;
  align-items: center;
  justify-content: center;
  width: 19px;
  height: 19px;
  border: 2px solid #ffe36a;
  border-radius: 50%;
  background: #2d2511;
  color: #ffe95a;
}
.account-identity { display: flex; flex: 1; min-width: 0; flex-direction: column; justify-content: center; gap: 3px; }
.account-name-row { display: flex; align-items: center; gap: 7px; min-width: 0; }
.account-name { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; color: #2b240f; font-size: 20px; font-weight: 850; line-height: 1.2; }
.account-badge { flex: none; padding: 2px 7px; border-radius: 999px; background: #fff7c9; color: #6b4f08; font-size: 9px; font-weight: 800; }
.account-id { color: #715b1f; font-size: 10px; font-variant-numeric: tabular-nums; letter-spacing: .02em; }
.account-caption { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; color: #6d5a26; font-size: 11px; }
.account-login { flex: none; min-height: 32px; padding-inline: 10px; }
.account-settings { display: flex; flex: none; align-items: center; justify-content: center; width: 34px; height: 34px; padding: 0; border: 1px solid rgba(90, 65, 10, .13); border-radius: 50%; background: rgba(255, 255, 255, .58); }

.account-stats {
  position: relative;
  z-index: 1;
  display: grid;
  grid-template-columns: repeat(5, minmax(0, 1fr));
  margin-top: 15px;
  padding: 11px 3px 10px;
  border-radius: 18px;
  background: #242017;
  box-shadow: 0 8px 20px rgba(76, 54, 8, .16);
}
.account-stat { display: flex; flex-direction: column; align-items: center; gap: 3px; min-width: 0; padding: 1px 0; border: 0; border-radius: 0; background: transparent; color: #fff; }
.account-stat + .account-stat { border-left: 1px solid rgba(255, 255, 255, .09); }
.account-stat-heart { height: 16px; color: #fff; font-size: 17px; font-weight: 600; line-height: 16px; }
.account-stat-value { color: #fff; font-size: 18px; font-weight: 850; line-height: 1.15; font-variant-numeric: tabular-nums; }
.account-stat-label { color: #bdb3a1; font-size: 10px; line-height: 1.2; }

.account-content { padding: 12px 14px 16px; }
.account-error { display: flex; align-items: center; justify-content: space-between; gap: 8px; margin: 0 0 8px; padding: 8px 10px; border-radius: 12px; background: #fdf1ee; }
.account-banner {
  position: relative;
  display: flex;
  align-items: center;
  width: 100%;
  min-height: 108px;
  overflow: hidden;
  padding: 14px 12px 13px 15px;
  border: 1px solid #f0cf4f;
  border-radius: 18px;
  background: linear-gradient(115deg, #fff4b5 0%, #ffdf4e 65%, #ffd52f 100%);
  text-align: left;
}
.account-banner-copy { position: relative; z-index: 1; display: flex; flex: 1; min-width: 0; flex-direction: column; align-items: flex-start; gap: 3px; }
.account-banner-kicker { color: #7b6013; font-size: 9px; font-weight: 850; letter-spacing: .08em; }
.account-banner-title { color: #2d2307; font-size: 16px; font-weight: 850; line-height: 1.3; }
.account-banner-sub { color: #6a5318; font-size: 11px; line-height: 1.35; }
.account-banner-cta { margin-top: 6px; padding: 5px 11px; border-radius: 999px; background: #2d2511; color: #ffe95a; font-size: 10px; font-weight: 800; }
.account-banner-pet { position: relative; z-index: 1; flex: none; width: 86px; height: 86px; margin: 0 -4px 0 2px; object-fit: contain; }

.account-quick { display: grid; grid-template-columns: repeat(3, 1fr); gap: 8px; margin-top: 10px; }
.account-quick-item { display: flex; flex-direction: column; align-items: flex-start; gap: 3px; min-width: 0; padding: 11px 10px 10px; border: 1px solid var(--border); border-radius: 14px; background: #fff; text-align: left; }
.account-quick-icon { display: flex; align-items: center; justify-content: center; width: 31px; height: 31px; margin-bottom: 3px; border-radius: 10px; background: #fff6d0; }
.account-quick-title { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; width: 100%; color: var(--ink); font-size: 12px; font-weight: 800; }
.account-quick-sub { color: var(--muted); font-size: 10px; }

.account-card { margin-top: 12px; padding: 13px 12px 12px; border: 1px solid var(--border); border-radius: 17px; background: #fff; }
.account-section-head { display: flex; align-items: center; justify-content: space-between; gap: 8px; margin-bottom: 10px; }
.account-section-title { color: var(--ink); font-size: 15px; font-weight: 850; }
.account-section-more { display: flex; align-items: center; gap: 3px; min-height: 24px; padding: 0; color: var(--muted); font-size: 11px; font-weight: 650; }
.account-order-grid { display: grid; grid-template-columns: repeat(4, minmax(0, 1fr)); gap: 4px; }
.account-order-item { display: flex; flex-direction: column; align-items: center; gap: 4px; min-width: 0; padding: 7px 2px; border: 0; border-radius: 10px; background: #fffdf8; }
.account-order-icon { display: flex; align-items: center; justify-content: center; width: 26px; height: 26px; }
.account-order-count { color: var(--ink); font-size: 15px; font-weight: 850; line-height: 1.1; font-variant-numeric: tabular-nums; }
.account-order-label { color: var(--muted); font-size: 10px; line-height: 1.2; }
.account-function-grid { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 7px; }
.account-function-item { display: flex; align-items: center; gap: 7px; min-width: 0; padding: 9px 8px; border: 1px solid #f1ede2; border-radius: 12px; background: #fffdf8; text-align: left; }
.account-function-icon { display: flex; flex: none; align-items: center; justify-content: center; width: 27px; height: 27px; border-radius: 9px; background: #fff6d0; }
.account-function-copy { display: flex; flex: 1; min-width: 0; flex-direction: column; gap: 1px; }
.account-function-title { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; color: var(--ink); font-size: 11px; font-weight: 750; }
.account-function-sub { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; color: var(--muted); font-size: 9px; }
</style>
