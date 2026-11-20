export interface User { id: string; username: string; displayName: string; createdAt: string }
export interface Pet { id: string; identityNumber: string|null; name: string; species: 'dog'|'cat'|'other'; breed: string; birthday: string|null; gender: 'unknown'|'male'|'female'; notes: string; avatarAssetId: string|null; assetCount: number; memoryCount: number }
import type { CatClipId, CatManifest, CatPoseId } from '../../shared/cat-motion.mjs'

export type Action = 'idle'|'happy'|'walk'|'sleep'|CatClipId
export interface Asset { id: string; petId: string; name: string; kind: 'photo'|'sprite'; action: Action|null; mimeType: string; byteSize: number; width: number; height: number; frames: number; columns: number; rows: number; fps: number; duration: number|null; hasVideo: boolean; backgroundRemoved?: 0 | 1; sleepLoop?: 0 | 1; imageVersion?: string; jobId: string|null; createdAt: string; motionFromAssetId?: string|null; motionToAssetId?: string|null; motionJoinable?: 0|1|null }
export type MotionPreviewAsset = Pick<Asset,'id'|'name'|'action'|'frames'|'columns'|'rows'|'fps'|'imageVersion'|'backgroundRemoved'|'motionJoinable'|'motionFromAssetId'|'motionToAssetId'> & {imagePath?: string}
export interface Job { id: string; petId: string; referenceAssetId: string|null; status: 'queued'|'running'|'completed'|'partial'|'failed'; completed: number; total: number; error: string|null; mode: 'image'|'video'|'motion_batch'|'motion_render'; duration: number; fps: number; model: string; phase: string; createdAt: string; motionKey?: CatClipId|CatPoseId|null }
export interface MotionStep { action: CatClipId; status: 'queued'|'submitting'|'generating'|'processing'|'completed'|'failed'; progress: number|null; retrying: 0|1|null; error: string|null; assetId: string|null }
export interface MotionManifest extends CatManifest<Asset> { steps: MotionStep[]; poseGenerationEnabled: boolean; clipGenerationEnabled: boolean }
export interface MotionBatchPlan { references: Pick<Asset,'id'|'name'>[]; poses: number; clips: number; jump: boolean; local: number; total: number }
export interface Memory { id: string; petId: string; title: string; content: string; happenedOn: string; assetId: string|null }
export interface Dashboard { stats: { pets: number; assets: number; sprites: number; storageBytes: number; memories: number }; generationEnabled: boolean; model: string; videoFps?: number; videoMatting?: boolean; generationReason?: string }
