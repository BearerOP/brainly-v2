import * as cheerio from 'cheerio';

export interface FetchResult {
    text: string;
    ogImage: string | null;
}

/**
 * Fetches URL content for LLM context AND extracts the best available preview image.
 * Returns { text (max ~8000 chars), ogImage (url or null) }
 */
export const fetchUrlContent = async (url: string): Promise<FetchResult> => {
    if (!url || !url.startsWith('http')) return { text: '', ogImage: null };

    // For direct image URLs — return the URL itself as the preview
    if (/\.(jpg|jpeg|png|gif|webp|svg|avif)(\?.*)?$/i.test(url)) {
        return { text: '', ogImage: url };
    }

    try {
        const response = await fetch(url, {
            headers: {
                'User-Agent': 'Mozilla/5.0 (compatible; BrainlyBot/1.0; +https://brainly.app)',
                'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
            },
            signal: AbortSignal.timeout(10000),
        });

        if (!response.ok) {
            console.warn(`[urlFetcher] Failed to fetch ${url}: ${response.status}`);
            return { text: '', ogImage: null };
        }

        const contentType = response.headers.get('content-type') || '';
        if (!contentType.includes('text/html') && !contentType.includes('text/plain')) {
            return { text: '', ogImage: null };
        }

        const html = await response.text();
        const $ = cheerio.load(html);

        // ── Extract preview image (priority order) ──────────────────────────
        const ogImage =
            $('meta[property="og:image"]').attr('content') ||
            $('meta[name="twitter:image"]').attr('content') ||
            $('meta[property="og:image:url"]').attr('content') ||
            $('link[rel="image_src"]').attr('href') ||
            null;

        // Resolve relative URLs
        const resolvedOgImage = ogImage
            ? ogImage.startsWith('http')
                ? ogImage
                : new URL(ogImage, url).href
            : null;

        // ── Extract text content ─────────────────────────────────────────────
        $('script, style, nav, footer, header, aside, noscript, iframe, svg').remove();

        const metaDesc = $('meta[name="description"]').attr('content') || '';
        const ogTitle = $('meta[property="og:title"]').attr('content') || '';
        const ogDesc = $('meta[property="og:description"]').attr('content') || '';
        const pageTitle = $('title').text() || '';
        const bodyText = $('body').text().replace(/\s+/g, ' ').trim();

        const parts = [
            pageTitle && `Title: ${pageTitle}`,
            ogTitle && ogTitle !== pageTitle && `OG Title: ${ogTitle}`,
            metaDesc && `Description: ${metaDesc}`,
            ogDesc && ogDesc !== metaDesc && `OG Description: ${ogDesc}`,
            bodyText && `Content: ${bodyText}`,
        ].filter(Boolean);

        return {
            text: parts.join('\n\n').slice(0, 8000),
            ogImage: resolvedOgImage,
        };

    } catch (error) {
        console.warn(`[urlFetcher] Error fetching ${url}:`, error instanceof Error ? error.message : error);
        return { text: '', ogImage: null };
    }
};

