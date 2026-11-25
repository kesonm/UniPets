import type { Pet } from '../lib/types'
import type { BusinessModule } from './business'
import type { PostPetType, ServiceCoordinates } from '../../shared/h5-discovery.mjs'
import type { District } from '../../shared/h5-districts.mjs'
export type { District } from '../../shared/h5-districts.mjs'

export type H5Tab = 'home'|'friends'|'cart'|'identity'|'me'|'shop'|'cloud'|'events'|'training'|'stories'|BusinessModule
export type PetArchiveSection = 'health'|'digital'|'assets'|'content'|'growth'|'memorial'
export type CloudSection = 'detail'|'space'|'photos'|'motions'|'memories'|PetArchiveSection
export type DemoPet = Pick<Pet,'id'|'identityNumber'|'name'|'species'|'breed'|'birthday'|'gender'> & {hasCover:boolean|number;interactiveRoom?:boolean}
export type CloudPet = (DemoPet & {shared:true}) | (Pet & {shared:false;interactiveRoom?:boolean})
export type FeedOrder = 'recommended'|'latest'|'hot'|'near'
export type PostTopic = 'daily'|'travel'|'rescue'|'help'

export interface H5Post {
  id: string
  title: string
  body: string
  petName: string
  species: Pet['species']
  petType?: PostPetType
  breed?: string
  author: string
  createdAt: string
  area: string|null
  district?: District|null
  likes: number
  hasImage: boolean|number
  hidden?: boolean|number
  topic?: PostTopic
  exampleImage?: string
}

export interface ServicePost {
  id: string
  title: string
  description: string
  category: string
  categoryLabel?: string
  provider: string
  venue: string
  phone: string
  district: string | null
  priceCents: number | null
  imageCount?: number
  updatedAt: string
  likes: number
  commentCount: number
  liked: boolean | number
  distanceMeters?: number | null
}

export interface BoundStore {
  id: string
  name: string
  address: string
  phone: string
  enabled: boolean
  ready: boolean
  cityCode: string | null
  location: ServiceCoordinates | null
}

export interface MerchantStoreProfile {
  name: string
  address: string
  phone: string
  location: ServiceCoordinates
  cityCode?: string
}

export type PersonalContentTab = 'published' | 'likes' | 'favorites'
export type PersonalContentCounts = Record<PersonalContentTab, number>
export interface PersonalContentItem {
  id: string
  title: string
  kind: 'post' | 'story' | 'service'
  visible: boolean | number
  activityAt: string
}

export type Recommendation = { kind: 'post'; post: H5Post } | { kind: 'service'; post: ServicePost }

export interface H5Social {
  published: H5Post[]
  favorites: H5Post[]
  likedIds: string[]
  savedIds: string[]
}

export interface H5Comment { id:string; author:string; body:string; createdAt:string }
export interface H5Match {
  petId:string
  petName:string
  species:Pet['species']
  breed:string
  gender:Pet['gender']
  ageMonths:number|null
  area:string
  district?:District|null
  intent:'friends'|'dating'|'both'
  introduction:string
}
export interface H5FriendRequest {
  id:string
  status:'pending'|'accepted'|'declined'
  incoming:boolean|number
  sourceName:string
  targetName:string
}
export interface H5Creator { id:string; name:string; bio:string; featured:boolean|number; postCount:number }

export interface H5Event {
  id: string
  title: string
  organizer: string
  city: string
  venue: string
  area: string|null
  species: Pet['species']|null
  startsAt: string
  registrationOpensAt: string
  registrationClosesAt: string
  registrationStatus: 'upcoming'|'open'|'closed'
}

export interface H5EventRegistration {
  petId: string
  petName: string
  submittedAt: string
}

export interface H5TrainingCourse {
  id: string
  title: string
  learningFormat: string
  startsAt: string|null
  examAt: string|null
  examLocation: string
  eligibility: string
  credential: string
  issuer: string
}
