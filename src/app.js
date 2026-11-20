import express from "express";
import morgan from "morgan";
import config from "./config/index.js";
import AuthRepository from "./repositories/AuthRepository.js";
import DriveRepository from "./repositories/DriveRepository.js";
import ImageRepository from "./repositories/ImageRepository.js";
import AuthService from "./services/AuthService.js";
import ImageService from "./services/ImageService.js";
import AuthController from "./controllers/AuthController.js";
import ImageController from "./controllers/ImageController.js";
import createRoutes from "./routes/index.js";
import { notFound, errorHandler } from "./middleware/errorHandler.js";

const authRepository = new AuthRepository(config);
const driveRepository = new DriveRepository(config);
const imageRepository = new ImageRepository(config);
const authService = new AuthService(authRepository, config);
const imageService = new ImageService(
  authService,
  driveRepository,
  imageRepository,
);
const authController = new AuthController(authService, config);
const imageController = new ImageController(imageService);

const app = express();
app.disable("x-powered-by");
app.use(morgan(process.env.NODE_ENV === "production" ? "combined" : "dev"));
app.use(express.json({ limit: "1mb" }));

if (config.corsOrigin) {
  app.use((request, response, next) => {
    response.setHeader("Access-Control-Allow-Origin", config.corsOrigin);
    response.setHeader("Access-Control-Allow-Credentials", "true");
    response.setHeader(
      "Access-Control-Allow-Headers",
      "Content-Type, Authorization",
    );
    response.setHeader(
      "Access-Control-Allow-Methods",
      "GET, POST, OPTIONS",
    );
    if (request.method === "OPTIONS") return response.sendStatus(204);
    return next();
  });
}

app.get("/", (request, response) => {
  response.json({
    name: "Google Drive Image Optimiser API",
    endpoints: {
      health: "GET /api/health",
      authStatus: "GET /api/auth/status",
      connectGoogleDrive: "GET /api/auth/google",
      oauthCallback: "GET /api/auth/google/callback",
      listImages: "GET /api/images",
      optimizeImages: "POST /api/images/optimize",
    },
  });
});
app.use(
  "/api",
  createRoutes({ authController, imageController }),
);
app.use(notFound);
app.use(errorHandler);

export default app;
