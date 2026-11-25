export const jobCategories: Readonly<Record<'grooming' | 'care' | 'training' | 'sales' | 'assistant' | 'other', string>>
export const employmentTypes: Readonly<Record<'full-time' | 'part-time', string>>
export const jobStatuses: Readonly<Record<'pending' | 'published' | 'rejected' | 'closed', string>>

export type JobCategory = keyof typeof jobCategories
export type EmploymentType = keyof typeof employmentTypes
export type JobStatus = keyof typeof jobStatuses
export const jobCategoryMaxLength: number
export function jobCategoryLabel(job: Pick<StoreJob, 'category' | 'customCategory'>): string
export function jobCityLabel(code: string | null): string

export interface StoreJob {
  id: string
  storeId: string
  storeName: string
  cityCode: string | null
  address: string
  phone: string
  title: string
  category: JobCategory
  customCategory?: string | null
  employmentType: EmploymentType
  salary: string
  description: string
  status: JobStatus
  imageCount: number
  internalDemo: boolean
  createdAt: string
  publishedAt: string | null
}
