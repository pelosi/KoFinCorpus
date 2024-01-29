import fs from 'fs';
import path from 'path';
import readline from 'readline';
import puppeteer from 'puppeteer';
import { FileLink, FileDownloader } from './FileDownloader';

export class FileLinkFetcher {
    private outputFilePath: string;
    private downloadFolderPath: string;

    constructor(
        private baseUrl: string,
        private sourceConfig: {sourceName: string, categoryId: string, categoryName: string},
        private startDate: { year: number, month: number, day: number },
        private endDate: { year: number, month: number, day: number },
        private startPage: number,
        private maxItemsPerPage: number,
        private downloadPattern: RegExp,
        private downloadMinDelayMs: number = 0,
        private downloadMaxDelayMs: number = 0        
    ) {
        this.baseUrl = this.baseUrl
            .replace('{categoryId}', this.sourceConfig.categoryId)
            .replace('{searchStartYear}', this.startDate.year.toString())
            .replace('{searchStartMonth}', this.formatNumber(this.startDate.month))
            .replace('{searchStartDay}', this.formatNumber(this.startDate.day))
            .replace('{searchEndYear}', this.endDate.year.toString())
            .replace('{searchEndMonth}', this.formatNumber(this.endDate.month))
            .replace('{searchEndDay}', this.formatNumber(this.endDate.day))
            .replace('{maxItemsPerPage}', this.maxItemsPerPage.toString());
        
        const dateRange = `${this.formatDate(this.startDate)}-${this.formatDate(this.endDate)}`;
        this.outputFilePath = `./downloads/${this.sourceConfig.sourceName}-${this.sourceConfig.categoryName}-${dateRange}.json`;
        this.downloadFolderPath = `./downloads/${this.sourceConfig.sourceName}-${this.sourceConfig.categoryName}-${dateRange}`;
    }

    private formatDate(date: { year: number, month: number, day: number }): string {
        return `${date.year}${this.formatNumber(date.month)}${this.formatNumber(date.day)}`;
    }

    private formatNumber(num: number): string {
        return num.toString().padStart(2, '0');
    }

    private extractFileUrl(href: string): string | null {
        const match = href.match(this.downloadPattern);
        if (match) {
            return match[0].startsWith('http') ? match[0] : new URL(match[0], this.baseUrl).href;
        }
        return null;
    }

    private extractFileNameFromTitle(title: string): string | null {
        const regex = /(.+\.[a-zA-Z0-9]+)/;
        const match = title.match(regex);
        return match ? match[1] : null;
    }

    private async getFileLinksFromPage(pageUrl: string): Promise<FileLink[]> {
        const fileLinks: FileLink[] = [];
        const browser = await puppeteer.launch();
        const page = await browser.newPage();

        try {
            await page.goto(pageUrl, { waitUntil: 'networkidle2' });
            const links = await page.evaluate(() => {
                const anchorElements = Array.from(document.querySelectorAll('a'));
                return anchorElements.map(anchor => ({
                    href: anchor.getAttribute('href') || '',
                    title: anchor.getAttribute('title') || ''
                }));
            });

            for (const link of links) {
                const fileUrl = this.extractFileUrl(link.href);
                const filename = this.extractFileNameFromTitle(link.title);
                if (fileUrl && filename) {
                    fileLinks.push({ url: fileUrl, filename });
                }
            }
        } catch (error) {
            console.error(`Failed to fetch or parse page ${pageUrl}:`, error);
        } finally {
            await browser.close();
        }

        return fileLinks;
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

    private async askUserConfirmation(message: string): Promise<boolean> {
        const rl = readline.createInterface({input: process.stdin, output: process.stdout});
    
        return new Promise(resolve => {
            rl.question(message, answer => {
                rl.close();
                resolve(answer.trim().toLowerCase() === 'y');
            });
        });
    }

    private async fetchAllFileLinks(): Promise<FileLink[]> {
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
    
        let page = this.startPage;
        let lastPageLinks: FileLink[] = [];
    
        while (true) {
            const pageUrl = this.baseUrl.replace('{curPage}', page.toString());
            console.log(`\nFetching page: ${pageUrl}`);
    
            const pageFileLinks = await this.getFileLinksFromPage(pageUrl);
            console.log(`\n${page} page file links: ${pageFileLinks.length}`);
    
            const isDuplicatePage = lastPageLinks.length === pageFileLinks.length && lastPageLinks.every((link, index) =>
                link.url === pageFileLinks[index].url && link.filename === pageFileLinks[index].filename
            );
    
            if (isDuplicatePage) {
                console.log(`Stopping fetch due to duplicate page detected at page ${page}`);
                break;
            }
    
            fileLinks.push(...pageFileLinks);
            lastPageLinks = pageFileLinks;
            page += 1;
    
            if (pageFileLinks.length < this.maxItemsPerPage) {
                console.log(`Stopping fetch as file links length is less than ${this.maxItemsPerPage}`);
                break;
            }
        }
    
        console.log(`fileLinks: ${fileLinks}`);
        this.saveFileLinksToJson(fileLinks);
        return fileLinks;
    }
    
    public async fetchAndDownloadFileLinks(): Promise<void> {
        const fileLinks = await this.fetchAllFileLinks();
        console.log(`\n${fileLinks.length} file links found: `, fileLinks);

        const downloader = new FileDownloader(this.downloadFolderPath, this.downloadMinDelayMs, this.downloadMaxDelayMs);
        await downloader.confirmAndDownloadFiles(fileLinks);
    }
}
