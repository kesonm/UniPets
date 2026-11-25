import type { BoundStore } from '../../../src/h5/types'
import { api } from './client'

export async function publishingStoreOptions() {
  const {stores} = await api<{stores:BoundStore[]}>('/h5/catalog/stores/mine')
  return [{id:'',label:'个人发布'}, ...stores.filter(store => store.enabled).map(store => ({id:store.id,label:store.name}))]
}
