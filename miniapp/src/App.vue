<script setup lang="ts">
import { onHide, onLaunch, onShow } from '@dcloudio/uni-app'
import { restoreSession } from './lib/client'
import { startCompanion, stopCompanion } from './lib/companion'
import { syncDeskPet } from './lib/desk-pet'
onLaunch(() => {
  void restoreSession().then(() => syncDeskPet())
})
onShow(() => {
  startCompanion()
})
onHide(() => {
  stopCompanion()
})
</script>
<style>
@import './style.css';
</style>
