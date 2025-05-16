// For more information, see https://crawlee.dev/
import { Actor } from 'apify';
import { PlaywrightCrawler, log } from 'crawlee';

await Actor.init();


// Bước 1: Crawl trang danh mục để lấy link sản phẩm
const productLinks = [];

const categoryCrawler = new PlaywrightCrawler({
    async requestHandler({ page, log }) {
        log.info('Đang lấy danh sách link sản phẩm...');
        await page.waitForLoadState('networkidle');
        // Lấy tất cả link sản phẩm từ trang danh mục
        const links = await page.$$eval('a', as =>
            as.map(a => a.href).filter(href =>
                href.includes('/gach-') && href.includes('.html')
            )
        );
        // Loại bỏ trùng lặp
        links.forEach(link => {
            if (!productLinks.includes(link)) productLinks.push(link);
        });
        log.info(`Tìm thấy ${productLinks.length} link sản phẩm.`);
    },
    maxRequestsPerCrawl: 1,
    maxConcurrency: 1,
});

await categoryCrawler.run(['https://b2b.daisan.vn/gach-lat-nen-30x30-catalan-3345-432456.html']);

// Bước 2: Crawl từng trang detail để lấy thông tin
const detailCrawler = new PlaywrightCrawler({
    async requestHandler({ page, request, log, pushData }) {
        log.info(`Đang xử lý: ${request.url}`);
        await page.waitForLoadState('networkidle');
        try {
            const name = await page.$eval('h1', el => el.textContent.trim()).catch(() => null);
            let price = null;
            price = await page.$eval('.price', el => el.textContent.trim()).catch(() => null);
            if (!price) {
                price = await page.$eval('span.price', el => el.textContent.trim()).catch(() => null);
            }
            if (!price) {
                const priceHandles = await page.$$('span,div');
                for (const handle of priceHandles) {
                    const text = await handle.textContent();
                    if (text && text.includes('đ')) {
                        price = text.trim();
                        break;
                    }
                }
            }
            const productData = { url: request.url, name, price };
            // Ghi vào file output.json

            pushData(productData);

            // if (!isFirst) {
            //     fs.appendFileSync('output.json', ',\n');
            // }
            // fs.appendFileSync('output.json', JSON.stringify(productData, null, 2));
            // isFirst = false;
            // log.info(`Đã lưu: ${JSON.stringify(productData)}`);
        } catch (error) {
            log.error(`Lỗi khi xử lý trang ${request.url}: ${error.message}`);
        }
    },
    maxRequestsPerCrawl: 20,
    maxConcurrency: 5,
    maxRequestRetries: 3,
});

await detailCrawler.run(productLinks);
await Actor.exit();
