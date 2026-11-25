<script setup lang="ts">
import { ref } from 'vue'
import { businessModules, type Listing } from '../../../../src/h5/business'
import { selectedLocation } from '../../lib/location'
import { searchListings } from '../../lib/directory'
import { pageLoad } from '../../lib/page'
import { useMenuLayout } from '../../lib/tab-page'
import BrowseLocation from '../../components/BrowseLocation.vue'
import BrowseToolbar from '../../components/BrowseToolbar.vue'
import ChoiceField from '../../components/ChoiceField.vue'
import DirectoryListing from '../../components/DirectoryListing.vue'
import LoadState from '../../components/LoadState.vue'

const layout = useMenuLayout()
const categories = [{ id: '', label: '全部类型' }, ...businessModules.immortality.categories]
const input = ref('')
const query = ref('')
const category = ref('')
const items = ref<Listing[]>([])
let request = 0
const { error, loading, refresh } = pageLoad(async () => {
  const current = ++request
  const listings = await searchListings('immortality', query.value, selectedLocation.value?.district.id, {
    category: category.value, local: true,
  })
  if (current === request) items.value = listings
})

function chooseCategory(value: string) {
  if (value === category.value) return
  category.value = value
  void refresh()
}

function search() {
  query.value = input.value.trim()
  void refresh()
}
</script>

<template>
  <view class="screen menu-screen" :style="layout">
    <BrowseToolbar v-model="input" placeholder="名称、机构或地点" @search="search" />
    <view class="browse-filters">
      <BrowseLocation placeholder="全国" @change="refresh" />
      <ChoiceField :model-value="category" :options="categories" appearance="filter" @update:model-value="chooseCategory" />
    </view>
    <LoadState :loading="loading" :error="error" @retry="refresh" />
    <template v-if="!loading && !error">
      <view v-if="items.length" class="browse-grid">
        <DirectoryListing v-for="item in items" :key="item.id" :listing="item" />
      </view>
      <view v-else class="card empty-card" role="status">暂无符合条件的项目</view>
    </template>
  </view>
</template>
