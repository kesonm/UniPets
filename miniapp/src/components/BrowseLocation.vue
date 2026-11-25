<script setup lang="ts">
import { changeBrowseLocation, openMapPicker, saveBrowseLocation, selectedLocation } from '../lib/location'
import UiIcon from './UiIcon.vue'

const props = defineProps<{ placeholder?: string; nearby?: boolean }>()
const emit = defineEmits<{ change: []; 'update:nearby': [value: boolean] }>()

async function choose() {
  const previous = selectedLocation.value
  if (props.nearby !== undefined && previous) {
    uni.showActionSheet({
      itemList: ['重新定位', props.nearby ? '查看全国' : '仅看同城', '清除位置'],
      success({tapIndex}) {
        if (tapIndex === 1) emit('update:nearby', !props.nearby)
        else if (tapIndex === 2) {
          saveBrowseLocation(null)
          emit('change')
        } else void openMapPicker(location => {
          if (!location) return
          saveBrowseLocation(location)
          emit('change')
        }, previous)
      },
    })
  } else {
    await changeBrowseLocation()
    if (selectedLocation.value !== previous) emit('change')
  }
}
</script>

<template>
  <button class="browse-filter-label browse-location" aria-label="地图选位置" @tap="choose">
    <UiIcon name="location" :size="13" />
    <text>{{ nearby ? '仅看同城' : selectedLocation?.district.name || placeholder || '定位' }}</text>
    <UiIcon name="down" :size="11" />
  </button>
</template>

<style scoped>
.browse-location { color: var(--gold-ink); }
</style>
