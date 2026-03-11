# Inuyasha Demon Tournament

1대1 멀티플레이 턴제 웹 게임 MVP 저장소다.

현재 저장소는 npm workspace 기반 모노레포 구조다.

- `frontend`: React + Vite 클라이언트
- `backend`: Fastify + Socket.IO 서버
- `shared`: 프론트/백엔드 공통 타입

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

검증 명령:

```bash
npm run typecheck
npm run build
```

## 환경 변수

백엔드 예시: [backend/.env.example](/home/hyukkyo/dev/repo/inuyasha_demon_tournament/backend/.env.example)

- `PORT`
- `HOST`
- `FRONTEND_ORIGIN`

프론트 예시: [frontend/.env.example](/home/hyukkyo/dev/repo/inuyasha_demon_tournament/frontend/.env.example)

- `VITE_SERVER_URL`

## Health Check URL

백엔드 health check:

- 로컬: `http://localhost:3001/health`
- 배포: `https://<backend-domain>/health`

프론트 health check:

- 로컬 dev: `http://localhost:5173/health.json`
- 배포: `https://<frontend-domain>/health.json`

설명:

- 백엔드는 Fastify health endpoint를 사용한다.
- 프론트는 정적 파일 `health.json` 존재 여부로 배포 성공을 빠르게 확인한다.

## Render 배포 가이드

이 프로젝트는 `shared/` 워크스페이스를 프론트와 백엔드가 함께 사용하므로, 서비스의 `Root Directory`를 `frontend` 또는 `backend` 하위로 잡지 말고 저장소 루트를 기준으로 빌드하는 편이 안전하다.

Render 공식 문서 기준:

- 모노레포에서 `root directory` 밖 파일은 build/runtime에서 사용할 수 없다.
- 따라서 현재 구조에서는 저장소 루트 기준 빌드 + `Build Filters` 사용이 적합하다.

참고 문서:

- Render Monorepo Support: https://render.com/docs/monorepo-support
- Render Fastify Deploy: https://render.com/docs/deploy-node-fastify-app
- Render Health Checks: https://render.com/docs/health-checks

### 1. 백엔드 Web Service 생성

Render Dashboard에서:

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

비고:

- `PORT`는 Render가 주입하는 값을 그대로 쓰면 된다.
- Fastify는 `0.0.0.0` 바인딩이 필요하다.

권장 Build Filters:

- Included Paths:
  - `backend/**`
  - `shared/**`
  - `package.json`
  - `package-lock.json`

### 2. 프론트 Static Site 생성

Render Dashboard에서:

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

권장 Build Filters:

- Included Paths:
  - `frontend/**`
  - `shared/**`
  - `package.json`
  - `package-lock.json`

### 3. Render 배포 순서

1. GitHub에 현재 저장소 푸시
2. 백엔드 Web Service 생성
3. 백엔드 `onrender.com` 주소 확인
4. 프론트 Static Site 생성
5. 프론트의 `VITE_SERVER_URL`에 백엔드 주소 입력
6. 프론트 배포 완료 후 백엔드 `FRONTEND_ORIGIN`을 실제 프론트 주소로 수정
7. 백엔드 재배포

## Vercel + Render 배포 가이드

프론트를 Vercel에, 백엔드를 Render에 올리는 조합도 가능하다.

Vercel 공식 문서 기준:

- 모노레포 프로젝트는 project별 `Root Directory`를 설정할 수 있다.
- root directory 밖 파일은 접근할 수 없으므로, 현재 workspace 구조에서는 그대로 Vercel root를 `frontend`로 두는 방식이 불리할 수 있다.

참고 문서:

- Vercel Monorepos: https://vercel.com/docs/monorepos
- Vercel Build Settings: https://vercel.com/docs/deploy-button/build-settings
- Vercel Configure a Build: https://vercel.com/docs/deployments/configure-a-build

현재 저장소 구조에서는 프론트도 Render Static Site로 먼저 배포하는 편이 단순하다.

## Railway 배포 시 명령

Railway를 사용할 경우에도 현재 저장소 구조에서는 저장소 루트 기준 명령을 쓰는 것이 안전하다.

백엔드:

- Build Command:

```bash
npm install && npm run build --workspace shared && npm run build --workspace backend
```

- Start Command:

```bash
npm run start --workspace backend
```

프론트:

- Build Command:

```bash
npm install && npm run build --workspace frontend
```

- Publish/Serve:
  Railway는 정적 사이트보다는 서버 배포에 더 자연스럽다. 현재 구조에선 프론트는 Render Static Site 또는 Vercel 쪽이 더 단순하다.

## WebSocket 배포 점검

배포 후 반드시 확인할 것:

1. 프론트 접속 직후 `Connection` 상태가 `connected`로 바뀌는지
2. 방 생성이 되는지
3. 다른 브라우저에서 방 입장이 되는지
4. 캐릭터 선택, 카드 선택, resolve 로그가 양쪽에 동기화되는지
5. 새로고침 후 자동 재접속이 되는지
6. 30초 복귀 실패 시 상대 승리로 종료되는지

문제 발생 시 우선 확인:

- `VITE_SERVER_URL`이 실제 백엔드 주소인지
- 백엔드 `FRONTEND_ORIGIN`이 실제 프론트 주소인지
- 브라우저 콘솔에 CORS 또는 websocket handshake 에러가 없는지
- Render 서비스 로그에 Socket.IO 연결/해제 로그가 찍히는지

## 배포용 최종 체크리스트

배포 전:

- `npm run typecheck`
- `npm run build`
- `backend/.env.example`, `frontend/.env.example` 값 확인

배포 직후:

- 백엔드 `GET /health` 200 확인
- 프론트 `GET /health.json` 200 확인
- 브라우저에서 첫 연결 성공 확인

실사용 테스트:

1. 방 생성
2. 방 입장
3. 캐릭터 선택
4. 카드 선택
5. resolve 진행
6. 결과 화면
7. `Leave Game`
8. 새로고침 재접속
9. 30초 복귀 실패 종료

운영 전 확인:

- 프론트 도메인이 백엔드 `FRONTEND_ORIGIN`과 일치하는지
- 불필요한 개발용 콘솔/테스트 코드가 없는지
- GitHub 기본 브랜치 push 시 자동 배포가 의도대로 동작하는지
