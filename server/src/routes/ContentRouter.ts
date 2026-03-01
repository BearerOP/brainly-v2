import { Request, Response, Router } from "express";
import { authMiddleware } from "../middleware/authMiddleware";
import { ContentSchema } from "../types/Schemas";
import { ContentModel, TagsModel } from "../db/db";
import { ProcessTags } from "../utils/ProcessTag";
import { QdrantDelete, QdrantSearch, QdrantUpsertPoints } from "../utils/QdrantProcessing";

export const ContentRouter = Router();

// Add New Content
ContentRouter.post('/', authMiddleware, async (req: Request, res: Response) => {
    try {
        const { success, data, error } = ContentSchema.safeParse(req.body);
        if (!success) {
            res.status(411).json({
                message: "Error in inputs",
                errors: error.errors,
            });
            return;
        }
        await ProcessTags(data.tags);

        // Upsert to Qdrant first with userId for per-user filtering
        await QdrantUpsertPoints(data, req.userId)

        // Get max position for this user to append at the end
        const maxContent = await ContentModel.findOne({ userId: req.userId }).sort({ position: -1 });
        const position = maxContent ? maxContent.position + 1 : 0;

        await ContentModel.create({
            contentId: data.contentId,
            link: data.link,
            type: data.type,
            title: data.title,
            tags: data.tags,
            createdAt: data.createdAt,
            position,
            metadata: data.metadata,
            extractedMetadata: data.extractedMetadata,
            userId: req.userId,
        });
        res.status(200).json({
            content: {
                link: data.link,
                type: data.type,
                title: data.title,
                tags: data.tags,
                contentId: data.contentId,
                createdAt: data.createdAt
            },
        });

    } catch (e) {
        res.status(500).json({
            message: "Internal Server Error",
            error: e,
        });
    }
});

// Get All Content
ContentRouter.get('/', authMiddleware, async (req: Request, res: Response) => {
    try {

        const allContent = await ContentModel.find({
            userId: req.userId,
        })
            .sort({ position: 1 }) // Use position for manual order
            .populate("userId", "username")
            .populate("tags", "title");

        res.status(200).json({
            allContent,
        });
    } catch (e) {
        res.status(500).json({
            message: "Internal Server Error",
            error: e,
        });
    }
});

// Delete a document
ContentRouter.delete('/', authMiddleware, async (req: Request, res: Response) => {
    try {
        const contentId = req.body.contentId;

        if (!contentId) {
            res.status(400).json({
                message: "Content ID is required for deletion",
            });
            return;
        }

        await ContentModel.deleteOne({
            contentId: contentId,
            userId: req.userId,
        });
        await QdrantDelete(contentId)
        res.status(200).json({
            message: "Deleted",
        });
    } catch (e) {
        res.status(500).json({
            message: "Internal Server Error",
            error: e,
        });
    }
});

// Update a document
ContentRouter.put('/', authMiddleware, async (req: Request, res: Response) => {
    try {
        const { success, data, error } = ContentSchema.safeParse(req.body);

        if (!success) {
            res.status(411).json({
                message: "Error in inputs",
                errors: error.errors,
            });
            return;
        }

        const contentId = req.body.contentId;

        if (!contentId) {
            res.status(400).json({
                message: "Content ID is required for updates",
            });
            return;
        }
        const updatedContent = await ContentModel.findOneAndUpdate(
            {
                contentId: contentId,
                userId: req.userId,
            },
            {
                link: data.link,
                type: data.type,
                title: data.title,
                tags: data.tags,
                extractedMetadata: data.extractedMetadata,
            },
            { new: true }
        );

        if (!updatedContent) {
            res.status(404).json({
                message: "Content not found or you're not authorized to update it",
            });
            return;
        }

        // @ts-ignore
        await QdrantUpsertPoints(data, req.userId)
        res.status(200).json({
            message: "Content updated successfully",
            updatedContent,
        });
    } catch (e) {
        console.error("Error updating content:", e);
        res.status(500).json({
            message: "Internal Server Error",
            error: e,
        });
    }
});

// Batch update positions for reordering
ContentRouter.put('/reorder', authMiddleware, async (req: Request, res: Response) => {
    try {
        const { positions } = req.body; // Array of { contentId, position }

        if (!Array.isArray(positions)) {
            res.status(400).json({ message: "Positions array is required" });
            return;
        }

        const bulkOps = positions.map((p: any) => ({
            updateOne: {
                filter: {
                    contentId: p.contentId,
                    userId: req.userId
                },
                update: { $set: { position: p.position } }
            }
        }));

        await ContentModel.bulkWrite(bulkOps);

        res.status(200).json({ message: "Order updated successfully" });
    } catch (e) {
        console.error("Error reordering content:", e);
        res.status(500).json({
            message: "Internal Server Error",
            error: e,
        });
    }
});

ContentRouter.post('/search', authMiddleware, async (req, res) => {
    try {
        const searchQuery = req.body.search
        if (!searchQuery) {
            res.status(400).json({ message: "Search query is required" });
            return;
        }

        // Pass raw string + userId — QdrantSearch handles embedding with correct inputType
        const qdrantIds = await QdrantSearch(searchQuery, req.userId) as string[];

        // Fetch full content from MongoDB using the IDs
        const documents = await ContentModel.find({
            contentId: { $in: qdrantIds }
        });

        // Reorder results to match Qdrant's relevance order and format for frontend
        const searchResults = qdrantIds.map(id => {
            const doc = documents.find(d => d.contentId === id);
            if (!doc) return null;
            return {
                contentId: doc.contentId,
                title: doc.title,
                link: doc.link,
                type: doc.type,
                tags: doc.tags,
                createdAt: doc.createdAt,
                extractedMetadata: doc.extractedMetadata,
            };
        }).filter(Boolean);

        res.status(200).json({
            search: searchResults || []
        });
    } catch (e) {
        console.error("Error searching content:", e);
        res.status(500).json({
            message: "Internal Server Error",
            error: e,
        });
    }
})
