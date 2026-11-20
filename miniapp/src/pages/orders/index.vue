<script setup lang="ts">
import { ref, computed } from 'vue'
import type { H5Order } from '../../../../src/h5/business'
import { api, user, go, confirm, toast } from '../../lib/client'
import { cart, quantity, checkout, money, statusName } from '../../lib/cart'
import { pageLoad, submitAction } from '../../lib/page'
import LoginCard from '../../components/LoginCard.vue'
import LoadState from '../../components/LoadState.vue'
const orders = ref<H5Order[]>([]),
  support = ref(''),
  text = ref('')
const total = computed(() => cart.value.items.reduce((t, i) => t + i.unitCents * i.quantity, 0))
async function load() {
  if (user.value) orders.value = (await api<{ orders: H5Order[] }>('/h5/orders')).orders
}
const { error, loading, refresh } = pageLoad(load, () => {
  orders.value = []
  support.value = ''
  text.value = ''
})
const { run, busy, error: actionError } = submitAction()
function openSupport(order: H5Order) {
  support.value = order.id
  text.value = order.supportMessage || ''
}
function order() {
  return run(async () => {
    if (!(await confirm('提交订单', '合计 ' + money(total.value) + '，提交后等待商家确认。'))) return
    await checkout()
    await load()
    toast('订单已提交')
  })
}
function cancel(id: string) {
  return run(async () => {
    if (!(await confirm('取消订单', '确认取消这笔订单？'))) return
    await api('/h5/orders/' + id + '/cancel', 'POST')
    await load()
  })
}
function help(id: string) {
  return run(async () => {
    await api('/h5/orders/' + id + '/support', 'PUT', { message: text.value })
    support.value = ''
    text.value = ''
    await load()
    toast('已提交售后')
  })
}
</script>
<template>
  <view class="screen">
    <LoginCard v-if="!user" />
    <template v-else>
      <text v-if="actionError" class="error">{{ actionError }}</text>
      <view class="card">
        <text class="heading">购物袋</text>
        <text v-if="!cart.items.length" class="empty">购物袋还是空的</text>
        <view v-for="i in cart.items" :key="i.itemId" class="line">
          <text>{{ i.title }} · {{ money(i.unitCents) }}</text>
          <view class="actions">
            <button class="small" :disabled="busy" @tap="quantity(i.itemId, i.quantity - 1)">−</button>
            <text>{{ i.quantity }}</text>
            <button
              class="small"
              :disabled="busy || i.quantity >= 99"
              @tap="quantity(i.itemId, i.quantity + 1)"
            >
              ＋
            </button>
          </view>
        </view>
        <view class="actions">
          <button class="small" @tap="go('directory', { module: 'shop' })">逛好物</button>
          <button v-if="cart.items.length" class="primary" :disabled="busy" @tap="order">
            提交订单 · {{ money(total) }}
          </button>
        </view>
      </view>
      <text class="heading">我的订单</text>
      <LoadState :loading="loading" :error="error" @retry="refresh" />
      <text v-if="!loading && !error && !orders.length" class="empty">暂无订单</text>
      <view v-for="o in orders" :key="o.id" class="card">
        <view class="spread">
          <text>{{ statusName[o.status] }}</text>
          <text>{{ money(o.totalCents) }}</text>
        </view>
        <text v-for="i in o.items" :key="i.itemId" class="line">{{ i.title }} × {{ i.quantity }}</text>
        <text v-if="o.supportMessage" class="sub">
          售后{{ o.supportResolved ? '已处理' : '处理中' }} · {{ o.supportMessage }}
        </text>
        <view class="actions">
          <button v-if="o.status === 'submitted'" class="small" :disabled="busy" @tap="cancel(o.id)">
            取消订单
          </button>
          <button v-if="o.status !== 'cancelled'" class="small" @tap="openSupport(o)">售后</button>
        </view>
        <template v-if="support === o.id">
          <text class="label">售后诉求</text>
          <textarea v-model="text" maxlength="500" />
          <button :disabled="busy || !text.trim()" @tap="help(o.id)">提交</button>
        </template>
      </view>
    </template>
  </view>
</template>
