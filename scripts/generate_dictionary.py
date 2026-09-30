"""Generate browser data using OpenCV: python scripts/generate_dictionary.py."""
import json
from pathlib import Path
import cv2

dictionaries = {}
# Uppercase aliases remove duplicate OpenCV names (e.g. 16h5 and 16H5).
names = sorted({name.upper() for name in dir(cv2.aruco) if name.startswith('DICT_')})
for name in names:
    dictionary = cv2.aruco.getPredefinedDictionary(getattr(cv2.aruco, name))
    size = dictionary.markerSize
    count = len(dictionary.bytesList)
    markers = []
    for marker_id in range(count):
        image = cv2.aruco.generateImageMarker(dictionary, marker_id, size + 2)
        bits = ''.join(str(int(bit)) for bit in (image[1:-1, 1:-1] // 255).flatten())
        markers.append(format(int(bits, 2), 'x'))
    dictionaries[name] = {'markerSize': size, 'count': count, 'markers': markers}
output = Path(__file__).resolve().parents[1] / 'src' / 'dictionary.js'
output.write_text(
    '// Generated with OpenCV ' + cv2.__version__ + ', borderBits=1.\n'
    '// Hex stores row-major inner white bits; the black border is added by getMarkerMatrix.\n'
    'export const DICTIONARIES = ' + json.dumps(dictionaries, separators=(',', ':')) + ';\n',
    encoding='utf-8',
)
print(f'Generated {len(dictionaries)} dictionaries, {sum(d["count"] for d in dictionaries.values())} markers: {output}')
