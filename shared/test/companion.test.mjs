import assert from 'node:assert/strict'
import test from 'node:test'
import {
  bubbleDuration,
  companionLines,
  pickCompanionMessage,
  shanghaiDate,
  shanghaiHour,
  timeOfDay,
} from '../companion.mjs'

const catIntervalLines = companionLines.filter(line =>
  line.species === 'cat' && line.scenes.includes('interval') && !line.weather && !line.birthday && !line.text.includes('{days}'))

test('every companion line addresses the owner as 主人', () => {
  assert.ok(companionLines.length > 60)
  for (const line of companionLines) assert.match(line.text, /主人/)
})

test('cat and dog personalities never mix', () => {
  for (let i = 0; i < 80; i++) {
    assert.match(pickCompanionMessage({ species: 'cat', scene: 'interval', when: 'any', recentIds: [] }).id, /^cat-/)
    assert.match(pickCompanionMessage({ species: 'dog', scene: 'interval', when: 'any', recentIds: [] }).id, /^dog-/)
  }
})

test('time buckets and Shanghai clock are stable', () => {
  assert.equal(timeOfDay(6), 'morning')
  assert.equal(timeOfDay(12), 'noon')
  assert.equal(timeOfDay(15), 'afternoon')
  assert.equal(timeOfDay(19), 'evening')
  assert.equal(timeOfDay(2), 'late')
  assert.equal(shanghaiHour(new Date('2026-11-26T03:00:00Z')), 11)
  assert.equal(shanghaiDate(new Date('2026-11-26T03:00:00Z')), '2026-11-26')
})

test('selection avoids recent ids when a fresh candidate exists', () => {
  const target = catIntervalLines[0]
  const recent = catIntervalLines.filter(line => line.id !== target.id).map(line => line.id)
  const picked = pickCompanionMessage({ species: 'cat', scene: 'interval', when: 'any', recentIds: recent })
  assert.equal(picked.id, target.id)
})

test('weather lines are dormant without weather and appear with rain', () => {
  const recentIds = catIntervalLines.map(line => line.id)
  for (let i = 0; i < 60; i++) {
    assert.doesNotMatch(pickCompanionMessage({ species: 'cat', scene: 'interval', when: 'any', weather: null, recentIds }).id, /weather/)
  }
  let sawRain = false
  for (let i = 0; i < 80; i++) {
    if (pickCompanionMessage({ species: 'cat', scene: 'interval', when: 'any', weather: { condition: 'rain' }, recentIds }).id.includes('weather-rain')) {
      sawRain = true
      break
    }
  }
  assert.equal(sawRain, true)
})

test('birthday lines only appear on the birthday and days placeholders render', () => {
  const recentIds = catIntervalLines.map(line => line.id)
  let sawBirthday = false
  for (let i = 0; i < 80; i++) {
    if (pickCompanionMessage({ species: 'cat', scene: 'interval', when: 'any', birthday: true, recentIds }).id.includes('birthday')) {
      sawBirthday = true
      break
    }
  }
  assert.equal(sawBirthday, true)
  const daysLine = companionLines.find(line => line.id === 'cat-days-1')
  const picked = pickCompanionMessage({
    species: 'cat', scene: 'interval', when: 'any', days: 42,
    recentIds: companionLines.filter(line => line.species === 'cat' && line.scenes.includes('interval') && line.id !== daysLine.id).map(line => line.id),
  })
  assert.equal(picked.text, '主人，今天是我们认识的第 42 天啦。')
})

test('bubble duration stays readable and bounded', () => {
  assert.ok(bubbleDuration('主人') >= 3400)
  assert.ok(bubbleDuration('主人，'.repeat(80)) <= 6000)
})
