import { ContentType } from "../types/Schemas";

export type CleanedPayload = {
    title: string;
    contentId: string;
    tagTitles: string[];
    description?: string;
    embeddingText?: string;
};

export const cleanPayload = (data: ContentType): CleanedPayload => {
    const { title, tags, contentId, metadata, extractedMetadata } = data;

    // Extract only tag titles
    const tagTitles = tags.map(tag => tag.title);

    return {
        title,
        contentId,
        tagTitles,
        description: metadata?.description,
        // Rich embedding text from AI extraction — takes priority in embedding generation
        embeddingText: extractedMetadata?.embedding_text,
    };
};