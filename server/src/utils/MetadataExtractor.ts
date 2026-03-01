import { GoogleGenerativeAI, SchemaType } from '@google/generative-ai';

const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY!);

export interface ExtractInput {
    url?: string;
    raw_content?: string;
    user_tags?: string[];
    user_notes?: string;
    fetched_content?: string;
}

export interface EntityItem {
    name: string;
    type: 'person' | 'company' | 'product' | 'place' | 'event' | 'tool' | 'other';
}

export interface ExtractedMetadata {
    // Identity
    title: string;
    source_type: string;
    platform: string;
    author: string | null;
    published_date: string | null;
    language: string;
    // Content
    summary: string;
    main_topic: string;
    key_points: string[];
    content_snippet: string;
    // Classification
    tags: string[];
    categories: string[];
    topics: string[];
    entities: EntityItem[];
    keywords: string[];
    intent: string;
    sentiment: string;
    // Source-specific extra fields
    source_specific: Record<string, unknown>;
    // Embedding (internal use)
    embedding_text: string;
    // Which fields the user can edit
    _editable: Record<string, boolean>;
}

const EXTRACTION_PROMPT = `You are a universal content intelligence agent. Your job is to analyze any given resource and extract rich, structured metadata optimized for semantic search and vector embedding.

## INPUT YOU WILL RECEIVE

{
  "url": "<the resource URL or null>",
  "raw_content": "<pasted text, post content, or null>",
  "user_tags": ["<tags the user already added>"],
  "user_notes": "<any notes or description the user added, or null>",
  "fetched_content": "<HTML, transcript, OCR output, or scraped text if available>"
}

## YOUR TASK

Analyze everything provided and extract structured metadata.

Important rules:
- User-provided tags and notes are ground truth — treat them as high-confidence signals about what this resource is about
- Merge user tags with your own inferred tags, do not drop user tags
- If user_notes exist, factor them heavily into your summary and topics
- All fields you return will be shown to the user for review and editing — keep values clean, readable, and concise
- Avoid technical jargon in field values unless the content itself is technical

## OUTPUT

Return a valid JSON object with exactly these fields:

### Identity
- title: Best title for this resource (string, never null)
- source_type: One of: article | blog | video | image | social_post | tweet | reel | pdf | note | product | research_paper | news | podcast | other
- platform: Platform or site name (e.g. YouTube, X, Medium, Reddit, unknown)
- author: Author or creator name (string or null)
- published_date: Publication date in YYYY-MM-DD format if detectable (or null)
- language: Language of the content (e.g. "English")

### Content
- summary: 2-4 sentence neutral summary of what this resource is and why it matters
- main_topic: Single sentence describing the core subject
- key_points: Array of 3-8 key insights, facts, or takeaways (strings)
- content_snippet: 1-2 sentence excerpt or paraphrase suitable for showing in a search result card

### Classification
- tags: Merged array of user-provided tags + your inferred tags (10-20 total, deduplicated, lowercase, no special chars)
- categories: Broad categories max 3 (e.g. Technology, Health, Finance, Science, Lifestyle)
- topics: Specific subject areas covered (5-15 items, more granular than categories)
- entities: Named entities as array of {name, type} where type is one of: person|company|product|place|event|tool|other
- keywords: 10-20 high-signal search keywords and phrases
- intent: One of: educational | opinion | tutorial | news | research | entertainment | promotional | other
- sentiment: One of: positive | negative | neutral | mixed

### Source-specific
- source_specific: Object with relevant extra fields based on source_type:
  - video: { duration, channel_name, transcript_summary }
  - social_post/tweet: { post_text, hashtags, mentions, media_type }
  - image: { visual_description, text_in_image, mood }
  - article/blog: { reading_time_minutes, has_code, has_data_or_stats }
  - research_paper: { abstract, methodology, findings }
  - podcast: { episode_title, guest_names, episode_number }

### Embedding
- embedding_text: Dense 200-500 word natural language block combining all key information. Weave in title, summary, topics, key points, entities, and keywords. Optimized for semantic similarity search. Write as coherent prose, not a list. Think like a librarian indexing this for the world's best search engine.

### Editable hints
- _editable: Object mapping field names to booleans indicating user-editability:
  { "title": true, "summary": true, "main_topic": true, "key_points": true, "tags": true, "categories": true, "topics": true, "author": true, "published_date": true, "sentiment": true, "intent": true, "entities": true, "content_snippet": true, "source_type": true, "platform": false, "language": false, "keywords": false, "embedding_text": false }

## GUIDELINES

- Never return null for title, summary, tags, topics, or embedding_text — always generate a best guess
- If the URL is inaccessible or fetched_content is empty, infer what you can from URL structure, domain, and path
- embedding_text should be written as if a librarian is describing this resource — maximize semantic coverage
- Think about what terms a user would type 6 months from now trying to rediscover this resource
- Return only valid JSON — no markdown fences, no explanation outside the JSON`;

export const extractMetadata = async (input: ExtractInput): Promise<ExtractedMetadata> => {
    const model = genAI.getGenerativeModel({
        model: 'gemini-2.5-flash',
        generationConfig: {
            responseMimeType: 'application/json',
            temperature: 0.2,
        },
    });

    const userInput = JSON.stringify({
        url: input.url ?? null,
        raw_content: input.raw_content ?? null,
        user_tags: input.user_tags ?? [],
        user_notes: input.user_notes ?? null,
        fetched_content: input.fetched_content ? input.fetched_content.slice(0, 6000) : null,
    }, null, 2);

    const prompt = `${EXTRACTION_PROMPT}\n\n## INPUT\n\n${userInput}`;

    const result = await model.generateContent(prompt);
    const text = result.response.text();

    // Parse JSON — Gemini with responseMimeType=json should return clean JSON
    const parsed: ExtractedMetadata = JSON.parse(text);
    return parsed;
};
