export const recommendationLabelKinds: readonly ['product', 'service', 'job', 'story']
export const recommendationLabelTextLimit: number
export const recommendationLabelColor: RegExp

export type RecommendationLabelKind = typeof recommendationLabelKinds[number]
export type RecommendationLabel = { text: string; textColor: string; backgroundColor: string }
export type RecommendationLabels = Record<RecommendationLabelKind, RecommendationLabel>
export type RecommendationLabelSettings = { labels: RecommendationLabels; revision: number }
export const defaultRecommendationLabels: RecommendationLabels
