<script setup lang="ts">
import { ref, computed } from 'vue'
import { onLoad } from '@dcloudio/uni-app'
import type { Asset, Memory, Pet } from '../../../../src/lib/types'
import type { PetRecords } from '../../../../src/h5/business'
import { api, confirm, genderNames, go, petsTab, speciesNames, toast, today, user } from '../../lib/client'
import { getPet, petFields } from '../../lib/pets'
import { choosePhoto } from '../../lib/photo'
import { pageLoad, submitAction } from '../../lib/page'
import LoginCard from '../../components/LoginCard.vue'
import LoadState from '../../components/LoadState.vue'
import PetImage from '../../components/PetImage.vue'
import ChoiceField from '../../components/ChoiceField.vue'
import MotionPlayer from '../../components/MotionPlayer.vue'
const id = ref(''),
  pet = ref<Pet>(),
  assets = ref<Asset[]>([]),
  memories = ref<Memory[]>([]),
  records = ref<PetRecords>()
const models = ref<string[]>([]),
  tab = ref('资料'),
  tabs = ['资料', '相册', '成长记忆', '健康', '纪念馆', '已有动作']
const photos = computed(() => assets.value.filter((a) => a.kind === 'photo'))
const clips = computed(() => assets.value.filter((a) => a.kind === 'sprite')),
  clipId = ref('')
const clip = computed(() => clips.value.find((a) => a.id === clipId.value) || clips.value[0])
const title = ref(''),
  content = ref(''),
  day = ref(today()),
  kind = ref('care'),
  tribute = ref(''),
  memoryPhoto = ref('')
const memorialTitle = ref(''),
  remembrance = ref('')
const healthKinds = [
  { id: 'care', label: '养护' },
  { id: 'exam', label: '体检' },
  { id: 'consultation', label: '问诊' },
  { id: 'medicine', label: '用药' },
]
const photoChoices = computed(() => [
  { id: '', label: '不关联照片' },
  ...photos.value.map((a) => ({ id: a.id, label: a.name })),
])
onLoad((q) => {
  id.value = q?.id || ''
})
async function load() {
  if (!user.value) return
  const [p, a, m, r, s] = await Promise.all([
    getPet(id.value),
    api<{ assets: Asset[] }>('/assets?petId=' + id.value),
    api<{ memories: Memory[] }>('/memories'),
    api<PetRecords>('/h5/pet-records/' + id.value),
    api<{ species: string[] }>('/pets/identity'),
  ])
  pet.value = p
  assets.value = a.assets
  memories.value = m.memories.filter((x) => x.petId === id.value)
  records.value = r
  models.value = s.species
  memorialTitle.value = r.memorial?.title || ''
  remembrance.value = r.memorial?.remembrance || ''
  uni.setNavigationBarTitle({ title: p.name + '的手帐' })
}
const { error, loading, refresh } = pageLoad(load, () => {
  pet.value = undefined
  assets.value = []
  memories.value = []
  records.value = undefined
})
const { run, busy, error: actionError } = submitAction()
async function saved(label: string) {
  await load()
  toast(label)
}
function removePet() {
  return run(async () => {
    if (!(await confirm('删除宠物档案', '将同时删除这只宠物的照片和记忆，删除后无法恢复。'))) return
    await api('/pets/' + id.value, 'DELETE')
    petsTab()
  })
}
function upload(nose = false) {
  return run(async () => {
    const image = await choosePhoto()
    if (!image) return
    if (nose) await api('/pets/' + id.value + '/identity', 'POST', { nosePrintImage: image })
    else
      await api('/assets', 'POST', { petId: id.value, name: (pet.value?.name || '宠物') + '的照片', image })
    await saved(nose ? '鼻纹已登记' : '照片已保存')
  })
}
function cover(assetId: string) {
  return run(async () => {
    if (!pet.value) return
    await api('/pets/' + id.value, 'PUT', { ...petFields(pet.value), avatarAssetId: assetId })
    await saved('封面已更新')
  })
}
function remove(path: string) {
  return run(async () => {
    if (!(await confirm('确认删除', '删除后无法恢复。'))) return
    await api(path, 'DELETE')
    await saved('已删除')
  })
}
function addRecord() {
  return run(async () => {
    if (tab.value === '成长记忆')
      await api('/memories', 'POST', {
        petId: id.value,
        title: title.value,
        content: content.value,
        happenedOn: day.value,
        assetId: memoryPhoto.value || null,
      })
    else
      await api('/h5/pet-records/' + id.value + '/health', 'POST', {
        kind: kind.value,
        title: title.value,
        note: content.value,
        happenedOn: day.value,
      })
    title.value = ''
    content.value = ''
    memoryPhoto.value = ''
    await saved('记录已保存')
  })
}
function saveMemorial() {
  return run(async () => {
    await api('/h5/pet-records/' + id.value + '/memorial', 'PUT', {
      title: memorialTitle.value,
      remembrance: remembrance.value,
      coverAssetId: records.value?.memorial?.coverAssetId || null,
    })
    await saved('纪念馆已保存')
  })
}
function addTribute() {
  return run(async () => {
    await api('/h5/pet-records/' + id.value + '/memorial/tributes', 'POST', {
      kind: 'message',
      body: tribute.value,
    })
    tribute.value = ''
    await saved('留言已保存')
  })
}
</script>
<template>
  <view class="screen">
    <LoginCard v-if="!user" />
    <template v-else>
      <LoadState :loading="loading" :error="error" @retry="refresh" />
      <template v-if="pet">
        <view class="sheet row">
          <PetImage :asset-id="pet.avatarAssetId" />
          <view class="grow">
            <text class="title">{{ pet.name }}</text>
            <text class="sub">{{ speciesNames[pet.species] }} · {{ pet.breed || '品种未填写' }}</text>
          </view>
        </view>
        <view class="chips">
          <button v-for="t in tabs" :key="t" :class="['chip', { active: tab === t }]" @tap="tab = t">
            {{ t }}
          </button>
        </view>
        <text v-if="actionError" class="error">{{ actionError }}</text>
        <view v-if="tab === '资料'" class="card">
          <text class="heading">宠物身份证</text>
          <text class="line">生日　{{ pet.birthday || '未填写' }}</text>
          <text class="line">性别　{{ genderNames[pet.gender] }}</text>
          <text class="line" selectable>鼻纹编号　{{ pet.identityNumber || '未登记' }}</text>
          <text v-if="pet.notes" class="body">{{ pet.notes }}</text>
          <view class="actions">
            <button class="primary" @tap="go('pet-edit', { id })">编辑档案</button>
            <button
              v-if="!pet.identityNumber && models.includes(pet.species)"
              :disabled="busy"
              @tap="upload(true)"
            >
              登记鼻纹
            </button>
            <button class="danger" :disabled="busy" @tap="removePet">删除档案</button>
          </view>
        </view>
        <view v-if="tab === '相册'" class="card">
          <view class="spread">
            <text class="heading">相册</text>
            <button class="small primary" :disabled="busy" @tap="upload()">上传照片</button>
          </view>
          <text v-if="!photos.length" class="empty">还没有照片</text>
          <view v-for="a in photos" :key="a.id" class="line">
            <PetImage :asset-id="a.id" large />
            <text>{{ a.name }}</text>
            <view class="actions">
              <button class="small" :disabled="busy || pet.avatarAssetId === a.id" @tap="cover(a.id)">
                {{ pet.avatarAssetId === a.id ? '当前封面' : '设为封面' }}
              </button>
              <button class="small danger" :disabled="busy" @tap="remove('/assets/' + a.id)">删除</button>
            </view>
          </view>
        </view>
        <template v-if="tab === '成长记忆' || tab === '健康'">
          <view class="card">
            <text class="heading">添加{{ tab === '健康' ? '健康记录' : '成长记忆' }}</text>
            <text class="label">日期</text>
            <picker mode="date" :value="day" @change="day = String($event.detail.value)">
              <view class="field">{{ day }}</view>
            </picker>
            <template v-if="tab === '健康'">
              <text class="label">类别</text>
              <ChoiceField v-model="kind" :options="healthKinds" />
            </template>
            <text class="label">标题</text>
            <input v-model="title" maxlength="100" />
            <text class="label">记录内容</text>
            <textarea v-model="content" :maxlength="tab === '健康' ? 1500 : 5000" />
            <template v-if="tab === '成长记忆' && photos.length">
              <text class="label">关联照片</text>
              <ChoiceField v-model="memoryPhoto" :options="photoChoices" />
            </template>
            <view class="actions">
              <button class="primary" :disabled="busy || !title.trim()" @tap="addRecord">保存记录</button>
            </view>
          </view>
          <view v-if="tab === '成长记忆'" class="card">
            <text class="heading">记忆时间线</text>
            <text v-if="!memories.length" class="empty">还没有成长记忆</text>
            <view v-for="m in memories" :key="m.id" class="line">
              <text class="sub">{{ m.happenedOn }}</text>
              <text>{{ m.title }}</text>
              <text class="body">{{ m.content }}</text>
              <PetImage v-if="m.assetId" :asset-id="m.assetId" large />
              <button class="small" :disabled="busy" @tap="remove('/memories/' + m.id)">删除记忆</button>
            </view>
          </view>
          <view v-else class="card">
            <text class="heading">健康记录</text>
            <text v-if="!records?.health.length" class="empty">还没有健康记录</text>
            <view v-for="h in records?.health" :key="h.id" class="line">
              <text class="sub">{{ h.happenedOn }}</text>
              <text>{{ h.title }}</text>
              <text class="body">{{ h.note }}</text>
            </view>
          </view>
        </template>
        <view v-if="tab === '纪念馆'" class="card">
          <text class="heading">纪念馆</text>
          <text class="label">名称</text>
          <input v-model="memorialTitle" maxlength="100" />
          <text class="label">纪念文字</text>
          <textarea v-model="remembrance" maxlength="3000" />
          <view class="actions">
            <button class="primary" :disabled="busy || !memorialTitle.trim()" @tap="saveMemorial">
              保存纪念馆
            </button>
          </view>
          <template v-if="records?.memorial">
            <text class="label">纪念留言</text>
            <input v-model="tribute" maxlength="500" />
            <view class="actions">
              <button :disabled="busy || !tribute.trim()" @tap="addTribute">留言</button>
            </view>
            <text v-for="v in records.tributes" :key="v.id" class="line">
              {{ v.body || (v.kind === 'candle' ? '点亮烛光' : '献上纪念') }}
            </text>
          </template>
        </view>
        <view v-if="tab === '已有动作'" class="card">
          <text class="heading">已保存的动作</text>
          <template v-if="clip">
            <MotionPlayer :clip="clip" />
            <view class="chips">
              <button v-for="a in clips" :key="a.id" class="chip" @tap="clipId = a.id">
                {{ a.name }}
              </button>
            </view>
          </template>
          <text v-else class="empty">这个档案还没有动作素材。</text>
        </view>
      </template>
    </template>
  </view>
</template>
