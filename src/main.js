// For more information, see https://crawlee.dev/
import { Actor } from 'apify';
import { PlaywrightCrawler } from 'crawlee';
import winston from 'winston';
import pkg from 'proxy-chain';
const { ProxyChain } = pkg;
import promClient from 'prom-client';
import Joi from 'joi';

// Cấu hình logger
const logger = winston.createLogger({
    level: 'info',
    format: winston.format.json(),
    transports: [
        new winston.transports.File({ filename: 'error.log', level: 'error' }),
        new winston.transports.File({ filename: 'combined.log' })
    ]
});

// Schema validation
const productSchema = Joi.object({
    url: Joi.string().uri().required(),
    name: Joi.string().required(),
    price: Joi.string().required()
});

// Metrics
const crawlDuration = new promClient.Histogram({
    name: 'crawl_duration_seconds',
    help: 'Duration of crawling in seconds'
});

await Actor.init();

// Sử dụng Set để lưu trữ links
const productLinks = new Set();

const categoryCrawler = new PlaywrightCrawler({
    async requestHandler({ page, log }) {
        const timer = crawlDuration.startTimer();
        try {
            log.info('Đang lấy danh sách link sản phẩm...');
            await page.waitForLoadState('networkidle');

            const links = await page.$$eval('a', as =>
                as.map(a => a.href)
                    .filter(href => href.includes('/gach-') && href.includes('.html'))
            );

            // Thêm vào Set (tự động loại bỏ trùng lặp)
            links.forEach(link => productLinks.add(link));

            log.info(`Tìm thấy ${productLinks.size} link sản phẩm.`);
        } catch (error) {
            logger.error(`Lỗi khi crawl danh mục: ${error.message}`);
        } finally {
            timer();
        }
    },
    maxRequestsPerCrawl: 1,
    maxConcurrency: 1,
});

// Cấu hình proxy (bỏ comment và thay thế bằng proxy thật khi cần)
// const proxyUrl = await ProxyChain.anonymizeProxy('http://user:pass@proxy.example.com:8080');

const detailCrawler = new PlaywrightCrawler({
    async requestHandler({ page, request, log, pushData }) {
        const timer = crawlDuration.startTimer();
        try {
            log.info(`Đang xử lý: ${request.url}`);
            await page.waitForLoadState('networkidle');

            const name = await page.$eval('h1', el => el.textContent.trim()).catch(() => null);
            let price = null;

            // Logic lấy price
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

            // Validate dữ liệu
            const { error, value } = productSchema.validate(productData);
            if (error) {
                logger.error(`Validation error: ${error.message}`);
                return;
            }

            // Lưu dữ liệu đã validate
            pushData(value);
            logger.info(`Đã lưu sản phẩm: ${value.name}`);

        } catch (error) {
            logger.error(`Lỗi khi xử lý trang ${request.url}: ${error.message}`);
        } finally {
            timer();
        }
    },
    maxRequestsPerCrawl: 20,
    maxConcurrency: 5,
    maxRequestRetries: 3,
    // proxyUrl, // Bỏ comment khi cần dùng proxy
});

await categoryCrawler.run(['https://b2b.daisan.vn/gach-lat-nen-30x30-catalan-3345-432456.html']);
await detailCrawler.run([...productLinks]);
await Actor.exit();
