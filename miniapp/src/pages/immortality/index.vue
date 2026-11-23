<script setup lang="ts">
import { computed, ref } from 'vue'
import { areaLabel, businessModules, type Listing } from '../../../../src/h5/business'
import { selectedArea } from '../../lib/area'
import { go } from '../../lib/client'
import { searchListings } from '../../lib/directory'
import { pageLoad } from '../../lib/page'
import { useMenuLayout } from '../../lib/tab-page'
import AreaPicker from '../../components/AreaPicker.vue'
import DirectoryListing from '../../components/DirectoryListing.vue'
import LoadState from '../../components/LoadState.vue'
import UiIcon from '../../components/UiIcon.vue'

const layout = useMenuLayout()
const categories = [{ id: '', label: '全部' }, ...businessModules.immortality.categories]
const input = ref('')
const query = ref('')
const category = ref('')
const areaPicker = ref(false)
const items = ref<Listing[]>([])
const displayed = computed(() => category.value ? items.value.filter(item => item.category === category.value) : items.value)
let request = 0
const { error, loading, refresh } = pageLoad(async () => {
  const current = ++request
  const listings = await searchListings('immortality', query.value, selectedArea.value)
  if (current === request) items.value = listings
})

function search() {
  query.value = input.value.trim()
  void refresh()
}
function back() {
  uni.navigateBack({ fail: () => go('home') })
}
</script>

<template>
  <view class="screen menu-screen" :style="layout">
    <view class="tab-leading immortality-toolbar">
      <button class="immortality-back" aria-label="返回" @tap="back">
        <view class="back-arrow"><UiIcon name="right" :size="17" /></view>
      </button>
      <view class="immortality-search">
        <UiIcon name="search" :size="15" />
        <input
          v-model="input"
          class="immortality-input"
          maxlength="60"
          placeholder="名称、机构或地点"
          aria-label="搜索名称、机构或地点"
          confirm-type="search"
          @confirm="search"
        />
        <button class="immortality-submit" @tap="search">搜索</button>
      </view>
    </view>

    <view class="card immortality-filters">
      <button class="text-button immortality-area" @tap="areaPicker = true">
        <UiIcon name="location" :size="15" />
        {{ areaLabel(selectedArea) || '选择商圈' }}
        <UiIcon name="down" :size="10" />
      </button>
      <view class="immortality-categories" aria-label="项目分类">
        <button
          v-for="option in categories"
          :id="'category-' + (option.id || 'all')"
          :key="option.id"
          :class="['chip', { active: category === option.id }]"
          :aria-pressed="category === option.id"
          @tap="category = option.id"
        >{{ option.label }}</button>
      </view>
    </view>

    <LoadState :loading="loading" :error="error" @retry="refresh" />
    <template v-if="!loading && !error">
      <DirectoryListing v-for="item in displayed" :key="item.id" :listing="item" />
      <view v-if="!displayed.length" class="card empty-card immortality-empty" role="status">
        {{ query ? '没有匹配的项目' : '当前分类暂无已发布的项目' }}
      </view>
    </template>
    <AreaPicker v-if="areaPicker" @close="areaPicker = false; refresh()" />
  </view>
</template>

<style scoped>
.immortality-toolbar { display: flex; align-items: center; gap: 7px; margin-bottom: 10px; }
.immortality-back {
  display: flex;
  align-items: center;
  justify-content: center;
  flex: none;
  width: 36px;
  height: 36px;
  padding: 0;
  border: 1px solid var(--border);
  border-radius: 50%;
  background: #fff;
}
.back-arrow { transform: rotate(180deg); }
.immortality-search {
  display: flex;
  flex: 1;
  align-items: center;
  gap: 6px;
  min-width: 0;
  min-height: 38px;
  padding: 3px 4px 3px 9px;
  border: 1px solid var(--border);
  border-radius: 24px;
  background: #fff;
}
.immortality-input {
  flex: 1;
  width: 0;
  min-width: 0;
  min-height: 28px;
  padding: 0;
  border: 0;
  background: transparent;
  font-size: 12px;
}
.immortality-submit {
  flex: none;
  padding: 5px 8px;
  border: 0;
  border-radius: 16px;
  background: var(--yellow);
  font-size: 12px;
}
.immortality-filters { padding: 8px 10px 10px; }
.immortality-area { padding: 4px 6px; }
.immortality-categories { display: flex; flex-wrap: wrap; gap: 5px; margin-top: 5px; }
.immortality-categories .chip { padding: 5px 7px; font-size: 11px; }
.immortality-empty { min-height: 94px; }
</style>
