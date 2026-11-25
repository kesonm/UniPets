export const recommendationLabelKinds = ['product', 'service', 'job', 'story']
export const recommendationLabelTextLimit = 8
export const recommendationLabelColor = /^#[0-9a-f]{6}$/i

export const defaultRecommendationLabels = {
  product: { text: '商品', textColor: '#7A441F', backgroundColor: '#FFE7D4' },
  service: { text: '服务', textColor: '#2D5A38', backgroundColor: '#E1F2DE' },
  job: { text: '招聘', textColor: '#2C527A', backgroundColor: '#E0EDFB' },
  story: { text: '短剧', textColor: '#613A7D', backgroundColor: '#EEE3F8' },
}
