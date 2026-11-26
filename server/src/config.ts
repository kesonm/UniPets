import { config as dotenv } from 'dotenv'
import { fileURLToPath } from 'node:url'
import path from 'node:path'
export const serverRoot = fileURLToPath(new URL('../', import.meta.url))
export const projectRoot = path.resolve(serverRoot, '..')
dotenv({ path: path.join(serverRoot, '.env') })
dotenv({ path: path.join(projectRoot, '.env.local') })
dotenv({ path: path.join(projectRoot, '.env') })
export const config = {
  port: Number(process.env.PORT || 3008), host: process.env.HOST || '127.0.0.1',
  production: process.env.NODE_ENV === 'production',
  trustProxy: process.env.TRUST_PROXY === '1',
  allowHttpAuth: process.env.PETCLOUD_ALLOW_HTTP_AUTH === '1',
  wechatAppId: process.env.WECHAT_APP_ID?.trim() || '',
  wechatAppSecret: process.env.WECHAT_APP_SECRET?.trim() || '',
  h5DemoOwnerId: process.env.H5_DEMO_OWNER_ID?.trim() || '',
  h5DemoMotionPetId: process.env.H5_DEMO_MOTION_PET_ID?.trim() || '',
  h5OperatorIds: (process.env.H5_OPERATOR_USER_IDS ?? '').split(',').map(id=>id.trim()).filter(Boolean),
  origins: (process.env.FRONTEND_ORIGINS || 'http://localhost:4173,http://127.0.0.1:4173').split(',').map(s => s.trim()),
  database: {
    host: process.env.DB_HOST || '127.0.0.1', port: Number(process.env.DB_PORT || 3307),
    user: process.env.DB_USER || 'petcloud', password: process.env.DB_PASSWORD || '', database: process.env.DB_NAME || 'petcloud',
    timezone: 'Z', charset: 'utf8mb4', connectionLimit: 10,
  },
  storage: path.resolve(process.env.STORAGE_DIR || path.join(serverRoot, 'storage')),
  nosePrintModelDir: process.env.PET_NOSEPRINT_MODEL_DIR?.trim() || '',
  nosePrintPython: process.env.PET_NOSEPRINT_PYTHON?.trim() || 'python3',
  deskPetGeneration: process.env.PETCLOUD_DESK_PET_GENERATION === '1',
  deskPetPython: process.env.PETCLOUD_DESK_PET_PYTHON?.trim() || '',
  deskPetComposeScript: process.env.PETCLOUD_DESK_PET_COMPOSE?.trim() || '',
  deskPetImageModel: process.env.DESK_PET_IMAGE_MODEL?.trim() || process.env.UNIWORK_MODEL || 'gpt-image-2.6-flare',
  deskPetImageQuality: process.env.DESK_PET_IMAGE_QUALITY || 'medium',
  deskPetDailyLimit: Math.max(1, Number(process.env.DESK_PET_DAILY_LIMIT) || 2),
  deskPetCellSize: Math.max(96, Math.min(384, Number(process.env.DESK_PET_CELL_SIZE) || 224)),
  weatherProvider: process.env.WEATHER_PROVIDER?.trim() || '',
  weatherKey: process.env.WEATHER_API_KEY?.trim() || '',
  weatherBaseUrl: process.env.WEATHER_BASE_URL?.trim() || '',
  imageKey: process.env.UNIWORK_KEY || '',
  imageUrl: process.env.UNIWORK_IMAGE_URL || 'https://pay.uniwork.top/v1/images/edits',
  imageModel: process.env.UNIWORK_MODEL || 'gpt-image-2.5-flare',
  videoKey: process.env.UNIWORK_VIDEO_KEY || process.env.UNIWORK_KEY || '',
  videoBaseUrl: (process.env.UNIWORK_VIDEO_BASE_URL || 'https://pay.uniwork.top/v1').replace(/\/$/, ''),
  videoModel: process.env.UNIWORK_VIDEO_MODEL || 'wan3.0-video',
  videoMatting: process.env.PETCLOUD_VIDEO_MATTING !== 'off',
  ffmpeg: process.env.FFMPEG_PATH || 'ffmpeg',
  ffprobe: process.env.FFPROBE_PATH || 'ffprobe',
}
