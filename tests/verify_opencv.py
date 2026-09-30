"""Independent export checks. Requires opencv-python and numpy.

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
data = (root / 'src/dictionary.js').read_text()
markers = json.loads(data.split('export const MARKERS = ', 1)[1].rstrip(';\n'))
dictionary = cv2.aruco.getPredefinedDictionary(cv2.aruco.DICT_4X4_50)
for marker_id, matrix in enumerate(markers):
    expected = cv2.aruco.generateImageMarker(dictionary, marker_id, 6)
    actual = np.array(matrix, dtype=np.uint8) * 255
    np.testing.assert_array_equal(actual, expected, err_msg=f'Marker {marker_id} differs from OpenCV')

ns = {'svg': 'http://www.w3.org/2000/svg'}
tree = ET.parse(root / 'test-results/all-markers.svg').getroot()
image = np.full((int(tree.attrib['height']), int(tree.attrib['width'])), 255, dtype=np.uint8)
groups = tree.findall('svg:g', ns)
assert len(groups) == 50
for group in groups:
    marker_id = int(group.attrib['data-marker-id'])
    x, y, scale = map(float, re.fullmatch(r'translate\(([^ ]+) ([^)]+)\) scale\(([^)]+)\)', group.attrib['transform']).groups())
    # Rasterize the exported rectangles, not the cached dictionary.
    for rect in group.findall('svg:g/svg:rect', ns):
        rx = x + float(rect.attrib['x']) * scale
        ry = y + float(rect.attrib['y']) * scale
        right = rx + float(rect.attrib['width']) * scale
        bottom = ry + float(rect.attrib['height']) * scale
        image[round(ry):round(bottom), round(rx):round(right)] = 0
    crop = image[round(y):round(y + scale * 6), round(x):round(x + scale * 6)]
    np.testing.assert_array_equal(crop, cv2.aruco.generateImageMarker(dictionary, marker_id, 150), err_msg=f'Exported SVG marker {marker_id} differs from OpenCV')

_, ids, _ = cv2.aruco.ArucoDetector(dictionary).detectMarkers(image)
assert ids is not None and sorted(ids.flatten().tolist()) == list(range(50)), 'Some exported markers cannot be detected'
cv2.imwrite(str(root / 'test-results/all-markers.png'), image)

# If the browser suite produced a real PNG, verify its recognizable large markers.
browser_png = root / 'test-results/map.png'
if browser_png.exists():
    _, detected, _ = cv2.aruco.ArucoDetector(dictionary).detectMarkers(cv2.imread(str(browser_png)))
    assert detected is not None and set(range(1, 7)) <= set(detected.flatten().tolist())
    print('Actual browser PNG: large original markers recognized')
print(f'OpenCV {cv2.__version__}: all 50 dictionary matrices match; all 50 exported SVG markers match and are recognized')
