import mongoose, { model, Schema, Types } from "mongoose";
import dotenv from "dotenv";

dotenv.config();
mongoose.connect(process.env.MONGO_URL!);

const UserSchema = new Schema({
  username: { type: String, required: true, unique: true },
  email: { type: String, unique: true, sparse: true },
  password: { type: String },
  googleId: { type: String, unique: true, sparse: true },
  refreshToken: { type: String },
  supabaseId: { type: String, unique: true, sparse: true }
});

export const contentTypes = ["image", "video", "article", "audio", "product", "youtube", "social", "link"] as const;
const ContentSchema = new Schema({
  link: {
    type: String,
    required: true,
  },
  type: { type: String, enum: contentTypes, required: true },
  title: { type: String, required: true },
  tags: [
    {
      tagId: {
        type: String,
        required: true,
      },
      title: {
        type: String,
        required: true,
      },
    },
  ],
  userId: { type: Types.ObjectId, ref: "Users", required: true },
  contentId: { type: String, required: true, unique: true },
  createdAt: { type: String },
  metadata: {
    thumbnail: String,
    favicon: String,
    description: String,
  },
});

const TagSchema = new Schema({
  title: {
    type: String,
    required: true,
    set: (a: string) => a.toLowerCase().trim(),
  },
  tagId: { type: String, required: true, unique: true },
});

const LinkSchema = new Schema({
  hash: { type: String, required: true },
  userId: { type: Types.ObjectId, ref: "Users", required: true },
});

export const UsersModel = model("Users", UserSchema);
export const ContentModel = model("Content", ContentSchema);
export const TagsModel = model("Tags", TagSchema);
export const LinksModel = model("Links", LinkSchema);
