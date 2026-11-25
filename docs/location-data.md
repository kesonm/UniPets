# 小程序区县定位的数据来源

小程序用微信的 WGS84 定位，在设备上判断坐标落在哪个区县。请求区划边界时只传所在的整度网格，推荐和服务接口只使用区县编号。小程序保存最近一次成功识别的区县。

用户在小程序地图选点后，服务器将选点转为 WGS84 并识别区县。浏览用的选点保存在本机，动态和公开交友名片只保存选中的区县编号。交友筛选按选点所在城市匹配，距离排序采用所选坐标作为起点。

浏览位置使用微信原生 `chooseLocation` 选点页，地点搜索和地址展示由微信提供。小程序端声明该接口，微信后台的接口设置和隐私指引也需包含选点定位。

`server/data/china-districts.json.gz` 由两份公开数据匹配区县名称、简化边界并量化坐标生成。部分边界和名称可能早于当地最新的行政区划调整。

- 边界源是 geoBoundaries CHN ADM3，版本 `9469f09`，对应的 OpenStreetMap 数据标注为 2017 年。项目中的边界及派生边界数据采用 ODbL 1.0。© OpenStreetMap 贡献者。[数据元信息](https://www.geoboundaries.org/api/current/gbOpen/CHN/ADM3/) · [OpenStreetMap 版权](https://www.openstreetmap.org/copyright) · [ODbL 1.0](https://opendatacommons.org/licenses/odbl/1-0/)
- 区县中文名及标识来自 GeoNames 的 `CN.zip`，采用 CC BY 4.0，名称数据采样于 2026-11-24。[GeoNames 数据](https://www.geonames.org/export/) · [许可说明](https://download.geonames.org/export/dump/readme.txt)

### 更新区划文件

下载两份源数据后，从项目根目录运行下方脚本。脚本使用 Python 3 和 Shapely 2。

```bash
python3 scripts/build-district-data.py adm3.json CN.zip server/data/china-districts.json.gz
```

已有门店沿用关联的区县编号。更新区划文件时应核对编号和旧商圈映射。

### 服务筛选的省份和城市

`shared/h5-service-regions.mjs` 采用 areacodes 的 2025 年区划代码，保留省级、地级和省直辖市的名称与代码。该数据集使用 CC0 1.0，文件 Git blob 为 `a31f53c95324bf8723be9f653bafce17bc253a61`。[数据集及来源](https://github.com/yescallop/areacodes)

门店可以明确选择服务城市。旧门店缺少城市代码时，根据关联区县或商圈归入省市。距离排序使用填有门店坐标的记录，用户选择距离排序时只向 API 发送保留三位小数的坐标。

### 小程序门店选点

门店负责人在小程序「我的门店」核验绑定码后填写资料，并用微信原生地图拖动选点。绑定后可在同一入口修改门店资料和位置。

数据库使用 WGS84，小程序地图使用 GCJ-02。服务端在选点入库和地图显示时转换坐标。
