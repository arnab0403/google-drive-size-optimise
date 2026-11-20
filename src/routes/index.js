import express from "express";

export default function createRoutes({ authController, imageController }) {
  const router = express.Router();

  router.get("/health", (request, response) => {
    response.json({ status: "ok" });
  });
  router.get("/auth/status", authController.status);
  router.get("/auth/google", authController.connect);
  router.get("/auth/google/callback", authController.callback);
  router.get("/images", imageController.list);
  router.post("/images/optimize", imageController.optimize);

  return router;
}
