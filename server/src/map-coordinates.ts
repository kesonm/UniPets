/* GCJ-02 offset equations adapted from https://github.com/wandergis/coordtransform.
The MIT License (MIT)

Copyright (c) 2015 记忆的残骸

Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all
copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
SOFTWARE.
*/
import type { ServiceCoordinates } from '../../shared/h5-discovery.mjs'

const radians = Math.PI / 180
const semiMajorAxis = 6378245
const eccentricitySquared = 0.006693421622965943

function offset(latitude: number, longitude: number): ServiceCoordinates {
  const x = longitude - 105
  const y = latitude - 35
  const horizontal = 20 * Math.sin(6 * x * Math.PI) + 20 * Math.sin(2 * x * Math.PI)
  const latDegrees = -100 + 2*x + 3*y + 0.2*y*y + 0.1*x*y + 0.2*Math.sqrt(Math.abs(x)) +
    (horizontal + 20*Math.sin(y*Math.PI) + 40*Math.sin(y*Math.PI/3) +
    160*Math.sin(y*Math.PI/12) + 320*Math.sin(y*Math.PI/30)) * 2/3
  const lngDegrees = 300 + x + 2*y + 0.1*x*x + 0.1*x*y + 0.1*Math.sqrt(Math.abs(x)) +
    (horizontal + 20*Math.sin(x*Math.PI) + 40*Math.sin(x*Math.PI/3) +
    150*Math.sin(x*Math.PI/12) + 300*Math.sin(x*Math.PI/30)) * 2/3
  const latRadians = latitude * radians
  const ellipsoid = 1 - eccentricitySquared * Math.sin(latRadians)**2
  const root = Math.sqrt(ellipsoid)

  return {
    latitude: latDegrees * ellipsoid * root / (semiMajorAxis * (1-eccentricitySquared) * radians),
    longitude: lngDegrees * root / (semiMajorAxis * Math.cos(latRadians) * radians),
  }
}

function usesGcjOffset({latitude,longitude}: ServiceCoordinates) {
  return longitude >= 72.004 && longitude <= 137.8347 && latitude >= 0.8293 && latitude <= 55.8271
}

// Tencent Maps uses GCJ-02. The store catalogue and district boundaries use WGS84.
export function mapPointToWgs84(point: ServiceCoordinates): ServiceCoordinates {
  if (!usesGcjOffset(point)) return point
  const {latitude, longitude} = point
  let estimate = point
  for (let pass = 0; pass < 3; pass++) {
    const correction = offset(estimate.latitude,estimate.longitude)
    estimate = {latitude:latitude-correction.latitude,longitude:longitude-correction.longitude}
  }
  return estimate
}

export function wgs84ToMapPoint(point: ServiceCoordinates): ServiceCoordinates {
  if (!usesGcjOffset(point)) return point
  const correction = offset(point.latitude,point.longitude)
  return {latitude:point.latitude+correction.latitude,longitude:point.longitude+correction.longitude}
}
