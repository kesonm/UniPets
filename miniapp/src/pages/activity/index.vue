<script setup lang="ts">
import { ref } from 'vue'
import type { Engagement, WalletSummary } from '../../../../src/h5/business'
import { api, user, confirm, go, toast } from '../../lib/client'
import { pageLoad, submitAction } from '../../lib/page'
import { statusName } from '../../lib/cart'
import LoginCard from '../../components/LoginCard.vue'
import LoadState from '../../components/LoadState.vue'
const items = ref<Engagement[]>([]),
  wallet = ref<WalletSummary>()
async function load() {
  if (user.value) {
    const [e, w] = await Promise.all([
      api<{ engagements: Engagement[] }>('/h5/engagements'),
      api<WalletSummary>('/h5/wallet'),
    ])
    items.value = e.engagements
    wallet.value = w
  }
}
const { loading, error, refresh } = pageLoad(load, () => {
  items.value = []
  wallet.value = undefined
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
        <text class="heading">我的积分与游戏币</text>
        <text>积分 {{ wallet.balances.points }}　·　游戏币 {{ wallet.balances.coins }}</text>
        <text v-for="e in wallet.entries" :key="e.id" class="line">{{ e.label }}　{{ e.quantity }}</text>
      </view>
      <text class="heading">我的参与</text>
      <text v-if="!loading && !error && !items.length" class="empty">暂无预约、课程或社群记录</text>
      <view v-for="i in items" :key="i.id" class="card">
        <text class="sub">{{ statusName[i.status] }} · {{ i.provider }}</text>
        <text class="heading">{{ i.title }}</text>
        <text v-if="i.petName" class="sub">{{ i.petName }}</text>
        <text v-if="i.note" class="body">{{ i.note }}</text>
        <text class="sub" selectable>编号 {{ i.id }}</text>
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
