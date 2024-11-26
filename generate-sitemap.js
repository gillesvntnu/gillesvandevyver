const { SitemapStream } = require('sitemap');
const { createWriteStream } = require('fs');
const { pipeline } = require('stream');
const { promisify } = require('util');

const links = [
    { url: '/', changefreq: 'daily', priority: 1.0 },
    { url: '/about', changefreq: 'weekly', priority: 0.8 },
    { url: '/contact', changefreq: 'monthly', priority: 0.7 },
    // Add more URLs as needed
];

const sitemap = new SitemapStream({ hostname: 'https://gillesvandevyver.com' });

const writeStream = createWriteStream('./public/sitemap.xml');

const pipelineAsync = promisify(pipeline);

(async () => {
    try {
        links.forEach(link => sitemap.write(link));
        sitemap.end();
        await pipelineAsync(sitemap, writeStream);
        console.log('Sitemap created successfully!');
    } catch (err) {
        console.error('Error creating sitemap:', err);
    }
})();