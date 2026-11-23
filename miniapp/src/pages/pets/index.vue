<script setup lang="ts">
import { computed, ref } from 'vue'
import type { CloudPet, DemoPet } from '../../../../src/h5/types'
import { api, genderNames, go, publicImage, toast, user } from '../../lib/client'
import { choosePhoto } from '../../lib/photo'
import { listPets } from '../../lib/pets'
import { pageLoad, submitAction } from '../../lib/page'
import { useTabPage } from '../../lib/tab-page'
import LoginCard from '../../components/LoginCard.vue'
import LoadState from '../../components/LoadState.vue'
import PetImage from '../../components/PetImage.vue'
import UiIcon from '../../components/UiIcon.vue'

const tabLayout = useTabPage('pages/pets/index')
const pets = ref<CloudPet[]>([])
const selectedId = ref('')
const models = ref<string[]>([])
const ownedCount = computed(() => pets.value.filter(pet => !pet.shared).length)
const selected = computed(() => pets.value.find(pet => pet.id === selectedId.value))
const speciesNames = { cat: '猫咪', dog: '狗狗', other: '其他宠物' }
async function load() {
  const owner = user.value?.id
  const [shared, owned, available] = await Promise.all([
    api<{ pets: DemoPet[] }>('/h5/demo-pets'),
    owner ? listPets() : [],
    owner ? api<{ species: string[] }>('/pets/identity') : undefined,
  ])
  if (user.value?.id !== owner) return
  const ownedIds = new Set(owned.map(pet => pet.id))
  pets.value = [
    ...owned.map(pet => ({ ...pet, shared: false as const })),
    ...shared.pets.filter(pet => !ownedIds.has(pet.id)).map(pet => ({ ...pet, shared: true as const })),
  ]
  models.value = available?.species || []
  if (!pets.value.some(pet => pet.id === selectedId.value)) selectedId.value = pets.value[0]?.id || ''
}
const { loading, error, refresh } = pageLoad(load, () => {
  pets.value = []
  selectedId.value = ''
  models.value = []
})
const { busy, run, error: enrollmentError } = submitAction()
function sharedPhoto(pet: CloudPet) {
  return pet.shared && pet.hasCover ? publicImage('/h5/demo-pets/' + pet.id + '/cover') : ''
}
function details(pet: CloudPet) {
  if (pet.shared) go('demo', { id: pet.id })
  else go('pet', { id: pet.id })
}
function enroll(pet: CloudPet) {
  return run(async () => {
    const image = await choosePhoto()
    if (!image) return
    await api('/pets/' + pet.id + '/identity', 'POST', { nosePrintImage: image })
    await load()
    toast('鼻纹已登记')
  })
}
</script>

<template>
  <view class="screen tab-screen identity-page" :style="tabLayout">
    <view class="tab-leading identity-tools">
      <scroll-view v-if="pets.length" scroll-x class="identity-scroll">
        <view class="identity-choices">
          <button
            v-for="pet in pets"
            :key="pet.id"
            :class="['pet-choice', { active: pet.id === selectedId }]"
            :aria-label="'切换到' + pet.name"
            :aria-pressed="pet.id === selectedId"
            @tap="selectedId = pet.id"
          >
            <view class="pet-ring">
              <PetImage :asset-id="pet.shared ? null : pet.avatarAssetId" :source="sharedPhoto(pet)" :size="42" :previewable="false" />
            </view>
            <text>{{ pet.name }}</text>
          </button>
        </view>
      </scroll-view>
      <button class="small primary identity-create" :disabled="ownedCount >= 3" @tap="go('pet-edit')">
        <UiIcon name="plus" :size="15" />新建档案
      </button>
    </view>
    <LoadState :loading="loading" :error="error" @retry="refresh" />
    <text v-if="enrollmentError" class="error">{{ enrollmentError }}</text>
    <view v-if="selected" class="card identity-card">
      <view class="identity-header">
        <view class="identity-title"><UiIcon name="identity-card" :size="19" /><text>宠物身份证</text></view>
        <text v-if="selected.shared" class="sub">共享档案</text>
        <button
          v-else-if="!selected.identityNumber && models.includes(selected.species)"
          class="text-button"
          :disabled="busy"
          @tap="enroll(selected)"
        >登记鼻纹</button>
      </view>
      <view class="identity-body">
        <PetImage :key="selected.id" :asset-id="selected.shared ? null : selected.avatarAssetId" :source="sharedPhoto(selected)" :size="94" />
        <view class="grow">
          <text class="identity-name">{{ selected.name }}</text>
          <view class="identity-fields">
            <text>种类</text><text>{{ speciesNames[selected.species] }}</text>
            <template v-if="selected.breed"><text>品种</text><text>{{ selected.breed }}</text></template>
            <template v-if="selected.gender !== 'unknown'"><text>性别</text><text>{{ genderNames[selected.gender] }}</text></template>
            <template v-if="selected.birthday"><text>生日</text><text>{{ selected.birthday }}</text></template>
          </view>
        </view>
      </view>
      <view class="identity-footer">
        <text>身份证号</text><text class="identity-number" user-select>{{ selected.identityNumber || '待登记' }}</text>
        <button class="text-button" @tap="details(selected)">查看详情<UiIcon name="right" :size="13" /></button>
      </view>
    </view>
    <view v-else-if="user && !loading && !error" class="card empty-card">暂无宠物档案</view>
    <LoginCard v-if="!user" />
  </view>
</template>

<style scoped>
.identity-tools { display: flex; align-items: center; gap: 8px; margin-bottom: 10px; }
.identity-scroll { flex: 1; width: 0; min-width: 0; }
.identity-choices { display: flex; align-items: flex-start; gap: 5px; }
.pet-choice {
  display: flex;
  flex: none;
  flex-direction: column;
  align-items: center;
  gap: 3px;
  width: 61px;
  padding: 2px 1px;
  border: 0;
  background: transparent;
  color: #776d59;
  font-size: 11px;
}
.pet-choice > text { width: 100%; overflow: hidden; white-space: nowrap; text-overflow: ellipsis; }
.pet-ring { padding: 3px; border: 2px solid transparent; border-radius: 18px; }
.pet-choice.active { color: #41320f; }
.pet-choice.active .pet-ring { border-color: #ffdc36; background: #fff6cc; }
.identity-create { display: flex; align-items: center; gap: 5px; flex: none; min-height: 36px; white-space: nowrap; }
.identity-card { padding: 15px 16px 13px; border-color: #ebdfbc; border-radius: 19px; background: linear-gradient(135deg, #fffdf7 55%, #fff3c6); }
.identity-header { display: flex; align-items: center; justify-content: space-between; gap: 9px; min-height: 31px; padding-bottom: 9px; }
.identity-title { display: flex; align-items: center; gap: 6px; color: #584317; font-size: 15px; font-weight: 800; }
.identity-body { display: flex; align-items: center; gap: 14px; }
.identity-name { display: block; overflow-wrap: anywhere; font-size: 23px; line-height: 1.2; font-weight: 850; }
.identity-fields { display: grid; grid-template-columns: auto minmax(0, 1fr); gap: 4px 10px; margin-top: 9px; font-size: 12px; }
.identity-fields text:nth-child(odd) { color: #746654; }
.identity-footer { display: flex; align-items: center; gap: 9px; margin-top: 13px; padding-top: 5px; border-top: 1px solid #e9ddb9; color: #705c35; font-size: 11px; }
.identity-number { color: #4a3511; font-size: 13px; font-weight: 750; letter-spacing: .07em; }
.identity-footer button { flex: none; margin-left: auto; padding-right: 0; font-size: 12px; }
</style>
