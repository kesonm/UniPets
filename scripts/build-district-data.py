"""Prepare the district lookup from geoBoundaries CHN ADM3 and GeoNames CN.zip."""

import gzip
import json
import re
import sys
import unicodedata
from pathlib import Path
from zipfile import ZipFile

from shapely.geometry import Point, shape
from shapely.strtree import STRtree


def normalize(name):
    name = unicodedata.normalize('NFKD', name.lower())
    name = re.sub(r'\b(autonomous|county|xian|district|qu|city|shi|banner|qi|forestry)\b', '', name)
    return re.sub(r'[^a-z0-9]', '', name)


def local_name(names, fallback):
    choices = [name for name in names if re.fullmatch(r'[\u3400-\u9fff]+', name)]
    official = [name for name in choices if name.endswith(('区', '市', '县', '旗', '州', '盟', '省'))]
    return max(official or choices, key=len, default=fallback)


def gazetteer(source):
    provinces, cities, districts = {}, {}, []
    with ZipFile(source) as archive, archive.open('CN.txt') as records:
        for record in records:
            row = record.decode('utf8').rstrip('\n').split('\t')
            kind = row[7]
            if kind not in ('ADM1', 'ADM2', 'ADM3'):
                continue
            names = row[3].split(',')
            name = local_name(names, row[1])
            if kind == 'ADM1':
                provinces[row[10]] = name
            elif kind == 'ADM2':
                cities[row[10], row[11]] = name
            else:
                variants = {normalize(item) for item in [row[1], row[2], *names]} - {''}
                districts.append((row[0], name, variants, Point(float(row[5]), float(row[4])), (row[10], row[11])))
    return districts, provinces, cities


def polygons(geometry):
    if geometry.geom_type == 'Polygon':
        return [geometry]
    return [part for part in geometry.geoms if part.geom_type == 'Polygon']


def coordinates(ring):
    return [[round(x, 4), round(y, 4)] for x, y in ring.coords]


def generate(boundaries, names):
    records, provinces, cities = gazetteer(names)
    tree = STRtree([record[3] for record in records])
    used = set()
    output = []
    for feature in json.loads(Path(boundaries).read_bytes())['features']:
        props = feature['properties']
        geom = shape(feature['geometry'])
        label = normalize(props['shapeName'])
        candidates = [records[index] for index in tree.query(geom, predicate='covers') if records[index][0] not in used]
        exact = [entry for entry in candidates if label in entry[2]]
        named = [entry for entry in candidates if re.search(r'[\u3400-\u9fff]', entry[1])]
        match = exact[0] if len(exact) == 1 else named[0] if not exact and len(named) == 1 else None
        district = {'id': 'gb-' + props['shapeID'], 'name': props['shapeName']}
        if match:
            identifier, name, _, _, region = match
            used.add(identifier)
            district = {'id': identifier, 'name': name, 'city': cities.get(region, ''), 'province': provinces.get(region[0], '')}
        simplified = geom.simplify(0.0009, preserve_topology=True)
        parts = [[coordinates(part.exterior), *[coordinates(ring) for ring in part.interiors]] for part in polygons(simplified)]
        if parts:
            output.append({**district, 'bounds': [round(x, 4) for x in simplified.bounds], 'polygons': parts, 'size': round(geom.area, 6)})
    return output


if __name__ == '__main__':
    boundaries, names, destination = sys.argv[1:]
    districts = generate(boundaries, names)
    Path(destination).parent.mkdir(parents=True, exist_ok=True)
    Path(destination).write_bytes(gzip.compress(json.dumps(districts, ensure_ascii=False, separators=(',', ':')).encode(), mtime=0))
    localized = sum(bool(re.search(r'[\u3400-\u9fff]', item['name'])) for item in districts)
    print(f'{len(districts)} districts, {localized} Chinese names')
