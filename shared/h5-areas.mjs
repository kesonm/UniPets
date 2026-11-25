export const h5Areas = [
  { id: 'beijing-chaoyang', label: '北京 · 朝阳', cityCode: '110000', latitude: 39.921, longitude: 116.443 },
  { id: 'shanghai-xuhui', label: '上海 · 徐汇', cityCode: '310000', latitude: 31.189, longitude: 121.436 },
  { id: 'guangzhou-tianhe', label: '广州 · 天河', cityCode: '440100', latitude: 23.13, longitude: 113.328 },
  { id: 'shenzhen-nanshan', label: '深圳 · 南山', cityCode: '440300', latitude: 22.533, longitude: 113.93 },
  { id: 'hangzhou-xihu', label: '杭州 · 西湖', cityCode: '330100', latitude: 30.265, longitude: 120.13 },
]

export function areaDistance(from, to) {
  const radians = Math.PI / 180
  const latitude = (to.latitude - from.latitude) * radians
  const longitude = (to.longitude - from.longitude) * radians
  const apart = Math.sin(latitude / 2) ** 2 + Math.cos(from.latitude * radians) *
    Math.cos(to.latitude * radians) * Math.sin(longitude / 2) ** 2
  return 12742 * Math.asin(Math.sqrt(Math.min(1, apart)))
}
