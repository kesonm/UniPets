<script setup lang="ts">
import { ref } from 'vue'
import { login, loginError, loggingIn, openPrivacyGuide } from '../lib/client'
import AccountAvatar from './AccountAvatar.vue'

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
      <view class="login-head">
        <button class="text-button login-cancel" :disabled="loggingIn" @tap="close">取消</button>
        <view class="login-brand">
          <image class="login-mark" src="/static/brand-mark.png" mode="aspectFit" aria-hidden="true" />
          <text class="heading login-heading">登录宠云</text>
        </view>
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
            <text class="login-field-label">头像</text>
            <view class="login-avatar-body">
              <AccountAvatar :size="46" :preview="avatar" />
            </view>
          </button>
          <view class="login-nickname-field">
            <text class="login-field-label">昵称</text>
            <view class="login-nickname-body">
              <input
                id="login-nickname"
                class="login-nickname-input"
                name="nickname"
                type="nickname"
                :always-embed="true"
                maxlength="40"
                placeholder="微信昵称或自行输入"
                aria-label="昵称"
                :disabled="loggingIn"
              />
            </view>
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
.login-head { position: relative; display: flex; justify-content: center; }
.login-cancel { position: absolute; top: -2px; right: 0; min-height: 30px; padding: 0; }
.login-brand { display: flex; flex-direction: column; align-items: center; gap: 7px; }
.login-mark { width: 48px; height: 48px; border-radius: 13px; box-shadow: 0 5px 14px rgba(167, 120, 3, 0.14); }
.login-heading { margin: 0; text-align: center; }
.login-description { display: block; margin-top: 8px; text-align: center; }
.login-fields {
  display: flex;
  width: 100%;
  margin-top: 14px;
  overflow: hidden;
  border: 1px solid #efe6cf;
  border-radius: 14px;
  background: #fffdf6;
}
.login-avatar-picker {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: flex-start;
  gap: 5px;
  width: 50%;
  padding: 10px 8px 12px;
  border: 0;
  border-right: 1px solid #efe6cf;
  border-radius: 0;
  background: transparent;
  text-align: center;
}
.login-field-label { display: block; color: #33290d; font-size: 13px; font-weight: 750; text-align: center; }
.login-avatar-body { display: flex; flex: 1; flex-direction: column; align-items: center; justify-content: center; gap: 4px; width: 100%; }
.login-nickname-field {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: flex-start;
  gap: 5px;
  width: 50%;
  min-height: 104px;
  margin: 0;
  padding: 10px 8px 12px;
  border: 0;
  text-align: center;
}
.login-nickname-body { display: flex; flex: 1; align-items: center; justify-content: center; width: 100%; }
.login-nickname-input { width: 100%; padding: 0; border: 0; background: transparent; font-size: 13px; text-align: center; }
.login-button { width: 100%; margin-top: 14px; border-radius: 12px; }
.privacy-guide { display: flex; width: 100%; margin-top: 5px; font-size: 12px; text-align: center; }
</style>
