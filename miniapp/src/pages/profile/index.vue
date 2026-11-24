<script setup lang="ts">
import { ref } from 'vue'
import { onUnload } from '@dcloudio/uni-app'
import type { User } from '../../../../src/lib/types'
import AccountAvatar from '../../components/AccountAvatar.vue'
import UiIcon from '../../components/UiIcon.vue'
import { api, confirm, go, logout, openPrivacyGuide, toast, updateUser, user } from '../../lib/client'
import { submitAction } from '../../lib/page'
import { readPhoto } from '../../lib/photo'

const avatar = ref('')
const { run, busy, error } = submitAction()
const { run:runLogout, busy:signingOut, error:logoutError } = submitAction()
let active = true
onUnload(() => { active = false })

function chooseAvatar(event: { detail: { avatarUrl?: string } }) {
  if (!busy.value && event.detail.avatarUrl) avatar.value = event.detail.avatarUrl
}

function close() {
  uni.navigateBack({ fail: () => go('account') })
}

function save(event: Event) {
  const account = user.value
  if (!account || signingOut.value) return
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

function signOut() {
  if (busy.value) return
  return runLogout(async () => {
    if (!await confirm('退出登录', '下次可用同一微信找回档案。')) return
    await logout()
    if (active) close()
  })
}
</script>

<template>
  <view class="screen profile-screen">
    <view v-if="user" class="card profile-card">
      <form @submit="save">
        <button id="choose-profile-avatar" class="avatar-picker" open-type="chooseAvatar" :disabled="busy || signingOut" @chooseavatar="chooseAvatar">
          <AccountAvatar :size="76" :preview="avatar" />
          <text>{{ avatar || user.avatarVersion ? '更换头像' : '选择头像' }}</text>
        </button>
        <text class="label">昵称</text>
        <input
          id="profile-nickname"
          name="nickname"
          type="nickname"
          :value="user.displayName"
          maxlength="40"
          aria-label="昵称"
          placeholder="使用微信昵称或自行填写"
          :disabled="busy || signingOut"
        />
        <text v-if="error" class="error" role="status">{{ error }}</text>
        <view class="profile-actions">
          <button id="save-profile" class="primary" form-type="submit" :disabled="busy || signingOut" :loading="busy">保存资料</button>
        </view>
      </form>
    </view>
    <view v-if="user" class="card privacy-card">
      <text class="heading">账号与隐私</text>
      <button id="profile-privacy-guide" class="privacy-link" @tap="openPrivacyGuide">
        <text>小程序用户隐私保护指引</text><UiIcon name="right" :size="13" />
      </button>
      <button id="profile-logout" class="privacy-link logout-link" :disabled="busy || signingOut" @tap="signOut">退出登录</button>
      <text v-if="logoutError" class="error" role="status">{{ logoutError }}</text>
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
.privacy-card { padding-block: 12px 4px; }
.privacy-link { display: flex; align-items: center; justify-content: space-between; width: 100%; min-height: 44px; padding: 7px 0; border: 0; border-radius: 0; background: transparent; text-align: left; }
.logout-link { border-top: 1px solid var(--border); color: #a03b2d; }
</style>
