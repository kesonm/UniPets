export const postPetTypes: readonly ['cat', 'dog', 'rabbit', 'other']
export type PostPetType = typeof postPetTypes[number]
export const postPetTypeLabels: Readonly<Record<PostPetType, string>>
export const serviceCategories: readonly { id: string; label: string; terms: readonly string[] }[]
export interface ServiceCategory { id: string; label: string }
export const serviceSorts: readonly ['recommended', 'likes-desc', 'likes-asc', 'distance-asc', 'distance-desc']
export type ServiceSort = typeof serviceSorts[number]
export function sortsByDistance(sort: ServiceSort): boolean
export interface ServiceCoordinates { latitude: number; longitude: number }
export function servicePhone(value: string): string
