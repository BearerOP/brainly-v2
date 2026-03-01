import { Request, Response, Router } from "express";
import { authMiddleware } from "../middleware/authMiddleware";
import { extractMetadata, ExtractInput } from "../utils/MetadataExtractor";
import { fetchUrlContent } from "../utils/urlFetcher";

export const ExtractRouter = Router();

/**
 * POST /v1/extract
 * Preview-only: Accepts a resource input, runs AI extraction, returns structured metadata.
 * Does NOT write to DB — that happens when user confirms in the modal.
 */
ExtractRouter.post('/', authMiddleware, async (req: Request, res: Response) => {
    try {
        const { url, raw_content, user_tags, user_notes } = req.body;

        if (!url && !raw_content) {
            res.status(400).json({
                message: "Provide either a url or raw_content to extract metadata from",
            });
            return;
        }

        // Step 1: Fetch page content if URL provided
        let fetched_content = '';
        if (url) {
            console.log(`[ExtractRouter] Fetching content from: ${url}`);
            fetched_content = await fetchUrlContent(url);
        }

        // Step 2: Build input and call Gemini extraction agent
        const input: ExtractInput = {
            url: url ?? undefined,
            raw_content: raw_content ?? undefined,
            user_tags: Array.isArray(user_tags) ? user_tags : [],
            user_notes: user_notes ?? undefined,
            fetched_content,
        };

        console.log(`[ExtractRouter] Running extraction agent...`);
        const metadata = await extractMetadata(input);

        res.status(200).json({
            success: true,
            metadata,
        });

    } catch (error) {
        console.error('[ExtractRouter] Extraction failed:', error);
        res.status(500).json({
            success: false,
            message: "Metadata extraction failed",
            error: error instanceof Error ? error.message : String(error),
        });
    }
});
