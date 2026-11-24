<script setup lang="ts">
import { ref } from 'vue'
import { onLoad, onUnload } from '@dcloudio/uni-app'
import type { User } from '../../../../src/lib/types'
import AccountAvatar from '../../components/AccountAvatar.vue'
import { api, go, toast, updateUser, user } from '../../lib/client'
import { submitAction } from '../../lib/page'
import { readPhoto } from '../../lib/photo'

const setup = ref(false)
const avatar = ref('')
const { run, busy, error } = submitAction()
let active = true
onLoad((options) => { setup.value = options?.setup === '1' })
onUnload(() => { active = false })

function chooseAvatar(event: { detail: { avatarUrl?: string } }) {
  if (!busy.value && event.detail.avatarUrl) avatar.value = event.detail.avatarUrl
}

function close() {
  uni.navigateBack({ fail: () => go('account') })
}

function save(event: Event) {
  const account = user.value
  if (!account) return
  const form = (event as CustomEvent<{ value?: { nickname?: string } }>).detail
  const nickname = form?.value?.nickname?.trim()
  const avatarPath = avatar.value
  return run(async () => {
    if (!nickname && !avatarPath) throw new Error('请选择头像或填写昵称')
    const avatarImage = avatarPath ? await readPhoto(avatarPath) : undefined
    if (user.value?.id !== account.id) throw new Error('登录已变更，请重新打开资料页')
    const result = avatarImage
      ? await api<{ user: User }>('/auth/profile/avatar', 'PUT', {
        avatarImage,
        ...(nickname && nickname !== account.displayName ? { displayName: nickname } : {}),
      })
      : await api<{ user: User }>('/auth/profile', 'PUT', { displayName: nickname })
    updateUser(result.user)
    if (active) {
      toast('资料已保存')
      close()
    }
  })
}
</script>

<template>
  <view class="screen profile-screen">
    <view v-if="user" class="card profile-card">
      <form @submit="save">
        <button id="choose-profile-avatar" class="avatar-picker" open-type="chooseAvatar" :disabled="busy" @chooseavatar="chooseAvatar">
          <AccountAvatar :size="76" :preview="avatar" />
          <text>{{ avatar || user.avatarVersion ? '更换头像' : '选择头像' }}</text>
        </button>
        <text class="label">昵称</text>
        <input
          id="profile-nickname"
          name="nickname"
          type="nickname"
          :value="setup ? '' : user.displayName"
          maxlength="40"
          aria-label="昵称"
          placeholder="使用微信昵称或自行填写"
          :disabled="busy"
        />
        <text v-if="error" class="error" role="status">{{ error }}</text>
        <view class="profile-actions">
          <button id="save-profile" class="primary" form-type="submit" :disabled="busy" :loading="busy">保存资料</button>
          <button v-if="setup" id="skip-profile" class="text-button" :disabled="busy" @tap="close">稍后设置</button>
        </view>
      </form>
    </view>
    <view v-else class="card empty-card">
      <text>请先登录微信账号</text>
      <button class="small primary" @tap="go('account')">返回我的</button>
    </view>
  </view>
</template>

<style scoped>
.profile-screen { padding-top: 12px; }
.profile-card { padding: 18px 16px 14px; }
.avatar-picker {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 7px;
  margin: 0 auto 16px;
  padding: 0 9px;
  border: 0;
  background: transparent;
  color: var(--gold-ink);
}
.profile-actions { display: flex; flex-direction: column; gap: 5px; margin-top: 15px; }
</style>
