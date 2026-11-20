"""Local nose bounding-box detection, capture checks and ORB feature extraction."""

import base64
import hashlib
import json
from pathlib import Path
import sys

import cv2
import numpy as np


class Retake(Exception):
    pass


def detect_nose(image, model_path):
    height, width = image.shape[:2]
    size = 640
    scale = size / max(width, height)
    scaled_width, scaled_height = round(width * scale), round(height * scale)
    left, top = (size - scaled_width) // 2, (size - scaled_height) // 2
    padded = np.full((size, size, 3), 114, dtype=np.uint8)
    padded[top:top + scaled_height, left:left + scaled_width] = cv2.resize(
        image, (scaled_width, scaled_height), interpolation=cv2.INTER_AREA,
    )
    network = cv2.dnn.readNetFromONNX(model_path)
    network.setInput(cv2.dnn.blobFromImage(padded, 1 / 255, swapRB=True))
    output = network.forward()
    if output.ndim != 3 or output.shape[:2] != (1, 5) or not np.isfinite(output).all():
        raise ValueError("expected raw single-class YOLO output [1, 5, N]")

    boxes, scores = [], []
    for x, y, w, h, score in output[0].T:
        if score >= 0.65 and w > 0 and h > 0:
            boxes.append([float(x - w / 2), float(y - h / 2), float(w), float(h)])
            scores.append(float(score))
    if not boxes:
        raise Retake("nose")
    kept = np.asarray(cv2.dnn.NMSBoxes(boxes, scores, 0.64, 0.45)).reshape(-1)
    if len(kept) != 1:
        raise Retake("multiple" if len(kept) > 1 else "nose")

    x, y, w, h = boxes[int(kept[0])]
    x1, x2 = round((x - left) / scale), round((x + w - left) / scale)
    y1, y2 = round((y - top) / scale), round((y + h - top) / scale)
    if (x1 < 2 or y1 < 2 or x2 > width - 2 or y2 > height - 2
            or x2 - x1 < max(120, width * 0.22) or y2 - y1 < 80):
        raise Retake("crop")
    return image[y1:y2, x1:x2]


def detect_cat_nose(image, model_path):
    import onnxruntime as ort

    ort.disable_telemetry_events()
    height, width = image.shape[:2]
    cascade_path = Path(model_path).with_name("cat-face-cascade.xml")
    face_detector = cv2.CascadeClassifier(str(cascade_path))
    if face_detector.empty():
        raise ValueError("cat face detector is unavailable")

    gray = cv2.cvtColor(image, cv2.COLOR_BGR2GRAY)
    scale = min(1.0, 800 / max(width, height))
    gray = cv2.resize(gray, None, fx=scale, fy=scale, interpolation=cv2.INTER_AREA)
    faces = face_detector.detectMultiScale(cv2.equalizeHist(gray), scaleFactor=1.1,
                                           minNeighbors=5, minSize=(72, 72))
    if len(faces) == 0:
        raise Retake("cat_face")
    if len(faces) != 1:
        raise Retake("multiple")

    x, y, w, h = (int(round(value / scale)) for value in faces[0])
    margin = round(w * 0.16)
    left, top = max(0, x - margin), max(0, y - margin)
    right, bottom = min(width, x + w + margin), min(height, y + h + margin)
    face = image[top:bottom, left:right]
    options = ort.SessionOptions()
    options.intra_op_num_threads = 1
    network = ort.InferenceSession(model_path, sess_options=options, providers=["CPUExecutionProvider"])
    tensor = cv2.dnn.blobFromImage(face, 1 / 255, (224, 224), swapRB=True)
    output = network.run(None, {network.get_inputs()[0].name: tensor})[0]
    if output.shape != (1, 18) or not np.isfinite(output).all():
        raise ValueError("expected 9 normalized cat facial landmarks")

    landmarks = output.reshape(9, 2) * [right - left, bottom - top] + [left, top]
    first_eye, second_eye = sorted(landmarks[:2], key=lambda point: point[0])
    nose = landmarks[2]
    eye_offset = second_eye - first_eye
    eye_distance = float(np.linalg.norm(eye_offset))
    if eye_distance < max(72, min(width, height) * 0.12):
        raise Retake("crop")

    eye_axis = eye_offset / eye_distance
    down_axis = np.array([-eye_axis[1], eye_axis[0]])
    nose_offset = (nose - (first_eye + second_eye) / 2) / eye_distance
    if (abs(eye_axis[1]) > 0.4 or abs(nose_offset @ eye_axis) > 0.34
            or not (0.18 < nose_offset @ down_axis < 0.95)):
        raise Retake("cat_face")

    half_width = eye_distance * 0.34
    x1, x2 = round(nose[0] - half_width), round(nose[0] + half_width)
    y1, y2 = round(nose[1] - eye_distance * 0.24), round(nose[1] + eye_distance * 0.27)
    if x1 < 2 or y1 < 2 or x2 > width - 2 or y2 > height - 2:
        raise Retake("crop")
    return image[y1:y2, x1:x2]


def extract_print(nose):
    gray = cv2.cvtColor(nose, cv2.COLOR_BGR2GRAY)
    low, high = np.percentile(gray, (5, 95))
    if high < 48 or high - low < 22 or np.mean(gray >= 248) > 0.12:
        raise Retake("exposure")
    sample = cv2.resize(gray, (256, 256), interpolation=cv2.INTER_AREA)
    if cv2.Laplacian(sample, cv2.CV_64F).var() < 32:
        raise Retake("focus")
    contrast = cv2.createCLAHE(clipLimit=2.0, tileGridSize=(8, 8)).apply(sample)
    orb = cv2.ORB_create(nfeatures=384, edgeThreshold=16, fastThreshold=10)
    _, descriptors = orb.detectAndCompute(contrast, None)
    if descriptors is None or len(descriptors) < 40:
        raise Retake("focus")
    return {
        "status": "ok",
        "digest": hashlib.sha256(sample.tobytes()).hexdigest(),
        "template": base64.b64encode(descriptors.tobytes()).decode("ascii"),
    }


def main():
    cv2.setNumThreads(1)
    photo = cv2.imdecode(np.frombuffer(sys.stdin.buffer.read(), np.uint8), cv2.IMREAD_COLOR)
    if photo is None:
        raise Retake("focus")
    detector = detect_cat_nose if len(sys.argv) > 2 and sys.argv[2] == "cat-landmarks" else detect_nose
    return extract_print(detector(photo, sys.argv[1]))


if __name__ == "__main__":
    try:
        print(json.dumps(main()))
    except Retake as error:
        print(json.dumps({"status": "retake", "reason": str(error)}))
