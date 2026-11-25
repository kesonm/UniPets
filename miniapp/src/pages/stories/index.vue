<script setup lang="ts">
import { ref, computed, watch } from 'vue'
import { onLoad, onShareAppMessage } from '@dcloudio/uni-app'
import type { StorySummary, StoryDetail, PersonalStory } from '../../../../src/h5/business'
import type { Pet, Asset } from '../../../../src/lib/types'
import { api, user, go, publicImage, toast } from '../../lib/client'
import { pageLoad, submitAction } from '../../lib/page'
import { listPets } from '../../lib/pets'
import LoadState from '../../components/LoadState.vue'
import LoginCard from '../../components/LoginCard.vue'
import PetPicker from '../../components/PetPicker.vue'
import ChoiceField from '../../components/ChoiceField.vue'
const mode = ref('all'),
  id = ref(''),
  q = ref(''),
  stories = ref<StorySummary[]>([]),
  story = ref<StoryDetail>(),
  mine = ref<PersonalStory[]>([])
const fav = ref<StorySummary[]>([]),
  liked = ref<string[]>([]),
  showFav = ref(false),
  pets = ref<Pet[]>([]),
  petId = ref(''),
  title = ref(''),
  scenes = ref<string[]>(['']),
  cover = ref('')
const assets = ref<Asset[]>([]),
  photos = computed(() => [
    { id: '', label: '无封面' },
    ...assets.value.filter((a) => a.petId === petId.value).map((a) => ({ id: a.id, label: a.name })),
  ])
const list = computed(() => (mode.value === 'all' ? stories.value : showFav.value ? fav.value : mine.value))
onLoad((o) => {
  id.value = o?.id || ''
  mode.value = o?.mode || (id.value ? 'read' : 'all')
  if (mode.value === 'mine' || mode.value === 'write') {
    uni.setNavigationBarTitle({ title: mode.value === 'mine' ? '我的故事' : '故事编辑' })
  }
  showFav.value = o?.tab === 'favorites'
})
onShareAppMessage(() => ({
  title: story.value?.title || '宠物故事',
  path: '/pages/stories/index' + (mode.value === 'read' ? '?id=' + id.value : ''),
}))
watch(petId, () => {
  if (!photos.value.some((x) => x.id === cover.value)) cover.value = ''
})
let loadedDraft = false
async function load() {
  if (mode.value === 'all') {
    stories.value = (
      await api<{ stories: StorySummary[] }>('/h5/stories?q=' + encodeURIComponent(q.value))
    ).stories
    return
  }
  if (mode.value === 'read')
    story.value = (await api<{ story: StoryDetail }>('/h5/stories/' + id.value)).story
  if (!user.value) return
  if (mode.value === 'mine' || mode.value === 'read') {
    const r = await api<{ favorites: StorySummary[]; likedIds: string[] }>('/h5/my-story-reactions')
    fav.value = r.favorites
    liked.value = r.likedIds
  }
  if (mode.value === 'mine' || (mode.value === 'write' && id.value))
    mine.value = (await api<{ stories: PersonalStory[] }>('/h5/my-stories')).stories
  if (mode.value === 'write') {
    const [p, a] = await Promise.all([listPets(), api<{ assets: Asset[] }>('/assets?kind=photo')])
    pets.value = p
    assets.value = a.assets
    if (!loadedDraft) {
      const draft = mine.value.find((s) => s.id === id.value)
      if (id.value && !draft) throw new Error('故事不存在或无法编辑')
      petId.value = draft?.petId || p[0]?.id || ''
      title.value = draft?.title || ''
      scenes.value = draft?.scenes || ['']
      cover.value = draft?.coverAssetId || ''
      loadedDraft = !!petId.value
    }
  }
}
const { loading, error, refresh } = pageLoad(load, () => {
  mine.value = []
  fav.value = []
  liked.value = []
  loadedDraft = false
  assets.value = []
  pets.value = []
})
const { run, busy, error: actionError } = submitAction()
function save(publish: boolean) {
  return run(async () => {
    const data = {
      title: title.value,
      scenes: scenes.value.map((s) => s.trim()).filter(Boolean),
      coverAssetId: cover.value || null,
      publish,
    }
    if (!data.scenes.length) throw new Error('请至少填写一个分镜')
    const r = await api<{ id: string; hidden?: boolean }>(
      '/h5/stories' + (id.value ? '/' + id.value : ''),
      id.value ? 'PUT' : 'POST',
      id.value ? data : { ...data, petId: petId.value },
    )
    toast(r.hidden ? '故事已保存，目前仍隐藏' : publish ? '故事已发布' : '草稿已保存')
    uni.redirectTo({ url: '/pages/stories/index?' + (publish && !r.hidden ? 'id=' + r.id : 'mode=mine') })
  })
}
function react(kind: 'like' | 'favorite') {
  return run(async () => {
    await api('/h5/stories/' + id.value + '/reaction', 'PUT', {
      kind,
      active: kind === 'like' ? !liked.value.includes(id.value) : !fav.value.some((s) => s.id === id.value),
    })
    await load()
  })
}
const saved = computed(() => fav.value.some((s) => s.id === id.value))
function open(s: StorySummary) {
  go('stories', mode.value === 'mine' && !showFav.value ? { mode: 'write', id: s.id } : { id: s.id })
}
</script>
<template>
  <view class="screen">
    <LoadState :loading="loading" :error="error" @retry="refresh" />
    <text v-if="actionError" class="error">{{ actionError }}</text>
    <LoginCard v-if="(mode === 'write' || mode === 'mine') && !user" />
    <template v-if="mode === 'all' || (mode === 'mine' && user)">
      <view class="card row">
        <input
          v-if="mode === 'all'"
          v-model="q"
          class="grow"
          maxlength="60"
          placeholder="搜索故事"
          confirm-type="search"
          @confirm="refresh"
        />
        <view v-else class="row grow">
          <button class="chip" @tap="showFav = false">作品与草稿</button>
          <button class="chip" @tap="showFav = true">收藏</button>
        </view>
        <button class="small primary" @tap="go('stories', { mode: 'write' })">写故事</button>
      </view>
      <view v-for="s in list" :key="s.id" class="card" @tap="open(s)">
        <image
          v-if="s.hasCover && s.publishedAt && !s.hidden"
          class="photo"
          mode="aspectFill"
          :src="publicImage('/h5/stories/' + s.id + '/cover')"
        />
        <text class="heading">{{ s.title }}</text>
        <text class="sub">
          {{ s.petName }} · {{ s.sceneCount }} 个分镜 · {{ s.hidden ? '已隐藏' : s.publishedAt ? '已发布' : '草稿' }}
        </text>
      </view>
      <text v-if="!list.length && !loading && !error" class="empty">暂无故事</text>
    </template>
    <view v-if="mode === 'write' && user" class="card">
      <PetPicker v-if="!id" v-model="petId" :pets="pets" />
      <text class="label">标题</text>
      <input v-model="title" maxlength="100" />
      <text class="label">封面照片</text>
      <ChoiceField v-model="cover" :options="photos" />
      <view v-for="(_, i) in scenes" :key="i">
        <text class="label">分镜 {{ i + 1 }}</text>
        <textarea v-model="scenes[i]" maxlength="500" />
        <button v-if="scenes.length > 1" class="chip" @tap="scenes.splice(i, 1)">移除分镜</button>
      </view>
      <view class="actions">
        <button v-if="scenes.length < 8" class="small" @tap="scenes.push('')">添加分镜</button>
        <button :disabled="busy || !title.trim() || !petId" @tap="save(false)">存为草稿</button>
        <button class="primary" :disabled="busy || !title.trim() || !petId" @tap="save(true)">发布</button>
      </view>
    </view>
    <template v-if="mode === 'read' && story">
      <view class="card">
        <text class="title">{{ story.title }}</text>
        <text class="sub">{{ story.author }} · {{ story.petName }}</text>
        <image
          v-if="story.hasCover"
          class="photo"
          mode="aspectFill"
          :src="publicImage('/h5/stories/' + id + '/cover')"
        />
        <text v-for="(s, i) in story.scenes" :key="i" class="body line">{{ s }}</text>
        <view class="actions">
          <button v-if="user" :disabled="busy" @tap="react('like')">
            {{ liked.includes(id) ? '已赞' : '赞' }} {{ story.likes }}
          </button>
          <button v-if="user" :disabled="busy" @tap="react('favorite')">
            {{ saved ? '已收藏' : '收藏' }}
          </button>
          <button open-type="share">分享</button>
        </view>
      </view>
      <LoginCard v-if="!user" />
    </template>
  </view>
</template>
