import { computed, ref } from 'vue'
import type { ServiceCoordinates } from '../../../shared/h5-discovery.mjs'
import type { District } from '../../../shared/h5-districts.mjs'
import { areaLabel } from '../../../src/h5/business'
import { toast } from './client'
import { district } from './district'

export interface MapLocation {
  point: ServiceCoordinates
  coordinates: ServiceCoordinates
  district: District
}

const key = 'petcloud.map-location.v1'
const saved = uni.getStorageSync(key) as MapLocation | 'anywhere' | ''
export const selectedLocation = ref<MapLocation | null | undefined>(saved === 'anywhere' ? null : saved || undefined)
export const browseDistrict = computed(() => selectedLocation.value === undefined ? district.value : selectedLocation.value?.district)
export const selectedLocationLabel = computed(() => areaLabel(null, selectedLocation.value?.district) || '地图选位置')

type LocationRequest = {
  initial?: MapLocation | null
  clearable: boolean
  select: (location: MapLocation | null) => void
}
let pending: LocationRequest | undefined

export function openMapPicker(select: LocationRequest['select'], initial?: MapLocation | null, clearable = false) {
  if (pending) return
  const request = {initial, clearable, select}
  pending = request
  uni.navigateTo({
    url: '/pages/location-map/index',
    fail() {
      releaseMapPicker(request)
      toast('暂时无法打开地图')
    },
  })
}

export function mapPickerRequest() {
  return pending
}

export function releaseMapPicker(request: LocationRequest | undefined) {
  if (pending === request) pending = undefined
}

export function saveBrowseLocation(location: MapLocation | null) {
  selectedLocation.value = location
  uni.setStorageSync(key, location ?? 'anywhere')
}

export function changeBrowseLocation() {
  openMapPicker(saveBrowseLocation, selectedLocation.value, !!selectedLocation.value)
}
