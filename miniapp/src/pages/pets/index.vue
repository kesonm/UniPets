<script setup lang="ts">
import { ref } from 'vue'
import type { Pet } from '../../../../src/lib/types'
import { go, user, speciesNames } from '../../lib/client'
import { listPets } from '../../lib/pets'
import { pageLoad } from '../../lib/page'
import LoginCard from '../../components/LoginCard.vue'
import LoadState from '../../components/LoadState.vue'
import PetImage from '../../components/PetImage.vue'
const pets = ref<Pet[]>([])
const { error, loading, refresh } = pageLoad(
  async () => {
    if (user.value) pets.value = await listPets()
  },
  () => {
    pets.value = []
  },
)
</script>
<template>
  <view class="screen">
    <LoginCard v-if="!user" />
    <template v-else>
      <view class="sheet">
        <text class="title">我的宠物档案</text>
        <text class="sub">{{ pets.length }} / 3 份档案</text>
        <view class="actions">
          <button class="primary" :disabled="pets.length >= 3" @tap="go('pet-edit')">添加宠物</button>
        </view>
      </view>
      <LoadState :error="error" :loading="loading" @retry="refresh" />
      <view v-for="pet in pets" :key="pet.id" class="card">
        <view class="row">
          <PetImage :asset-id="pet.avatarAssetId" />
          <view class="grow">
            <text class="heading">{{ pet.name }}</text>
            <text class="sub">
              {{ speciesNames[pet.species] }} {{ pet.breed }} · {{ pet.memoryCount }} 条记忆
            </text>
          </view>
          <button class="small" @tap="go('pet', { id: pet.id })">查看档案</button>
        </view>
      </view>
      <view v-if="!loading && !error && !pets.length" class="card">
        <text class="heading">添加第一只宠物</text>
        <text class="sub">填写名字和种类就能建档，照片、生日和鼻纹都可以以后补充。</text>
      </view>
    </template>
  </view>
</template>
