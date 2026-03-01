import { S3Client, PutObjectCommand } from "@aws-sdk/client-s3";
import path from "path";
import { v4 as uuidv4 } from "uuid";

const s3Client = new S3Client({
    region: process.env.AWS_REGION || "ap-south-1",
    credentials: {
        accessKeyId: process.env.AWS_ACCESS_KEY_ID || "",
        secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY || "",
    },
});

/**
 * Downloads an image from a URL and uploads it to S3.
 * Returns the public S3 URL.
 */
export async function uploadImageFromUrl(imageUrl: string): Promise<string | null> {
    if (!imageUrl) return null;

    try {
        const response = await fetch(imageUrl);
        if (!response.ok) {
            console.error(`[S3Uploader] Failed to fetch image: ${response.statusText}`);
            return null;
        }

        const buffer = Buffer.from(await response.arrayBuffer());
        const contentType = response.headers.get("content-type") || "image/jpeg";

        // Generate a unique filename
        const extension = path.extname(new URL(imageUrl).pathname) || ".jpg";
        const fileName = `${uuidv4()}${extension}`;
        const bucket = process.env.AWS_S3_BUCKET || "querysecondbrain";
        const prefix = process.env.AWS_S3_PREFIX || "previews/";

        const key = `${prefix}${fileName}`;

        await s3Client.send(
            new PutObjectCommand({
                Bucket: bucket,
                Key: key,
                Body: buffer,
                ContentType: contentType,
                ACL: "public-read",
            })
        );

        // Construct the public URL
        const region = process.env.AWS_REGION || "ap-south-1";
        const encodedKey = key.split('/').map(segment => encodeURIComponent(segment)).join('/');
        const publicUrl = `https://${bucket}.s3.${region}.amazonaws.com/${encodedKey}`;

        console.log(`[S3Uploader] Successfully uploaded to: ${publicUrl}`);
        return publicUrl;

    } catch (error) {
        console.error("[S3Uploader] Error uploading image:", error);
        return null;
    }
}

/**
 * Uploads an image from a base64 string directly to S3.
 * Returns the public S3 URL.
 */
export async function uploadImageFromBase64(base64Data: string, mimeType: string): Promise<string | null> {
    if (!base64Data) return null;

    try {
        // Strip out the data:image/xxx;base64, prefix if present
        const base64Content = base64Data.includes("base64,")
            ? base64Data.split("base64,")[1]
            : base64Data;

        const buffer = Buffer.from(base64Content, 'base64');

        // Generate a unique filename
        const extension = mimeType.split('/')[1] || "jpg";
        const fileName = `${uuidv4()}.${extension}`;
        const bucket = process.env.AWS_S3_BUCKET || "querysecondbrain";
        const prefix = process.env.AWS_S3_PREFIX || "previews/";

        const key = `${prefix}${fileName}`;

        await s3Client.send(
            new PutObjectCommand({
                Bucket: bucket,
                Key: key,
                Body: buffer,
                ContentType: mimeType,
                ACL: "public-read",
            })
        );

        const region = process.env.AWS_REGION || "ap-south-1";
        const encodedKey = key.split('/').map(segment => encodeURIComponent(segment)).join('/');
        const publicUrl = `https://${bucket}.s3.${region}.amazonaws.com/${encodedKey}`;

        console.log(`[S3Uploader] Successfully uploaded base64 to: ${publicUrl}`);
        return publicUrl;

    } catch (error) {
        console.error("[S3Uploader] Error uploading base64 image:", error);
        return null;
    }
}
