import path from "node:path";

const port = Number(process.env.PORT) || 5001;
const baseUrl = (process.env.BASE_URL || `http://localhost:${port}`).replace(
  /\/$/,
  "",
);

const config = {
  port,
  baseUrl,
  frontendUrl: process.env.FRONTEND_URL || null,
  corsOrigin: process.env.CORS_ORIGIN || process.env.FRONTEND_URL || null,
  googleRedirectUri:
    process.env.GOOGLE_REDIRECT_URI || `${baseUrl}/api/auth/google/callback`,
  scopes: [
    "https://www.googleapis.com/auth/drive.readonly",
    "https://www.googleapis.com/auth/drive.file",
  ],
  paths: {
    credentials: path.resolve("credentials.json"),
    token: path.resolve("token.json"),
    downloads: path.resolve("downloads"),
    optimized: path.resolve("downloads", "optimised"),
  },
  drive: {
    folderName: "optimise",
    folderAppId: "google-drive-size-optimise",
    maxImages: Math.max(1, Number(process.env.MAX_IMAGES) || 10),
  },
};

export default config;
