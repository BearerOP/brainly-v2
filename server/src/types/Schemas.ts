import { z } from "zod";
import { contentTypes } from "../db/db";

const tagSchema = z.object({
    tagId: z.string(),
    title: z
        .string()
        .toLowerCase()
        .trim()
        .max(24, { message: "Max length of tag is 24" })
        .transform((v) => v.replace(/[&\/\\#, +()$~%.'":*?<>{}]/g, '-'))
});

export const AuthSchema = z.object({
    username: z.string().min(3, { message: "Username has to be minimum of 3 letters" })
        .max(10, { message: "Username has to be maximum of 10 letters" }),
    password: z.string().min(8, { message: "Password has to be minimum of 8 letters" })
        .max(20, { message: "Password has   to be maximum of 20 letters" })
})


export const ContentSchema = z.object({
    link: z.string().min(1, { message: "Enter a valid link" }),
    type: z.enum(contentTypes, { message: "Enter a valid type" }),
    title: z.string().min(1, { message: "Enter title" }),
    tags: z.array(tagSchema),
    contentId: z.string(),
    createdAt: z.string(),
    metadata: z.object({
        thumbnail: z.string().optional(),
        favicon: z.string().optional(),
        description: z.string().optional(),
    }).optional()
})

export type ContentType = z.infer<typeof ContentSchema>
export type TagType = z.infer<typeof tagSchema>

