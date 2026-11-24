import { h5Areas } from '../../shared/h5-areas.mjs'
import { serviceCategories } from '../../shared/h5-discovery.mjs'

export const businessModules = {
  immortality: {title:'宠物数字永生', categories:[
    {id:'care',label:'临终关怀'}, {id:'farewell',label:'告别仪式'}, {id:'ecology',label:'生态纪念'}, {id:'keepsake',label:'纪念品定制'},
  ]},
  services: {title:'宠物周边服务', categories:[...serviceCategories, {id:'self-service',label:'自助洗护烘干'}]},
  charity: {title:'宠物公益慈善', categories:[
    {id:'activity',label:'公益活动'}, {id:'rescue',label:'救助资讯'}, {id:'adoption',label:'领养匹配'}, {id:'donation',label:'爱心捐赠'}, {id:'knowledge',label:'生命科普'},
  ]},
  medical: {title:'宠物医疗医药', categories:[
    {id:'hospital',label:'附近医院'}, {id:'consultation',label:'问诊与转诊'}, {id:'medicine',label:'医药与护理'}, {id:'senior',label:'老年照护'},
  ]},
  travel: {title:'宠物旅游出行', categories:[
    {id:'places',label:'宠物友好点位'}, {id:'packages',label:'出行套餐'}, {id:'guides',label:'带宠攻略'}, {id:'ecology',label:'户外纪念'},
  ]},
  education: {title:'宠物升学教育', categories:[
    {id:'online',label:'线上课程'}, {id:'training',label:'线下训练'}, {id:'creators',label:'达人教学'},
  ]},
} as const

export type BusinessModule = keyof typeof businessModules
export type ListingModule = BusinessModule|'friends'|'shop'
export type ListingKind = 'article'|'appointment'|'enrollment'|'product'|'group'|'link'
export function isBusinessModule(value: string): value is BusinessModule {
  return Object.prototype.hasOwnProperty.call(businessModules,value)
}

export const listingKindNames: Record<ListingKind,string> = {
  article:'详情',appointment:'预约',enrollment:'报名',product:'选购',group:'社群',link:'官方入口',
}

export interface Listing {
  id: string
  module: ListingModule
  category: string
  kind: ListingKind
  title: string
  provider: string
  description: string
  area: string|null
  venue: string|null
  startsAt: string|null
  closesAt: string|null
  priceCents: number|null
  stock: number|null
  externalUrl: string|null
}

export interface Engagement {
  id: string
  itemId: string
  petId: string|null
  petName: string|null
  module: ListingModule
  category: string
  kind: ListingKind
  title: string
  provider: string
  venue: string|null
  startsAt: string|null
  status: 'requested'|'joined'|'confirmed'|'completed'|'cancelled'
  note: string
  checkedInAt: string|null
  createdAt: string
}

export interface H5Order {
  id: string
  status: 'submitted'|'confirmed'|'completed'|'cancelled'
  totalCents: number
  createdAt: string
  supportMessage: string|null
  supportResolved: boolean|null
  items: {itemId:string; title:string; provider:string; unitCents:number; quantity:number}[]
}

export interface HealthRecord {
  id: string
  kind: 'exam'|'consultation'|'medicine'|'care'
  title: string
  happenedOn: string
  note: string
}

export interface Memorial {
  title: string
  remembrance: string
  coverAssetId: string|null
  updatedAt: string
}

export interface Tribute {
  id: string
  kind: 'message'|'candle'|'tribute'
  body: string
  createdAt: string
}

export interface PetRecords {
  health: HealthRecord[]
  engagements: Engagement[]
  posts: {id:string; title:string; createdAt:string}[]
  stories: {id:string; title:string; publishedAt:string|null; updatedAt:string}[]
  memorial: Memorial|null
  tributes: Tribute[]
}

export interface StorySummary {
  id: string
  title: string
  petName: string
  author: string
  hasCover: boolean|number
  hidden?: boolean|number
  publishedAt: string|null
  sceneCount: number
  likes: number
}

export interface StoryDetail extends StorySummary { scenes: string[] }
export interface PersonalStory extends StoryDetail { petId: string; coverAssetId: string|null; updatedAt: string }

export const currencyNames = {points:'数字永生积分',coins:'云上游戏币'} as const
export interface WalletSummary {
  balances: Record<keyof typeof currencyNames,number>
  entries: {id:string; currency:keyof typeof currencyNames; quantity:number; label:string; createdAt:string}[]
}

export const healthNames: Record<HealthRecord['kind'],string> = {exam:'体检',consultation:'问诊',medicine:'用药',care:'养护'}
export const engagementNames: Record<Engagement['status'],string> = {requested:'待确认',joined:'已参加',confirmed:'已确认',completed:'已完成',cancelled:'已取消'}
export const orderNames: Record<H5Order['status'],string> = {submitted:'待确认',confirmed:'已确认',completed:'已完成',cancelled:'已取消'}
export type AccountPanel = 'published'|'favorites'|'orders'|'appointments'|'learning'|'charity'|'assets'|'ip'|'creator'|'help'|'settings'
export type RecordsPanel = Extract<AccountPanel,'orders'|'appointments'|'learning'|'charity'|'assets'|'ip'|'creator'>
export const areaLabel = (id: string|null) => h5Areas.find(area => area.id === id)?.label ?? ''
const dateTime = new Intl.DateTimeFormat('zh-CN',{dateStyle:'medium',timeStyle:'short',timeZone:'Asia/Shanghai'})
export const localDateTime = (value: string) => dateTime.format(new Date(value))
