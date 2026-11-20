import type { Listing } from './business'

export const categories = [
  {id:'all',label:'全部'}, {id:'food',label:'宠粮零食'}, {id:'care',label:'药品护理'}, {id:'toys',label:'玩具用品'},
  {id:'culture',label:'文创周边'}, {id:'custom',label:'定制潮玩'}, {id:'memorial',label:'纪念品'}, {id:'package',label:'服务套餐'},
] as const
export type CatalogCategory = (typeof categories)[number]['id']

export interface Product {
  id: string
  name: string
  merchant: string
  area: string
  category: Exclude<CatalogCategory,'all'>
  illustration: number
  description: string
  variants: { name: string; cents: number }[]
  example: boolean
  platform?: boolean
  stock?: number
  purchaseUrl?: string
  merchantUrl?: string
}

export const products: Product[] = [
  { id:'cat-food',name:'全价成猫鸡肉粮',merchant:'云宠街角宠物店',area:'shenzhen-nanshan',category:'food',illustration:0,
    description:'鸡肉口味的日常主粮，提供试吃装和常规装。',variants:[{name:'500 g',cents:2990},{name:'1.5 kg',cents:6990}],example:true },
  { id:'pet-care',name:'宠物日常护理营养粉',merchant:'毛孩子护理站',area:'shenzhen-nanshan',category:'care',illustration:1,
    description:'宠物用品类目展示，可按规格查看商家信息。',variants:[{name:'60 g',cents:3990}],example:true },
  { id:'feather',name:'羽毛逗猫棒',merchant:'云宠街角宠物店',area:'shenzhen-nanshan',category:'toys',illustration:2,
    description:'轻量手柄搭配彩色羽毛，用于陪猫咪玩耍。',variants:[{name:'单支',cents:1290},{name:'两支装',cents:1990}],example:true },
  { id:'dog-treat',name:'冻干鸡胸肉小零食',merchant:'尾巴食堂',area:'shanghai-xuhui',category:'food',illustration:3,
    description:'独立封口的宠物零食，可查看不同包装规格。',variants:[{name:'50 g',cents:2590},{name:'100 g',cents:4590}],example:true },
  { id:'care-kit',name:'梳毛与清洁护理套装',merchant:'毛孩子护理站',area:'shenzhen-nanshan',category:'care',illustration:4,
    description:'日常梳毛清洁用品套装。',variants:[{name:'基础套装',cents:3590}],example:true },
  { id:'felt-ball',name:'彩色羊毛毡追逐球',merchant:'爪子玩具铺',area:'guangzhou-tianhe',category:'toys',illustration:5,
    description:'轻盈的彩色玩具球，适合一起玩抛球游戏。',variants:[{name:'三只装',cents:1690}],example:true },
]

export function productFromListing(item: Listing): Product|undefined {
  if (item.kind!=='product' || item.priceCents===null || item.stock===null) return
  const category = item.module==='immortality' ? 'memorial' : item.module==='services' ? 'package' :
    item.module==='medical' ? 'care' : categories.find(group=>group.id!=='all'&&group.id===item.category)?.id
  return {id:item.id,name:item.title,merchant:item.provider || '云上空间',area:item.area ?? '',
    category:category && category!=='all' ? category : 'culture',illustration:0,description:item.description,
    variants:[{name:'标准规格',cents:item.priceCents}],example:false,platform:true,stock:item.stock}
}
export const productFor = (id: string, published: readonly Product[] = []) => published.find(item=>item.id===id) ?? products.find(item=>item.id===id)
export const amount = (cents: number) => (cents/100).toFixed(2).replace(/\.00$/,'')
