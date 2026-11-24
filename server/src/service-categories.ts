import { z } from 'zod'
import type { ServiceCategory } from '../../shared/h5-discovery.mjs'
import { rows } from './db.js'
import { HttpError } from './errors.js'

export const serviceCategoryId = z.string().regex(/^[a-z][a-z0-9-]{0,31}$/, '请选择有效的服务分类')
export const serviceCategoryName = z.string().trim().refine(value => {
  const length = Array.from(value).length
  return length >= 2 && length <= 4
}, '分类名称需为 2 到 4 个字')

export const serviceCategoryJoin = `LEFT JOIN h5_service_categories sc ON i.module='services'
  AND i.kind NOT IN ('product','group')
  AND sc.id=CASE WHEN i.category='self-service' THEN 'grooming' ELSE i.category END`
export const serviceCategoryColumn = "COALESCE(sc.id,'other')"
export const serviceCategoryLabel = "COALESCE(sc.label,(SELECT label FROM h5_service_categories WHERE id='other'),'其他')"

export function getServiceCategories() {
  return rows<ServiceCategory>('SELECT id,label FROM h5_service_categories ORDER BY position,created_at,id')
}

export async function checkServiceCategory(id: string) {
  const [valid] = await rows('SELECT id FROM h5_service_categories WHERE id=?', [id === 'self-service' ? 'grooming' : id])
  if (!valid) throw new HttpError(400, '请选择管理员创建的服务分类')
}
