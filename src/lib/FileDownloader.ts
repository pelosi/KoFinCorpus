import readline from 'readline';
import fs from 'fs';
import path from 'path';
import axios from 'axios';

export interface FileLink {
    url: string;
    filename: string;
}

export class FileDownloader {
    constructor(
        private folderPath: string,
        private minDelayMs: number = 0,
        private maxDelayMs: number = 0
    ) {}

    private getRandomDelay(): number {
        return Math.floor(Math.random() * (this.maxDelayMs - this.minDelayMs + 1)) + this.minDelayMs;
    }

    private async delay(ms: number): Promise<void> {
        return new Promise(resolve => setTimeout(resolve, ms));
    }

    private async askUserConfirmation(message: string): Promise<boolean> {
        const rl = readline.createInterface({
            input: process.stdin,
            output: process.stdout,
        });

        return new Promise(resolve => {
            rl.question(message, answer => {
                rl.close();
                resolve(answer.trim().toLowerCase() === 'y');
            });
        });
    }

    private async downloadFile(fileLink: FileLink): Promise<{downloaded: boolean}> {
        const filePath = path.join(this.folderPath, fileLink.filename);

        try {
            const response = await axios.get(fileLink.url, { responseType: 'stream' });

            if (fs.existsSync(filePath)) {
                const existingFileSize = fs.statSync(filePath).size;
                const contentLengthHeader = response.headers["content-length"];
                const tempFileSize = contentLengthHeader ? parseInt(contentLengthHeader, 10) : null;
            
                if (tempFileSize === null) {
                    console.log("Download skipped: Existing file detected, but size comparison is not possible.");
                    return {downloaded: false};
                }
            
                console.log(`existingFileSize: ${existingFileSize}, tempFileSize: ${tempFileSize}`);
            
                if (existingFileSize === tempFileSize) {
                    console.log("Download skipped: File already exists and matches size.");
                    return {downloaded: false};
                }
            
                console.log("Existing file differs in size. Replacing...");
                fs.unlinkSync(filePath);
            }
    
            const writer = fs.createWriteStream(filePath);

            response.data.pipe(writer);

            await new Promise<void>((resolve, reject) => {
                writer.on('finish', resolve);
                writer.on('error', reject);
            });

            console.log('Downloaded');
            return {downloaded: true};
        } catch (error) {
            console.error(`Failed to download ${fileLink.url}:`, error);
            throw error;
        }

    }

    public async downloadAllFiles(fileLinks: FileLink[]): Promise<void> {
        if (!fs.existsSync(this.folderPath)) {
            fs.mkdirSync(this.folderPath, { recursive: true });
            console.log(`Folder created at ${this.folderPath}`);
        }

        for (let i = 0; i < fileLinks.length; i++) {
            const fileLink = fileLinks[i];
            console.log(`Starting download for file #${i + 1}: ${fileLink.filename}`);
            const {downloaded} = await this.downloadFile(fileLink);
            if (downloaded) {
                const delayTime = this.getRandomDelay();
                await this.delay(delayTime);
            }
        }

        console.log('All files downloaded successfully.');
    }

    public async confirmAndDownloadFiles(fileLinks: FileLink[]): Promise<void> {
        const confirmed = await this.askUserConfirmation(`Download ${fileLinks.length} file links? (y/n): `);

        if (confirmed) {
            try {
                await this.downloadAllFiles(fileLinks);
                console.log('All downloads complete.');
            } catch (error) {
                console.error('Error during download process:', error);
            }
        } else {
            console.log('File download cancelled by user.');
        }
    }
}