import type { Pet } from '../../../src/lib/types'
import { api } from './client'
export async function listPets() {
  return (await api<{ pets: Pet[] }>('/pets')).pets
}
export async function getPet(id: string) {
  const pet = (await listPets()).find((p) => p.id === id)
  if (!pet) throw new Error('宠物档案不存在或已删除')
  return pet
}
export function petFields(pet: Pet) {
  const { name, species, gender, breed, birthday, notes, avatarAssetId } = pet
  return { name, species, gender, breed, birthday, notes, avatarAssetId }
}
