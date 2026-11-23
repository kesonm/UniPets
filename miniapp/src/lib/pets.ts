import type { Pet } from '../../../src/lib/types'
import { api, user } from './client'
import { choosePhoto } from './photo'
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
export async function scanPetIdentity(id: string) {
  const owner = user.value?.id
  if (!owner) return
  const photo = await choosePhoto(['camera'])
  if (!photo || user.value?.id !== owner) return
  const { pet } = await api<{ pet: Pet }>('/pets/' + id + '/identity', 'POST', { nosePrintImage: photo }, 35000)
  if (user.value?.id === owner) return pet
}
