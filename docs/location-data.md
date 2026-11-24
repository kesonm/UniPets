# 小程序区县定位的数据来源

小程序用微信的 WGS84 定位，在设备上判断坐标落在哪个区县。请求区划边界时只传所在的整度网格，推荐和服务接口只使用区县编号。小程序保存最近一次成功识别的区县。

`server/data/china-districts.json.gz` 由两份公开数据匹配区县名称、简化边界并量化坐标生成。部分边界和名称可能早于当地最新的行政区划调整。

- 边界源是 geoBoundaries CHN ADM3，版本 `9469f09`，对应的 OpenStreetMap 数据标注为 2017 年。项目中的边界及派生边界数据采用 ODbL 1.0。© OpenStreetMap 贡献者。[数据元信息](https://www.geoboundaries.org/api/current/gbOpen/CHN/ADM3/) · [OpenStreetMap 版权](https://www.openstreetmap.org/copyright) · [ODbL 1.0](https://opendatacommons.org/licenses/odbl/1-0/)
- 区县中文名及标识来自 GeoNames 的 `CN.zip`，采用 CC BY 4.0，名称数据采样于 2026-11-24。[GeoNames 数据](https://www.geonames.org/export/) · [许可说明](https://download.geonames.org/export/dump/readme.txt)

### 更新区划文件

下载两份源数据后，从项目根目录运行下方脚本。脚本使用 Python 3 和 Shapely 2。

```bash
python3 scripts/build-district-data.py adm3.json CN.zip server/data/china-districts.json.gz
```

已有门店沿用关联的区县编号。更新区划文件时应核对编号和旧商圈映射。
