export const postPetTypes = ['cat', 'dog', 'rabbit', 'other']
export const postPetTypeLabels = { cat: '猫', dog: '狗', rabbit: '兔', other: '其他宠物' }

export const serviceCategories = [
  { id: 'grooming', label: '洗护服务', terms: ['洗护', '美容', '洗澡', '修毛', '剪毛', '剪指甲', '打结'] },
  { id: 'boarding', label: '代养服务', terms: ['代养', '寄养', '托管', '托养', '短期照顾'] },
  { id: 'home-service', label: '上门服务', terms: ['上门', '喂养', '遛狗', '遛宠', '铲屎', '换水'] },
  { id: 'photography', label: '宠物拍摄', terms: ['拍摄', '写真', '摄影'] },
  { id: 'package', label: '服务套餐', terms: ['套餐'] },
  { id: 'other', label: '其他服务', terms: [] },
]

export function servicePhone(value) {
  const number = value.replace(/[\s()-]/g, '')
  return /^\+?[0-9]{5,20}$/.test(number) ? number : ''
}
