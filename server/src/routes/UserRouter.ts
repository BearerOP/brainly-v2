import { Request, Response, Router } from "express";
import crypto from "crypto";
import { AuthSchema } from "../types/Schemas";
import mongoose from "mongoose";
import dotenv from "dotenv";
import { UsersModel } from "../db/db";
import bcrypt from "bcrypt";
import jwt from "jsonwebtoken";

dotenv.config();
const salt_rounds = 10;
mongoose.connect(process.env.MONGO_URL!);
export const UserRouter = Router();

// Signup and Signin Endpoints

UserRouter.post("/register", async (req: Request, res: Response) => {
  try {
    const { success, data, error } = AuthSchema.safeParse(req.body);
    if (!success) {
      res.status(411).json({
        message: "Error in inputs",
        errors: error.errors,
      });
    } else {
      const hashPass = await bcrypt.hash(data.password, salt_rounds);

      await UsersModel.create({
        username: data.username,
        password: hashPass,
      });
      res.status(200).json({
        message: "User Created in DB",
      });
    }
  } catch (error) {
    // @ts-ignore
    if (error.code === 11000) {
      res.status(403).json({
        message: "User already exists.",
      });
    } else {
      res.status(500).json({
        message: "Internal Server Error.",
      });
    }
  }
});

UserRouter.post("/login", async (req: Request, res: Response) => {
  try {
    const { success, data, error } = AuthSchema.safeParse(req.body);
    if (!success) {
      res.status(411).json({
        message: "Error in inputs",
        errors: error.errors,
      });
      return;
    } else {
      const existingUser = await UsersModel.findOne({
        username: data.username,
      });
      if (existingUser) {
        if (!existingUser.password) {
          res.status(401).json({
            message: "This account uses Google login. Please sign in with Google.",
          });
          return;
        }
        const match = await bcrypt.compare(
          data.password,
          existingUser.password
        );
        if (match) {
          const token = jwt.sign(
            {
              id: existingUser._id,
            },
            process.env.JWT_SECRET! as string
            // {expiresIn: '1h'}
          );
          res.status(200).json({
            message: "Login Succesful, token set",
            token: token,
          });
          return;
        } else {
          res.status(401).json({
            message: "Password incorrect, please try again",
          });
          return;
        }
      } else {
        res.status(404).json({
          message: "User doesn't exist, please sign up",
        });
        return;
      }
    }
  } catch (error) {
    res.status(500).json({
      message: "Internal Server Error",
    });
    return;
  }
});

UserRouter.post("/supabase-auth", async (req: Request, res: Response) => {
  try {
    const { email, supabaseId } = req.body;

    let user = await UsersModel.findOne({ username: email });

    if (!user) {
      // Auto-create user from Supabase auth
      const randomPassword = crypto.randomBytes(32).toString('hex');
      const hashPass = await bcrypt.hash(randomPassword, salt_rounds);
      user = await UsersModel.create({
        username: email,
        password: hashPass,
        supabaseId: supabaseId
      });
    }

    const token = jwt.sign({ id: user._id }, process.env.JWT_SECRET!);
    res.json({ token });
  } catch (error) {
    console.error("Auth sync failed", error);
    res.status(500).json({ message: "Auth sync failed" });
  }
});
