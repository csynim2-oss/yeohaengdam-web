"""src/ 의 파일들을 합쳐 루트의 index.html 한 파일로 만듭니다. 사용: python tools/build_web.py"""
from pathlib import Path
import re
root = Path(__file__).resolve().parents[1]
src = root / 'src'
parts = []
for name in ('trip-model.mjs', 'styles.mjs', 'trip-tools.mjs', 'app.js'):
    text = (src / name).read_text(encoding='utf-8')
    text = re.sub(r'^import .*?;\s*$', '', text, flags=re.M)
    text = re.sub(r'\bexport\s+(?=(?:async\s+)?(?:function|class|const|let))', '', text)
    parts.append(text)
js = '(async()=>{\n"use strict";\n' + '\n'.join(parts) + '\n})();'
assert '</script' not in js.lower()
html = (src / 'index.template.html').read_text(encoding='utf-8') \
    .replace('/*STYLE*/', (src / 'style.css').read_text(encoding='utf-8')) \
    .replace('/*BUNDLE*/', js)
(root / 'index.html').write_text(html, encoding='utf-8')
print('index.html', len(html.encode()), 'bytes')
