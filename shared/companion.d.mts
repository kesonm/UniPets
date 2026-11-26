export type CompanionSpecies = 'cat' | 'dog'
export type CompanionScene = 'open' | 'interval' | 'tap'
export type CompanionTime = 'morning' | 'noon' | 'afternoon' | 'evening' | 'late' | 'any'
export type CompanionAction = 'breathe' | 'lick_paw'
export type CompanionWeatherCondition = 'rain' | 'hot' | 'cold'

export interface CompanionLine {
  readonly id: string
  readonly species: CompanionSpecies
  readonly scenes: readonly CompanionScene[]
  readonly when: readonly CompanionTime[]
  readonly text: string
  readonly action: CompanionAction
  readonly weight: number
  readonly weather?: CompanionWeatherCondition
  readonly birthday?: boolean
}

export interface CompanionMessage {
  id: string
  text: string
  action: CompanionAction
  durationMs: number
}

export interface CompanionWeather {
  condition: CompanionWeatherCondition
}

export interface CompanionContext {
  species: CompanionSpecies
  scene: CompanionScene
  when?: CompanionTime
  recentIds?: readonly string[]
  weather?: CompanionWeather | null
  birthday?: boolean
  days?: number | null
}

export declare const companionLines: readonly CompanionLine[]
export declare function timeOfDay(hour: number): CompanionTime
export declare function shanghaiHour(date?: Date): number
export declare function shanghaiDate(date?: Date): string
export declare function bubbleDuration(text: string): number
export declare function pickCompanionMessage(context: CompanionContext): CompanionMessage
