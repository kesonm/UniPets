<script setup lang="ts">
import { ref, computed, watch } from 'vue'
import { onLoad, onShareAppMessage } from '@dcloudio/uni-app'
import type { H5Post, H5Comment, H5Social } from '../../../../src/h5/types'
import { examplePosts, feedSorting } from '../../../../src/h5/home'
import type { Pet, Asset } from '../../../../src/lib/types'
import { h5Areas } from '../../../../shared/h5-areas.mjs'
import { api, user, go, publicImage, confirm, toast } from '../../lib/client'
import { listPets } from '../../lib/pets'
import { pageLoad, submitAction } from '../../lib/page'
import { homeImage } from '../../lib/home'
import LoadState from '../../components/LoadState.vue'
import LoginCard from '../../components/LoginCard.vue'
import PetPicker from '../../components/PetPicker.vue'
import ChoiceField from '../../components/ChoiceField.vue'
import PostGrid from '../../components/PostGrid.vue'
const mode = ref('all'),
  id = ref(''),
  query = ref(''),
  sort = ref('recommended'),
  area = ref(''),
  page = ref(1),
  more = ref(false)
const example = computed(() => examplePosts.find((post) => post.id === id.value))
const areas = [{ id: '', label: '不限地区' }, ...h5Areas],
  topic = ref('daily'),
  petType = ref('other'),
  topics = [
    { id: 'daily', label: '日常' },
    { id: 'travel', label: '出行' },
    { id: 'rescue', label: '救助' },
    { id: 'help', label: '求助' },
  ]
const otherPetTypes = [{id:'other',label:'其他宠物'},{id:'rabbit',label:'兔'}]
const posts = ref<H5Post[]>([]),
  current = ref<H5Post>(),
  comments = ref<H5Comment[]>([]),
  social = ref<H5Social>(),
  myComments = ref<string[]>([])
const mineTab = ref('published'),
  pets = ref<Pet[]>([]),
  petId = ref(''),
  assetId = ref(''),
  assets = ref<Asset[]>([]),
  title = ref(''),
  body = ref(''),
  reply = ref('')
const selectedPet = computed(() => pets.value.find(pet => pet.id === petId.value))
const visiblePosts = computed(() =>
  mode.value === 'mine'
    ? (mineTab.value === 'published' ? social.value?.published : social.value?.favorites) || []
    : posts.value,
)
const photoOptions = computed(() => [
  { id: '', label: '不附照片' },
  ...assets.value.filter((a) => a.petId === petId.value).map((a) => ({ id: a.id, label: a.name })),
])
watch(petId, () => {
  assetId.value = ''
  petType.value = /兔|rabbit/i.test(selectedPet.value?.breed || '') ? 'rabbit' : 'other'
})
onLoad((q) => {
  id.value = q?.id || ''
  mode.value = q?.mode || (id.value ? 'detail' : 'all')
  if (q?.tab === 'favorites') mineTab.value = 'favorites'
  if (q?.area && h5Areas.some((item) => item.id === q.area)) area.value = q.area
})
onShareAppMessage(() => ({
  title: current.value?.title || '宠云社区',
  path: '/pages/feed/index' + (id.value ? '?id=' + id.value : ''),
}))
async function fetchPage(n: number) {
  const result = await api<{ posts: H5Post[]; hasMore: boolean }>(
    '/h5/posts?sort=' +
      sort.value +
      '&page=' +
      n +
      '&q=' +
      encodeURIComponent(query.value) +
      (area.value ? '&area=' + area.value : ''),
  )
  posts.value = n === 1 ? result.posts : posts.value.concat(result.posts)
  more.value = result.hasMore
  page.value = n
}
async function load() {
  if (mode.value === 'all') return fetchPage(1)
  if (mode.value === 'write' && user.value) {
    const [p, a] = await Promise.all([listPets(), api<{ assets: Asset[] }>('/assets?kind=photo')])
    pets.value = p
    assets.value = a.assets
    if (!p.some((x) => x.id === petId.value)) petId.value = p[0]?.id || ''
  }
  if (mode.value === 'private') {
    social.value = user.value ? await api<H5Social>('/h5/me') : undefined
    current.value = social.value?.published.find(post => post.id === id.value)
    if (!current.value && user.value) throw new Error('动态不存在')
    return
  }
  if (mode.value === 'detail') {
    if (example.value) {
      current.value = example.value
      return
    }
    const [p, c] = await Promise.all([
      api<{ post: H5Post }>('/h5/posts/' + id.value),
      api<{ comments: H5Comment[] }>('/h5/posts/' + id.value + '/comments'),
    ])
    current.value = p.post
    comments.value = c.comments
  }
  if (user.value && (mode.value === 'mine' || mode.value === 'detail')) {
    social.value = await api<H5Social>('/h5/me')
    if (mode.value === 'detail')
      myComments.value = (await api<{ ids: string[] }>('/h5/my-comments/' + id.value)).ids
  }
}
const { error, loading, refresh } = pageLoad(load, () => {
  social.value = undefined
  myComments.value = []
  pets.value = []
  assets.value = []
})
const { run, busy, error: actionError } = submitAction()
function setSort(value: string) {
  sort.value = value
  void refresh()
}
function publish() {
  return run(async () => {
    const r = await api<{ post: H5Post }>('/h5/posts', 'POST', {
      petId: petId.value,
      assetId: assetId.value || null,
      title: title.value,
      body: body.value,
      area: area.value || null,
      topic: topic.value,
      ...(selectedPet.value?.species === 'other' ? { petType: petType.value } : {}),
    })
    uni.redirectTo({ url: '/pages/feed/index?id=' + r.post.id })
  })
}
function react(kind: 'like' | 'favorite') {
  return run(async () => {
    const active = !(kind === 'like' ? social.value?.likedIds : social.value?.savedIds)?.includes(id.value)
    await api('/h5/posts/' + id.value + '/reaction', 'PUT', { kind, active })
    await load()
  })
}
function comment() {
  return run(async () => {
    await api('/h5/posts/' + id.value + '/comments', 'POST', { body: reply.value })
    reply.value = ''
    await load()
  })
}
function remove(commentId = '') {
  return run(async () => {
    if (!(await confirm('确认删除', commentId ? '删除这条评论？' : '删除这条动态？'))) return
    await api('/h5/posts/' + id.value + (commentId ? '/comments/' + commentId : ''), 'DELETE')
    if (commentId) await load()
    else {
      toast('动态已删除')
      uni.redirectTo({ url: '/pages/feed/index' })
    }
  })
}
const owned = computed(() => social.value?.published.some((p) => p.id === id.value))
</script>
<template>
  <view class="screen">
    <LoadState :error="error" :loading="loading" @retry="refresh" />
    <text v-if="actionError" class="error">{{ actionError }}</text>
    <LoginCard v-if="!user && (mode === 'write' || mode === 'mine' || mode === 'private')" />
    <view v-if="mode === 'all'" class="card">
      <view class="spread">
        <text class="heading">社区动态</text>
        <button class="small primary" @tap="go('feed', { mode: 'write' })">发动态</button>
      </view>
      <input
        v-model="query"
        maxlength="60"
        placeholder="搜索宠物、作者或动态"
        confirm-type="search"
        @confirm="refresh"
      />
      <view class="chips">
        <button
          v-for="s in feedSorting"
          :key="s.id"
          :class="['chip', { active: sort === s.id }]"
          @tap="setSort(s.id)"
        >
          {{ s.name }}
        </button>
      </view>
      <template v-if="sort === 'near'">
        <ChoiceField v-model="area" :options="areas" @update:model-value="refresh" />
      </template>
      <button class="small" @tap="refresh">搜索</button>
    </view>
    <view v-if="mode === 'mine' && user" class="chips">
      <button :class="['chip', { active: mineTab === 'published' }]" @tap="mineTab = 'published'">我的发布</button>
      <button :class="['chip', { active: mineTab === 'favorites' }]" @tap="mineTab = 'favorites'">收藏</button>
      <button v-if="mineTab === 'favorites'" class="chip" @tap="go('stories', { mode: 'mine', tab: 'favorites' })">短剧收藏</button>
    </view>
    <template v-if="mode === 'all' || (mode === 'mine' && user)">
      <PostGrid :posts="visiblePosts" @view="go('feed', { id: $event.id, mode: $event.hidden ? 'private' : 'detail' })" />
      <text v-if="!loading && !error && !visiblePosts.length" class="empty">暂无动态</text>
      <button v-if="more && mode === 'all'" :disabled="busy" @tap="run(() => fetchPage(page + 1))">
        加载更多
      </button>
    </template>
    <view v-if="mode === 'write' && user" class="card">
      <text class="heading">发动态</text>
      <PetPicker v-model="petId" :pets="pets" />
      <template v-if="selectedPet?.species === 'other'">
        <text class="label">宠物类型</text>
        <ChoiceField v-model="petType" :options="otherPetTypes" />
      </template>
      <text class="label">标题</text>
      <input v-model="title" maxlength="100" />
      <text class="label">正文</text>
      <textarea v-model="body" maxlength="3000" />
      <text class="label">主题</text>
      <ChoiceField v-model="topic" :options="topics" />
      <text class="label">地区</text>
      <ChoiceField v-model="area" :options="areas" />
      <text class="label">档案照片</text>
      <ChoiceField v-model="assetId" :options="photoOptions" />
      <view class="actions">
        <button class="primary" :disabled="busy || !petId || !title.trim()" @tap="publish">发布动态</button>
      </view>
    </view>
    <template v-if="current && (mode === 'detail' || (mode === 'private' && user))">
      <view class="card">
        <text class="title">{{ current.title }}</text>
        <text class="sub">{{ current.petName }} · {{ current.author }}</text>
        <text v-if="current.hidden" class="sub">这条动态已隐藏</text>
        <image
          v-if="current.hasImage"
          class="photo"
          mode="aspectFill"
          :src="current.exampleImage ? homeImage(current.exampleImage) : publicImage('/h5/posts/' + id + '/image')"
        />
        <text class="body">{{ current.body }}</text>
        <view v-if="!example" class="actions">
          <button v-if="user && mode !== 'private'" class="small" :disabled="busy" @tap="react('like')">
            {{ social?.likedIds.includes(id) ? '已赞' : '赞' }} {{ current.likes }}
          </button>
          <button v-if="user && mode !== 'private'" class="small" :disabled="busy" @tap="react('favorite')">
            {{ social?.savedIds.includes(id) ? '已收藏' : '收藏' }}
          </button>
          <button v-if="mode !== 'private'" class="small" open-type="share">分享</button>
          <button v-if="owned" class="small danger" :disabled="busy" @tap="remove()">删除</button>
        </view>
      </view>
      <LoginCard v-if="!user && !example" />
      <view v-if="!example && mode !== 'private'" class="card">
        <text class="heading">评论</text>
        <template v-if="user">
          <input v-model="reply" maxlength="500" placeholder="写条评论" />
          <view class="actions">
            <button class="small primary" :disabled="busy || !reply.trim()" @tap="comment">发送</button>
          </view>
        </template>
        <view v-for="c in comments" :key="c.id" class="line">
          <text class="sub">{{ c.author }}</text>
          <text class="body">{{ c.body }}</text>
          <button v-if="myComments.includes(c.id)" class="chip" :disabled="busy" @tap="remove(c.id)">
            删除
          </button>
        </view>
        <text v-if="!comments.length" class="empty">暂无评论</text>
      </view>
    </template>
  </view>
</template>
