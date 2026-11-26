import type { H5Post } from './types'

export const homeEntries = [
  { id: 'immortality', label: '宠物数字永生', icon: 'Sunny', tone: 'gold' },
  { id: 'services', label: '宠物周边服务', icon: 'LocationFilled', tone: 'cyan' },
  { id: 'friends', label: '宠物相亲交友', icon: 'ChatDotRound', tone: 'pink' },
  { id: 'stories', label: '宠物创作', icon: 'Film', tone: 'violet' },
  { id: 'charity', label: '宠物公益慈善', icon: 'Star', tone: 'coral' },
  { id: 'shop', label: '宠物品牌超市', icon: 'ShoppingBag', tone: 'orange' },
  { id: 'medical', label: '宠物医疗医药', icon: 'FirstAidKit', tone: 'green' },
  { id: 'travel', label: '宠物旅游出行', icon: 'Compass', tone: 'blue' },
  { id: 'education', label: '宠物升学教育', icon: 'Reading', tone: 'yellow' },
] as const

export const homeSlides = [
  { title: '宠物培训与考证', line: '美容洗护 · 行为训导 · 赛事执裁', cta: '查看课程和考期', image: 'h5-training.webp', action: 'training' },
  { title: '宠物数字永生', line: '在云端保存照片、故事与回忆', cta: '打开纪念空间', image: 'h5-hero.webp', action: 'immortality' },
  { title: '宠物赛事', line: '查看赛程、参赛规则和报名时间', cta: '查看赛事', image: 'pet-hero.png', action: 'events' },
] as const

export const feedSorting = [
  { id: 'recommended', name: '推荐' }, { id: 'latest', name: '最新' },
  { id: 'hot', name: '最热' }, { id: 'near', name: '最近' },
] as const

export const homeSearchKinds = [
  { id: 'shop', name: '商品' }, { id: 'services', name: '服务' },
  { id: 'stories', name: '短剧' }, { id: 'feed', name: '动态' },
] as const

export const examplePosts = [
  {
    id: 'example-nap', title: '找到了最暖和的午睡位', body: '下午的阳光刚好落在窗边，小猫趴了一整个午后。',
    petName: '布丁', author: '示例动态', species: 'cat', createdAt: '', area: null, likes: 0,
    hasImage: true, exampleImage: 'h5-hero.webp',
  },
  {
    id: 'example-friends', title: '和小伙伴一起过周末', body: '两只小家伙挨在一起，等着出门散步。',
    petName: '小满', author: '示例动态', species: 'dog', createdAt: '', area: null, likes: 0,
    hasImage: true, exampleImage: 'pet-hero.png',
  },
] satisfies readonly H5Post[]
