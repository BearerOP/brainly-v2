import * as cheerio from 'cheerio';

/**
 * Fetches raw text content from a URL for LLM context.
 * Returns cleaned text (max ~8000 chars). Returns empty string on failure.
 */
export const fetchUrlContent = async (url: string): Promise<string> => {
    if (!url || !url.startsWith('http')) return '';

    try {
        const response = await fetch(url, {
            headers: {
                'User-Agent': 'Mozilla/5.0 (compatible; BrainlyBot/1.0; +https://brainly.app)',
                'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
            },
            signal: AbortSignal.timeout(10000), // 10s timeout
        });

        if (!response.ok) {
            console.warn(`[urlFetcher] Failed to fetch ${url}: ${response.status}`);
            return '';
        }

        const contentType = response.headers.get('content-type') || '';

        // Only parse HTML/text responses
        if (!contentType.includes('text/html') && !contentType.includes('text/plain')) {
            return '';
        }

        const html = await response.text();
        const $ = cheerio.load(html);

        // Remove script, style, nav, footer noise
        $('script, style, nav, footer, header, aside, noscript, iframe, svg').remove();

        // Extract meta description as priority
        const metaDesc = $('meta[name="description"]').attr('content') || '';
        const ogTitle = $('meta[property="og:title"]').attr('content') || '';
        const ogDesc = $('meta[property="og:description"]').attr('content') || '';
        const pageTitle = $('title').text() || '';

        // Extract body text
        const bodyText = $('body').text()
            .replace(/\s+/g, ' ')
            .trim();

        // Compose context block
        const parts = [
            pageTitle && `Title: ${pageTitle}`,
            ogTitle && ogTitle !== pageTitle && `OG Title: ${ogTitle}`,
            metaDesc && `Description: ${metaDesc}`,
            ogDesc && ogDesc !== metaDesc && `OG Description: ${ogDesc}`,
            bodyText && `Content: ${bodyText}`,
        ].filter(Boolean);

        const combined = parts.join('\n\n');

        // Cap at ~8000 chars to stay within LLM context limits
        return combined.slice(0, 8000);

    } catch (error) {
        console.warn(`[urlFetcher] Error fetching ${url}:`, error instanceof Error ? error.message : error);
        return '';
    }
};
