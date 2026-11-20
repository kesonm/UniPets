# H5 宠物鼻纹登记

登录后，从「宠物身份证 → 新建档案」填写名字和类型，点击「保存宠物档案」。为猫狗同时办理身份证时，勾选「同时登记鼻纹并签发身份证」，上传一张清晰的正面近照，再点击「识别并签发身份证」。猫的照片需要拍到双眼和鼻子，狗的照片需要完整拍到鼻尖和两侧鼻孔。已有宠物可在卡片上使用「登记鼻纹」。照片模糊、反光、鼻部过小时页面会提示重拍。

服务器在本地定位鼻部，评估曝光、清晰度和纹理，再用 OpenCV 提取 ORB 描述子。猫的鼻纹特征写入 `pet_cat_noseprints`，狗的写入 `pet_dog_noseprints`。猫狗共用一个号码池，签发的编号保存在 `pet_identities`。原图在本次识别完成后释放。当前用检测区域摘要拦截同物种的重复照片。跨照片确认同一只宠物需要单独验证比对模型和阈值。

每个账号最多同时保留 3 只宠物，昵称可重复。数据库从 `000000` 到 `999999` 随机分配号码，发完后启用 `1000000` 到 `9999999`。编号按字符串保存，删除档案后仍保留已消耗的号段位置。宠物资料、鼻纹特征和编号在同一个数据库事务中保存。

## 启用本地识别

1. 在 Python 虚拟环境里安装 `server/noseprint/requirements.txt`。
2. 将犬鼻检测权重保存为 `dog-nose.onnx`。猫可使用直出鼻部框的 `cat-nose.onnx`，也可同时配置 `cat-face-landmarks.onnx` 和 `cat-face-cascade.xml`，由猫脸和双眼定位鼻部。权重目录可以放到 `.local/noseprint/models`。
3. 在 `.env.local` 或服务运行环境里设置 `PET_NOSEPRINT_MODEL_DIR`。使用虚拟环境时，另设 `PET_NOSEPRINT_PYTHON` 为该环境 Python 的绝对路径。
4. 运行 `pnpm db:migrate`，重启 API。从 H5 的身份证入口验证有效近照和驳回样本。

推理入口为 `server/noseprint/scan.py`。部署在容器里时，API 进程需要可访问此脚本、Python/OpenCV 和只读权重目录。每个 API 进程一次处理一张照片，单次推理上限为 20 秒。

鼻部检测模型输入为 `float32[1,3,640,640]` RGB 图像，等比缩放并以 114 居中补边，像素除以 255。输出为 `float32[1,5,N]`，依次为模型输入像素坐标下的中心点、宽高和鼻部置信度。YOLOv5 的置信度取目标置信度与鼻部分类概率的乘积。猫脸关键点模型输入为经过同样归一化的 `float32[1,3,224,224]` RGB 猫脸裁剪图，输出是 `float32[1,18]` 的 9 个归一化坐标点，前 3 点是双眼和鼻部。

### 本地权重来源

犬鼻权重由公开的 YOLOv5n 检测模型导出，原仓库未声明商用授权。 [犬鼻模型](https://github.com/DI-LEE/dognose_recognition_management_service/blob/main/crop_dognose_yoloV5/runs/train/dog_nose_yolov5n_14/weights/best.pt)

猫脸关键点使用模型卡标注为 MIT 的权重，猫脸检测使用 OpenCV 的 frontalcatface_extended。 [猫脸关键点](https://huggingface.co/Isa0/cat-detection) · [OpenCV 猫脸检测](https://github.com/opencv/opencv/blob/4.12.0/data/haarcascades/haarcascade_frontalcatface_extended.xml)
