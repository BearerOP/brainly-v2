import { QdrantClient } from "@qdrant/js-client-rest";
import { ContentType } from "../types/Schemas";
import { cleanPayload } from "./cleanPayload";
import { getEmbeddings } from "./TextEmbeddings";

// Qdrant Cloud: use HTTPS without port (defaults to 443). Port 6333 returns 404 over HTTPS.
const rawUrl = process.env.QDRANT_URL ?? '';
const qdrantUrl = rawUrl.startsWith('https://') && rawUrl.includes(':6333')
    ? rawUrl.replace(/:6333\/?$/, '')
    : rawUrl;
const client = new QdrantClient({
    url: qdrantUrl,
    apiKey: process.env.QDRANT_KEY
})

const COLLECTION_NAME = "brainly";
// Cohere embed-english-v3.0 produces 1024-dimensional vectors
const VECTOR_SIZE = 1024;

/**
 * Ensures the Qdrant collection exists, creating it if necessary
 */
const ensureCollectionExists = async (): Promise<void> => {
    try {
        const response = await client.getCollections();
        const collectionNames = response.collections.map(c => c.name);

        if (!collectionNames.includes(COLLECTION_NAME)) {
            console.log(`Collection "${COLLECTION_NAME}" not found. Creating...`);
            await client.createCollection(COLLECTION_NAME, {
                vectors: {
                    size: VECTOR_SIZE,
                    distance: "Cosine"
                }
            });
            console.log(`Collection "${COLLECTION_NAME}" created successfully`);
        }
    } catch (error: any) {
        console.error(`Error ensuring collection "${COLLECTION_NAME}":`, error);
        throw error;
    }

    // Ensure userId is indexed for filtering
    try {
        await client.createPayloadIndex(COLLECTION_NAME, {
            field_name: "userId",
            field_schema: "keyword",
        });
        console.log(`Payload index for "userId" verified/created`);
    } catch (error) {
        // Ignore if index already exists
    }
};


export const QdrantUpsertPoints = async (data: ContentType, userId?: string) => {
    const payload = cleanPayload(data);

    // Build a rich Qdrant payload so filtering and payload-based search are possible
    const qdrantPayload: Record<string, any> = {
        ...payload,
        userId: userId ?? null,
        type: data.type,
        link: data.link,
    };

    // Include all AI-extracted fields for potential payload-based filtering later
    if (data.extractedMetadata) {
        const em = data.extractedMetadata as any;
        qdrantPayload.summary = em.summary ?? null;
        qdrantPayload.main_topic = em.main_topic ?? null;
        qdrantPayload.topics = em.topics ?? [];
        qdrantPayload.tags_ai = em.tags ?? [];
        qdrantPayload.source_type = em.source_type ?? null;
        qdrantPayload.sentiment = em.sentiment ?? null;
        qdrantPayload.intent = em.intent ?? null;
    }

    const embeddings = await getEmbeddings(payload, 'search_document');

    try {
        await ensureCollectionExists();
        await client.upsert(COLLECTION_NAME, {
            points: [{
                id: data.contentId,
                payload: qdrantPayload,
                vector: embeddings,
            }]
        });
        console.log("Qdrant upserted id:", data.contentId);
        return;
    } catch (error) {
        console.error("Error upserting points:", error);
        throw error;
    }
}

/**
 * Semantic search in Qdrant.
 * @param query     Raw search string (will be embedded as search_query)
 * @param userId    Optional — filter results to this user only
 * @param limit     Max results to return (default 20)
 */
export const QdrantSearch = async (
    query: string,
    userId?: string,
    limit = 20
) => {
    try {
        await ensureCollectionExists();

        // Embed the query as 'search_query' — MUST match Cohere's asymmetric retrieval spec
        const embeddings = await getEmbeddings(query, 'search_query');

        const searchParams: any = {
            vector: embeddings,
            limit,
            with_payload: false,
        };

        // Filter by userId if provided (avoids cross-user leakage)
        if (userId) {
            searchParams.filter = {
                must: [{ key: 'userId', match: { value: userId } }]
            };
        }

        const response = await client.search(COLLECTION_NAME, searchParams);
        return response.map(r => r.id);
    } catch (error) {
        console.error("Error searching for points:", error);
        throw error;
    }
}

export const QdrantDelete = async (contentId: string) => {
    try {
        await ensureCollectionExists();
        await client.delete(COLLECTION_NAME, {
            points: [contentId]
        })
        console.log("Qdrant Deleted id:", contentId);
        return;
    } catch (error) {
        console.error("Error deleting points:", error);
        throw error;
    }
}