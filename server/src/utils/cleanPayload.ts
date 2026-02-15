import { ContentType } from "../types/Schemas";

export type CleanedPayload = {
    title: string;
    contentId: string;
    tagTitles: string[];
    description?: string;
};
export const cleanPayload = (data: ContentType): CleanedPayload => {
    const { title, tags, contentId, metadata } = data;

    // Extract only tag titles
    const tagTitles = tags.map(tag => tag.title);

    return {
        title,
        contentId,
        tagTitles,
        description: metadata?.description,
    };
};