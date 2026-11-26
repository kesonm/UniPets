export const defaultDeskPetId = 'system-tabby-cat'
export const customDeskPetPrefix = 'pet:'

const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

export const systemDeskPets = [
  {
    id: defaultDeskPetId,
    name: '默认橘猫',
    species: 'cat',
    badge: '系统默认',
    description: '正面坐着呼吸 · 坐着舔前爪循环',
    avatar: '/static/desk-pets/system-tabby-cat-avatar.png',
    actions: [
      {
        key: 'breathe',
        label: '正面坐着呼吸',
        shortLabel: '呼吸',
        sheet: '/static/desk-pets/system-tabby-cat-breathe.png',
        frames: 6,
        columns: 3,
        rows: 2,
        fps: 4,
        repeats: 2,
      },
      {
        key: 'lick_paw',
        label: '坐着舔前爪',
        shortLabel: '舔前爪',
        sheet: '/static/desk-pets/system-tabby-cat-lick-paw.png',
        frames: 6,
        columns: 3,
        rows: 2,
        fps: 4,
        repeats: 1,
      },
    ],
  },
  {
    id: 'system-ragdoll-cat',
    name: '布偶小猫',
    species: 'cat',
    badge: '系统桌宠',
    description: '正面坐着呼吸 · 坐着舔前爪循环',
    avatar: '/static/desk-pets/system-ragdoll-cat-avatar.png',
    actions: [
      {
        key: 'breathe',
        label: '正面坐着呼吸',
        shortLabel: '呼吸',
        sheet: '/static/desk-pets/system-ragdoll-cat-breathe.png',
        frames: 6,
        columns: 3,
        rows: 2,
        fps: 4,
        repeats: 2,
      },
      {
        key: 'lick_paw',
        label: '坐着舔前爪',
        shortLabel: '舔前爪',
        sheet: '/static/desk-pets/system-ragdoll-cat-lick-paw.png',
        frames: 6,
        columns: 3,
        rows: 2,
        fps: 4,
        repeats: 1,
      },
    ],
  },
]

export function isSystemDeskPetId(id) {
  return typeof id === 'string' && systemDeskPets.some((pet) => pet.id === id)
}

export function customDeskPetId(petId) {
  return customDeskPetPrefix + petId
}

export function parseCustomDeskPetId(id) {
  if (typeof id !== 'string' || !id.startsWith(customDeskPetPrefix)) return null
  const petId = id.slice(customDeskPetPrefix.length)
  return uuidPattern.test(petId) ? petId : null
}

export function getSystemDeskPet(id) {
  return systemDeskPets.find((pet) => pet.id === id) ?? systemDeskPets[0]
}
