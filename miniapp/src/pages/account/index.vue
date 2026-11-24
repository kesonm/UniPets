<script setup lang="ts">
import { ref } from 'vue'
import { onHide } from '@dcloudio/uni-app'
import type { PersonalContentCounts, PersonalContentTab } from '../../../../src/h5/types'
import { api, user, go } from '../../lib/client'
import { listPets } from '../../lib/pets'
import { pageLoad } from '../../lib/page'
import { useTabPage } from '../../lib/tab-page'
import { orderPanel } from '../../lib/cart'
import AccountAvatar from '../../components/AccountAvatar.vue'
import LoginDialog from '../../components/LoginDialog.vue'
import UiIcon from '../../components/UiIcon.vue'

const entries = [
  { id: 'stores', icon: 'entry-services', title: '我的门店', page: 'stores' },
  { id: 'orders', icon: 'account-orders', title: '订单与售后', page: 'orders' },
  { id: 'appointments', icon: 'account-appointments', title: '预约记录', page: 'activity', args: { panel: 'appointments' } },
  { id: 'assets', icon: 'account-assets', title: '资产中心', page: 'activity', args: { panel: 'assets' } },
  { id: 'learning', icon: 'account-learning', title: '我的课程', page: 'activity', args: { panel: 'learning' } },
  { id: 'help', icon: 'account-help', title: '帮助与客服', page: '' },
] as const
const contentLinks = [
  {id:'published',label:'发布',icon:'account-published'},
  {id:'likes',label:'点赞',icon:''},
  {id:'favorites',label:'收藏',icon:'account-favorites'},
] as const
const tabLayout = useTabPage('pages/account/index')
const loginDialog = ref(false)
const help = ref(false)
const petCount = ref(0)
const emptyCounts: PersonalContentCounts = {published:0,likes:0,favorites:0}
const counts = ref<PersonalContentCounts>(emptyCounts)
const { error: countError, refresh } = pageLoad(async () => {
  const owner = user.value?.id
  if (!owner) return
  await Promise.all([
    listPets().then(pets => { if (user.value?.id === owner) petCount.value = pets.length }),
    api<{counts:PersonalContentCounts}>('/h5/posts/mine/counts').then(result => {
      if (user.value?.id === owner) counts.value = result.counts
    }),
  ])
}, () => { petCount.value = 0; counts.value = emptyCounts })
onHide(() => { help.value = false })

function openContent(tab: PersonalContentTab) {
  if (!user.value) {
    loginDialog.value = true
    return
  }
  go('my-content', {tab})
}
function editProfile() {
  if (!user.value) {
    loginDialog.value = true
    return
  }
  go('profile')
}
function open(item: (typeof entries)[number]) {
  if (item.id === 'help') { help.value = true; return }
  if (item.id === 'stores' && !user.value) { loginDialog.value = true; return }
  if (item.id === 'orders') orderPanel.value = 'orders'
  go(item.page, 'args' in item ? item.args : {})
}
</script>

<template>
  <view class="account-page tab-screen" :style="tabLayout">
    <view class="account-head">
      <view class="tab-leading account-profile">
        <button id="account-avatar" class="account-avatar-button" :aria-label="user ? '编辑头像' : '点击头像登录'" @tap="editProfile">
          <AccountAvatar :size="44" />
        </button>
        <view class="account-identity">
          <text class="account-name">{{ user?.displayName || '未登录' }}</text>
          <text v-if="user?.publicId" class="account-id">ID {{ user.publicId }}</text>
          <text v-else-if="!user" class="account-caption">点击头像登录</text>
        </view>
        <button v-if="!user" id="open-wechat-login" class="small primary account-action account-login" @tap="loginDialog = true">登录 / 注册</button>
        <button v-else id="edit-account-profile" class="text-button account-action" @tap="editProfile"><UiIcon name="account-settings" :size="13" />编辑资料</button>
      </view>
      <view class="account-stats">
        <button v-for="item in contentLinks" :id="'account-stat-'+item.id" :key="item.id" class="account-stat"
          :aria-label="'我的'+item.label+' '+counts[item.id]+' 条'" @tap="openContent(item.id)">
          <text>{{ item.label }}</text>
          <UiIcon v-if="item.icon" :name="item.icon" :size="15" />
          <text v-else class="account-like-icon" aria-hidden="true">♡</text>
          <text class="account-stat-count">{{ counts[item.id] }}</text>
        </button>
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
        <button v-for="item in entries" :id="'account-link-'+item.id" :key="item.id" class="account-link" @tap="open(item)">
          <UiIcon :name="item.icon" :size="17" />
          <text>{{ item.title }}</text><UiIcon name="right" :size="13" />
        </button>
      </view>
    </view>
    <LoginDialog v-if="loginDialog" @close="loginDialog = false" />
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
.account-head { padding: var(--tab-start, 8px) 14px 12px; background: linear-gradient(#ffe78a, #fff2bf 76%, #f5f4f1); }
.account-profile { display: flex; align-items: center; gap: 9px; min-height: max(48px, var(--tab-row-height, 40px)); }
.account-avatar-button { flex: none; padding: 0; border: 0; border-radius: 50%; background: transparent; }
.account-identity { display: flex; flex: 1; min-width: 0; flex-direction: column; justify-content: center; gap: 2px; }
.account-name { display: block; overflow: hidden; white-space: nowrap; text-overflow: ellipsis; font-size: 17px; font-weight: 850; line-height: 1.25; }
.account-id, .account-caption { display: block; color: #65531c; font-size: 11px; line-height: 1.25; white-space: nowrap; }
.account-id { font-variant-numeric: tabular-nums; letter-spacing: .25px; }
.account-caption { overflow: hidden; text-overflow: ellipsis; }
.account-action { flex: none; min-height: 32px; white-space: nowrap; }
.account-login { padding-inline: 9px; }
.account-stats {
  display: grid;
  grid-template-columns: repeat(3, minmax(0,1fr));
  margin-top: 12px;
  padding: 4px 0;
  border: 1px solid rgba(170,132,36,.16);
  border-radius: 14px;
  background: rgba(255,255,255,.63);
}
.account-stat {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 5px;
  min-width: 0;
  padding: 7px 4px 5px;
  border: 0;
  border-radius: 0;
  background: transparent;
  color: #554218;
  font-size: 12px;
  font-weight: 600;
  line-height: 1.15;
}
.account-stat + .account-stat { border-left: 1px solid rgba(170,132,36,.15); }
.account-like-icon { height: 15px; color: #8b681f; font-size: 17px; font-weight: 700; line-height: 15px; }
.account-stat-count { color: var(--ink); font-size: 16px; font-weight: 800; font-variant-numeric: tabular-nums; }
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
