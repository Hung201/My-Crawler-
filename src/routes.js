import { createPlaywrightRouter } from 'crawlee';
import winston from 'winston';
import Joi from 'joi';
import pkg from 'proxy-chain';
const { ProxyChain } = pkg;

// Schema validation
const productSchema = Joi.object({
    url: Joi.string().uri().required(),
    name: Joi.string().required(),
    price: Joi.string().required()
});

// Logger
const logger = winston.createLogger({
    level: 'info',
    format: winston.format.json(),
    transports: [
        new winston.transports.File({ filename: 'error.log', level: 'error' }),
        new winston.transports.File({ filename: 'combined.log' })
    ]
});

// Cấu hình proxy (bỏ comment và thay thế bằng proxy thật khi cần)
// const proxyUrl = await ProxyChain.anonymizeProxy('http://user:pass@proxy.example.com:8080');

export const router = createPlaywrightRouter();

// Xử lý trang danh mục
router.addHandler('CATEGORY', async ({ page, log, enqueueLinks }) => {
    log.info('Đang lấy danh sách link sản phẩm...');
    await page.waitForLoadState('networkidle');

    // Lấy tất cả link sản phẩm
    const links = await page.$$eval('a', as =>
        as.map(a => a.href)
            .filter(href => href.includes('/gach-') && href.includes('.html'))
    );

    // Enqueue các link sản phẩm với label DETAIL
    await enqueueLinks({
        urls: links,
        label: 'DETAIL',
    });

    log.info(`Đã tìm thấy ${links.length} link sản phẩm.`);
});

// Xử lý trang chi tiết sản phẩm
router.addHandler('DETAIL', async ({ page, request, log, pushData }) => {
    log.info(`Đang xử lý: ${request.url}`);
    await page.waitForLoadState('networkidle');

    try {
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

        // Lưu dữ liệu
        pushData(value);
        logger.info(`Đã lưu sản phẩm: ${value.name}`);

    } catch (error) {
        logger.error(`Lỗi khi xử lý trang ${request.url}: ${error.message}`);
    }
}); 