# KoFinCorpus

AI/LLM의 RAG(Retrieval-Augmented Generation) 검색 및 모델 학습을 위한 한국 금융 도메인 코퍼스 수집기입니다.

## 프로젝트 배경

대규모 언어 모델(LLM)의 금융 도메인 특화를 위해서는 고품질의 한국어 금융 데이터가 필수적입니다. 이 프로젝트는 다음 목적을 위해 개발되었습니다:

- **RAG 시스템 구축** - 금융 질의응답을 위한 검색 기반 문서 저장소 생성
- **도메인 특화 학습** - 금융 용어, 보고서 형식, 분석 패턴을 학습하기 위한 코퍼스 확보
- **데이터 파이프라인** - 원시 금융 문서를 AI 학습 가능한 형태로 수집/정제

## 지원 데이터 소스

| 소스 | 모듈 | 수집 데이터 | 활용 분야 |
|------|------|-------------|-----------|
| DART (금융감독원) | `DartFetcher.ts` | 코스닥 기업 공시자료 | 재무제표, 사업보고서 분석 |
| 한경 컨센서스 | `HankyungConsensusFetcher.ts` | 산업/기업 분석 보고서 | 투자 의견, 시장 전망 |
| 미래에셋증권 | `MiraeAssetFetcher.ts` | 증권 분석 보고서 | 종목 분석, 밸류에이션 |

## 주요 기능

- **다중 소스 통합** - 여러 금융 데이터 소스를 단일 파이프라인으로 수집
- **메타데이터 보존** - 문서별 출처, 날짜, 기업명 등 RAG 검색에 필요한 메타정보 저장
- **중복 검사** - 파일 크기 기반 중복 다운로드 방지로 코퍼스 품질 유지
- **속도 제한 대응** - 다운로드 간 랜덤 딜레이로 안정적인 대량 수집
- **인코딩 처리** - UTF-8, EUC-KR 자동 변환으로 한글 문서 정확히 처리
- **재시작 지원** - 캐시된 링크 데이터로 중단된 수집 작업 재개

## 프로젝트 구조

```
KoFinCorpus/
├── src/                              # TypeScript 소스 코드
│   ├── DartFetcher.ts               # DART 공시자료 수집기
│   ├── HankyungConsensusFetcher.ts  # 한경 컨센서스 수집기
│   ├── MiraeAssetFetcher.ts         # 미래에셋증권 수집기
│   ├── PdfDownloader.ts             # PDF 다운로드 유틸리티
│   └── lib/
│       ├── FileDownloader.ts        # 파일 다운로드 매니저
│       └── FileLinkFetcher.ts       # Puppeteer 기반 링크 추출기
├── dist/                            # 컴파일된 JavaScript 출력
├── downloads/                       # 수집된 코퍼스 저장소
├── package.json                     # 프로젝트 의존성
├── tsconfig.json                    # TypeScript 설정
└── eslint.config.mjs               # ESLint 설정
```

## 기술 스택

- **TypeScript** - 타입 안전성을 갖춘 메인 개발 언어
- **Node.js** - 런타임 환경
- **Puppeteer** - JavaScript 렌더링 페이지 처리를 위한 헤드리스 브라우저
- **Cheerio** - 서버 사이드 HTML 파싱
- **Axios** - HTTP 클라이언트

## 설치

```bash
npm install
```

## 빌드

```bash
npx tsc
```

## 사용법

### 데이터 수집 실행

```bash
# DART 코스닥 기업 공시자료 수집
npx ts-node src/DartFetcher.ts

# 한경 컨센서스 기업분석 보고서 수집
npx ts-node src/HankyungConsensusFetcher.ts

# 미래에셋증권 분석 보고서 수집
npx ts-node src/MiraeAssetFetcher.ts
```

### 수집 설정

각 수집기는 소스 코드 내에서 다음 항목을 설정할 수 있습니다:

| 설정 항목 | 설명 | 예시 |
|-----------|------|------|
| 날짜 범위 | 수집할 문서의 기간 | 2022-01-01 ~ 2024-12-31 |
| 페이지당 항목 수 | API 요청당 가져올 문서 수 | 10 ~ 100 |
| 다운로드 딜레이 | 요청 간 대기 시간 (ms) | 0 ~ 3000 |
| 저장 경로 | 코퍼스 저장 위치 | ./downloads |

## 출력 구조

```
./downloads/
├── DART-{기업명}-공시자료-meta.json    # 검색 메타데이터 (RAG 인덱싱용)
├── DART-{기업명}-공시자료.json         # 다운로드 링크 및 문서 정보
├── DART-{기업명}-공시자료/             # 수집된 PDF 문서
├── 한경컨센서스-기업분석-meta.json
├── 한경컨센서스-기업분석.json
└── 한경컨센서스-기업분석/
```

## 데이터 파이프라인

### 2단계 수집 프로세스

```
[웹 소스] → [링크 수집] → [메타데이터 JSON] → [문서 다운로드] → [코퍼스]
              ↓                                      ↓
         Puppeteer/Cheerio                    Axios Stream
```

1. **링크 수집 단계** - 웹사이트 스크래핑으로 문서 URL과 메타정보 추출, JSON 저장
2. **다운로드 단계** - JSON 기반 문서 다운로드 (재시도 로직 및 중복 검사 포함)

### 후속 처리 (별도 구현 필요)

수집된 코퍼스는 다음 단계를 통해 AI/LLM에 활용할 수 있습니다:

1. **PDF 텍스트 추출** - PyMuPDF, pdfplumber 등으로 텍스트 변환
2. **청킹(Chunking)** - RAG 검색을 위한 적절한 크기로 문서 분할
3. **임베딩 생성** - OpenAI, Sentence-Transformers 등으로 벡터화
4. **벡터 DB 저장** - Pinecone, Chroma, Milvus 등에 인덱싱

## 의존성

### 프로덕션

| 패키지 | 버전 | 용도 |
|--------|------|------|
| axios | ^1.7.7 | HTTP 클라이언트 |
| cheerio | ^1.0.0 | HTML 파싱 |
| puppeteer | ^23.7.1 | 헤드리스 브라우저 |
| iconv-lite | ^0.6.3 | 문자 인코딩 변환 |

### 개발

| 패키지 | 버전 | 용도 |
|--------|------|------|
| typescript | ^5.6.3 | TypeScript 컴파일러 |
| @types/node | ^22.9.0 | Node.js 타입 정의 |
| eslint | ^9.15.0 | 코드 린팅 |

## 라이선스

Private
