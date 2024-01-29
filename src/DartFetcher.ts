import * as fs from "fs";
import * as path from "path";
import readline from 'readline';
import axios from "axios";
import { load } from "cheerio"
import * as iconv from "iconv-lite";
import { FileLink, FileDownloader } from './lib/FileDownloader';

/**
 * 검색 파라미터를 정의하는 인터페이스
 * 서버에 요청할 때 사용되는 각 검색 필드와 값들을 정의합니다.
 */
   interface SearchParams {
    /** 현재 페이지 번호 (1부터 시작) */
    currentPage: number;
    /** 한 페이지당 표시할 최대 결과 수 */
    maxResults: number;
    /** 페이지 네비게이션에 표시할 최대 링크 수 */
    maxLinks: number;
    /** 정렬 기준 (e.g., "date") */
    sort: string;
    /** 정렬 순서 (e.g., "asc" 또는 "desc") */
    series: string;
    /** 공시 대상 회사 이름 (선택 항목) */
    textCrpNm?: string;
    /** 검색 시작일 (YYYYMMDD 형식, 선택 항목) */
    startDate: string;
    /** 검색 종료일 (YYYYMMDD 형식, 선택 항목) */
    endDate: string;
    /** 첨부된 문서 이름 (선택 항목) */
    attachDocNm?: string;
    /** 공시 유형 (e.g., ["A001", "B001"], 선택 항목) */
    publicType?: string[];
    /** 최종 보고서 여부 (true: "recent", false: 공백) */
    finalReport: boolean;
}

/**
 * 검색 결과 항목을 정의하는 인터페이스
 * HTML 응답에서 파싱된 각 검색 결과 데이터를 표현합니다.
 */
interface SearchResultItem {
    /** 결과 번호 (1부터 시작) */
    number: number;
    /** 공시 대상 회사 이름 */
    corpName: string;
    /** 보고서 제목 */
    reportName: string;
    /** 제출자 (공시를 제출한 기관 또는 개인) */
    submitter: string;
    /** 보고서 접수 날짜 (YYYY.MM.DD 형식) */
    receiveDate: string;
    /** 비고 (추가 정보, 없을 경우 '-') */
    remarks: string;
    /** 보고서 View 링크 (전체 URL) */
    href: string;
}

interface PdfDownloadInfo {
    /**
     * 접수번호 (Receipt Number)
     * 공시 보고서의 고유 식별 번호
     */
    rcpNo: string;

    /**
     * 문서번호 (Document Number)
     * 공시 보고서의 특정 문서를 구분하기 위한 번호
     */
    dcmNo: string;
}

/**
 * DART 공시 페이지 구조:
 * - 검색 결과에서 각 공시의 href로 상세 페이지 접근
 * - 상세 페이지의 다운로드 버튼에서 rcpNo(접수번호)와 dcmNo(문서번호) 추출
 * - PDF 다운로드 URL: /pdf/download/pdf.do?rcp_no={rcpNo}&dcm_no={dcmNo}
 */

class DartFetcher {
    private readonly BASE_URL = "https://dart.fss.or.kr";
    private metaFilePath: string;
    private outputFilePath: string;
    private downloadFolderPath: string;

    constructor(
        private sourceConfig: {sourceName: string, categoryId: string, categoryName: string},
        private downloadMinDelayMs: number = 0,
        private downloadMaxDelayMs: number = 0
    ) {
        this.metaFilePath = `./downloads/${this.sourceConfig.sourceName}-${this.sourceConfig.categoryId}-${this.sourceConfig.categoryName}-meta.json`;
        this.outputFilePath = `./downloads/${this.sourceConfig.sourceName}-${this.sourceConfig.categoryId}-${this.sourceConfig.categoryName}.json`;
        this.downloadFolderPath = `./downloads/${this.sourceConfig.sourceName}-${this.sourceConfig.categoryId}-${this.sourceConfig.categoryName}`;
    }

    /**
     * 코스닥 기업명으로 공시자료 리스트 조회
     * @param params 검색 조건 (기업명, 기간, 공시유형 등)
     * @returns 공시 자료 조회 결과 (HTML 테이블 형식)
     */
    private async search(params: SearchParams): Promise<string> {
        try {
            const formData = new URLSearchParams();
            formData.append("currentPage", params.currentPage.toString());
            formData.append("maxResults", params.maxResults.toString());
            formData.append("maxLinks", params.maxLinks.toString());
            formData.append("sort", params.sort);
            formData.append("series", params.series);
            if (params.textCrpNm) formData.append("textCrpNm", params.textCrpNm);
            if (params.startDate) formData.append("startDate", params.startDate);
            if (params.endDate) formData.append("endDate", params.endDate);
            if (params.attachDocNm) formData.append("attachDocNm", params.attachDocNm);
            if (params.publicType) {
                params.publicType.forEach((type) => formData.append("publicType", type));
            }
            formData.append("finalReport", params.finalReport ? "recent" : "");

            const response = await axios.post(this.BASE_URL + "/dsab001/search.ax", formData, {
                headers: { "Content-Type": "application/x-www-form-urlencoded" },
            });
            return response.data;
        } catch (error) {
            console.error("An error occurred during the search:", error);
            throw new Error("An error occurred while processing the search request.");
        }
    }

    /**
     * HTML 검색 결과를 파싱하여 구조화된 데이터로 변환
     * @param html 공시 자료 조회 결과 (HTML 테이블 형식)
     * @returns 공시 자료 리스트 (번호, 기업명, 보고서명, 제출인, 접수일자, 비고, URL)
     */
    private parseResults(html: string): SearchResultItem[] {
        const $ = load(html);

        const rows = $("tbody#tbody tr");
        const results: SearchResultItem[] = [];

        rows.each((_, row) => {
            const cells = $(row).find("td");
            if (cells.length === 6) {
                const reportLink = $(cells[2]).find("a");
                const item: SearchResultItem = {
                    number: parseInt($(cells[0]).text().trim() || "0"),
                    corpName: $(cells[1]).find("a").text().trim(),
                    reportName: reportLink.text().replace(/[\n\t]+/g, " ").replace(/\s+/g, " ").trim(),
                    submitter: $(cells[3]).text().replace(/[\n\t]+/g, " ").replace(/\s+/g, " ").trim(),
                    receiveDate: $(cells[4]).text().trim(),
                    remarks: $(cells[5]).text().replace(/[\n\t]+/g, " ").replace(/\s+/g, " ").trim() || "-",
                    href: this.BASE_URL + reportLink.attr("href")!,
                };
                results.push(item);
            }
        });

        return results;
    }

    /**
     * 보고서 페이지에서 접수번호와 문서번호 추출
     * @param reportUrl 보고서 URL (BASE_URL 제외)
     * @returns PdfDownloadInfo 객체
     */
    private async getPdfDownloadInfo(reportUrl: string): Promise<PdfDownloadInfo | null> {
        try {
            const response = await axios.get(reportUrl, {
                headers: { "User-Agent": "Mozilla/5.0" }, // 요청을 일반 브라우저처럼 보이게 설정
            });

            const $ = load(response.data);

            // 다운로드 버튼에서 `onclick` 속성 추출
            const button = $("button.btnDown");
            const onclickAttr = button.attr("onclick");

            if (!onclickAttr) {
                console.error("다운로드 버튼이 존재하지 않습니다.");
                return null;
            }

            // openPdfDownload('{rcpNo}', '{dcmNo}') 패턴 추출
            const match = /openPdfDownload\('(\d+)',\s*'(\d+)'\)/.exec(onclickAttr);

            if (match && match.length === 3) {
                const [_, rcpNo, dcmNo] = match;
                return { rcpNo, dcmNo };
            } else {
                console.error("Failed to parse arguments for openPdfDownload");
                return null;
            }
        } catch (error) {
            console.error("Error occurred while loading the page:", error);
            return null;
        }
    }

    /**
     * 다운로드 URL과 파일명을 가져오는 메서드
     * @param rcpNo 접수번호
     * @param dcmNo 문서번호
     * @returns DownloadInfo 객체
     */
    private async getDownloadInfo(rcpNo: string, dcmNo: string, fileType: "pdf"|"zip"): Promise<FileLink> {
        const downloadUrl = `${this.BASE_URL}/pdf/download/${fileType}.do?rcp_no=${rcpNo}&dcm_no=${dcmNo}`;
        console.log(`Fetching download information from URL: ${downloadUrl}`);

        const response = await axios.get(downloadUrl, {
            headers: { "User-Agent": "Mozilla/5.0" },
            maxRedirects: 10, // 허용 리디렉션 횟수를 기본보다 증가
        });

        // Extract filename from Content-Disposition header or use a default name
        const contentDisposition = response.headers["content-disposition"];
        if (!contentDisposition) {
            throw new Error("Content-Disposition header is missing.");
        }
        
        let fileName = `file_${rcpNo}.unknown`; // Default name if extraction fails
        const utf8FileNameMatch = contentDisposition.match(/filename\*=UTF-8''([^;]+)/i);
        const eucKrFileNameMatch = contentDisposition.match(/filename="?([^"]+)"?/i);

        if (utf8FileNameMatch) {
            fileName = decodeURIComponent(utf8FileNameMatch[1]);
        } else if (eucKrFileNameMatch) {
            const encodedFileName = eucKrFileNameMatch[1];
            fileName = iconv.decode(Buffer.from(encodedFileName, "binary"), "euc-kr");
        }

        // Ensure the file name is safe
        fileName = fileName.replace(/[<>:"/\\|?*]+/g, "_");

        return { url: downloadUrl, filename: fileName };
    }
    
    private saveFileLinksToJson(fileLinks: FileLink[]): void {
        const folderPath = path.dirname(this.outputFilePath);

        if (!fs.existsSync(folderPath)) {
            fs.mkdirSync(folderPath, { recursive: true });
            console.log(`Folder created at ${folderPath}`);
        }

        const jsonLines = '[\n' + fileLinks.map(link => `  ${JSON.stringify(link)}`).join(',\n') + '\n]';
        fs.writeFileSync(this.outputFilePath, jsonLines, 'utf8');
        console.log(`File links saved to ${this.outputFilePath}`);
    }

    private saveSearchItemsToJson(searchItems: SearchResultItem[]): void {
        const folderPath = path.dirname(this.outputFilePath);

        if (!fs.existsSync(folderPath)) {
            fs.mkdirSync(folderPath, { recursive: true });
            console.log(`Folder created at ${folderPath}`);
        }

        const jsonData = JSON.stringify(searchItems, null, 2);
        fs.writeFileSync(this.metaFilePath, jsonData, "utf8");
        console.log(`Search items saved to ${this.metaFilePath}`);
    }

    private async askUserConfirmation(message: string): Promise<boolean> {
        const rl = readline.createInterface({input: process.stdin, output: process.stdout});
    
        return new Promise(resolve => {
            rl.question(message, answer => {
                rl.close();
                resolve(answer.trim().toLowerCase() === 'y');
            });
        });
    }

    private async fetchAllFileLinks(params: SearchParams): Promise<FileLink[]> {
        const existingFilePath = this.outputFilePath;
        let fileLinks: FileLink[] = [];

        if (fs.existsSync(existingFilePath)) {
            console.log(`Existing JSON file found: ${existingFilePath}`);
            
            const userChoice = await this.askUserConfirmation("A file with existing download links was found. Do you want to use it? (y = use existing, n = fetch new): ");
    
            if (userChoice) {
                fileLinks = JSON.parse(fs.readFileSync(existingFilePath, 'utf8'));
                console.log(`Loaded ${fileLinks.length} file links from ${existingFilePath}`);
                return fileLinks;
            } else {
                console.log("Fetching new download links...");
            }
        }

        // 검색 요청
        const htmlResponse = await this.search(params);
        console.log("Search completed.");

        // HTML 결과 파싱
        const searchItems = this.parseResults(htmlResponse);
        console.log("search items:", searchItems);
        this.saveSearchItemsToJson(searchItems);

        for (const result of searchItems) {
            const reportUrl = result.href;
            const pdfDownloadInfo = await this.getPdfDownloadInfo(reportUrl);

            if (pdfDownloadInfo) {
                try {
                    const fileLink = await this.getDownloadInfo(pdfDownloadInfo.rcpNo, pdfDownloadInfo.dcmNo, "pdf");
                    fileLinks.push({
                        url: fileLink.url,
                        filename: fileLink.filename,
                    });
                } catch (error) {
                    try {
                        const fileLink = await this.getDownloadInfo(pdfDownloadInfo.rcpNo, pdfDownloadInfo.dcmNo, "zip");
                        fileLinks.push({
                            url: fileLink.url,
                            filename: fileLink.filename,
                        });
                    } catch (zipError) {
                        const zipErrMessage = zipError instanceof Error ? zipError.message : String(zipError);
                        console.error("ZIP download info also failed:", zipErrMessage);
                    }
                }
            } else {
                console.log("Failed to retrieve download information for:", reportUrl);
            }
        }

        this.saveFileLinksToJson(fileLinks);
        return fileLinks;
    }

    /**
     * 전체 프로세스를 실행하며, 먼저 FileLink[] 배열을 생성한 후 다운로드 수행
     * @param params 검색 조건
     * @param saveDir 파일 저장 디렉토리
     */
    public async fetchAndDownloadFileLinks(params: SearchParams): Promise<void> {
        try {
            const dateRange = `${params.startDate}-${params.endDate}`;
            this.metaFilePath = `./downloads/${this.sourceConfig.sourceName}-${this.sourceConfig.categoryId}-${this.sourceConfig.categoryName}-${dateRange}-meta.json`;
            this.outputFilePath = `./downloads/${this.sourceConfig.sourceName}-${this.sourceConfig.categoryId}-${this.sourceConfig.categoryName}-${dateRange}.json`;
            this.downloadFolderPath = `./downloads/${this.sourceConfig.sourceName}-${this.sourceConfig.categoryId}-${this.sourceConfig.categoryName}-${dateRange}`;
    
            const fileLinks = await this.fetchAllFileLinks(params);
            console.log(`\n${fileLinks.length} file links found: `, fileLinks);

            const downloader = new FileDownloader(this.downloadFolderPath, this.downloadMinDelayMs, this.downloadMaxDelayMs);
            await downloader.confirmAndDownloadFiles(fileLinks);
        } catch (error) {
            console.error("Error during processDownloads:", error);
        }
    }
}

(async () => {
    const kosdaqList: string[] = [
        "쓰리빌리언",
        "닷밀",
        "노머스",
        "에어레인",
        "토모큐브",
        "에이치이엠파마",
        "탑런토탈솔루션",
        "에이럭스",
        "성우",
        "유진스팩11호",
        "클로봇",
        "에이치엔에스하이텍",
        "웨이비스",
        "씨메스",
        "한켐",
        "루미르",
        "와이제이링크",
        "인스피언",
        "셀비온",
        "제닉스",
        "KB제30호스팩",
        "아이언디바이스",
        "미래에셋비전스팩7호",
        "아이스크림미디어",
        "이엔셀",
        "M83",
        "대신밸런스제18호스팩",
        "티디에스팜",
        "넥스트바이오메디컬",
        "케이쓰리아이",
        "유라클",
        "교보16호스팩",
        "뱅크웨어글로벌",
        "아이빔테크놀로지",
        "피앤에스미캐닉스",
        "엔에이치스팩31호",
        "SK증권제13호스팩",
        "엑셀세라퓨틱스",
        "이베스트스팩6호",
        "하스",
        "이노스페이스",
        "에이치브이엠",
        "하이젠알앤엠",
        "한국제15호스팩",
        "에스오에스랩",
        "한중엔시에스",
        "에이치엠씨제7호스팩",
        "미래에셋비전스팩6호",
        "KB제29호스팩",
        "씨어스테크놀로지",
        "미래에셋비전스팩5호",
        "한국제14호스팩",
        "디비금융스팩12호",
        "라메디텍",
        "그리드위즈",
        "미래에셋비전스팩4호",
        "노브랜드",
        "아이씨티케이",
        "KB제28호스팩",
        "코칩",
        "SK증권제12호스팩",
        "민테크",
        "디앤디파마텍",
        "유안타제16호스팩",
        "제일엠앤에스",
        "하나33호스팩",
        "신한제13호스팩",
        "신한제12호스팩",
        "아이엠비디엑스",
        "하나32호스팩",
        "엔젤로보틱스",
        "삼현",
        "오상헬스케어",
        "케이엔알시스템",
        "하나31호스팩",
        "비엔케이제2호스팩",
        "SK증권제11호스팩",
        "유진스팩10호",
        "유안타제15호스팩",
        "코셈",
        "이에이트",
        "케이웨더",
        "스튜디오삼익",
        "신영스팩10호",
        "폰드그룹",
        "이닉스",
        "IBKS제24호스팩",
        "포스뱅크",
        "현대힘스",
        "HB인베스트먼트",
        "우진엔텍",
        "대신밸런스제17호스팩",
        "IBKS제23호스팩",
        "하나30호스팩",
        "블루엠텍",
        "LS머트리얼즈",
        "케이엔에스",
        "와이바이오로직스",
        "교보15호스팩",
        "삼성스팩9호",
        "에이텀",
        "엔에이치스팩30호",
        "에이에스텍",
        "그린리소스",
        "한선엔지니어링",
        "에코아이",
        "스톰테크",
        "캡스톤파트너스",
        "에스와이스틸텍",
        "에이직랜드",
        "한국제13호스팩",
        "큐로셀",
        "비아이매트릭스",
        "메가터치",
        "컨텍",
        "쏘닉스",
        "KB제27호스팩",
        "유투바이오",
        "유진테크놀로지",
        "퀄리타스반도체",
        "워트",
        "에스엘에스바이오",
        "신성에스티",
        "퓨릿",
        "에이치엠씨제6호스팩",
        "아이엠티",
        "레뷰코퍼레이션",
        "한싹",
        "신한제11호스팩",
        "밀리의서재",
        "인스웨이브시스템즈",
        "상상인제4호스팩",
        "한화플러스제4호스팩",
        "대신밸런스제16호스팩",
        "유안타제11호스팩",
        "대신밸런스제15호스팩",
        "한국제12호스팩",
        "시큐레터",
        "스마트레이더시스템",
        "빅텐츠",
        "SK증권제10호스팩",
        "큐리옥스바이오시스템즈",
        "코츠테크놀로지",
        "하나28호스팩",
        "KB제26호스팩",
        "파두",
        "엠아이큐브솔루션",
        "시지트로닉스",
        "에이엘티",
        "파로스아이바이오",
        "유안타제14호스팩",
        "버넥트",
        "뷰티스킨",
        "SK증권제9호스팩",
        "와이랩",
        "센서뷰",
        "필에너지",
        "DB금융스팩11호",
        "이노시뮬레이션",
        "교보14호스팩",
        "알멕",
        "오픈놀",
        "시큐센",
        "하나29호스팩",
        "엔에이치스팩29호",
        "KB제25호스팩",
        "하이제8호스팩",
        "프로테옴텍",
        "큐라티스",
        "마녀공장",
        "나라셀라",
        "진영",
        "기가비스",
        "씨유박스",
        "모니터랩",
        "트루엔",
        "키움제8호스팩",
        "에스바이오메딕스",
        "토마토시스템",
        "마이크로투나노",
        "미래에셋비전스팩3호",
        "하나27호스팩",
        "IBKS제22호스팩",
        "지아이이노베이션",
        "LB인베스트먼트",
        "유안타제12호스팩",
        "미래에셋드림스팩1호",
        "금양그린파워",
        "엔에이치스팩28호",
        "자람테크놀로지",
        "하나26호스팩",
        "나노팀",
        "바이오인프라",
        "삼성스팩8호",
        "유안타제13호스팩",
        "미래에셋비전스팩2호",
        "이노진",
        "제이오",
        "샌즈랩",
        "꿈비",
        "스튜디오미르",
        "삼기이브이",
        "오브젠",
        "미래반도체",
        "한주라이트메탈",
        "티이엠씨",
        "신영스팩9호",
        "비엔케이제1호스팩",
        "엔에이치스팩27호",
        "IBKS제21호스팩",
        "SAMG엔터",
        "대신밸런스제14호스팩",
        "엔에이치스팩26호",
        "유진스팩9호",
        "대신밸런스제13호스팩",
        "펨트론",
        "인벤티지랩",
        "유비온",
        "엔젯",
        "티쓰리",
        "티에프이",
        "윤성에프앤씨",
    ];

    const START_INDEX = 0;
    const END_INDEX = kosdaqList.length - 1;

    for (let i = START_INDEX; i <= END_INDEX; i++) {
        const searchParams: SearchParams = {
            currentPage: 1,
            maxResults: 15,
            maxLinks: 10,
            sort: "date",
            series: "desc",
            textCrpNm: kosdaqList[i],
            startDate: "20220101",
            endDate: "20240531",
            publicType: [],
            finalReport: true,
        };
    
        const dartFetcher = new DartFetcher(
            { sourceName: "DART", categoryId: `${searchParams.textCrpNm}`, categoryName: "공시자료" },
            0,
            3000
        );
    
        await dartFetcher.fetchAndDownloadFileLinks(searchParams);
    
        console.log(`Index ${i}: ${kosdaqList[i]}의 파일 다운로드 완료`);
    }
    
})();