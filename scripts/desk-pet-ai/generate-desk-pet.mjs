#!/usr/bin/env node
/**
 * Generate 2D realistic floating desk-pet motion sprite sheets from a pet photo
 * using the upstream OpenAI-compatible /v1/images/edits API (default model: gpt-image-2.6).
 *
 * Usage:
 *   node scripts/desk-pet-ai/generate-desk-pet.mjs \
 *     --input miniapp/src/static/h5-hero.jpg \
 *     --out /tmp/desk-pet-test \
 *     --model gpt-image-2.6 \
 *     --species cat
 */
import { execFile } from 'node:child_process'
import { mkdir, readFile, writeFile } from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { promisify } from 'node:util'
import { createRequire } from 'node:module'

const execFileAsync = promisify(execFile)
const scriptDir = path.dirname(fileURLToPath(import.meta.url))
const projectRoot = path.resolve(scriptDir, '../..')
const serverRequire = createRequire(path.join(projectRoot, 'server/package.json'))
const dotenv = serverRequire('dotenv')
const sharp = serverRequire('sharp')

// Match server/src/config.ts env precedence without printing secrets
dotenv.config({ path: path.join(projectRoot, 'server/.env') })
dotenv.config({ path: path.join(projectRoot, '.env.local') })
dotenv.config({ path: path.join(projectRoot, '.env') })

function parseArgs(argv) {
  const options = {
    inputs: [],
    out: '',
    model: process.env.DESK_PET_IMAGE_MODEL || 'gpt-image-2.6-flare',
    url: process.env.UNIWORK_IMAGE_URL || 'https://pay.uniwork.top/v1/images/edits',
    quality: 'medium',
    species: 'cat',
    cellSize: 224,
    skipAnchor: false,
    skipCompose: false,
    dryRun: false,
  }
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i]
    const next = () => {
      if (i + 1 >= argv.length) throw new Error(`Missing value for ${arg}`)
      return argv[++i]
    }
    if (arg === '--input' || arg === '-i') options.inputs.push(next())
    else if (arg === '--out' || arg === '-o') options.out = next()
    else if (arg === '--model' || arg === '-m') options.model = next()
    else if (arg === '--url') options.url = next()
    else if (arg === '--quality' || arg === '-q') options.quality = next()
    else if (arg === '--species') options.species = next()
    else if (arg === '--cell-size') options.cellSize = Number(next())
    else if (arg === '--skip-anchor') options.skipAnchor = true
    else if (arg === '--skip-compose') options.skipCompose = true
    else if (arg === '--dry-run') options.dryRun = true
    else if (arg === '--help' || arg === '-h') {
      console.log(`Usage: node scripts/desk-pet-ai/generate-desk-pet.mjs --input <photo> --out <dir> [--model gpt-image-2.6] [--species cat|dog] [--quality low|medium|high]`)
      process.exit(0)
    } else {
      throw new Error(`Unknown argument: ${arg}`)
    }
  }
  if (!options.inputs.length) throw new Error('At least one --input <photo> is required')
  if (!options.out) throw new Error('--out <dir> is required')
  return options
}

function buildPrompts(species) {
  const animal = species === 'dog' ? 'dog' : 'cat'
  const animalZh = species === 'dog' ? '狗狗' : '猫咪'
  const secondActionEn =
    species === 'dog'
      ? 'gently raising one front paw to wave/give-paw and lowering it back to the floor'
      : 'gently lifting its viewer-left front paw up to its mouth to lick it twice with a tiny pink tongue, then lowering it cleanly back onto the floor'

  const anchor = [
    `Create a single 1:1 square crisp 2D realistic studio photograph of this EXACT ${animal} (${animalZh}) from the reference photo, faithfully preserving its exact breed, face shape, eye color, fur markings, ear shape, and coat texture.`,
    `Ignore the input photo's original pose, background, collar, leash, clothes, furniture, or props.`,
    `Pose: sitting neatly upright facing directly straight at the camera (strict eye-level front view), buttocks resting on the ground, both front paws placed neatly together side-by-side right in front of its chest, tail curled naturally beside the body, looking straight ahead with bright clear eyes, mouth gently closed in a relaxed sweet neutral expression.`,
    `Composition: full body completely visible from ear tips to paws and tail with generous clean empty margin on all four sides (~15% padding around the whole silhouette) so nothing is clipped.`,
    `Background: completely flat uniform pure solid white (#FFFFFF) studio background, soft even studio lighting, NO floor seam line, NO heavy shadow, NO props, NO text, NO borders, NO collage.`,
  ].join(' ')

  const breathe = [
    `Using the reference image of this EXACT sitting ${animal}, generate a single 3:2 landscape sprite sheet arranged as a strict 3 columns × 2 rows grid (6 equal-sized frames) showing a gentle, seamless "front-sitting breathing" idle loop.`,
    `CRITICAL CONSISTENCY & LAYOUT RULES:`,
    `- Exact same ${animal} identity across all 6 frames: identical face, markings, fur length, ear shape, paws, curled tail, and crisp realistic studio 2D photographic style.`,
    `- Strict 3×2 grid: 3 evenly spaced columns across, 2 evenly spaced rows down. Every frame sits on the exact same horizontal baseline inside its cell at the exact same scale and straight-on front eye-level camera angle.`,
    `- Completely flat uniform pure white (#FFFFFF) background everywhere. NO grid lines, NO borders, NO numbers, NO text, NO props, NO floor shadows. Leave generous white space between every figure so adjacent frames never touch.`,
    `6-frame sequence (left-to-right, top row then bottom row):`,
    `Frame 1 (top-left): exact neutral sitting upright pose matching reference, eyes fully open looking straight ahead, both front paws neatly together.`,
    `Frame 2 (top-center): gentle inhale — chest expands slightly fuller, shoulders lift very slightly, ears perk softly, eyes open.`,
    `Frame 3 (top-right): peak calm inhale — chest gently full, eyelids softly half-closed in a relaxed slow blink.`,
    `Frame 4 (bottom-left): cozy peaceful slow blink — eyes gently closed, calm upright sitting posture.`,
    `Frame 5 (bottom-center): gentle exhale — eyes opening halfway back up, chest softly relaxing downward.`,
    `Frame 6 (bottom-right): exhale complete — eyes fully open looking straight forward, returned smoothly to the exact neutral pose of Frame 1 for a seamless loop.`,
  ].join(' ')

  const lickPaw = [
    `Using the reference image of this EXACT sitting ${animal}, generate a single 3:2 landscape sprite sheet arranged as a strict 3 columns × 2 rows grid (6 equal-sized frames) showing a cute, seamless front-sitting action cycle: ${secondActionEn}.`,
    `CRITICAL CONSISTENCY & LAYOUT RULES:`,
    `- Exact same ${animal} identity across all 6 frames: identical face, markings, fur texture, ear shape, paws, curled tail, and crisp realistic studio 2D photographic style.`,
    `- Strict 3×2 grid: 3 evenly spaced columns across, 2 evenly spaced rows down. Every frame sits on the exact same horizontal baseline inside its cell at the exact same scale and straight-on front eye-level camera angle. The sitting lower body, hind legs, and curled tail remain planted in place throughout.`,
    `- Completely flat uniform pure white (#FFFFFF) background everywhere. NO grid lines, NO borders, NO numbers, NO text, NO props, NO floor shadows. Leave generous white space between every figure so adjacent frames never touch.`,
    `6-frame sequence (left-to-right, top row then bottom row):`,
    species === 'dog'
      ? `Frame 1 (top-left): exact neutral front-sitting pose matching reference, both front paws on the ground. Frame 2 (top-center): starting to lift viewer-left front paw off the floor. Frame 3 (top-right): front paw raised happily at chest level with a gentle smile. Frame 4 (bottom-left): holding paw raised with a slight cute head tilt. Frame 5 (bottom-center): gently lowering front paw halfway back toward the ground. Frame 6 (bottom-right): both front paws neatly back on the floor, matching Frame 1 seamlessly.`
      : `Frame 1 (top-left): exact neutral front-sitting pose matching reference, both front paws neatly on the ground looking straight ahead. Frame 2 (top-center): lifting viewer-left front paw halfway up toward its chest while glancing slightly down toward the paw; the other front paw stays planted firmly on the ground. Frame 3 (top-right): lifted front paw held right beside its mouth, head slightly lowered, small pink tongue clearly visible licking the paw, eyes gently half-closed. Frame 4 (bottom-left): second paw lick — keeping the same front paw raised near its mouth, head angled slightly as its small pink tongue licks the side of the paw, eyes softly squinting happily. Frame 5 (bottom-center): tongue tucked back in, lowering the front paw halfway back down toward the ground while raising head and opening eyes. Frame 6 (bottom-right): both front paws neatly planted side-by-side on the floor, head upright looking straight forward, matching Frame 1 seamlessly.`,
  ].join(' ')

  return { anchor, breathe, lickPaw }
}

async function normalizeInputPng(filePath) {
  const raw = await readFile(filePath)
  return sharp(raw)
    .rotate()
    .resize({ width: 1024, height: 1024, fit: 'inside', withoutEnlargement: true })
    .png()
    .toBuffer()
}

async function callImageEdit({ url, apiKey, model, size, quality, images, prompt, label }) {
  const started = Date.now()
  const form = new FormData()
  form.set('model', model)
  form.set('size', size)
  if (quality) form.set('quality', quality)
  form.set('prompt', prompt)
  for (const [idx, bytes] of images.entries()) {
    form.append('image', new Blob([new Uint8Array(bytes)], { type: 'image/png' }), `reference-${idx + 1}.png`)
  }

  console.log(`[${label}] POST ${url} model=${model} size=${size} quality=${quality} refs=${images.length}`)
  const response = await fetch(url, {
    method: 'POST',
    headers: { Authorization: `Bearer ${apiKey}` },
    body: form,
    signal: AbortSignal.timeout(270_000),
  })
  const elapsed = ((Date.now() - started) / 1000).toFixed(1)
  const text = await response.text()
  if (!response.ok) {
    throw new Error(`[${label}] HTTP ${response.status} (${elapsed}s): ${text.slice(0, 600)}`)
  }
  let payload
  try {
    payload = JSON.parse(text)
  } catch {
    throw new Error(`[${label}] Non-JSON response (${elapsed}s): ${text.slice(0, 400)}`)
  }
  const item = payload?.data?.[0]
  let bytes
  if (item?.b64_json) {
    bytes = Buffer.from(item.b64_json, 'base64')
  } else if (item?.url) {
    console.log(`[${label}] Downloading image from returned URL...`)
    const dl = await fetch(item.url, { signal: AbortSignal.timeout(120_000) })
    if (!dl.ok) throw new Error(`[${label}] Failed downloading result URL: HTTP ${dl.status}`)
    bytes = Buffer.from(await dl.arrayBuffer())
  } else {
    throw new Error(`[${label}] Response missing data[0].b64_json / url: ${text.slice(0, 400)}`)
  }
  const meta = await sharp(bytes).metadata()
  console.log(`[${label}] OK in ${elapsed}s -> ${meta.width}x${meta.height} (${meta.format}, ${(bytes.length / 1024).toFixed(1)} KB)`)
  return bytes
}

async function main() {
  const opts = parseArgs(process.argv.slice(2))
  const apiKey = process.env.UNIWORK_KEY?.trim() || ''
  if (!opts.dryRun && !apiKey) {
    throw new Error('UNIWORK_KEY is not set in server/.env, .env.local, or environment')
  }

  const outDir = path.resolve(opts.out)
  await mkdir(outDir, { recursive: true })
  const prompts = buildPrompts(opts.species)

  if (opts.dryRun) {
    console.log(JSON.stringify({ ...opts, hasApiKey: Boolean(apiKey), prompts }, null, 2))
    return
  }

  const inputBuffers = await Promise.all(opts.inputs.map(normalizeInputPng))

  let anchorBytes
  const anchorPath = path.join(outDir, 'raw-anchor.png')
  if (opts.skipAnchor) {
    anchorBytes = inputBuffers[0]
    await writeFile(anchorPath, anchorBytes)
    console.log(`[anchor] Skipped generation, using ${opts.inputs[0]}`)
  } else {
    anchorBytes = await callImageEdit({
      url: opts.url,
      apiKey,
      model: opts.model,
      size: '1024x1024',
      quality: opts.quality,
      images: inputBuffers,
      prompt: prompts.anchor,
      label: 'anchor',
    })
    await writeFile(anchorPath, anchorBytes)
  }

  const anchorPng = await sharp(anchorBytes)
    .resize({ width: 1024, height: 1024, fit: 'inside', withoutEnlargement: true })
    .png()
    .toBuffer()

  // Generate both 3x2 action sprite sheets in parallel anchored to the exact same anchor photo!
  const [breatheBytes, lickBytes] = await Promise.all([
    callImageEdit({
      url: opts.url,
      apiKey,
      model: opts.model,
      size: '1536x1024',
      quality: opts.quality,
      images: [anchorPng],
      prompt: prompts.breathe,
      label: 'breathe',
    }),
    callImageEdit({
      url: opts.url,
      apiKey,
      model: opts.model,
      size: '1536x1024',
      quality: opts.quality,
      images: [anchorPng],
      prompt: prompts.lickPaw,
      label: 'lick-paw',
    }),
  ])

  const rawBreathePath = path.join(outDir, 'raw-breathe.png')
  const rawLickPath = path.join(outDir, 'raw-lick-paw.png')
  await Promise.all([writeFile(rawBreathePath, breatheBytes), writeFile(rawLickPath, lickBytes)])

  if (opts.skipCompose) {
    console.log('Done (raw sheets saved, --skip-compose set).')
    return
  }

  // Post-process: slice 3x2, matte transparent background, unify scale & ground baseline, generate verification sheet
  console.log('[compose] Running matting, alignment, and sprite sheet composition...')
  const composeScript = path.join(scriptDir, 'compose-sprites.py')
  const { stdout, stderr } = await execFileAsync('python3', [
    composeScript,
    '--breathe',
    rawBreathePath,
    '--lick',
    rawLickPath,
    '--out',
    outDir,
    '--cell',
    String(opts.cellSize),
  ])
  if (stdout.trim()) console.log(stdout.trim())
  if (stderr.trim()) console.error(stderr.trim())

  // Optimize transparent PNGs with sharp palette compression for WeChat Mini Program budget
  for (const [src, dst, resize] of [
    ['composed-breathe.png', 'desk-pet-breathe.png', null],
    ['composed-lick-paw.png', 'desk-pet-lick-paw.png', null],
    ['composed-avatar.png', 'desk-pet-avatar.png', 160],
  ]) {
    let pipeline = sharp(path.join(outDir, src))
    if (resize) pipeline = pipeline.resize(resize, resize)
    const outPath = path.join(outDir, dst)
    await pipeline.png({ palette: true, quality: 92, compressionLevel: 9, effort: 10 }).toFile(outPath)
    const info = await sharp(outPath).metadata()
    const stat = (await readFile(outPath)).length
    console.log(`[optimize] ${dst}: ${info.width}x${info.height} (${(stat / 1024).toFixed(1)} KB)`)
  }

  console.log(`\nAll outputs saved to: ${outDir}`)
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error)
  process.exit(1)
})
