import { ChatDotRound, CollectionTag, Film, FirstAidKit, Goods, Shop, User } from '@element-plus/icons-vue'
import { h5Areas } from '../../shared/h5-areas.mjs'
import type { ServiceCoordinates } from '../../shared/h5-discovery.mjs'
import { serviceRegions } from '../../shared/h5-service-regions.mjs'
import { businessModules, type Listing } from '../h5/business'
import { categories } from '../h5/catalog'
import type { PostTopic } from '../h5/types'

type Choice = { id: string; label: string }
export const sections = [
  {id:'users',title:'用户管理',icon:User,search:'搜索昵称、账号或用户 ID',
    columns:['用户','登录方式','宠物档案','注册时间','状态'],
    filters:[{id:'enabled',label:'正常'},{id:'disabled',label:'已停用'}]},
  {id:'stores',title:'门店管理',icon:Shop,search:'搜索门店、地址或电话',create:'新增门店',
    columns:['门店','地区','联系电话','创建时间','状态','绑定'],
    filters:[{id:'enabled',label:'营业中'},{id:'disabled',label:'已停用'},{id:'bound',label:'已被绑定'},{id:'unbound',label:'暂未绑定'}]},
  {id:'products',title:'商品管理',icon:Goods,search:'搜索商品或门店',create:'新增商品',
    columns:['商品','门店 / 提供方','价格','库存','状态'],filters:catalogFilters()},
  {id:'pets',title:'宠物管理',icon:CollectionTag,search:'搜索宠物、主人或宠物编号',
    columns:['宠物','所属用户','宠物编号','建档时间'],
    filters:[{id:'cat',label:'猫'},{id:'dog',label:'狗'},{id:'other',label:'其他'}]},
  {id:'services',title:'服务管理',icon:FirstAidKit,search:'搜索服务或门店',create:'新增服务',
    columns:['服务','门店 / 提供方','项目类型','服务时间','状态'],filters:catalogFilters()},
  {id:'posts',title:'动态管理',icon:ChatDotRound,search:'搜索动态、发布人或宠物',
    columns:['动态','发布人','类型','评论','发布时间','状态'],
    filters:[{id:'published',label:'已发布'},{id:'hidden',label:'已隐藏'}]},
  {id:'stories',title:'创作管理',icon:Film,search:'搜索作品、创作者或宠物',
    columns:['作品','创作者','分镜','更新时间','状态'],
    filters:[{id:'published',label:'已发布'},{id:'hidden',label:'已隐藏'},{id:'draft',label:'草稿'}]},
] as const

function catalogFilters(): Choice[] {
  return [{id:'published',label:'已上架'},{id:'unpublished',label:'未上架'},{id:'paused',label:'门店已停用'}]
}

export type Section = (typeof sections)[number]['id']
type Flag = 0|1|boolean
interface BaseRow { id: string }
export interface Account extends BaseRow {
  username: string; displayName: string; createdAt: string
  isAdmin: Flag; wechat: Flag; enabled: Flag; petCount: number
}
export interface Store extends BaseRow {
  name: string; area: string|null; districtCode: string|null; cityCode: string|null; address: string; phone: string
  latitude: number|null; longitude: number|null; enabled: Flag; bound: Flag; createdAt: string
}
export interface CatalogItem extends Listing {
  storeId: string|null; storeName: string|null; storeEnabled: Flag|null; visible: Flag; published: Flag; updatedAt: string
  categoryLabel?: string|null
}
export const speciesNames = {cat:'猫',dog:'狗',other:'其他'}
export const genderNames = {unknown:'未知',male:'公',female:'母'}
export interface Pet extends BaseRow {
  name: string; species: keyof typeof speciesNames; breed: string; gender: keyof typeof genderNames
  birthday: string|null; notes: string; owner: string; ownerUsername: string; identityNumber: string|null; createdAt: string
}
export interface Post extends BaseRow {
  title: string; topic: PostTopic; createdAt: string
  author: string; petName: string; commentCount: number; hidden: Flag
}
export interface Story extends BaseRow {
  title: string; author: string; petName: string; sceneCount: number; hidden: Flag
  publishedAt: string|null; updatedAt: string
}
export type AdminRecord = Account|Store|CatalogItem|Pet|Post|Story
export type StoreOnMap = Store & {mapPoint:ServiceCoordinates|null}
export type Content = Post|Story

export const listingGroups = {...businessModules,shop:{title:'宠物品牌超市',categories:categories.filter(item => item.id !== 'all')},
  friends:{title:'宠物相亲交友',categories:[{id:'community',label:'社群'}]}}
export const kinds: Record<Listing['kind'],string> = {
  article:'资讯',appointment:'预约服务',enrollment:'报名项目',product:'商品',link:'官方链接',group:'社群',
}
const topics: Record<PostTopic,string> = {daily:'日常分享',travel:'出行攻略',rescue:'救助信息',help:'求助'}
const localDate = new Intl.DateTimeFormat('zh-CN', {
  year:'numeric',month:'2-digit',day:'2-digit',hour:'2-digit',minute:'2-digit',hourCycle:'h23',timeZone:'Asia/Shanghai',
})
const currency = new Intl.NumberFormat('zh-CN',{style:'currency',currency:'CNY'})
const cities = new Map(serviceRegions.flatMap(province => [province,...province.cities]).map(city => [city.id,city.label]))
type Cell = { title: string; detail?: string; tone?: 'positive'|'muted'|'warning' }
const cell = (title: string|number|null, detail?: string): Cell => ({title:String(title ?? '—'),detail})
const status = (title: string, tone: Cell['tone']): Cell => ({title,tone})
const date = (value: string|null) => cell(value ? localDate.format(new Date(value)) : null)

export function tableCells(row: AdminRecord): Cell[] {
  if ('username' in row) return [
    cell(row.displayName,row.username),cell(row.wechat ? '微信登录' : '网页账号',row.isAdmin ? '管理员' : undefined),
    cell(row.petCount),date(row.createdAt),row.enabled ? status('正常','positive') : status('已停用','warning'),
  ]
  if ('phone' in row) return [
    cell(row.name,row.address),cell(cities.get(row.cityCode ?? '') ?? h5Areas.find(area => area.id===row.area)?.label ?? row.area),
    cell(row.phone || null),date(row.createdAt),row.enabled ? status('营业中','positive') : status('已停用','warning'),
    row.bound ? status('已被绑定','positive') : status('暂未绑定','muted'),
  ]
  if ('storeId' in row) {
    const category = row.categoryLabel ?? listingGroups[row.module].categories.find(item => item.id===row.category)?.label ?? row.category
    const primary = cell(row.title,category)
    const provider = cell(row.storeName || row.provider || '平台')
    const visibility = row.visible ? status('已上架','positive') : row.published ? status('门店已停用','warning') : status('未上架','muted')
    return row.kind === 'product'
      ? [primary,provider,cell(row.priceCents===null ? null : currency.format(row.priceCents/100)),cell(row.stock),visibility]
      : [primary,provider,cell(kinds[row.kind]),date(row.startsAt),visibility]
  }
  if ('owner' in row) return [
    cell(row.name,[speciesNames[row.species],row.breed].filter(Boolean).join(' · ')),
    cell(row.owner,row.ownerUsername),cell(row.identityNumber ?? '未登记'),date(row.createdAt),
  ]
  const hidden = status('已隐藏','warning')
  const published = status('已发布','positive')
  if ('topic' in row) return [
    cell(row.title,row.petName),cell(row.author),cell(topics[row.topic]),cell(row.commentCount),date(row.createdAt),
    row.hidden ? hidden : published,
  ]
  return [cell(row.title,row.petName),cell(row.author),cell(row.sceneCount),date(row.updatedAt),
    row.hidden ? hidden : row.publishedAt ? published : status('草稿','muted')]
}

export function detailTitle(row: AdminRecord|undefined) {
  if (!row) return ''
  if ('displayName' in row) return row.displayName
  if ('name' in row) return row.name
  return row.title
}

export function canReview(row: Content) {
  return 'topic' in row || Boolean(row.hidden || row.publishedAt)
}

export function recordAction(row: AdminRecord) {
  if ('enabled' in row && !('isAdmin' in row && row.isAdmin)) {
    const title = 'username' in row ? '账号' : '门店'
    const notice = title === '账号' ? '账号的现有登录会话会立即失效。' : '关联商品和服务会暂停展示，已有订单和预约会保留。'
    return {label:row.enabled ? '停用' : '启用',body:{enabled:!row.enabled},notice:row.enabled ? notice : ''}
  }
  if ('storeId' in row) return {label:row.published ? '下架' : '上架',body:{published:!row.published},
    notice:row.published ? '下架后，用户将无法从目录中看到这条记录。' : ''}
  if ('hidden' in row && canReview(row)) return {label:row.hidden ? '恢复' : '隐藏',body:{hidden:!row.hidden},
    notice:row.hidden ? '' : '隐藏后，内容将停止公开展示。作者仍可查看自己的记录。'}
}
