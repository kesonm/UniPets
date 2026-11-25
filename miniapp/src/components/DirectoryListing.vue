<script setup lang="ts">
import { areaLabel, businessModules, isBusinessModule, type Listing } from '../../../src/h5/business'
import { money } from '../lib/cart'
import { go, productCover } from '../lib/client'
import UiIcon from './UiIcon.vue'

defineProps<{ listing: Listing }>()

function categoryLabel(listing: Listing) {
  if (isBusinessModule(listing.module))
    return businessModules[listing.module].categories.find(item => item.id === listing.category)?.label
}
</script>

<template>
  <button class="browse-card directory-listing" @tap="go('directory', { module: listing.kind === 'product' ? 'shop' : listing.module, id: listing.id })">
    <image v-if="listing.hasCover" class="browse-card-cover" :src="productCover(listing.id)" mode="aspectFill" lazy-load />
    <view v-else class="browse-card-cover directory-cover" :class="'directory-cover-' + listing.module">
      <UiIcon :name="'entry-' + listing.module" :size="32" />
    </view>
    <view class="browse-card-copy">
      <text class="browse-card-title">{{ listing.title }}</text>
      <text v-if="listing.provider || listing.area || listing.district" class="browse-card-meta">
        {{ [listing.provider, areaLabel(listing.area, listing.district)].filter(Boolean).join(' · ') }}
      </text>
      <view class="directory-info">
        <text v-if="categoryLabel(listing)" class="browse-card-meta">{{ categoryLabel(listing) }}</text>
        <text v-if="listing.priceCents !== null" class="directory-price">{{ money(listing.priceCents) }}</text>
      </view>
    </view>
  </button>
</template>

<style scoped>
.directory-listing { display: block; width: 100%; padding: 0; text-align: left; }
.directory-cover-charity { background: #fae8dd; }
.directory-cover-medical { background: #e5f2e8; }
.directory-cover-travel { background: #e4eefb; }
.directory-cover-education { background: #fff3c7; }
.directory-info { display: flex; flex-wrap: wrap; justify-content: space-between; align-items: baseline; gap: 3px 6px; }
.directory-price { color: var(--gold-ink); font-size: 12px; font-weight: 700; }
</style>
