"""Generate browser data using OpenCV: python scripts/generate_dictionary.py."""
import json
from pathlib import Path
import cv2

dictionary = cv2.aruco.getPredefinedDictionary(cv2.aruco.DICT_4X4_50)
markers = [(cv2.aruco.generateImageMarker(dictionary, i, 6) // 255).tolist() for i in range(50)]
output = Path(__file__).resolve().parents[1] / 'src' / 'dictionary.js'
output.write_text(
    '// Generated with OpenCV ' + cv2.__version__ + ', DICT_4X4_50, borderBits=1.\n'
    '// 0 = black, 1 = white. See scripts/generate_dictionary.py.\n'
    'export const MARKERS = ' + json.dumps(markers, separators=(',', ':')) + ';\n',
    encoding='utf-8',
)
print(f'Generated {len(markers)} markers: {output}')
