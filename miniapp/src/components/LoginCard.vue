<script setup lang="ts">
import { login, loggingIn, loginError } from '../lib/client'
</script>
<template>
  <view class="sheet">
    <text class="heading">登录宠云</text>
    <text class="sub">用微信保存自己的宠物档案。首次登录会自动创建账号。</text>
    <view class="actions">
      <button class="primary" :loading="loggingIn" :disabled="loggingIn" @tap="login">微信一键登录</button>
    </view>
    <text v-if="loginError" class="error">{{ loginError }}</text>
  </view>
</template>
