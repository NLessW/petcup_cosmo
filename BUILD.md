# CUPBOX COSMO 빌드 및 배포 가이드

## 설치

먼저 의존성을 설치합니다:

```bash
npm install
```

## 개발

개발 모드로 실행:

```bash
npm start
```

## 빌드 및 패키징

### Windows 설치 프로그램 만들기

```bash
npm run make
```

이 명령어는 `out/make` 디렉토리에 다음 파일들을 생성합니다:

- **CUPBOX-COSMO-Setup.exe** - Windows 설치 프로그램 (권장)
- **CUPBOX_COSMO-1.0.0-full.nupkg** - Squirrel 패키지
- **CUPBOX_COSMO-1.0.0-delta.nupkg** - 업데이트용 델타 패키지
- **CUPBOX-COSMO-1.0.0-win32-x64.zip** - 포터블 버전

### 더 드라이한 실행 (테스트용)

```bash
npm run pack
```

## 배포 구조

```
out/
├── make/
│   ├── squirrel.windows/
│   │   ├── CUPBOX-COSMO-Setup.exe          ← 이 파일로 사용자가 설치합니다
│   │   ├── CUPBOX_COSMO-1.0.0-full.nupkg
│   │   └── CUPBOX_COSMO-1.0.0-delta.nupkg
│   └── zip/
│       └── CUPBOX-COSMO-1.0.0-win32-x64.zip
└── CUPBOX-COSMO/                           ← 압축 해제된 앱 파일들
    ├── CUPBOX COSMO.exe                    ← 실행 파일
    └── resources/
        └── app/                             ← 애플리케이션 파일들
```

## 설치 프로그램 특징

- **자동 업데이트**: Squirrel.Windows를 사용하여 자동 업데이트 지원
- **흔적 없는 설치**: 설정 파일은 `%AppData%`에만 저장
- **32비트/64비트 자동 감지**: 시스템 아키텍처에 맞는 버전 자동 설치
- **바탕화면 바로가기**: 설치 후 자동 생성
- **시작 메뉴**: Windows 시작 메뉴에 앱 등록

## 아이콘 설정 (선택사항)

더 전문적인 설치 프로그램을 위해 아이콘을 준비하려면:

1. `assets` 디렉토리 생성:

    ```bash
    mkdir assets
    ```

2. 아이콘 파일 준비:
    - `assets/icon.ico` - 윈도우 아이콘 (256x256px 권장)
    - `assets/icon.png` - 대체 아이콘 (512x512px)

3. 다시 빌드:
    ```bash
    npm run make
    ```

## 명령어 설명

| 명령어            | 설명                     |
| ----------------- | ------------------------ |
| `npm start`       | 개발 모드에서 앱 실행    |
| `npm run make`    | 설치 프로그램 생성       |
| `npm run pack`    | 테스트용 빌드 (드라이런) |
| `npm run publish` | GitHub에 릴리스 배포     |

## 설정 파일

- **forge.config.js** - Electron Forge 설정
- **electron/main.js** - Electron 메인 프로세스
- **package.json** - 프로젝트 메타데이터 및 빌드 설정

## 문제 해결

### 빌드 실패 시

1. Node.js 버전 확인 (14.0 이상 필요):

    ```bash
    node --version
    ```

2. 캐시 삭제 후 재설치:

    ```bash
    npm cache clean --force
    rm -r node_modules package-lock.json
    npm install
    ```

3. 다시 빌드:
    ```bash
    npm run make
    ```

### SerialPort 컴파일 오류

SerialPort는 네이티브 모듈입니다. Windows에서 Python과 Visual Studio Build Tools가 필요할 수 있습니다.

설치 방법:

```bash
# Windows 빌드 도구 설치
npm install --global --production windows-build-tools
```

그 후 다시 설치:

```bash
npm install
```
