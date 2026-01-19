import { QdrantClient, QdrantClientUnexpectedResponseError } from "@qdrant/js-client-rest";
import { ContentType } from "../types/Schemas";
import { cleanPayload } from "./cleanPayload";
import { getEmbeddings } from "./TextEmbeddings";

const client = new QdrantClient({ 
    url: process.env.QDRANT_URL,
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
        const collectionInfo = await client.getCollection(COLLECTION_NAME);
        console.log(`Collection "${COLLECTION_NAME}" already exists`);
    } catch (error: any) {
        // Collection doesn't exist, create it
        if (error.status === 404 || error.message?.includes('404') || error.message?.includes('Not Found')) {
            console.log(`Collection "${COLLECTION_NAME}" not found. Creating...`);
            try {
                await client.createCollection(COLLECTION_NAME, {
                    vectors: {
                        size: VECTOR_SIZE,
                        distance: "Cosine"
                    }
                });
                console.log(`Collection "${COLLECTION_NAME}" created successfully`);
            } catch (createError) {
                console.error(`Error creating collection "${COLLECTION_NAME}":`, createError);
                throw createError;
            }
        } else {
            // Some other error occurred
            console.error(`Error checking collection "${COLLECTION_NAME}":`, error);
            throw error;
        }
    }
};

export const QdrantUpsertPoints = async(data: ContentType ) => {
    const payload = cleanPayload(data)
    const embeddings = await getEmbeddings(payload)
    try {
        // Ensure collection exists before upserting
        await ensureCollectionExists();
        
        console.log(embeddings, 'embeddings');
        
        await client.upsert(COLLECTION_NAME, {
            points: [{
                id: data.contentId,  
                payload: payload,
                vector: embeddings,  
            }]
        });
        console.log("Qdrant Created id: ", data.contentId)
        return;
      } catch (error) {
        console.error("Error upserting points:", error);
        throw error;
        }
}

export const QdrantSearch = async (embeddings : number[]) => {
    try{
        // Ensure collection exists before searching
        await ensureCollectionExists();
        
        const response = await client.search(COLLECTION_NAME, {
            vector: embeddings,
            limit: 3
        })
        return response.map(response => response.id)
    } catch(error){
        console.error("Error searching for points:", error);
        throw error;
    }
}

export const QdrantDelete = async(contentId: string) => {
    try{
        // Ensure collection exists before deleting
        await ensureCollectionExists();
        
        await client.delete(COLLECTION_NAME, {
            points: [contentId]
        })
        console.log("Qdrant Deleting id: ", contentId)
        return;
    } catch (error){
        console.error("Error deleting points:", error);
        throw error;
    }
}