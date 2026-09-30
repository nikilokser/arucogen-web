"""Independent export checks; requires opencv-python and numpy.

node tests/create-opencv-fixtures.mjs
python tests/verify_opencv.py
"""
import json
import re
from pathlib import Path
import xml.etree.ElementTree as ET
import cv2
import numpy as np

root = Path(__file__).resolve().parents[1]
matrices = json.loads((root / 'test-results/dictionaries.json').read_text())
total = 0
for name, markers in matrices.items():
    dictionary = cv2.aruco.getPredefinedDictionary(getattr(cv2.aruco, name))
    assert len(markers) == len(dictionary.bytesList), name
    for marker_id, matrix in enumerate(markers):
        expected = cv2.aruco.generateImageMarker(dictionary, marker_id, dictionary.markerSize + 2)
        actual = np.array(matrix, dtype=np.uint8) * 255
        np.testing.assert_array_equal(actual, expected, err_msg=f'{name}, marker {marker_id} differs from OpenCV')
    total += len(markers)

ns = {'svg': 'http://www.w3.org/2000/svg'}

def verify_svg(filename, name, expected_ids):
    dictionary = cv2.aruco.getPredefinedDictionary(getattr(cv2.aruco, name))
    tree = ET.parse(root / 'test-results' / filename).getroot()
    _, _, width, height = map(float, tree.attrib['viewBox'].split())
    image = np.full((round(height), round(width)), 255, dtype=np.uint8)
    groups = tree.findall('svg:g', ns)
    assert len(groups) == len(expected_ids)
    for group in groups:
        marker_id = int(group.attrib['data-marker-id'])
        x, y, scale = map(float, re.fullmatch(r'translate\(([^ ]+) ([^)]+)\) scale\(([^)]+)\)', group.attrib['transform']).groups())
        cells = dictionary.markerSize + 2
        # Rasterize actual export rectangles independently of core.markerRects.
        for rect in group.findall('svg:g/svg:rect', ns):
            rx = x + float(rect.attrib['x']) * scale
            ry = y + float(rect.attrib['y']) * scale
            right = rx + float(rect.attrib['width']) * scale
            bottom = ry + float(rect.attrib['height']) * scale
            image[round(ry):round(bottom), round(rx):round(right)] = 0
        crop = image[round(y):round(y + scale * cells), round(x):round(x + scale * cells)]
        np.testing.assert_array_equal(crop, cv2.aruco.generateImageMarker(dictionary, marker_id, round(cells * scale)), err_msg=f'{name}, exported marker {marker_id} differs')
    _, ids, _ = cv2.aruco.ArucoDetector(dictionary).detectMarkers(image)
    assert ids is not None and sorted(ids.flatten().tolist()) == sorted(expected_ids), f'Failed detection: {name}'
    return image

image = verify_svg('all-markers.svg', 'DICT_4X4_50', list(range(50)))
cv2.imwrite(str(root / 'test-results/all-markers.png'), image)
for name, markers in matrices.items():
    verify_svg(f'{name}.svg', name, [0, len(markers) // 2, len(markers) - 1])

browser_png = root / 'test-results/map.png'
if browser_png.exists():
    dictionary = cv2.aruco.getPredefinedDictionary(cv2.aruco.DICT_4X4_50)
    _, detected, _ = cv2.aruco.ArucoDetector(dictionary).detectMarkers(cv2.imread(str(browser_png)))
    assert detected is not None and set(range(1, 7)) <= set(detected.flatten().tolist())
    print('Actual browser PNG: large original markers recognized')
grid_png = root / 'test-results/grid.png'
if grid_png.exists():
    dictionary = cv2.aruco.getPredefinedDictionary(cv2.aruco.DICT_5X5_100)
    _, detected, _ = cv2.aruco.ArucoDetector(dictionary).detectMarkers(cv2.imread(str(grid_png)))
    assert detected is not None and sorted(detected.flatten().tolist()) == list(range(90, 96))
    print('Actual browser PNG: grid IDs 90-95 recognized')
print(f'OpenCV {cv2.__version__}: {len(matrices)} dictionaries, {total} matrices match; SVG samples from every dictionary detected')
