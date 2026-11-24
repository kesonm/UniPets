<script setup lang="ts">
import { ref } from 'vue'
import { login, loginError, loggingIn, openPrivacyGuide } from '../lib/client'
import AccountAvatar from './AccountAvatar.vue'
import UiIcon from './UiIcon.vue'

const emit = defineEmits<{ close: [] }>()
const avatar = ref('')
loginError.value = ''

function close() {
  if (!loggingIn.value) emit('close')
}

function chooseAvatar(event: { detail?: { avatarUrl?: string } }) {
  if (!loggingIn.value && event.detail?.avatarUrl) avatar.value = event.detail.avatarUrl
}

async function signIn(event: Event) {
  if (loggingIn.value) return
  const form = (event as CustomEvent<{ value?: { nickname?: string } }>).detail
  const displayName = form?.value?.nickname?.trim()
  if (await login({ displayName, avatarPath: avatar.value })) emit('close')
}
</script>

<template>
  <view class="modal-scrim" @tap="close" @touchmove.stop.prevent>
    <view class="modal-panel login-panel" role="dialog" aria-label="登录宠云" @tap.stop>
      <view class="spread">
        <view class="login-brand">
          <image class="login-mark" src="/static/brand-mark.png" mode="aspectFit" aria-hidden="true" />
          <text class="heading login-heading">登录宠云</text>
        </view>
        <button class="text-button" :disabled="loggingIn" @tap="close">取消</button>
      </view>
      <text class="sub login-description">首次登录自动注册，头像和昵称选填。</text>
      <form @submit="signIn">
        <view class="login-fields">
          <button
            id="login-avatar"
            class="login-avatar-picker"
            open-type="chooseAvatar"
            :disabled="loggingIn"
            @chooseavatar="chooseAvatar"
          >
            <AccountAvatar :size="46" :preview="avatar" />
            <view class="login-avatar-copy">
              <text class="login-field-label">头像</text>
              <text class="sub">{{ avatar ? '更换头像' : '选择微信头像或照片' }}</text>
            </view>
            <UiIcon name="right" :size="13" />
          </button>
          <view class="login-nickname-field">
            <text class="login-field-label">昵称</text>
            <input
              id="login-nickname"
              class="login-nickname-input"
              name="nickname"
              type="nickname"
              maxlength="40"
              placeholder="使用微信昵称或自行输入"
              aria-label="昵称"
              :disabled="loggingIn"
            />
          </view>
        </view>
        <text v-if="loginError" class="error" role="status">{{ loginError }}</text>
        <button id="confirm-wechat-login" class="primary login-button" form-type="submit" :loading="loggingIn" :disabled="loggingIn" @tap.stop>
          微信登录
        </button>
      </form>
      <button class="text-button privacy-guide" @tap="openPrivacyGuide">小程序用户隐私保护指引</button>
    </view>
  </view>
</template>

<style scoped>
.login-panel { max-width: 360px; padding: 18px; border-radius: 20px; }
.login-brand { display: flex; align-items: center; gap: 9px; }
.login-mark { width: 34px; height: 34px; border-radius: 9px; }
.login-heading { margin: 0; }
.login-description { margin-top: 10px; }
.login-fields { margin-top: 14px; border: 1px solid #efe6cf; border-radius: 14px; background: #fffdf6; }
.login-avatar-picker {
  display: flex;
  align-items: center;
  gap: 10px;
  width: 100%;
  padding: 10px 12px;
  border: 0;
  border-radius: 14px 14px 0 0;
  background: transparent;
  text-align: left;
}
.login-avatar-copy { flex: 1; min-width: 0; }
.login-field-label { display: block; color: #33290d; font-size: 13px; font-weight: 750; }
.login-nickname-field {
  display: flex;
  align-items: center;
  gap: 12px;
  min-height: 43px;
  margin: 0 12px;
  border-top: 1px solid #efe6cf;
}
.login-nickname-field .login-field-label { flex: none; }
.login-nickname-input { flex: 1; min-width: 0; padding: 7px 0; border: 0; background: transparent; }
.login-button { width: 100%; margin-top: 14px; border-radius: 12px; }
.privacy-guide { display: flex; width: 100%; margin-top: 5px; font-size: 12px; }
</style>
