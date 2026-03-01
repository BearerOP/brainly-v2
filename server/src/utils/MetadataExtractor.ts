import { GoogleGenerativeAI } from '@google/generative-ai';
import Groq from 'groq-sdk';

const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY!);
const groq = new Groq({ apiKey: process.env.GROQ_API_KEY });

export interface ExtractInput {
    url?: string;
    raw_content?: string;
    user_tags?: string[];
    user_notes?: string;
    fetched_content?: string;
    image_base64?: string;
    image_mime_type?: string;
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
    preview_image?: string | null;
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

Analyze everything provided (including the image if attached) and extract structured metadata.

Important rules:
- If an image is provided: Perform OCR to extract visible text and analyze visual elements (charts, people, mood).
- User-provided tags and notes are ground truth — treat them as high-confidence signals.
- Merge user tags with your own inferred tags, do not drop user tags.
- All fields you return will be shown to the user for review and editing — keep values clean and concise.

## OUTPUT

Return a valid JSON object with exactly these fields:

### Identity
- title: Best title for this resource (string, never null)
- source_type: One of: article | blog | video | image | social_post | tweet | reel | pdf | note | product | research_paper | news | podcast | other
- platform: Platform or site name (e.g. YouTube, X, Medium, Reddit, Upload, unknown)
- author: Author or creator name (string or null)
- published_date: Publication date in YYYY-MM-DD format if detectable (or null)
- language: Language of the content (e.g. "English")

### Content
- summary: 2-4 sentence neutral summary of what this resource is. For images, describe what is happening or what the document contains.
- main_topic: Single sentence describing the core subject
- key_points: Array of 3-8 key insights or text extracted via OCR (strings)
- content_snippet: 1-2 sentence excerpt suitable for a search card

### Classification
- tags: Merged array of user-provided tags + your inferred tags (10-20 total, lowercase)
- categories: Broad categories max 3 (e.g. Technology, Health, Finance, Science, Lifestyle)
- topics: Specific subject areas covered
- entities: Named entities {name, type} where type is: person|company|product|place|event|tool|other
- keywords: 10-20 search keywords
- intent: One of: educational | opinion | tutorial | news | research | entertainment | promotional | other
- sentiment: One of: positive | negative | neutral | mixed

### Source-specific
- source_specific: Object with relevant extra fields based on source_type:
  - image: { visual_description, text_in_image, mood, orientation, resolution_hint }
  - video: { duration, channel_name, transcript_summary }
  - article: { reading_time_minutes, has_code, has_data_stats }

### Embedding
- embedding_text: Dense 200-500 word natural language block. Weave in title, summary, topics, and OCR text. Optimized for semantic search.

### Editable hints
- _editable: { "title": true, "summary": true, "main_topic": true, "key_points": true, "tags": true, "categories": true, "topics": true, "author": true, "published_date": true, "sentiment": true, "intent": true, "entities": true, "content_snippet": true, "source_type": true, "platform": false, "language": false, "keywords": false, "embedding_text": false }

## GUIDELINES
- Return only valid JSON. No markdown fences.`;

export const extractMetadata = async (input: ExtractInput): Promise<ExtractedMetadata> => {
    const userInput = JSON.stringify({
        url: input.url ?? null,
        raw_content: input.raw_content ?? null,
        user_tags: input.user_tags ?? [],
        user_notes: input.user_notes ?? null,
        fetched_content: input.fetched_content ? input.fetched_content.slice(0, 6000) : null,
    }, null, 2);

    const prompt = `${EXTRACTION_PROMPT}\n\n## INPUT\n\n${userInput}`;

    // Try Gemini first
    try {
        console.log('[MetadataExtractor] Attempting extraction with Gemini...');
        if (!process.env.GEMINI_API_KEY) throw new Error('GEMINI_API_KEY missing');

        // Note: Using 2.0-flash for reliability
        const model = genAI.getGenerativeModel({
            model: 'gemini-2.0-flash',
            generationConfig: {
                responseMimeType: 'application/json',
                temperature: 0.2,
            },
        });

        const parts: any[] = [{ text: prompt }];
        if (input.image_base64 && input.image_mime_type) {
            parts.push({
                inlineData: {
                    data: input.image_base64,
                    mimeType: input.image_mime_type
                }
            });
        }

        const result = await model.generateContent(parts);
        const text = result.response.text();
        return JSON.parse(text);

    } catch (geminiError) {
        console.error('[MetadataExtractor] Gemini failed, falling back to Groq:', geminiError);

        if (!process.env.GROQ_API_KEY) {
            throw new Error('Both Gemini and Groq providers failed or are unconfigured.');
        }

        try {
            console.log('[MetadataExtractor] Attempting extraction with Groq (Llama 3.2 Vision)...');

            const messages: any[] = [
                { role: 'system', content: 'You are a metadata extraction expert. Return only valid JSON.' }
            ];

            if (input.image_base64 && input.image_mime_type) {
                messages.push({
                    role: 'user',
                    content: [
                        { type: 'text', text: prompt },
                        {
                            type: 'image_url',
                            image_url: { url: `data:${input.image_mime_type};base64,${input.image_base64}` }
                        }
                    ]
                });
            } else {
                messages.push({ role: 'user', content: prompt });
            }

            const completion = await groq.chat.completions.create({
                messages,
                model: input.image_base64 ? 'llama-3.2-90b-vision-preview' : 'llama-3.3-70b-versatile',
                response_format: { type: 'json_object' },
                temperature: 0.2,
            });

            const content = completion.choices[0]?.message?.content;
            if (!content) throw new Error('Groq returned empty content');

            return JSON.parse(content);

        } catch (groqError) {
            console.error('[MetadataExtractor] Groq also failed:', groqError);
            throw groqError;
        }
    }
};
