#!/usr/bin/env python3
"""
Slice two 3x2 AI-generated pet sprite sheets (breathe + lick_paw), remove studio white
background cleanly with OpenCV Lab+GrabCut matting, align scale & ground baseline across
all 12 frames, and export transparent sheets + checkerboard QA preview.
"""
import argparse
import os
import cv2
import numpy as np


def matte_studio_frame(bgr: np.ndarray) -> np.ndarray:
    h, w = bgr.shape[:2]
    lab = cv2.cvtColor(bgr, cv2.COLOR_BGR2LAB).astype(np.float32)
    border_pixels = np.concatenate(
        [
            lab[:8, :, :].reshape(-1, 3),
            lab[-8:, :, :].reshape(-1, 3),
            lab[:, :8, :].reshape(-1, 3),
            lab[:, -8:, :].reshape(-1, 3),
        ],
        axis=0,
    )
    bg_lab = np.median(border_pixels, axis=0)

    dL = np.abs(lab[:, :, 0] - bg_lab[0])
    da = lab[:, :, 1] - bg_lab[1]
    db = lab[:, :, 2] - bg_lab[2]
    chroma_dist = np.sqrt(da * da + db * db)
    color_dist = np.sqrt(dL * dL * 0.9 + da * da * 2.0 + db * db * 2.0)

    gray = cv2.cvtColor(bgr, cv2.COLOR_BGR2GRAY).astype(np.float32)
    gx = cv2.Sobel(gray, cv2.CV_32F, 1, 0, ksize=3)
    gy = cv2.Sobel(gray, cv2.CV_32F, 0, 1, ksize=3)
    grad = np.sqrt(gx * gx + gy * gy)

    bg_candidate = ((color_dist < 8.0) & (chroma_dist < 5.0) & (grad < 18.0)).astype(np.uint8)
    flood = bg_candidate.copy()
    ff_mask = np.zeros((h + 2, w + 2), np.uint8)
    for x in range(w):
        if flood[0, x] == 1:
            cv2.floodFill(flood, ff_mask, (x, 0), 2)
        if flood[h - 1, x] == 1:
            cv2.floodFill(flood, ff_mask, (x, h - 1), 2)
    for y in range(h):
        if flood[y, 0] == 1:
            cv2.floodFill(flood, ff_mask, (0, y), 2)
        if flood[y, w - 1] == 1:
            cv2.floodFill(flood, ff_mask, (w - 1, y), 2)

    ext_bg = (flood == 2).astype(np.uint8)
    gc_mask = np.full((h, w), cv2.GC_PR_FGD, np.uint8)
    sure_bg = cv2.erode(ext_bg, cv2.getStructuringElement(cv2.MORPH_ELLIPSE, (9, 9)))
    gc_mask[sure_bg == 1] = cv2.GC_BGD
    gc_mask[(ext_bg == 1) & (sure_bg == 0)] = cv2.GC_PR_BGD

    fg_init = (1 - ext_bg).astype(np.uint8)
    num_l, labels, stats, _ = cv2.connectedComponentsWithStats(fg_init, connectivity=8)
    if num_l > 1:
        largest = 1 + int(np.argmax(stats[1:, cv2.CC_STAT_AREA]))
        fg_init = (labels == largest).astype(np.uint8)

    sure_fg = cv2.erode(fg_init, cv2.getStructuringElement(cv2.MORPH_ELLIPSE, (11, 11)))
    sure_fg = np.where((fg_init == 1) & (color_dist > 22.0), 1, sure_fg).astype(np.uint8)
    gc_mask[sure_fg == 1] = cv2.GC_FGD

    bgd_model = np.zeros((1, 65), np.float64)
    fgd_model = np.zeros((1, 65), np.float64)
    if np.any(gc_mask == cv2.GC_BGD) and np.any(gc_mask == cv2.GC_FGD):
        cv2.grabCut(bgr, gc_mask, None, bgd_model, fgd_model, 5, cv2.GC_INIT_WITH_MASK)

    mask = np.where((gc_mask == cv2.GC_FGD) | (gc_mask == cv2.GC_PR_FGD), 1, 0).astype(np.uint8)
    light_shadow = (chroma_dist < 4.0) & (lab[:, :, 0] > 222.0) & (sure_fg == 0)
    non_shadow = (mask & (~light_shadow).astype(np.uint8)).astype(np.uint8)
    num_l, labels, stats, _ = cv2.connectedComponentsWithStats(non_shadow, connectivity=8)
    if num_l > 1:
        largest = 1 + int(np.argmax(stats[1:, cv2.CC_STAT_AREA]))
        mask = (labels == largest).astype(np.uint8)

    inv = (1 - mask).astype(np.uint8)
    ff_m = np.zeros((h + 2, w + 2), np.uint8)
    cv2.floodFill(inv, ff_m, (0, 0), 2)
    mask = np.where(inv == 2, 0, 1).astype(np.uint8)

    mask = cv2.morphologyEx(mask, cv2.MORPH_CLOSE, cv2.getStructuringElement(cv2.MORPH_ELLIPSE, (3, 3)))

    alpha = mask.astype(np.float32) * 255.0
    alpha = cv2.GaussianBlur(alpha, (3, 3), 0.75)
    inner = cv2.erode(mask, cv2.getStructuringElement(cv2.MORPH_ELLIPSE, (3, 3)))
    alpha[inner == 1] = 255.0
    alpha[alpha < 18] = 0.0
    alpha = np.clip(alpha, 0, 255).astype(np.uint8)

    rgb = bgr.astype(np.float32)
    edge = (alpha > 0) & (alpha < 245)
    if np.any(edge):
        a = np.maximum(alpha[edge].astype(np.float32) / 255.0, 0.25)[:, None]
        bg_bgr = np.array([250.0, 250.0, 250.0], dtype=np.float32)
        rgb[edge] = np.clip((rgb[edge] - (1.0 - a) * bg_bgr) / a, 0, 255)

    return np.dstack([rgb.astype(np.uint8), alpha])


def slice_3x2(path: str):
    img = cv2.imread(path)
    if img is None:
        raise RuntimeError(f"Failed to read image: {path}")
    h, w = img.shape[:2]
    cw, ch = w // 3, h // 2
    cells = []
    for r in range(2):
        for c in range(3):
            y0, y1 = r * ch, (r + 1) * ch if r == 0 else h
            x0, x1 = c * cw, (c + 1) * cw if c < 2 else w
            cells.append(img[y0:y1, x0:x1])
    return cells


def place_frame(bgra: np.ndarray, metric, scale: float, cell: int, bottom_y: int) -> np.ndarray:
    x0, y0, x1, y1, _bh, anchor_x = metric
    h, w = bgra.shape[:2]
    cx0, cy0 = max(0, x0 - 2), max(0, y0 - 2)
    cx1, cy1 = min(w, x1 + 3), min(h, y1 + 3)
    crop = bgra[cy0:cy1, cx0:cx1]
    nw = max(1, int(round(crop.shape[1] * scale)))
    nh = max(1, int(round(crop.shape[0] * scale)))
    resized = cv2.resize(crop, (nw, nh), interpolation=cv2.INTER_AREA)

    local_anchor_x = (anchor_x - cx0) * scale
    local_bottom_y = (y1 - cy0) * scale
    canvas = np.zeros((cell, cell, 4), dtype=np.uint8)
    dx = int(round(cell * 0.48 - local_anchor_x))
    dy = int(round(bottom_y - local_bottom_y))

    sx0, sy0 = max(0, -dx), max(0, -dy)
    tx0, ty0 = max(0, dx), max(0, dy)
    cw = min(nw - sx0, cell - tx0)
    ch = min(nh - sy0, cell - ty0)
    if cw > 0 and ch > 0:
        canvas[ty0 : ty0 + ch, tx0 : tx0 + cw] = resized[sy0 : sy0 + ch, sx0 : sx0 + cw]
    return canvas


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--breathe", required=True)
    parser.add_argument("--lick", required=True)
    parser.add_argument("--out", required=True)
    parser.add_argument("--cell", type=int, default=224)
    args = parser.parse_args()

    os.makedirs(args.out, exist_ok=True)
    inputs = {"breathe": args.breathe, "lick": args.lick}
    frames = {}
    metrics = {}

    for name, path in inputs.items():
        frames[name] = []
        metrics[name] = []
        for idx, cell_bgr in enumerate(slice_3x2(path)):
            bgra = matte_studio_frame(cell_bgr)
            frames[name].append(bgra)
            ys, xs = np.where(bgra[:, :, 3] > 128)
            if len(xs) == 0:
                raise RuntimeError(f"Empty foreground detected in {name} frame {idx}")
            x0, x1 = int(xs.min()), int(xs.max())
            y0, y1 = int(ys.min()), int(ys.max())
            bh = y1 - y0 + 1
            lower_mask = ys >= (y1 - int(bh * 0.35))
            anchor_x = float(np.median(xs[lower_mask]))
            metrics[name].append((x0, y0, x1, y1, bh, anchor_x))
            print(f"{name}[{idx}]: bbox=({x0},{y0})-({x1},{y1}) size={x1-x0+1}x{bh} anchor_x={anchor_x:.1f}")

    cell = args.cell
    target_h = int(cell * 0.87)
    bottom_y = cell - 10
    ref_heights = {
        "breathe": float(np.median([m[4] for m in metrics["breathe"]])),
        "lick": float(np.mean([metrics["lick"][0][4], metrics["lick"][5][4]])),
    }

    composed = {}
    for name in ["breathe", "lick"]:
        scale = target_h / ref_heights[name]
        sheet = np.zeros((cell * 2, cell * 3, 4), dtype=np.uint8)
        for i in range(6):
            placed = place_frame(frames[name][i], metrics[name][i], scale, cell, bottom_y)
            r, c = i // 3, i % 3
            sheet[r * cell : (r + 1) * cell, c * cell : (c + 1) * cell] = placed
        composed[name] = sheet

    cv2.imwrite(os.path.join(args.out, "composed-breathe.png"), composed["breathe"])
    cv2.imwrite(os.path.join(args.out, "composed-lick-paw.png"), composed["lick"])
    cv2.imwrite(os.path.join(args.out, "composed-avatar.png"), composed["breathe"][0:cell, 0:cell])

    # Checkerboard QA image stacking breathe (top 2 rows) and lick (bottom 2 rows)
    combined = np.vstack([composed["breathe"], composed["lick"]])
    ch, cw = combined.shape[:2]
    tile = 16
    yy, xx = np.indices((ch, cw))
    checker = ((yy // tile) + (xx // tile)) % 2 == 0
    bg_check = np.zeros((ch, cw, 3), dtype=np.uint8)
    bg_check[checker] = (232, 238, 244)
    bg_check[~checker] = (186, 198, 210)
    a = combined[:, :, 3:4].astype(np.float32) / 255.0
    vis = (combined[:, :, :3].astype(np.float32) * a + bg_check.astype(np.float32) * (1.0 - a)).astype(np.uint8)
    for gx in [cell, cell * 2]:
        cv2.line(vis, (gx, 0), (gx, ch), (255, 110, 110), 1)
    for gy in [cell, cell * 2, cell * 3]:
        cv2.line(vis, (0, gy), (cw, gy), (255, 110, 110), 1)
    cv2.imwrite(os.path.join(args.out, "verify-checkerboard.png"), vis)
    print("COMPOSE_DONE")


if __name__ == "__main__":
    main()
