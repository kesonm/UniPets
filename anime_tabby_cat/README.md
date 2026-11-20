# 麦穗 · 动漫狸花猫

角色按同一张参考板上的站姿和坐姿三视图制作。默认四足站立，额头有深色 M 纹，虹膜黄绿，前胸与趾端为浅米色。Blender 场景使用米，Z 向上、面朝 −Y。参考图没有标尺，站姿耳尖高度设为约 37 厘米。

## 打开与播放

在 Blender 4.5 LTS 打开 [cat_animated.blend](blender/cat_animated.blend)。时间线从站立开始，按空格可依次观看观察、步行、坐下、卧下、入睡和起身。预览由 NLA 轨道组成，时间线标记标出了每段的起点。可以直接看[原生转台与动作影片](renders/motion_preview.mp4)、[六个角度](renders/turntable.jpg)和[与原图的对照](renders/reference_check.jpg)。

| 文件 | 用途 |
| --- | --- |
| [cat_master.blend](blender/cat_master.blend) | 编辑网格、UV、材质、曲线毛与毛片 |
| [cat_rigged.blend](blender/cat_rigged.blend) | 四足 IK、身体与尾巴 FK、表情滑块，适合开始制作新动作 |
| [cat_animated.blend](blender/cat_animated.blend) | 同一角色的 23 个独立 Action，含 NLA 示范时间线 |
| [cat_realtime.glb](exports/cat_realtime.glb) | 自包含 glTF 2.0 二进制包，嵌入蒙皮、贴图、表情、体积补偿和动作 |
| [分动作导出目录](exports/animations/) | 每个 glTF 含单个动作，与同目录的 cat_skin.bin 配合使用 |
| [动作清单](reports/animation_manifest.json) | 每个动作的帧数、秒数、起止姿态、步幅与循环标记 |
| [质量报告](reports/quality_report.md) | 接地、毛根、循环、浏览器实测与版本差异 |

## 角色与绑定

- `Cat | Anatomy` 包含连续肩胯与腿部网格、带眼眶及开口唇线的头部、耳廓、球形眼、口腔、舌、牙、趾和肉垫。体表有命名 UV 和独立的颜色、微法线贴图。随工程打包的参考板列在 `Reference plates`。
- `Cat | Groom` 按躯干、头、耳和尾巴分底绒及护毛。胡须另列。曲线存有根部三角面的顶点和重心坐标。Geometry Nodes 用变形后的皮肤恢复毛束位置与方向。
- `Cat | Realtime coat` 包含带 Alpha 遮罩的蒙皮毛片及细须几何，默认在原生渲染中隐藏。毛片可在原生工程中逐束跟随变形皮肤三角面。GLB 采用有权重的几何，毛片和躯干都带有深折腿与舔毛的姿态补偿。
- 选择 `Mugi | feline rig`，打开覆层并进入姿态模式。`FootIK.Fore.L/R` 与 `FootIK.Hind.L/R` 控制爪掌落点和朝向。肩胛、骨盆、脊柱、胸廓、头颈与八段 `Tail.*` 均可单独编辑。骨架数据中的辅助骨集合提供膝肘极向和后踝目标。`Root` 控制整体位移。
- 对象自定义属性中的 `blink_L/R`、`brow_L/R`、`smile` 均可打关键帧。`Eye.L/R` 控制眼球，`Ear.L/R` 控制转耳，`Jaw` 与 `Tongue` 可编辑张嘴和舔舐。卧姿待机保持醒着，`sleep` 持续闭眼并只循环呼吸。
- 单独编辑动作时，在非线性动画编辑器静音 `Performance | A`、`Performance | B` 和 `Preview | floor travel`，然后在动作编辑器选择英文动作名。示范时间线上另有一条整体位移曲线，为步行提供向前行程。

## 实时预览与状态切换

`exports` 目录包含本地 Three.js r180、加载器、轨道相机和许可证。将此目录通过本地 HTTP 服务打开即可交互预览。在项目根目录运行下列命令，再打开下方地址。选择动作即可触发对应的姿态过渡。

```sh
python3 -m http.server 8000 --bind 127.0.0.1 --directory exports
```

[本机预览页面](http://127.0.0.1:8000/preview.html)

集成时，把 Three.js 命名空间、GLTFLoader 返回的场景、动作及动作定义传给 [CatPerformance](exports/animations/state_machine.mjs)。动作定义可取 `gltf.parser.json.animations.map(a => ({name: a.name, ...a.extras}))`。`request("sleep")` 从当前姿态经趴下和合眼进入睡眠，`request("idle_sit")` 会选择能到达坐姿的过渡。每帧调用 `update(deltaSeconds)`。默认交叉淡化为 0.16 秒。GLB 面向 +Z，步行每周期前进 0.104 米，小跑 0.1352 米。接入游戏已有移动系统时，用 `{applyRootMotion: false}` 建立控制器，再由游戏按清单步幅驱动位移。

## 重建

在项目根目录使用本机 Blender 执行。脚本使用自带的 Python 和 NumPy，制图和影片分别使用 Pillow、FFmpeg。原生阶段按顺序读取上一步工程，默认复用已生成的文件。要替换特定阶段，在相应命令末尾加 `-- --rebuild`，然后依次重建后续阶段。工程通过临时文件完成保存。

```sh
BLENDER=/Applications/Blender.app/Contents/MacOS/Blender
"$BLENDER" -b --factory-startup --python-exit-code 12 -P scripts/create_model.py
"$BLENDER" -b --factory-startup --python-exit-code 12 -P scripts/create_fur.py
"$BLENDER" -b --factory-startup --python-exit-code 12 -P scripts/create_rig.py
"$BLENDER" -b --factory-startup --python-exit-code 12 -P scripts/create_animations.py
"$BLENDER" -b --factory-startup --python-exit-code 12 -P scripts/export_assets.py
"$BLENDER" -b --factory-startup --python-exit-code 12 -P scripts/validate_assets.py
"$BLENDER" -b --factory-startup --python-exit-code 12 -P scripts/render_review.py
"$BLENDER" -b --factory-startup --python-exit-code 12 -P scripts/render_motion.py
python3 scripts/make_sheets.py
```

绑定阶段会调用 `create_expressions.py` 安装面部驱动，该脚本也可以独立运行。网页回归脚本 `scripts/validate_web.mjs` 的 `checkRuntime` 接受预览页的 `window.mugi` 和原生检查 JSON，返回骨骼、皮肤和过渡的实测值。

格式及混合 API 可查阅 [Khronos glTF 2.0 规范](https://registry.khronos.org/glTF/specs/2.0/glTF-2.0.html) 与 [Three.js AnimationAction](https://threejs.org/docs/#api/en/animation/AnimationAction)。
