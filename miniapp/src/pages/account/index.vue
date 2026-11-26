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
import { deskPetEnabled } from '../../lib/desk-pet'
import AccountAvatar from '../../components/AccountAvatar.vue'
import FloatingDeskPet from '../../components/FloatingDeskPet.vue'
import LoginDialog from '../../components/LoginDialog.vue'
import UiIcon from '../../components/UiIcon.vue'

type StatItem = { id: string; label: string; value: number; icon?: string; run: () => void }
type FunctionItem = { id: string; title: string; icon: string; share?: boolean }

const tabLayout = useTabPage('pages/account/index')
const loginDialog = ref(false)
const help = ref(false)
const petCount = ref(0)
const points = ref(0)
const orders = ref<H5Order[]>([])
const emptyCounts: PersonalContentCounts = { published: 0, likes: 0, favorites: 0 }
const counts = ref<PersonalContentCounts>(emptyCounts)

const statItems = computed<StatItem[]>(() => [
  { id: 'pets', label: '宠物', value: petCount.value, icon: 'account-pets', run: openPets },
  { id: 'published', label: '发布', value: counts.value.published, icon: 'account-published', run: () => openContent('published') },
  { id: 'likes', label: '点赞', value: counts.value.likes, run: () => openContent('likes') },
  { id: 'favorites', label: '收藏', value: counts.value.favorites, icon: 'account-favorites', run: () => openContent('favorites') },
  { id: 'points', label: '积分', value: points.value, icon: 'account-assets', run: () => openActivity('assets') },
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
    { id: 'completed', label: '已完成', count: totals.completed },
    { id: 'support', label: '售后', icon: 'account-help', count: totals.support },
  ]
})

const functionItems: FunctionItem[] = [
  { id: 'stores', title: '我的门店', icon: 'entry-services' },
  { id: 'appointments', title: '预约记录', icon: 'account-appointments' },
  { id: 'learning', title: '我的课程', icon: 'account-learning' },
  { id: 'assets', title: '资产中心', icon: 'account-assets' },
  { id: 'share', title: '推荐给好友', icon: 'entry-friends', share: true },
  { id: 'help', title: '帮助与客服', icon: 'account-help' },
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
          <AccountAvatar :size="54" />
        </button>
        <button class="account-identity" @tap="editProfile">
          <text class="account-name">{{ user?.displayName || '未登录' }}</text>
          <text v-if="user?.publicId" class="account-id">ID {{ user.publicId }}</text>
          <text v-else-if="!user" class="account-id">登录后同步宠物档案</text>
        </button>
        <button v-if="!user" id="open-wechat-login" class="small primary account-login" @tap="loginDialog = true">登录 / 注册</button>
        <button v-else id="edit-account-profile" class="account-settings" aria-label="编辑资料与设置" @tap="editProfile">
          <UiIcon name="account-settings" :size="20" />
        </button>
      </view>

      <view class="account-stats">
        <button v-for="item in statItems" :id="'account-stat-' + item.id" :key="item.id" class="account-stat" :aria-label="item.label + ' ' + item.value" @tap="item.run">
          <text class="account-stat-label">{{ item.label }}</text>
          <UiIcon v-if="item.icon" :name="item.icon" :size="14" />
          <text v-else class="account-stat-heart" aria-hidden="true">♡</text>
          <text class="account-stat-value">{{ item.value }}</text>
        </button>
      </view>
    </view>

    <view class="account-content">
      <view v-if="loadError" class="account-error">
        <text class="error">{{ loadError }}</text>
        <button class="text-button" @tap="refresh">重试</button>
      </view>

      <view class="account-banner">
        <button id="account-desk-pet" class="account-banner-link" aria-label="管理我的桌宠" @tap="editProfile">
          <view class="account-banner-copy">
            <text class="account-banner-title">我的桌宠</text>
            <text class="account-banner-sub">用宠物档案照片生成专属桌宠</text>
          </view>
          <UiIcon name="right" :size="14" />
        </button>
        <view class="account-pet-dock">
          <image v-if="!deskPetEnabled" class="account-banner-pet" src="/static/desk-pets/system-ragdoll-cat-avatar.png" mode="aspectFit" aria-hidden="true" />
          <FloatingDeskPet dock />
        </view>
      </view>

      <view class="account-card account-orders">
        <view class="account-section-head">
          <text class="account-section-title">我的订单</text>
          <button class="account-section-more" @tap="openOrders">
            <text>{{ orders.length ? '全部 ' + orders.length + ' 笔' : '全部订单' }}</text>
            <UiIcon name="right" :size="11" />
          </button>
        </view>
        <view class="account-order-grid">
          <button v-for="item in orderItems" :id="'account-order-' + item.id" :key="item.id" class="account-order-item" :aria-label="item.label + ' ' + item.count + ' 笔，查看订单'" @tap="openOrders">
            <view class="account-order-icon">
              <UiIcon v-if="item.icon" :name="item.icon" :size="22" />
              <text v-else class="account-order-done" aria-hidden="true">✓</text>
              <text v-if="item.count" class="account-order-count">{{ item.count > 99 ? '99+' : item.count }}</text>
            </view>
            <text class="account-order-label">{{ item.label }}</text>
          </button>
        </view>
      </view>

      <view class="account-card account-functions">
        <view class="account-section-head">
          <text class="account-section-title">常用工具</text>
        </view>
        <view class="account-function-grid">
          <button
            v-for="item in functionItems"
            :id="'account-function-' + item.id"
            :key="item.id"
            class="account-function-item"
            :open-type="item.share ? 'share' : undefined"
            @tap="openFunction(item)"
          >
            <view class="account-function-icon" :class="'tool-' + item.id"><UiIcon :name="item.icon" :size="20" /></view>
            <text class="account-function-title">{{ item.title }}</text>
          </button>
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
.account-page {
  max-width: 500px;
  min-height: 100vh;
  margin: auto;
  background: linear-gradient(180deg, #ffe994 0, #fff1bf 95px, var(--canvas) 230px);
}
.account-head { padding: var(--tab-start, 8px) 14px 0; }
.account-profile { display: flex; align-items: center; gap: 11px; }
.account-avatar-button {
  flex: none;
  padding: 2px;
  border: 0;
  border-radius: 50%;
  background: #fffdf3;
}
.account-identity {
  display: flex;
  flex: 1;
  min-width: 0;
  min-height: 44px;
  flex-direction: column;
  align-items: flex-start;
  justify-content: center;
  gap: 4px;
  padding: 0;
  border: 0;
  background: transparent;
  text-align: left;
}
.account-name, .account-id {
  display: block;
  max-width: 100%;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.account-name { color: #302819; font-size: 22px; font-weight: 750; line-height: 1.25; }
.account-id { color: #6b5b37; font-size: 12px; font-weight: 500; line-height: 1.4; font-variant-numeric: tabular-nums; }
.account-login { flex: none; white-space: nowrap; }
.account-settings {
  display: flex;
  flex: none;
  align-items: center;
  justify-content: center;
  width: 42px;
  height: 44px;
  padding: 0;
  border: 0;
  background: transparent;
}

.account-stats {
  display: grid;
  grid-template-columns: repeat(5, minmax(0, 1fr));
  margin-top: 14px;
  padding: 10px 2px;
  border-radius: 16px;
  background: #fffdf7;
}
.account-stat {
  display: flex;
  min-width: 0;
  flex-direction: column;
  align-items: center;
  gap: 4px;
  padding: 1px 0;
  border: 0;
  border-radius: 0;
  background: transparent;
}
.account-stat + .account-stat { border-left: 1px solid #f1eada; }
.account-stat-label { color: #665c48; font-size: 12px; font-weight: 550; line-height: 1.3; }
.account-stat-heart { height: 14px; color: var(--gold-ink); font-size: 16px; line-height: 14px; }
.account-stat-value { max-width: 100%; color: #332c20; font-size: 20px; font-weight: 750; line-height: 1.1; font-variant-numeric: tabular-nums; }

.account-content { display: flex; flex-direction: column; gap: 12px; padding: 12px 14px 16px; }
.account-error { display: flex; align-items: center; justify-content: space-between; gap: 8px; padding: 8px 10px; border-radius: 12px; background: #fdf1ee; }
.account-banner {
  position: relative;
  border: 1px solid #f0dfac;
  border-radius: 16px;
  background: linear-gradient(105deg, #fff4cc, #ffe59a);
}
.account-banner-link {
  display: flex;
  width: 100%;
  min-height: 86px;
  align-items: center;
  gap: 92px;
  padding: 6px 14px 6px 18px;
  border: 0;
  border-radius: inherit;
  background: transparent;
  text-align: left;
}
.account-banner-copy { display: flex; flex: 1; min-width: 0; flex-direction: column; gap: 5px; }
.account-banner-title { color: #382b14; font-size: 18px; font-weight: 750; line-height: 1.3; }
.account-banner-sub { color: #695631; font-size: 12px; font-weight: 500; line-height: 1.5; }
.account-pet-dock {
  position: absolute;
  top: 50%;
  right: 32px;
  display: flex;
  width: 84px;
  height: 84px;
  align-items: center;
  justify-content: center;
  margin-top: -42px;
  pointer-events: none;
}
.account-banner-pet { display: block; flex: none; width: 74px; height: 74px; }

.account-card { padding: 12px 16px 14px; border: 1px solid var(--border); border-radius: 16px; background: var(--paper); }
.account-section-head { display: flex; min-height: 36px; align-items: center; justify-content: space-between; gap: 8px; }
.account-section-title { color: var(--ink); font-size: 16px; font-weight: 750; line-height: 1.35; }
.account-section-more {
  display: flex;
  min-height: 40px;
  align-items: center;
  gap: 4px;
  padding: 0 0 0 8px;
  border: 0;
  background: transparent;
  color: var(--muted);
  font-size: 12px;
  font-weight: 500;
}
.account-order-grid, .account-function-grid { display: grid; }
.account-order-grid { grid-template-columns: repeat(4, minmax(0, 1fr)); }
.account-order-item, .account-function-item {
  display: flex;
  min-width: 0;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 6px;
  padding: 6px 2px;
  border: 0;
  background: transparent;
  color: var(--ink);
  font-size: 13px;
  font-weight: 550;
  line-height: 1.4;
}
.account-order-icon { position: relative; display: flex; width: 30px; height: 30px; align-items: center; justify-content: center; }
.account-order-done {
  width: 18px;
  height: 18px;
  border: 1.5px solid currentColor;
  border-radius: 50%;
  color: var(--gold-ink);
  font-size: 13px;
  line-height: 15px;
  text-align: center;
}
.account-order-count {
  position: absolute;
  top: -3px;
  left: 19px;
  min-width: 16px;
  padding: 0 4px;
  border: 1px solid #fff;
  border-radius: 10px;
  background: #a54b25;
  color: #fff;
  font-size: 10px;
  line-height: 15px;
  text-align: center;
  white-space: nowrap;
}
.account-function-grid { grid-template-columns: repeat(3, minmax(0, 1fr)); row-gap: 10px; margin-top: 6px; }
.account-function-icon {
  display: flex;
  width: 36px;
  height: 36px;
  align-items: center;
  justify-content: center;
  border-radius: 12px;
  background: #f8efda;
}
.tool-stores { background: #e4f1ec; }
.tool-learning { background: #e9edf6; }
.tool-assets { background: #f8ebd9; }
.tool-share { background: #fae9ef; }
.tool-help { background: #eeedf4; }
</style>
