export const recommendationSeed = Date.now().toString(36) + '-' + Math.random().toString(36).slice(2)

export function homeImage(file: string) {
  return '/static/' + (file === 'pet-hero.png' ? 'pet-hero.jpg' : file.replace(/\.webp$/, '.jpg'))
}
