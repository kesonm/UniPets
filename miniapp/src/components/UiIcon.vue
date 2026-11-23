<script setup lang="ts">
withDefaults(defineProps<{ name: string; size?: number }>(), { size: 16 })
</script>

<template>
  <image
    class="ui-icon"
    :src="'/static/icons/' + name + '.png'"
    :style="{ width: size + 'px', height: size + 'px' }"
    mode="aspectFit"
    aria-hidden="true"
  />
</template>

<style scoped>
.ui-icon { display: block; flex: none; }
</style>
