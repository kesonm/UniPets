<script setup lang="ts">
import { computed, ref } from 'vue'
import { onLoad } from '@dcloudio/uni-app'
import type { Pet } from '../../../../src/lib/types'
import type { H5Comment, H5Creator, H5Match, H5FriendRequest } from '../../../../src/h5/types'
import { h5Areas } from '../../../../shared/h5-areas.mjs'
import { api, user, go, toast, speciesNames } from '../../lib/client'
import { listPets } from '../../lib/pets'
import { pageLoad, submitAction } from '../../lib/page'
import LoadState from '../../components/LoadState.vue'
import LoginCard from '../../components/LoginCard.vue'
import PetPicker from '../../components/PetPicker.vue'
import ChoiceField from '../../components/ChoiceField.vue'
const group = ref(''),
  creatorId = ref(''),
  tab = ref('匹配'),
  tabs = ['匹配', '我的名片', '邀请', '达人']
const pets = ref<Pet[]>([]),
  petId = ref(''),
  matches = ref<H5Match[]>([]),
  mine = ref<H5Match[]>([]),
  invites = ref<H5FriendRequest[]>([])
const areas = [...h5Areas],
  area = ref(areas[0].id),
  intent = ref('friends'),
  intro = ref(''),
  filter = ref('')
const filterAreas = [{ id: '', label: '全部地区' }, ...areas],
  intents = [
    { id: 'friends', label: '交朋友' },
    { id: 'dating', label: '寻伴' },
    { id: 'both', label: '都可以' },
  ]
const messages = ref<H5Comment[]>([]),
  chat = ref(''),
  creators = ref<H5Creator[]>([]),
  creator = ref<H5Creator>(),
  posts = ref<{ id: string; title: string }[]>([])
const profile = computed(() => mine.value.find((m) => m.petId === petId.value))
const available = computed(() => matches.value.filter((m) => !pets.value.some((p) => p.id === m.petId)))
onLoad((o) => {
  group.value = o?.group || ''
  creatorId.value = o?.creator || ''
  if (o?.panel && tabs.includes(o.panel)) tab.value = o.panel
  if (o?.area && areas.some((item) => item.id === o.area)) filter.value = o.area
})
function fill() {
  area.value = profile.value?.area || areas[0].id
  intent.value = profile.value?.intent || 'friends'
  intro.value = profile.value?.introduction || ''
}
async function load() {
  if (group.value) {
    if (user.value)
      messages.value = (
        await api<{ messages: H5Comment[] }>('/h5/groups/' + group.value + '/messages')
      ).messages
    return
  }
  if (creatorId.value) {
    const r = await api<{ creator: H5Creator; posts: { id: string; title: string }[] }>(
      '/h5/creators/' + creatorId.value,
    )
    creator.value = r.creator
    posts.value = r.posts
    return
  }
  if (tab.value === '达人') {
    creators.value = (await api<{ creators: H5Creator[] }>('/h5/creators')).creators
    return
  }
  if (tab.value === '匹配')
    matches.value = (
      await api<{ matches: H5Match[] }>('/h5/matches' + (filter.value ? '?area=' + filter.value : ''))
    ).matches
  if (!user.value) return
  pets.value = await listPets()
  if (!pets.value.some((p) => p.id === petId.value)) petId.value = pets.value[0]?.id || ''
  if (tab.value === '我的名片') {
    mine.value = (await api<{ matches: H5Match[] }>('/h5/my-matches')).matches
    fill()
  }
  if (tab.value === '邀请')
    invites.value = (await api<{ requests: H5FriendRequest[] }>('/h5/friend-requests')).requests
}
const { loading, error, refresh } = pageLoad(load, () => {
  pets.value = []
  petId.value = ''
  mine.value = []
  invites.value = []
  messages.value = []
  chat.value = ''
})
const { run, busy, error: actionError } = submitAction()
function change(t: string) {
  tab.value = t
  void refresh()
}
function join(targetPetId: string) {
  return run(async () => {
    await api('/h5/friend-requests', 'POST', { sourcePetId: petId.value, targetPetId })
    toast('邀请已发送')
  })
}
function answer(id: string, status: string) {
  return run(async () => {
    await api('/h5/friend-requests/' + id, 'PUT', { status })
    await load()
  })
}
function save(remove = false) {
  return run(async () => {
    if (remove) await api('/h5/my-matches/' + petId.value, 'DELETE')
    else
      await api('/h5/my-matches/' + petId.value, 'PUT', {
        area: area.value,
        intent: intent.value,
        introduction: intro.value,
      })
    await load()
    toast(remove ? '名片已撤下' : '名片已保存')
  })
}
function send() {
  return run(async () => {
    await api('/h5/groups/' + group.value + '/messages', 'POST', { body: chat.value })
    chat.value = ''
    await load()
  })
}
</script>
<template>
  <view class="screen">
    <LoadState :loading="loading" :error="error" @retry="refresh" />
    <text v-if="actionError" class="error">{{ actionError }}</text>
    <template v-if="group">
      <LoginCard v-if="!user" />
      <view v-else class="card">
        <view class="spread">
          <text class="heading">社群聊天</text>
          <button class="small" @tap="refresh">刷新</button>
        </view>
        <text v-if="!messages.length && !loading && !error" class="empty">暂无消息</text>
        <view v-for="m in messages" :key="m.id" class="line">
          <text class="sub">{{ m.author }}</text>
          <text class="body">{{ m.body }}</text>
        </view>
        <text class="label">发消息</text>
        <input v-model="chat" maxlength="500" />
        <view class="actions">
          <button class="primary" :disabled="busy || !chat.trim()" @tap="send">发送</button>
        </view>
      </view>
    </template>
    <view v-else-if="creatorId && creator" class="card">
      <text class="title">{{ creator.name }}</text>
      <text class="body">{{ creator.bio }}</text>
      <view v-for="p in posts" :key="p.id" class="line" @tap="go('feed', { id: p.id })">{{ p.title }} ›</view>
    </view>
    <template v-else-if="!creatorId">
      <view class="chips">
        <button v-for="t in tabs" :key="t" :class="['chip', { active: tab === t }]" @tap="change(t)">
          {{ t }}
        </button>
      </view>
      <view v-if="tab === '达人'" class="card">
        <text class="heading">社区达人</text>
        <text v-if="!loading && !creators.length" class="empty">暂无达人成员</text>
        <view v-for="c in creators" :key="c.id" class="line" @tap="go('social', { creator: c.id })">
          {{ c.name }} · {{ c.postCount }} 条动态 ›
        </view>
      </view>
      <template v-else>
        <LoginCard v-if="!user" />
        <view v-if="(tab === '匹配' || tab === '我的名片') && user" class="card">
          <PetPicker v-model="petId" :pets="pets" @update:model-value="fill" />
        </view>
        <template v-if="tab === '匹配'">
          <view class="card">
            <ChoiceField v-model="filter" :options="filterAreas" @update:model-value="refresh" />
          </view>
          <view v-for="m in available" :key="m.petId" class="card">
            <text class="heading">{{ m.petName }}</text>
            <text class="sub">{{ speciesNames[m.species] }}　{{ m.breed }}</text>
            <text class="body">{{ m.introduction }}</text>
            <button v-if="user" class="small primary" :disabled="busy || !petId" @tap="join(m.petId)">
              发送宠友邀请
            </button>
          </view>
          <text v-if="!loading && !error && !available.length" class="empty">这里暂时没有匹配名片</text>
        </template>
        <view v-if="tab === '我的名片' && user && petId" class="card">
          <text class="heading">公开匹配名片</text>
          <text class="label">地区</text>
          <ChoiceField v-model="area" :options="areas" />
          <text class="label">意向</text>
          <ChoiceField v-model="intent" :options="intents" />
          <text class="label">介绍</text>
          <textarea v-model="intro" maxlength="300" />
          <view class="actions">
            <button class="primary" :disabled="busy" @tap="save()">保存并公开</button>
            <button v-if="profile" :disabled="busy" @tap="save(true)">撤下名片</button>
          </view>
        </view>
        <view v-if="tab === '邀请' && user" class="card">
          <text v-if="!invites.length" class="empty">暂无邀请</text>
          <view v-for="i in invites" :key="i.id" class="line">
            <text>{{ i.sourceName }} → {{ i.targetName }}</text>
            <text class="sub">
              {{ i.status === 'accepted' ? '已接受' : i.status === 'declined' ? '已婉拒' : '等待回复' }}
            </text>
            <view v-if="i.incoming && i.status === 'pending'" class="actions">
              <button class="small primary" :disabled="busy" @tap="answer(i.id, 'accepted')">接受</button>
              <button class="small" :disabled="busy" @tap="answer(i.id, 'declined')">婉拒</button>
            </view>
          </view>
        </view>
      </template>
    </template>
  </view>
</template>
