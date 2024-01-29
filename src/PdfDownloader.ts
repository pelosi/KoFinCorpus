import axios from "axios";
import * as fs from "fs";
import * as path from "path";

class PdfDownloader {
    private readonly BASE_URL = "https://dart.fss.or.kr";

    public async downloadPdf(rcpNo: string, dcmNo: string, saveDir: string): Promise<string> {
        const downloadUrl = `${this.BASE_URL}/pdf/download/pdf.do?rcp_no=${rcpNo}&dcm_no=${dcmNo}`;
        const response = await axios.get(downloadUrl, { responseType: "stream" });

        // Extract filename from Content-Disposition header or use a default name
        const contentDisposition = response.headers["content-disposition"];
        const defaultFilename = `file_${rcpNo}.pdf`;
        const filename = contentDisposition
            ? contentDisposition.match(/filename\*=UTF-8''(.+)/)?.[1] || defaultFilename
            : defaultFilename;

        const filePath = path.join(saveDir, decodeURIComponent(filename));

        // Handle file name conflicts
        let uniqueFilePath = filePath;
        let counter = 1;
        while (fs.existsSync(uniqueFilePath)) {
            uniqueFilePath = filePath.replace(/(\.pdf)$/, ` (${counter}).pdf`);
            counter++;
        }

        // Save the file
        const writer = fs.createWriteStream(uniqueFilePath);
        response.data.pipe(writer);

        return new Promise((resolve, reject) => {
            writer.on("finish", () => resolve(uniqueFilePath));
            writer.on("error", reject);
        });
    }
}

// 사용 예시
(async () => {
    const downloader = new PdfDownloader();
    const saveDir = "./downloads"; // 다운로드를 저장할 디렉토리
    const rcpNo = "20240101000001"; // PDF의 rcpNo (예시)
    const dcmNo = "10000001"; // PDF의 dcmNo (예시)

    try {
        if (!fs.existsSync(saveDir)) {
            fs.mkdirSync(saveDir);
        }

        const savedPath = await downloader.downloadPdf(rcpNo, dcmNo, saveDir);
        console.log(`다운로드 완료: ${savedPath}`);
    } catch (error) {
        console.error("다운로드 중 오류 발생:", error);
    }
})();
