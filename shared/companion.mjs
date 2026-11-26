// Desk-pet companionship lines. Kept in shared code so the API and the
// offline mini program fallback select from the same library.
//
// Each line can be restricted by:
// - species: cat | dog
// - scenes: open (first bubble after opening the mini program), interval
//   (while browsing), tap (the owner touches the pet)
// - when: morning | noon | afternoon | evening | late | any
// - weather: rain | hot | cold (only offered when weather data is available)
// - birthday: true (only offered on the pet's birthday)
// - {days}: replaced with the number of days since the pet profile was created
//
// Keep lines short: the bubble is a compact floating element, not a chat page.

function line(id, species, scenes, when, text, action = 'breathe', extra = {}) {
  return {
    id,
    species,
    scenes,
    when: Array.isArray(when) ? when : [when],
    text,
    action,
    weight: 1,
    ...extra,
  }
}

const cat = [
  // First bubble after opening the mini program.
  line('cat-open-morning-1', 'cat', ['open'], 'morning', '主人早安～今天也慢慢来，我先替你晒晒太阳。'),
  line('cat-open-morning-2', 'cat', ['open'], 'morning', '早呀主人，我刚醒。今天也不用一下子就很厉害。'),
  line('cat-open-noon-1', 'cat', ['open'], 'noon', '主人，中午啦。先吃饭，再忙别的。', 'lick_paw'),
  line('cat-open-afternoon-1', 'cat', ['open'], 'afternoon', '主人，下午好。犯困的话就起来走两步吧。'),
  line('cat-open-evening-1', 'cat', ['open'], 'evening', '主人今天辛苦了，回来就先坐下歇一会儿。'),
  line('cat-open-evening-2', 'cat', ['open'], 'evening', '欢迎回家，主人。今天也谢谢你没有忘记我。', 'lick_paw'),
  line('cat-open-late-1', 'cat', ['open'], 'late', '这么晚还没睡呀主人？我陪你一会儿，但别熬太久。'),
  line('cat-open-any-1', 'cat', ['open'], 'any', '主人，我在呢。见到你真好。'),

  // Ambient bubbles while the mini program stays open.
  line('cat-interval-any-1', 'cat', ['interval'], 'any', '主人，我刚刚打了个哈欠。你忙到哪一步啦？'),
  line('cat-interval-any-2', 'cat', ['interval'], 'any', '主人，记得喝口水。我替你看着时间。', 'lick_paw'),
  line('cat-interval-any-3', 'cat', ['interval'], 'any', '我就安静趴着，主人忙你的，不用管我。'),
  line('cat-interval-morning-1', 'cat', ['interval'], 'morning', '主人，早上的光很好，适合慢慢开始。'),
  line('cat-interval-noon-1', 'cat', ['interval'], 'noon', '主人，饭点过了吗？别空着肚子忙。', 'lick_paw'),
  line('cat-interval-afternoon-1', 'cat', ['interval'], 'afternoon', '主人，坐久了就伸个懒腰吧。'),
  line('cat-interval-evening-1', 'cat', ['interval'], 'evening', '主人，今天快结束了，剩下的事明天再说。'),
  line('cat-interval-late-1', 'cat', ['interval'], 'late', '主人，夜深了。今天先到这里也可以。'),
  line('cat-interval-any-4', 'cat', ['interval'], 'any', '主人，我闻到一点风的味道。你那边天气怎么样？'),
  line('cat-interval-any-5', 'cat', ['interval'], 'any', '主人，如果累了就靠一会儿，我在这里。'),
  line('cat-interval-any-6', 'cat', ['interval'], 'any', '主人，今天有没有什么小事让你开心？', 'lick_paw'),
  line('cat-interval-any-7', 'cat', ['interval'], 'any', '主人，我刚刚舔了舔爪子，顺便想你一下。', 'lick_paw'),
  line('cat-interval-any-8', 'cat', ['interval'], 'any', '主人，不用一直很坚强，偶尔偷懒也没关系。'),
  line('cat-interval-any-9', 'cat', ['interval'], 'any', '主人，我在这儿。你忙完记得看看我。'),
  line('cat-interval-any-10', 'cat', ['interval'], 'any', '主人，今天也谢谢你照顾我。'),

  // Immediate reactions to a tap.
  line('cat-tap-1', 'cat', ['tap'], 'any', '喵？主人叫我？', 'lick_paw'),
  line('cat-tap-2', 'cat', ['tap'], 'any', '在呢在呢，主人～'),
  line('cat-tap-3', 'cat', ['tap'], 'any', '呼噜呼噜…主人再摸一下。', 'lick_paw'),
  line('cat-tap-4', 'cat', ['tap'], 'any', '主人，我在这儿，没走。'),
  line('cat-tap-5', 'cat', ['tap'], 'any', '喵～主人今天身上有阳光的味道。'),
  line('cat-tap-6', 'cat', ['tap'], 'any', '主人，摸头可以，摸肚子要收费的。', 'lick_paw'),
  line('cat-tap-7', 'cat', ['tap'], 'any', '主人，我在听。你慢慢说。'),
  line('cat-tap-8', 'cat', ['tap'], 'morning', '早安，主人。'),
  line('cat-tap-9', 'cat', ['tap'], 'evening', '主人回来啦。', 'lick_paw'),
  line('cat-tap-10', 'cat', ['tap'], 'late', '主人还不睡吗？'),

  // Weather rules are wired but stay dormant until a provider returns data.
  line('cat-weather-rain-1', 'cat', ['open', 'interval'], 'any', '主人，预报说待会儿可能有雨，出门记得带伞嗷。', 'breathe', { weather: 'rain', weight: 5 }),
  line('cat-weather-rain-2', 'cat', ['open', 'interval'], 'any', '主人，外面可能要下雨了。伞在门口吗？', 'breathe', { weather: 'rain', weight: 5 }),
  line('cat-weather-hot-1', 'cat', ['open', 'interval'], 'any', '主人，今天很热，记得多喝水，别晒太久。', 'breathe', { weather: 'hot', weight: 5 }),
  line('cat-weather-cold-1', 'cat', ['open', 'interval'], 'any', '主人，降温啦，出门加件外套。', 'breathe', { weather: 'cold', weight: 5 }),

  line('cat-birthday-1', 'cat', ['open', 'interval'], 'any', '主人，今天是我的生日吗？那我想多要一个摸摸。', 'lick_paw', { birthday: true, weight: 6 }),
  line('cat-birthday-2', 'cat', ['open', 'interval'], 'any', '主人，谢谢你记得我的生日。今天可以多陪我一会儿吗？', 'breathe', { birthday: true, weight: 6 }),
  line('cat-days-1', 'cat', ['open', 'interval'], 'any', '主人，今天是我们认识的第 {days} 天啦。', 'breathe', { weight: 2 }),
  line('cat-days-2', 'cat', ['open', 'interval'], 'any', '主人，第 {days} 天了。我还是很喜欢你。', 'lick_paw', { weight: 2 }),
]

const dog = [
  line('dog-open-morning-1', 'dog', ['open'], 'morning', '主人早安！今天也一起加油汪！'),
  line('dog-open-morning-2', 'dog', ['open'], 'morning', '主人！你终于来啦，我等你很久了！'),
  line('dog-open-noon-1', 'dog', ['open'], 'noon', '主人，吃饭时间到！你吃我就开心！', 'lick_paw'),
  line('dog-open-afternoon-1', 'dog', ['open'], 'afternoon', '主人，下午也要有精神！我陪你！'),
  line('dog-open-evening-1', 'dog', ['open'], 'evening', '主人今天辛苦啦！快坐下，我陪你！'),
  line('dog-open-evening-2', 'dog', ['open'], 'evening', '主人回来啦！尾巴已经摇起来了！', 'lick_paw'),
  line('dog-open-late-1', 'dog', ['open'], 'late', '主人还不睡吗？我先替你守着，汪。'),
  line('dog-open-any-1', 'dog', ['open'], 'any', '主人！见到你真好！今天也一起吧！'),

  line('dog-interval-any-1', 'dog', ['interval'], 'any', '主人！我刚刚在门口转了一圈，你忙完记得看我！'),
  line('dog-interval-any-2', 'dog', ['interval'], 'any', '主人，喝水！喝水！我盯着你呢！'),
  line('dog-interval-any-3', 'dog', ['interval'], 'any', '主人，坐久了起来走两步，我陪你！'),
  line('dog-interval-any-4', 'dog', ['interval'], 'any', '主人，今天有没有人夸你？我先夸：你最棒！'),
  line('dog-interval-any-5', 'dog', ['interval'], 'any', '主人，累了就休息，我在这儿！'),
  line('dog-interval-any-6', 'dog', ['interval'], 'any', '主人，我摇尾巴了，你看到了吗？', 'lick_paw'),
  line('dog-interval-any-7', 'dog', ['interval'], 'any', '主人，今天也要好好吃饭！'),
  line('dog-interval-any-8', 'dog', ['interval'], 'any', '主人，外面风大不大？回来我陪你。'),
  line('dog-interval-any-9', 'dog', ['interval'], 'any', '主人，我一直在！你叫我就到！'),
  line('dog-interval-any-10', 'dog', ['interval'], 'any', '主人，今天开心吗？不开心也没关系，我陪你。'),
  line('dog-interval-any-11', 'dog', ['interval'], 'any', '主人，我想跟你出去玩，不过先忙完也行！'),
  line('dog-interval-any-12', 'dog', ['interval'], 'any', '主人，你刚刚皱眉了，我看到了。'),
  line('dog-interval-any-13', 'dog', ['interval'], 'any', '主人，记得伸个懒腰！'),
  line('dog-interval-any-14', 'dog', ['interval'], 'any', '主人，我给你留了最舒服的位置！'),
  line('dog-interval-any-15', 'dog', ['interval'], 'any', '主人，今天也谢谢你！'),

  line('dog-tap-1', 'dog', ['tap'], 'any', '汪！主人！', 'lick_paw'),
  line('dog-tap-2', 'dog', ['tap'], 'any', '摇尾巴摇尾巴～主人！'),
  line('dog-tap-3', 'dog', ['tap'], 'any', '主人叫我？我一直在！'),
  line('dog-tap-4', 'dog', ['tap'], 'any', '主人，摸摸头！再摸一下！', 'lick_paw'),
  line('dog-tap-5', 'dog', ['tap'], 'any', '汪！今天也最喜欢主人！'),
  line('dog-tap-6', 'dog', ['tap'], 'any', '主人，我在这儿，别怕！'),
  line('dog-tap-7', 'dog', ['tap'], 'any', '主人，你回来啦！', 'lick_paw'),
  line('dog-tap-8', 'dog', ['tap'], 'morning', '早安主人！'),
  line('dog-tap-9', 'dog', ['tap'], 'evening', '主人辛苦啦！'),
  line('dog-tap-10', 'dog', ['tap'], 'late', '主人快睡！我守着你！'),

  line('dog-weather-rain-1', 'dog', ['open', 'interval'], 'any', '主人！要下雨啦，伞！伞！', 'breathe', { weather: 'rain', weight: 5 }),
  line('dog-weather-rain-2', 'dog', ['open', 'interval'], 'any', '主人，外面要下雨了，别淋湿！', 'breathe', { weather: 'rain', weight: 5 }),
  line('dog-weather-hot-1', 'dog', ['open', 'interval'], 'any', '主人，今天好热，多喝水！', 'breathe', { weather: 'hot', weight: 5 }),
  line('dog-weather-cold-1', 'dog', ['open', 'interval'], 'any', '主人，降温了，穿厚一点！', 'breathe', { weather: 'cold', weight: 5 }),

  line('dog-birthday-1', 'dog', ['open', 'interval'], 'any', '主人！今天是我的生日吗？我想要一个大大的摸头！', 'lick_paw', { birthday: true, weight: 6 }),
  line('dog-birthday-2', 'dog', ['open', 'interval'], 'any', '主人，谢谢你记得我的生日！今天多陪我一会儿！', 'breathe', { birthday: true, weight: 6 }),
  line('dog-days-1', 'dog', ['open', 'interval'], 'any', '主人，今天是我们认识的第 {days} 天！我超开心！', 'breathe', { weight: 2 }),
  line('dog-days-2', 'dog', ['open', 'interval'], 'any', '主人，第 {days} 天啦！还要一起很多天！', 'lick_paw', { weight: 2 }),
]

export const companionLines = Object.freeze([...cat, ...dog])

export function timeOfDay(hour) {
  if (hour >= 5 && hour < 10) return 'morning'
  if (hour >= 10 && hour < 14) return 'noon'
  if (hour >= 14 && hour < 17) return 'afternoon'
  if (hour >= 17 && hour < 22) return 'evening'
  return 'late'
}

export function shanghaiHour(date = new Date()) {
  const hour = new Intl.DateTimeFormat('en-GB', {
    timeZone: 'Asia/Shanghai',
    hour: '2-digit',
    hourCycle: 'h23',
  }).format(date)
  return Number(hour)
}

export function shanghaiDate(date = new Date()) {
  const parts = new Intl.DateTimeFormat('en-GB', {
    timeZone: 'Asia/Shanghai',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(date)
  const value = (type) => parts.find(part => part.type === type)?.value || ''
  return `${value('year')}-${value('month')}-${value('day')}`
}

export function bubbleDuration(text) {
  return Math.min(6000, Math.max(3400, 1800 + Array.from(text).length * 120))
}

function matches(line, context) {
  if (line.species !== context.species) return false
  if (!line.scenes.includes(context.scene)) return false
  if (!line.when.includes('any') && !line.when.includes(context.when)) return false
  if (line.weather && line.weather !== context.weather) return false
  if (line.birthday && !context.birthday) return false
  if (line.text.includes('{days}') && context.days === null) return false
  return true
}

function render(line, days) {
  const text = days === null ? line.text : line.text.replace('{days}', String(days))
  return {
    id: line.id,
    text,
    action: line.action,
    durationMs: bubbleDuration(text),
  }
}

export function pickCompanionMessage(context) {
  const species = context.species === 'dog' ? 'dog' : 'cat'
  const when = context.when || timeOfDay(shanghaiHour())
  const recent = new Set(context.recentIds || [])
  const normalized = {
    species,
    scene: context.scene === 'tap' ? 'tap' : context.scene === 'open' ? 'open' : 'interval',
    when,
    weather: context.weather?.condition ?? context.weather ?? null,
    birthday: Boolean(context.birthday),
    days: Number.isFinite(context.days) ? context.days : null,
  }

  const candidates = (scene) => companionLines.filter(line => matches(line, { ...normalized, scene }))
  let pool = candidates(normalized.scene)
  if (!pool.length && normalized.scene === 'open') pool = candidates('interval')
  if (!pool.length) pool = candidates('tap')

  const fresh = pool.filter(line => !recent.has(line.id))
  const chosen = fresh.length ? fresh : pool
  if (!chosen.length) {
    return {
      id: 'companion-fallback',
      text: species === 'dog' ? '主人，我在呢！' : '主人，我在这儿。',
      action: 'breathe',
      durationMs: 3600,
    }
  }

  let total = 0
  for (const line of chosen) total += Math.max(1, line.weight || 1)
  let roll = Math.random() * total
  for (const line of chosen) {
    roll -= Math.max(1, line.weight || 1)
    if (roll <= 0) return render(line, normalized.days)
  }
  return render(chosen[chosen.length - 1], normalized.days)
}
