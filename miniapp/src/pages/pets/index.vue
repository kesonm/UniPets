<script setup lang="ts">
import { computed, ref } from 'vue'
import type { Pet } from '../../../../src/lib/types'
import { api, genderNames, go, toast, user } from '../../lib/client'
import { listPets, scanPetIdentity } from '../../lib/pets'
import { pageLoad, submitAction } from '../../lib/page'
import { useTabPage } from '../../lib/tab-page'
import LoginCard from '../../components/LoginCard.vue'
import LoadState from '../../components/LoadState.vue'
import PetImage from '../../components/PetImage.vue'
import PetIdentityCodes from '../../components/PetIdentityCodes.vue'
import UiIcon from '../../components/UiIcon.vue'

const tabLayout = useTabPage('pages/pets/index')
const pets = ref<Pet[]>([])
const selectedId = ref('')
const models = ref<string[]>([])
const selected = computed(() => pets.value.find(pet => pet.id === selectedId.value))
const speciesNames = { cat: '猫咪', dog: '狗狗', other: '其他宠物' }
async function load() {
  const owner = user.value?.id
  if (!owner) return
  const owned = await listPets()
  if (user.value?.id !== owner) return
  pets.value = owned
  if (!pets.value.some(pet => pet.id === selectedId.value)) selectedId.value = pets.value[0]?.id || ''
  if (owned.some(pet => !pet.identityNumber && pet.species !== 'other')) {
    const available = await api<{ species: string[] }>('/pets/identity')
    if (user.value?.id === owner) models.value = available.species
  }
}
const { loading, error, refresh } = pageLoad(load, () => {
  pets.value = []
  selectedId.value = ''
  models.value = []
})
const { busy, run, error: enrollmentError } = submitAction()
function enroll(pet: Pet) {
  return run(async () => {
    const updated = await scanPetIdentity(pet.id)
    if (!updated) return
    pets.value = pets.value.map(item => item.id === updated.id ? updated : item)
    toast('宠物身份证已生成')
  })
}
</script>

<template>
  <view class="screen tab-screen identity-page" :style="tabLayout">
    <view class="tab-leading identity-tools">
      <scroll-view v-if="user && pets.length" scroll-x class="identity-scroll">
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
              <PetImage :asset-id="pet.avatarAssetId" :size="42" :previewable="false" />
            </view>
            <text>{{ pet.name }}</text>
          </button>
        </view>
      </scroll-view>
      <button class="small primary identity-create" :disabled="pets.length >= 3" @tap="go('pet-edit')">
        <UiIcon name="plus" :size="15" />新建档案
      </button>
    </view>
    <LoadState :loading="loading" :error="error" @retry="refresh" />
    <text v-if="enrollmentError" class="error">{{ enrollmentError }}</text>
    <view v-if="user && selected" :class="['card', 'identity-card', { issued: selected.identityNumber }]">
      <view class="identity-header">
        <view class="identity-title">
          <UiIcon :name="selected.identityNumber ? 'identity-card' : 'account-pets'" :size="19" />
          <text>{{ selected.identityNumber ? '宠物身份证' : '宠物档案' }}</text>
        </view>
        <button
          id="scan-nose"
          v-if="!selected.identityNumber && models.includes(selected.species)"
          class="text-button"
          :disabled="busy"
          @tap="enroll(selected)"
        >{{ busy ? '正在识别…' : '扫描鼻纹' }}</button>
      </view>
      <view class="identity-body">
        <PetImage :key="selected.id" :asset-id="selected.avatarAssetId" :size="94" />
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
        <template v-if="selected.identityNumber">
          <text>身份证号</text><text class="identity-number" user-select>{{ selected.identityNumber }}</text>
        </template>
        <button class="text-button" @tap="go('pet', { id: selected.id })">查看详情<UiIcon name="right" :size="13" /></button>
      </view>
      <PetIdentityCodes v-if="selected.identityNumber" :pet-id="selected.id" :number="selected.identityNumber" />
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
.identity-card { padding: 15px 16px 13px; border-radius: 19px; }
.identity-card.issued { border-color: #ebdfbc; background: linear-gradient(135deg, #fffdf7 55%, #fff3c6); }
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
