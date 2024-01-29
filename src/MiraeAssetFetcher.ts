import { FileLinkFetcher } from './lib/FileLinkFetcher';

// const SOURCE_CONFIG = { sourceName: "미래에셋증권", categoryId: "1525", categoryName: "산업분석" };
const SOURCE_CONFIG = {sourceName: "미래에셋증권", categoryId: "1800", categoryName: "기업분석"};
const BASE_URL = `https://securities.miraeasset.com/bbs/board/message/list.do?categoryId={categoryId}&searchType=2&searchStartYear={searchStartYear}&searchStartMonth={searchStartMonth}&searchStartDay={searchStartDay}&searchEndYear={searchEndYear}&searchEndMonth={searchEndMonth}&searchEndDay={searchEndDay}&listType=1&startId=zzzzz~&startPage=1&curPage={curPage}&direction=1`;
const START_DATE = { year: 2024, month: 1, day: 1 }
const END_DATE = { year: 2024, month: 5, day: 31 }
const START_PAGE = 1;
const MAX_ITEMS_PER_PAGE = 10;
const DOWNLOAD_PATTERN = /https?:\/\/[^\s"']+\.pdf(\?[^\s"']+)?/;

const fileLinkFetcher = new FileLinkFetcher(
    BASE_URL,
    SOURCE_CONFIG,
    START_DATE,
    END_DATE,
    START_PAGE,
    MAX_ITEMS_PER_PAGE,
    DOWNLOAD_PATTERN,
    0,
    500
);

async function startDownloadProcess() {
    try {
        await fileLinkFetcher.fetchAndDownloadFileLinks();
        console.log('Download process completed.');
    } catch (error) {
        console.error('Error during download process:', error);
    }
}

startDownloadProcess();