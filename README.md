# Bible to PPT Web

한국어 성경 구절을 검색하고 바로 PPT 슬라이드로 만들어주는 웹앱입니다.

> 데스크탑 앱 [sunghwan2789/Bible2PPT](https://github.com/sunghwan2789/Bible2PPT)에서 영감을 받아 웹 버전으로 재구현하였습니다.

---

## 주요 기능

- **성경 구절 검색** — 번역본, 책, 장, 절 범위를 선택하면 본문이 자동으로 채워집니다
- **3가지 번역본 지원** — 개역한글 · 개역개정 · 쉬운말성경
- **다중 구절 관리** — 여러 구절을 추가하고 각각 제목·소제목·본문을 독립적으로 편집
- **슬라이드 분할 모드** — 1절씩 나누기 / 슬라이드를 최대한 채우고 넘기기
- **실시간 미리보기** — PPT와 동일한 비율로 슬라이드를 미리 확인
- **디자인 커스터마이징** — 배경 이미지, 글꼴, 폰트 크기, 색상, 정렬, 위치 등 세부 설정
- **PPTX 다운로드** — 설정한 그대로 `.pptx` 파일로 저장
- **로컬 저장** — 모든 설정과 구절이 브라우저 localStorage에 자동 저장

---

## 번역본 데이터

| 번역본 | 파일 |
|---|---|
| 개역한글 (KRV) | `public/korean-bible.json` |
| 개역개정 (NKRV) | `public/bible-nkrv.json` |
| 쉬운말성경 (KORSMS) | `public/bible-korsms.json` |

모든 성경 데이터는 정적 JSON 파일로 제공되며 별도의 백엔드 서버가 필요하지 않습니다.

---

## 기술 스택

- **React 19** + **TypeScript**
- **Vite 6**
- **Tailwind CSS v4**
- **pptxgenjs** — PPTX 파일 생성
- **lucide-react** — 아이콘

---

## 로컬 실행

**필요 사항:** Node.js 18+

```bash
# 의존성 설치
npm install

# 개발 서버 실행 (http://localhost:3000)
npm run dev

# 프로덕션 빌드
npm run build
```

---

## 배포

백엔드가 없는 순수 정적 앱이므로 Vercel, Netlify, GitHub Pages 등 어디서든 바로 배포할 수 있습니다.

---

## 참고

- 원본 데스크탑 앱: [sunghwan2789/Bible2PPT](https://github.com/sunghwan2789/Bible2PPT)
