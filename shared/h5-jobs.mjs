import { serviceRegions } from './h5-service-regions.mjs'

export const jobCategories = {
  grooming: '宠物美容',
  care: '宠物护理',
  training: '宠物训导',
  sales: '门店销售',
  assistant: '医疗助理',
  other: '其他岗位',
}

export const employmentTypes = {
  'full-time': '全职',
  'part-time': '兼职',
}

export const jobStatuses = {
  pending: '待审核',
  published: '招聘中',
  rejected: '审核未通过',
  closed: '已关闭',
}

const cities = new Map(serviceRegions.flatMap(region => region.cities.length ? region.cities : [region])
  .map(city => [city.id, city.label]))

export function jobCityLabel(code) {
  return cities.get(code) ?? ''
}
