import type { ServiceCoordinates } from '../../shared/h5-discovery.mjs'
import { api } from '../lib/api'

interface LatLng {
  getLat(): number
  getLng(): number
}
interface LatLngBounds {
  extend(point: LatLng): LatLngBounds
}
export interface MapView {
  setCenter(center: LatLng): void
  setZoom(zoom: number): void
  fitBounds(bounds: LatLngBounds, options: {padding:number;maxZoom:number}): void
  destroy(): void
}
interface Marker {
  id: string
  position: LatLng
}
export interface MultiMarker {
  setGeometries(markers: Marker[]): void
  setMap(map: MapView|null): void
  on(event: 'click', listener: (event: {geometry:Marker}) => void): void
}
export interface TencentMap {
  LatLng: new (lat: number, lng: number) => LatLng
  LatLngBounds: new (southwest: LatLng, northeast: LatLng) => LatLngBounds
  Map: new (container: HTMLElement, options: {center:LatLng;zoom:number}) => MapView
  MultiMarker: new (options: {map:MapView;geometries:Marker[]}) => MultiMarker
}

declare global {
  interface Window {
    TMap?: TencentMap
    petcloudTencentMapReady?: () => void
  }
}

export async function getTencentMapKey() {
  const {key} = await api<{key:string|null}>('/admin/stores/map-settings')
  return key
}

export function storeMarkerUrl(point: ServiceCoordinates) {
  const url = new URL('https://apis.map.qq.com/uri/v1/marker')
  url.search = new URLSearchParams({marker:`coord:${point.latitude},${point.longitude}`,referer:'PetCloud'}).toString()
  return url.href
}

let loadingMap: Promise<TencentMap> | undefined

export function loadTencentMap(key: string) {
  if (loadingMap) return loadingMap
  loadingMap = new Promise<TencentMap>((resolve,reject) => {
    const script = document.createElement('script')
    const source = new URL('https://map.qq.com/api/gljs')
    source.search = new URLSearchParams({key,v:'1.exp',callback:'petcloudTencentMapReady'}).toString()
    const finish = (sdk?: TencentMap) => {
      window.clearTimeout(timer)
      delete window.petcloudTencentMapReady
      script.onerror = null
      if (sdk?.Map && sdk.LatLng && sdk.LatLngBounds && sdk.MultiMarker) {
        resolve(sdk)
      } else {
        script.remove()
        reject(new Error('腾讯地图加载失败，请检查网络或网页 Key'))
      }
    }
    const timer = window.setTimeout(() => finish(),12000)
    window.petcloudTencentMapReady = () => finish(window.TMap)
    script.src = source.href
    script.async = true
    script.onerror = () => finish()
    document.head.append(script)
  }).catch(cause => {
    loadingMap = undefined
    throw cause
  })
  return loadingMap
}
