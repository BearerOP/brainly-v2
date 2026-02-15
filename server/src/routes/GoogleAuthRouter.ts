import { Router } from "express";
import { OAuth2Client } from "google-auth-library";
import { UsersModel } from "../db/db";
import jwt from "jsonwebtoken";
import dotenv from "dotenv";

dotenv.config();

const client = new OAuth2Client(
    process.env.GOOGLE_CLIENT_ID,
    process.env.GOOGLE_CLIENT_SECRET,
    "http://localhost:3000/api/auth/callback/google"
);

export const GoogleAuthRouter = Router();

// Redirect to Google Consent Screen
GoogleAuthRouter.get("/google", (req, res) => {
    const url = client.generateAuthUrl({
        access_type: "offline", // Required to get refresh token
        scope: ["profile", "email"],
        prompt: "consent"
    });
    res.redirect(url);
});

// Handle Google Callback
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
                // Check if user exists with same email but different login method
                user = await UsersModel.findOne({ email });
                if (user) {
                    user.googleId = googleId;
                    if (tokens.refresh_token) user.refreshToken = tokens.refresh_token;
                    await user.save();
                } else {
                    user = await UsersModel.create({
                        username: name || email?.split('@')[0],
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

// Refresh token endpoint
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
