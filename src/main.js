// For more information, see https://crawlee.dev/
import { Actor } from 'apify';
import { PlaywrightCrawler } from 'crawlee';
import winston from 'winston';
import pkg from 'proxy-chain';
const { ProxyChain } = pkg;
import promClient from 'prom-client';
import Joi from 'joi';
import { router } from './routes.js';

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

// Cấu hình proxy (bỏ comment và thay thế bằng proxy thật khi cần)
// const proxyUrl = await ProxyChain.anonymizeProxy('http://user:pass@proxy.example.com:8080');

const crawler = new PlaywrightCrawler({
    requestHandler: router,
    maxRequestsPerCrawl: 20,
    maxConcurrency: 5,
    maxRequestRetries: 3,
    // proxyUrl, // Bỏ comment khi cần dùng proxy
});

// Chạy crawler với URL ban đầu là trang danh mục
await crawler.run([
    {
        url: 'https://b2b.daisan.vn/gach-lat-nen-30x30-catalan-3345-432456.html',
        label: 'CATEGORY'
    }
]);

await Actor.exit();
