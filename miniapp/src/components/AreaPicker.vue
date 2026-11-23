<script setup lang="ts">
import { h5Areas } from '../../../shared/h5-areas.mjs'
import { selectedArea, selectArea } from '../lib/area'
import UiIcon from './UiIcon.vue'

const emit = defineEmits<{ close: [] }>()
function choose(id: string) {
  selectArea(id)
  emit('close')
}
</script>

<template>
  <view class="modal-scrim" @tap="emit('close')" @touchmove.stop.prevent>
    <view class="modal-panel" role="dialog" aria-label="选择商圈" @tap.stop>
      <view class="spread">
        <text class="heading">选择商圈</text>
        <button class="text-button" @tap="emit('close')">取消</button>
      </view>
      <button
        v-for="area in h5Areas"
        :key="area.id"
        :class="['choice-row', { selected: selectedArea === area.id }]"
        :aria-pressed="selectedArea === area.id"
        @tap="choose(area.id)"
      >
        <UiIcon name="location" :size="15" />
        <text>{{ area.label }}</text>
        <UiIcon name="right" :size="12" />
      </button>
      <button class="text-button" @tap="choose('')">不限商圈</button>
    </view>
  </view>
</template>

<style scoped>
.choice-row {
  display: flex;
  align-items: center;
  gap: 8px;
  width: 100%;
  margin: 7px 0;
  padding: 10px 12px;
  text-align: left;
}
.choice-row text { flex: 1; }
.choice-row.selected { border-color: #f1d577; background: #fff1bf; }
</style>
