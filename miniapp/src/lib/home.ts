export function homeImage(file: string) {
  return '/static/' + (file === 'pet-hero.png' ? 'pet-hero.webp' : file)
}
