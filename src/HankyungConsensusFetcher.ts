import { FileLinkFetcher } from './lib/FileLinkFetcher';

// const SOURCE_CONFIG = {sourceName: "한경컨센서스", categoryId: "IN", categoryName: "산업분석"};
const SOURCE_CONFIG = {sourceName: "한경컨센서스", categoryId: "CO", categoryName: "기업분석"};
const BASE_URL = `https://consensus.hankyung.com/analysis/list?&sdate={searchStartYear}-{searchStartMonth}-{searchStartDay}&edate={searchEndYear}-{searchEndMonth}-{searchEndDay}&report_type=${SOURCE_CONFIG.categoryId}&pagenum={maxItemsPerPage}&order_type=&now_page={curPage}`;
const START_DATE = { year: 2024, month: 1, day: 1 }
const END_DATE = { year: 2024, month: 5, day: 31 }
const START_PAGE = 1;
const MAX_ITEMS_PER_PAGE = 80;
const DOWNLOAD_PATTERN = /\/analysis\/downpdf\?[^"']*/;

const fileLinkFetcher = new FileLinkFetcher(
    BASE_URL,
    SOURCE_CONFIG,
    START_DATE,
    END_DATE,
    START_PAGE,
    MAX_ITEMS_PER_PAGE,
    DOWNLOAD_PATTERN,
    0,
    3000
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