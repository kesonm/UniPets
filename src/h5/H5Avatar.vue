<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import { Picture } from '@element-plus/icons-vue'
import AssetImage from '../components/AssetImage.vue'
import { apiUrl } from '../lib/api'
import type { CloudPet } from './types'

const props = defineProps<{pet:CloudPet}>()
const failed = ref(false)
const cover = computed(()=>props.pet.shared && props.pet.hasCover ? apiUrl(`/h5/demo-pets/${props.pet.id}/cover`) : '')
watch(cover,()=>{ failed.value=false })
</script>

<template>
  <div class="h5-avatar-picture">
    <img v-if="cover && !failed" :src="cover" :alt="pet.name" @error="failed=true">
    <AssetImage v-else-if="!pet.shared && pet.avatarAssetId" :id="pet.avatarAssetId" :alt="pet.name" />
    <el-icon v-else aria-hidden="true"><Picture /></el-icon>
  </div>
</template>
