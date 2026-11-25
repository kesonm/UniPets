<script setup lang="ts">
import { areaLabel, type Listing } from '../../../src/h5/business'
import { money } from '../lib/cart'
import { go } from '../lib/client'

defineProps<{ listing: Listing }>()
const kindNames = {
  article: '文章',
  appointment: '预约',
  enrollment: '报名',
  group: '社群',
  product: '商品',
  link: '官方入口',
}
</script>

<template>
  <button class="card directory-listing" @tap="go('directory', { module: listing.module, id: listing.id })">
    <text class="heading">{{ listing.title }}</text>
    <text class="sub">{{ [kindNames[listing.kind], listing.provider, areaLabel(listing.area, listing.district)].filter(Boolean).join(' · ') }}</text>
    <text v-if="listing.priceCents" class="body">{{ money(listing.priceCents) }}</text>
  </button>
</template>

<style scoped>
.directory-listing { display: block; width: 100%; text-align: left; }
</style>
