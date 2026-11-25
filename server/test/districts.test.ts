import assert from 'node:assert/strict'
import test from 'node:test'
import { districtById, districtForPoint } from '../src/districts.js'

test('identifies the current Honggutan and Xinjian districts separately', () => {
  const honggutan = districtForPoint(28.661,115.831)
  assert.equal(honggutan?.id,'cn-360113')
  assert.equal(honggutan.name,'红谷滩区')
  assert.equal(honggutan.serviceCityCode,'360100')

  const xinjian = districtForPoint(28.695736,115.810270)
  assert.equal(xinjian?.id,'1788795')
  assert.equal(xinjian.name,'新建区')
  assert.equal(districtById('1788795')?.name,'新建区')
})
