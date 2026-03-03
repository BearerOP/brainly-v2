import { Router } from "express";
import { OAuth2Client } from "google-auth-library";
import { UsersModel } from "../db/db";
import jwt from "jsonwebtoken";
import dotenv from "dotenv";

dotenv.config();

const client = new OAuth2Client(
    process.env.GOOGLE_CLIENT_ID,
    process.env.GOOGLE_CLIENT_SECRET,
    process.env.GOOGLE_REDIRECT_URL
);

export const GoogleAuthRouter = Router();

GoogleAuthRouter.get("/google", (req, res) => {
    const url = client.generateAuthUrl({
        access_type: "offline",
        scope: ["profile", "email"],
        prompt: "consent"
    });
    res.redirect(url);
});

GoogleAuthRouter.get("/callback/google", (req, res) => {
    (async () => {
        const { code } = req.query;
        if (!code) {
            return res.status(400).json({ message: "No code provided" });
        }

        try {
            const { tokens } = await client.getToken(code as string);
            client.setCredentials(tokens);

            const ticket = await client.verifyIdToken({
                idToken: tokens.id_token!,
                audience: process.env.GOOGLE_CLIENT_ID
            });

            const payload = ticket.getPayload();
            if (!payload) {
                return res.status(500).json({ message: "Failed to get user payload" });
            }

            const { sub: googleId, email, name } = payload;
            let user = await UsersModel.findOne({ googleId });

            if (!user) {
                user = await UsersModel.findOne({ email });
                if (user) {
                    console.log(`[GoogleAuth] Linking Google account to existing user: ${email}`);
                    user.googleId = googleId;
                    if (tokens.refresh_token) user.refreshToken = tokens.refresh_token;
                    await user.save();
                } else {
                    console.log(`[GoogleAuth] Creating new user for: ${email}`);
                    let baseUsername = name || email?.split('@')[0] || "user";
                    let username = baseUsername;

                    const existingUsername = await UsersModel.findOne({ username });
                    if (existingUsername) {
                        username = `${baseUsername}_${Math.random().toString(36).substring(2, 7)}`;
                    }

                    user = await UsersModel.create({
                        username,
                        email,
                        googleId,
                        refreshToken: tokens.refresh_token
                    });
                }
            } else if (tokens.refresh_token) {
                user.refreshToken = tokens.refresh_token;
                await user.save();
            }

            const accessToken = jwt.sign(
                { id: user._id },
                process.env.JWT_SECRET!,
                { expiresIn: '1h' }
            );

            const frontendUrl = process.env.FRONTEND_URL || "http://localhost:5173";
            res.redirect(`${frontendUrl}/auth-callback?token=${accessToken}`);

        } catch (error) {
            console.error("Google Auth Error:", error);
            res.status(500).json({ message: "Authentication failed" });
        }
    })();
});

GoogleAuthRouter.post("/refresh", (req, res) => {
    (async () => {
        const { refreshToken } = req.body;
        if (!refreshToken) return res.status(401).json({ message: "Refresh token required" });

        try {
            const user = await UsersModel.findOne({ refreshToken });
            if (!user) return res.status(403).json({ message: "Invalid refresh token" });

            client.setCredentials({ refresh_token: refreshToken });
            const { credentials } = await client.refreshAccessToken();

            const newAccessToken = jwt.sign(
                { id: user._id },
                process.env.JWT_SECRET!,
                { expiresIn: '1h' }
            );

            res.json({ accessToken: newAccessToken });
        } catch (error) {
            res.status(403).json({ message: "Failed to refresh token" });
        }
    })();
});
