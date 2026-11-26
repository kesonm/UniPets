import { config } from './config.js'

export type CompanionWeatherCondition = 'rain' | 'hot' | 'cold'

export interface CompanionWeather {
  condition: CompanionWeatherCondition
  summary: string
  source: string
}

// Provider integration point for companion weather messages.
//
// The current release intentionally has no provider connected. The client and
// the companion selector already understand rain/hot/cold rules, so enabling a
// provider later only needs:
//   1. WEATHER_PROVIDER, WEATHER_API_KEY and optionally WEATHER_BASE_URL.
//   2. Fetching an hourly/daily forecast for the coarse city code.
//   3. Caching the response for 30-60 minutes per city.
//   4. Returning `rain` only when precipitation probability is high enough in
//      the next few hours, `hot`/`cold` only when the forecast crosses the
//      temperature thresholds. Never invent a forecast when the provider fails.
export async function getCompanionWeather(cityCode?: string): Promise<CompanionWeather | null> {
  if (!cityCode || !config.weatherProvider || !config.weatherKey) return null
  return null
}
