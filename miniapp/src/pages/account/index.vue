<script setup lang="ts">
import { ref, watch } from 'vue'
import type { User } from '../../../../src/lib/types'
import { api, user, updateUser, go, petsTab, confirm, logout, toast } from '../../lib/client'
import { submitAction } from '../../lib/page'
import LoginCard from '../../components/LoginCard.vue'
const nickname = ref('')
watch(
  user,
  (value) => {
    nickname.value = value?.displayName || ''
  },
  { immediate: true },
)
const { run, busy, error } = submitAction()
function save() {
  return run(async () => {
    const result = await api<{ user: User }>('/auth/profile', 'PUT', { displayName: nickname.value.trim() })
    updateUser(result.user)
    toast('昵称已保存')
  })
}
function signOut() {
  return run(async () => {
    if (await confirm('退出登录', '下次可用同一微信找回档案。')) await logout()
  })
}
</script>
<template>
  <view class="screen">
    <LoginCard v-if="!user" />
    <template v-else>
      <view class="sheet">
        <text class="sub">我的账号</text>
        <text class="title">{{ user.displayName }}</text>
      </view>
      <view class="tile-grid stack">
        <button class="tile" @tap="petsTab">我的宠物</button>
        <button class="tile" @tap="go('feed', { mode: 'mine' })">动态与收藏</button>
        <button class="tile" @tap="go('stories', { mode: 'mine' })">我的故事</button>
        <button class="tile" @tap="go('orders')">购物袋与订单</button>
        <button class="tile" @tap="go('activity')">参与记录与积分</button>
        <button class="tile" @tap="go('social')">宠友邀请</button>
      </view>
      <view class="card">
        <text class="heading">账号设置</text>
        <text class="label">昵称</text>
        <input v-model="nickname" maxlength="40" placeholder="输入昵称" />
        <view class="actions">
          <button class="primary" :disabled="busy || !nickname.trim()" @tap="save">保存昵称</button>
          <button :disabled="busy" @tap="signOut">退出登录</button>
        </view>
        <text v-if="error" class="error">{{ error }}</text>
      </view>
    </template>
  </view>
</template>
