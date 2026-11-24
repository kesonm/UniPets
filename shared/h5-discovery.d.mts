export const postPetTypes: readonly ['cat', 'dog', 'rabbit', 'other']
export type PostPetType = typeof postPetTypes[number]
export const postPetTypeLabels: Readonly<Record<PostPetType, string>>
export const serviceCategories: readonly { id: string; label: string; terms: readonly string[] }[]
export function servicePhone(value: string): string
