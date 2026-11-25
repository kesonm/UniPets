import { ref, watch } from 'vue'
import type { H5Post, H5Social } from '../../../src/h5/types'
import { api, go, message, toast, user } from './client'

export function usePostLikes(active: () => boolean, updateLikes: (id: string, likes: number) => void) {
  const liked = ref<string[]>([])
  const reacting = new Set<string>()

  watch([active, () => user.value?.id], async ([visible, owner], _, onCleanup) => {
    let current = true
    onCleanup(() => { current = false })
    liked.value = []
    if (!visible || !owner) return
    try {
      const result = await api<H5Social>('/h5/me')
      if (current) liked.value = result.likedIds
    } catch { /* Feed reading does not require reactions. */ }
  }, { immediate: true })

  async function like(post: H5Post) {
    if (!user.value) return go('feed', { id: post.id })
    if (reacting.has(post.id)) return
    const owner = user.value.id
    const selected = !liked.value.includes(post.id)
    reacting.add(post.id)
    try {
      const result = await api<{ likes: number }>('/h5/posts/' + post.id + '/reaction', 'PUT', { kind: 'like', active: selected })
      if (user.value?.id !== owner) return
      liked.value = selected ? liked.value.concat(post.id) : liked.value.filter(id => id !== post.id)
      updateLikes(post.id, result.likes)
    } catch (cause) {
      toast(message(cause))
    } finally {
      reacting.delete(post.id)
    }
  }

  return { liked, like }
}
