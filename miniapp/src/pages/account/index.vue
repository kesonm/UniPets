<script setup lang="ts">
import { ref, watch } from 'vue'
import { onHide } from '@dcloudio/uni-app'
import { user, go, confirm, logout, openPrivacyGuide } from '../../lib/client'
import { listPets } from '../../lib/pets'
import { pageLoad, submitAction } from '../../lib/page'
import { useTabPage } from '../../lib/tab-page'
import { orderPanel } from '../../lib/cart'
import AccountAvatar from '../../components/AccountAvatar.vue'
import LoginDialog from '../../components/LoginDialog.vue'
import UiIcon from '../../components/UiIcon.vue'

const entries = [
  { id: 'published', title: '我的发布', page: 'feed', args: { mode: 'mine' } },
  { id: 'favorites', title: '收藏', page: 'feed', args: { mode: 'mine', tab: 'favorites' } },
  { id: 'orders', title: '订单与售后', page: 'orders' },
  { id: 'appointments', title: '预约记录', page: 'activity', args: { panel: 'appointments' } },
  { id: 'assets', title: '资产中心', page: 'activity', args: { panel: 'assets' } },
  { id: 'ip', title: '我的 IP', page: 'stories', args: { mode: 'mine' } },
  { id: 'learning', title: '我的课程', page: 'activity', args: { panel: 'learning' } },
  { id: 'creator', title: '达人权益', page: 'activity', args: { panel: 'creator' } },
  { id: 'charity', title: '公益记录', page: 'activity', args: { panel: 'charity' } },
  { id: 'help', title: '帮助与客服', page: '' },
  { id: 'settings', title: '账号与隐私', page: '' },
] as const
const tabLayout = useTabPage('pages/account/index')
const loginDialog = ref(false)
const settings = ref(false)
const help = ref(false)
const petCount = ref(0)
const { error: countError, refresh } = pageLoad(async () => {
  const owner = user.value?.id
  if (!owner) return
  const pets = await listPets()
  if (user.value?.id === owner) petCount.value = pets.length
}, () => { petCount.value = 0 })
const { run, busy, error } = submitAction()
watch(() => user.value?.id, () => { settings.value = false })
onHide(() => { settings.value = false; help.value = false })

function openSettings() {
  if (!user.value) {
    loginDialog.value = true
    return
  }
  settings.value = true
}
function editProfile() {
  settings.value = false
  go('profile')
}
function open(item: (typeof entries)[number]) {
  if (item.id === 'settings') return openSettings()
  if (item.id === 'help') { help.value = true; return }
  if (item.id === 'orders') orderPanel.value = 'orders'
  go(item.page, 'args' in item ? item.args : {})
}
function signOut() {
  return run(async () => {
    if (await confirm('退出登录', '下次可用同一微信找回档案。')) await logout()
  })
}
</script>

<template>
  <view class="account-page tab-screen" :style="tabLayout">
    <view class="account-head">
      <view class="tab-leading account-profile">
        <AccountAvatar />
        <view class="grow">
          <text class="account-name">{{ user?.displayName || '欢迎来到云上空间' }}</text>
          <text class="sub">{{ user ? '微信账号' : '登录后创建自己的宠物档案' }}</text>
        </view>
      </view>
      <view class="account-actions">
        <button v-if="!user" id="open-wechat-login" class="small primary account-action account-login" @tap="loginDialog = true">登录 / 注册</button>
        <button v-else id="edit-account-profile" class="text-button account-action" @tap="editProfile"><UiIcon name="account-settings" :size="15" />编辑资料</button>
      </view>
    </view>
    <view class="account-content">
      <view v-if="countError" class="spread">
        <text class="error">{{ countError }}</text><button class="text-button" @tap="refresh">重试</button>
      </view>
      <view class="card account-archives">
        <button class="account-link" @tap="go('pets')">
          <UiIcon name="account-pets" :size="18" />
          <text>我的宠物档案 <text class="account-count">{{ petCount }}</text> 只</text>
          <UiIcon name="right" :size="13" />
        </button>
        <button class="text-button" :disabled="petCount >= 3" @tap="go('pet-edit')"><UiIcon name="plus" :size="13" />新建</button>
      </view>
      <view class="card account-links">
        <button v-for="item in entries" :key="item.id" class="account-link" @tap="open(item)">
          <UiIcon :name="'account-' + item.id" :size="17" />
          <text>{{ item.title }}</text><UiIcon name="right" :size="13" />
        </button>
      </view>
    </view>
    <LoginDialog v-if="loginDialog" @close="loginDialog = false" />
    <view v-if="settings && user" class="modal-scrim" @tap="settings = false">
      <view class="modal-panel" role="dialog" aria-label="账号与隐私" @tap.stop>
        <view class="spread"><text class="heading">账号与隐私</text><button class="text-button" @tap="settings = false">关闭</button></view>
        <button class="account-link" @tap="editProfile">
          <UiIcon name="account-avatar" :size="16" /><text>编辑头像和昵称</text><UiIcon name="right" :size="13" />
        </button>
        <button class="account-link" @tap="openPrivacyGuide">
          <UiIcon name="account-help" :size="16" /><text>小程序用户隐私保护指引</text><UiIcon name="right" :size="13" />
        </button>
        <text v-if="error" class="error">{{ error }}</text>
        <view class="actions">
          <button :disabled="busy" @tap="signOut">退出登录</button>
        </view>
      </view>
    </view>
    <view v-if="help" class="modal-scrim" @tap="help = false">
      <view class="modal-panel" role="dialog" aria-label="帮助与客服" @tap.stop>
        <view class="spread"><text class="heading">帮助与客服</text><button class="text-button" @tap="help = false">关闭</button></view>
        <text class="label">购物和售后</text>
        <text class="body">平台订单可在「订单与售后」查询，商家外链的订单由商家处理。</text>
        <text class="label">宠物资料</text>
        <text class="body">上传的照片、健康记录和纪念馆默认仅账号内可见。公开动态、交友档案和短剧由你确认发布。</text>
      </view>
    </view>
  </view>
</template>

<style scoped>
.account-page { max-width: 500px; margin: auto; }
.account-head { padding: var(--tab-start, 8px) 14px 5px; background: linear-gradient(#ffe78a, #fff2bf 78%, #f5f4f1); }
.account-profile { display: flex; align-items: center; gap: 9px; }
.account-name { display: block; overflow: hidden; white-space: nowrap; text-overflow: ellipsis; font-size: 18px; font-weight: 850; }
.account-head .sub { color: #65531c; font-size: 11px; }
.account-actions { display: flex; justify-content: flex-end; padding: 2px 0 4px; }
.account-actions .account-action { min-height: 34px; }
.account-login { flex: none; padding-inline: 11px; }
.account-content { padding: 5px 14px 0; }
.account-archives { display: flex; align-items: center; gap: 4px; padding: 0 10px; margin-bottom: 12px; }
.account-archives .account-link { flex: 1; min-width: 0; border: 0; color: #44340e; }
.account-count { font-weight: 850; }
.account-links { padding: 0 10px; }
.account-link {
  display: flex;
  align-items: center;
  gap: 10px;
  width: 100%;
  min-height: 46px;
  padding: 8px 2px;
  border: 0;
  border-bottom: 1px solid #f0ede4;
  border-radius: 0;
  background: transparent;
  color: #262422;
  font-weight: 500;
  text-align: left;
}
.account-link > text { flex: 1; min-width: 0; }
.account-link:last-child { border-bottom: 0; }
</style>
