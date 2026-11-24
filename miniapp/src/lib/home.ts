import { ref } from 'vue'

export const showFriendsFeed = ref(false)
export const recommendationSeed = Date.now().toString(36) + '-' + Math.random().toString(36).slice(2)

export function homeImage(file: string) {
  return '/static/' + (file === 'pet-hero.png' ? 'pet-hero.webp' : file)
}
