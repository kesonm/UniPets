<script setup lang="ts">
import { computed, ref } from 'vue'
import { onLoad } from '@dcloudio/uni-app'
import type { Engagement, WalletSummary } from '../../../../src/h5/business'
import type { H5Creator } from '../../../../src/h5/types'
import { api, user, confirm, go, toast } from '../../lib/client'
import { pageLoad, submitAction } from '../../lib/page'
import { statusName } from '../../lib/cart'
import LoginCard from '../../components/LoginCard.vue'
import LoadState from '../../components/LoadState.vue'
const items = ref<Engagement[]>([]),
  wallet = ref<WalletSummary>(),
  creator = ref<H5Creator | null>(null)
const titles = {
  all: '我的参与',
  appointments: '预约记录',
  assets: '资产中心',
  learning: '我的课程',
  creator: '达人权益',
  charity: '公益记录',
} as const
const panel = ref<keyof typeof titles>('all')
const recordsPanel = computed(() => panel.value !== 'assets' && panel.value !== 'creator')
const displayed = computed(() => items.value.filter(item => {
  if (panel.value === 'appointments') return item.kind === 'appointment'
  if (panel.value === 'learning') return item.module === 'education'
  if (panel.value === 'charity') return item.module === 'charity'
  return true
}))
onLoad((query) => {
  const value = query?.panel || ''
  if (Object.prototype.hasOwnProperty.call(titles, value)) panel.value = value as keyof typeof titles
  uni.setNavigationBarTitle({ title: titles[panel.value] })
})
async function load() {
  const owner = user.value?.id
  if (!owner) return
  const [e, w, c] = await Promise.all([
    recordsPanel.value ? api<{ engagements: Engagement[] }>('/h5/engagements') : undefined,
    panel.value === 'all' || panel.value === 'assets' ? api<WalletSummary>('/h5/wallet') : undefined,
    panel.value === 'creator' ? api<{ creator: H5Creator | null }>('/h5/creator-account') : undefined,
  ])
  if (owner !== user.value?.id) return
  items.value = e?.engagements || []
  wallet.value = w
  creator.value = c?.creator || null
}
const { loading, error, refresh } = pageLoad(load, () => {
  items.value = []
  wallet.value = undefined
  creator.value = null
})
const { run, busy, error: actionError } = submitAction()
function change(id: string, action: 'cancel' | 'check-in') {
  return run(async () => {
    if (action === 'cancel' && !(await confirm('取消参与', '确认取消这条记录？'))) return
    await api('/h5/engagements/' + id, 'PUT', { action })
    await load()
    toast('记录已更新')
  })
}
</script>
<template>
  <view class="screen">
    <LoginCard v-if="!user" />
    <template v-else>
      <LoadState :loading="loading" :error="error" @retry="refresh" />
      <text v-if="actionError" class="error">{{ actionError }}</text>
      <view v-if="wallet" class="sheet">
        <text class="heading">数字永生积分与云上游戏币</text>
        <text>积分 {{ wallet.balances.points }}　·　游戏币 {{ wallet.balances.coins }}</text>
        <text v-for="e in wallet.entries" :key="e.id" class="line">{{ e.label }}　{{ e.quantity }}</text>
      </view>
      <view v-if="panel === 'creator' && creator" class="card">
        <text class="heading">{{ creator.name }}</text>
        <text class="body">{{ creator.bio }}</text>
        <button class="text-button" @tap="go('social', { creator: creator.id })">查看达人主页</button>
      </view>
      <view v-else-if="panel === 'creator' && !loading && !error" class="card empty-card">你的账号尚未开通达人主页</view>
      <view v-if="recordsPanel && !loading && !error && !displayed.length" class="card empty-card">暂无相关记录</view>
      <view v-for="i in displayed" :key="i.id" class="card">
        <text class="sub">{{ statusName[i.status] }} · {{ i.provider }}</text>
        <text class="heading">{{ i.title }}</text>
        <text v-if="i.petName" class="sub">{{ i.petName }}</text>
        <text v-if="i.note" class="body">{{ i.note }}</text>
        <text class="sub" user-select>编号 {{ i.id }}</text>
        <view class="actions">
          <button
            v-if="i.kind === 'group' && i.status === 'joined'"
            class="small"
            @tap="go('social', { group: i.itemId })"
          >
            群聊
          </button>
          <button
            v-if="i.module === 'education' && i.kind === 'enrollment' && i.status !== 'cancelled'"
            class="small"
            :disabled="busy || !!i.checkedInAt"
            @tap="change(i.id, 'check-in')"
          >
            {{ i.checkedInAt ? '已打卡' : '打卡' }}
          </button>
          <button
            v-if="i.status !== 'cancelled' && i.status !== 'completed' && !i.checkedInAt"
            class="small"
            :disabled="busy"
            @tap="change(i.id, 'cancel')"
          >
            取消参与
          </button>
        </view>
      </view>
    </template>
  </view>
</template>
