import { Request, Response, Router } from "express";
import { authMiddleware } from "../middleware/authMiddleware";
import { extractMetadata, ExtractInput } from "../utils/MetadataExtractor";
import { fetchUrlContent } from "../utils/urlFetcher";
import { uploadImageFromUrl, uploadImageFromBase64 } from "../utils/S3Uploader";

export const ExtractRouter = Router();

/**
 * POST /v1/extract
 * Preview-only: Accepts a resource input (URL, text, or image), 
 * runs AI extraction, and returns structured metadata.
 */
ExtractRouter.post('/', authMiddleware, async (req: Request, res: Response) => {
    try {
        const { url, raw_content, user_tags, user_notes, base64_image, image_mime_type } = req.body;

        if (!url && !raw_content && !base64_image) {
            res.status(400).json({
                message: "Provide a url, raw_content, or base64_image to extract metadata from",
            });
            return;
        }

        let fetched_content = '';
        let preview_image: string | null = null;

        // Step 1: Handle URL-based content
        if (url) {
            console.log(`[ExtractRouter] Fetching content from: ${url}`);
            const result = await fetchUrlContent(url);
            fetched_content = result.text;
            preview_image = result.ogImage;

            const ytMatch = url.match(/(?:youtube\.com\/watch\?v=|youtu\.be\/)([^&\n?#]+)/);
            if (ytMatch) {
                preview_image = `https://img.youtube.com/vi/${ytMatch[1]}/mqdefault.jpg`;
            }
        }

        // Step 2: Handle Direct Image Upload
        if (base64_image && image_mime_type) {
            console.log(`[ExtractRouter] Direct image upload detected. MimeType: ${image_mime_type}`);
            const s3Url = await uploadImageFromBase64(base64_image, image_mime_type);
            if (s3Url) {
                preview_image = s3Url;
            }
        } else if (preview_image) {
            // Persist the OG image to S3 if it was found via URL
            console.log(`[ExtractRouter] Persisting OG image to S3: ${preview_image}`);
            const s3Url = await uploadImageFromUrl(preview_image);
            if (s3Url) {
                preview_image = s3Url;
            }
        }

        // Step 3: Build input and call AI extraction agent
        const input: ExtractInput = {
            url: url ?? undefined,
            raw_content: raw_content ?? undefined,
            user_tags: Array.isArray(user_tags) ? user_tags : [],
            user_notes: user_notes ?? undefined,
            fetched_content,
            image_base64: base64_image,
            image_mime_type: image_mime_type
        };

        console.log(`[ExtractRouter] Running extraction agent...`);
        const metadata = await extractMetadata(input);

        // Step 4: Finalize metadata
        if (preview_image) {
            (metadata as any).preview_image = preview_image;
        }

        // If it was a direct image upload, default source_type to 'image' if AI didn't catch it
        if (base64_image && !metadata.source_type) {
            metadata.source_type = 'image';
        }

        res.status(200).json({
            success: true,
            metadata,
        });

    } catch (error: any) {
        console.error('[ExtractRouter] Extraction failed:', error);

        const status = error.status || (error.response?.status === 429 ? 429 : 500);
        const message = status === 429
            ? "API rate limit exceeded. Please wait a moment and try again."
            : "Metadata extraction failed";

        res.status(status).json({
            success: false,
            message,
            error: error.message || String(error),
        });
    }
});
