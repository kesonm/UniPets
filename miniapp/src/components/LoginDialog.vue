<script setup lang="ts">
import { go, login, loginError, loggingIn, openPrivacyGuide } from '../lib/client'

const emit = defineEmits<{ close: [] }>()
loginError.value = ''

function close() {
  if (!loggingIn.value) emit('close')
}

async function signIn() {
  if (loggingIn.value) return
  const result = await login()
  if (!result) return
  emit('close')
  if (result.firstLogin) go('profile', { setup: '1' })
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
      <text class="sub login-description">首次使用微信登录会自动注册。</text>
      <button id="confirm-wechat-login" class="primary login-button" :loading="loggingIn" :disabled="loggingIn" @tap="signIn">
        微信一键登录
      </button>
      <text v-if="loginError" class="error" role="status">{{ loginError }}</text>
      <button class="text-button privacy-guide" @tap="openPrivacyGuide">小程序用户隐私保护指引</button>
    </view>
  </view>
</template>

<style scoped>
.login-panel { padding: 16px; }
.login-brand { display: flex; align-items: center; gap: 9px; }
.login-mark { width: 32px; height: 32px; border-radius: 9px; }
.login-heading { margin: 0; }
.login-description { margin-top: 10px; }
.login-button { width: 100%; margin-top: 14px; }
.privacy-guide { display: flex; width: 100%; margin-top: 5px; font-size: 12px; }
</style>
