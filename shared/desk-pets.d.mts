export interface DeskPetActionSpec {
  readonly key: string
  readonly label: string
  readonly shortLabel?: string
  readonly sheet: string
  readonly frames: number
  readonly columns: number
  readonly rows: number
  readonly fps: number
  readonly repeats: number
}

export interface SystemDeskPetSpec {
  readonly id: string
  readonly species?: 'cat' | 'dog' | 'other'
  readonly name: string
  readonly badge: string
  readonly description: string
  readonly avatar: string
  readonly actions: readonly DeskPetActionSpec[]
}

export declare const defaultDeskPetId: string
export declare const customDeskPetPrefix: string
export declare const systemDeskPets: readonly SystemDeskPetSpec[]
export declare function isSystemDeskPetId(id: unknown): id is string
export declare function customDeskPetId(petId: string): string
export declare function parseCustomDeskPetId(id: unknown): string | null
export declare function getSystemDeskPet(id?: string | null): SystemDeskPetSpec
