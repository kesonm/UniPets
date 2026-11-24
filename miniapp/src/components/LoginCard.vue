<script setup lang="ts">
import { ref } from 'vue'
import LoginDialog from './LoginDialog.vue'

const dialog = ref(false)
</script>
<template>
  <view class="sheet">
    <text class="heading">登录宠云</text>
    <text class="sub">用微信保存自己的宠物档案。首次登录会自动创建账号。</text>
    <view class="actions">
      <button class="primary" @tap="dialog = true">微信一键登录</button>
    </view>
    <LoginDialog v-if="dialog" @close="dialog = false" />
  </view>
</template>
