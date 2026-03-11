# Inuyasha Demon Tournament

1대1 멀티플레이 턴제 웹 게임 MVP 프로젝트다.

이 저장소의 배포 기준은 아래로 확정한다.

- 프론트엔드: Render Static Site
- 백엔드: Render Web Service

## 구조

- `frontend`: React + Vite
- `backend`: Fastify + Socket.IO
- `shared`: 공통 타입

이 저장소는 npm workspace 기반 모노레포다.

## 요구 환경

- Node.js 24+
- npm 11+

## 로컬 실행

의존성 설치:

```bash
npm install
```

백엔드 실행:

```bash
npm run dev --workspace backend
```

프론트 실행:

```bash
npm run dev --workspace frontend
```

검증:

```bash
npm run typecheck
npm run build
```

## 환경 변수

백엔드 예시: [backend/.env.example](/home/hyukkyo/dev/repo/inuyasha_demon_tournament/backend/.env.example)

```bash
PORT=3001
HOST=0.0.0.0
FRONTEND_ORIGIN=http://localhost:5173
```

프론트 예시: [frontend/.env.example](/home/hyukkyo/dev/repo/inuyasha_demon_tournament/frontend/.env.example)

```bash
VITE_SERVER_URL=http://localhost:3001
```

## Health Check URL

백엔드:

- 로컬: `http://localhost:3001/health`
- 배포: `https://<backend-domain>/health`

프론트:

- 로컬: `http://localhost:5173/health.json`
- 배포: `https://<frontend-domain>/health.json`

프론트 health 파일: [frontend/public/health.json](/home/hyukkyo/dev/repo/inuyasha_demon_tournament/frontend/public/health.json)

## 왜 Render + Render인가

이 프로젝트는 `shared/` 워크스페이스를 프론트와 백엔드가 함께 사용한다.

따라서:

- 저장소 루트 기준으로 workspace 명령을 쓰는 배포가 단순하고
- 프론트와 백엔드를 같은 플랫폼에서 관리하면 환경 변수와 도메인 연결이 덜 꼬인다

현재 MVP 단계에서는 이 조합이 가장 단순하다.

## Render 배포 절차

### 1. GitHub에 코드 올리기

먼저 현재 저장소를 GitHub 원격 저장소에 push 한다.

Render는 Git 저장소 기준으로 배포한다.

### 2. 백엔드 Web Service 만들기

Render Dashboard:

1. `New +`
2. `Web Service`
3. GitHub 저장소 연결

설정값:

- Runtime: `Node`
- Root Directory: 비움 또는 repo root
- Build Command:

```bash
npm install && npm run build --workspace shared && npm run build --workspace backend
```

- Start Command:

```bash
npm run start --workspace backend
```

- Health Check Path:

```bash
/health
```

환경 변수:

```bash
HOST=0.0.0.0
FRONTEND_ORIGIN=https://<frontend-domain>
```

메모:

- `PORT`는 Render가 주입한다.
- 처음에는 `FRONTEND_ORIGIN`을 임시값으로 두고, 프론트 배포 후 실제 주소로 바꿔도 된다.

### 3. 백엔드 배포 확인

배포 후 아래 URL이 열려야 한다.

```bash
https://<backend-domain>/health
```

정상 응답 예시:

```json
{"ok":true,"now":1234567890}
```

### 4. 프론트 Static Site 만들기

Render Dashboard:

1. `New +`
2. `Static Site`
3. 같은 GitHub 저장소 연결

설정값:

- Root Directory: 비움 또는 repo root
- Build Command:

```bash
npm install && npm run build --workspace frontend
```

- Publish Directory:

```bash
frontend/dist
```

환경 변수:

```bash
VITE_SERVER_URL=https://<backend-domain>
```

### 5. 프론트 배포 확인

배포 후 아래 URL이 열려야 한다.

```bash
https://<frontend-domain>/health.json
```

정상 응답 예시:

```json
{
  "ok": true,
  "service": "frontend"
}
```

### 6. 프론트/백엔드 연결 마무리

프론트 주소가 확정되면 백엔드 환경 변수 `FRONTEND_ORIGIN`을 실제 프론트 URL로 수정한다.

예:

```bash
FRONTEND_ORIGIN=https://<frontend-domain>
```

수정 후 백엔드를 다시 배포한다.

## Render 입력값 요약

### 백엔드

- Build Command

```bash
npm install && npm run build --workspace shared && npm run build --workspace backend
```

- Start Command

```bash
npm run start --workspace backend
```

- Health Check Path

```bash
/health
```

- Environment Variables

```bash
HOST=0.0.0.0
FRONTEND_ORIGIN=https://<frontend-domain>
```

### 프론트

- Build Command

```bash
npm install && npm run build --workspace frontend
```

- Publish Directory

```bash
frontend/dist
```

- Environment Variables

```bash
VITE_SERVER_URL=https://<backend-domain>
```

## WebSocket 배포 점검

배포 후 아래 순서로 실제 동작을 확인한다.

1. 프론트 첫 접속 시 연결 상태가 `connected`로 바뀌는지 확인
2. 방 생성이 되는지 확인
3. 다른 브라우저에서 방 입장이 되는지 확인
4. 캐릭터 선택이 양쪽에 동기화되는지 확인
5. 카드 선택이 양쪽에 동기화되는지 확인
6. resolve 로그가 양쪽에서 정상 표시되는지 확인
7. 결과 화면이 표시되는지 확인
8. 새로고침 후 자동 재접속이 되는지 확인
9. 30초 복귀 실패 시 상대 승리 종료가 되는지 확인

문제 발생 시 먼저 볼 것:

- `VITE_SERVER_URL`이 실제 백엔드 주소인지
- `FRONTEND_ORIGIN`이 실제 프론트 주소인지
- 브라우저 콘솔에 CORS 또는 websocket handshake 에러가 있는지
- Render 로그에 socket connect/disconnect 로그가 남는지

## 배포 전 체크리스트

1. `npm run typecheck`
2. `npm run build`
3. `.env.example` 값 확인
4. GitHub 기본 브랜치에 최신 코드 push

## 배포 직후 체크리스트

1. 백엔드 `/health` 확인
2. 프론트 `/health.json` 확인
3. 브라우저 첫 접속 성공 확인
4. CORS 에러 없는지 확인

## MVP 최종 체크리스트

1. 방 생성
2. 방 입장
3. 캐릭터 선택
4. 카드 선택
5. resolve 진행
6. 결과 화면
7. Leave Game
8. 새로고침 재접속
9. 30초 복귀 실패 종료

## 실제 배포를 시작할 때 순서

처음부터 순차적으로 하면 된다.

1. GitHub 저장소 준비
2. Render에서 백엔드 서비스 생성
3. 백엔드 `/health` 확인
4. Render에서 프론트 서비스 생성
5. 프론트 `/health.json` 확인
6. 백엔드 `FRONTEND_ORIGIN` 최종 수정
7. 브라우저 두 개로 WebSocket 실사용 테스트
