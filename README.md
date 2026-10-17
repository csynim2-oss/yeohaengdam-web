# 여행담 (Yeohaengdam) 웹앱

여행 계획·준비물·달력·기록·보고서(PDF)를 한곳에서 관리하는 웹앱입니다.
서버·로그인·API 키가 필요 없으며, 기록은 각자 브라우저(IndexedDB)에 저장됩니다.

- 배포: Render **Static Site** (Build Command 없음, Publish Directory = `.`)
- 수정: `src/` 파일 수정 → `python tools/build_web.py` → `index.html` 재생성 → push
- 주의: 데이터는 브라우저별 저장이므로 설정 → 백업 파일 저장을 꼭 사용하세요.
