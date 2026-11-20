<script setup lang="ts">
import { onLaunch } from '@dcloudio/uni-app'
import { restoreSession } from './lib/client'
onLaunch(() => {
  void restoreSession()
})
</script>
<style>
@import './style.css';
</style>
