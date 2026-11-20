import crypto from "node:crypto";
import AppError from "../errors/AppError.js";

export default class AuthService {
  constructor(authRepository, config) {
    this.authRepository = authRepository;
    this.config = config;
  }

  async getStatus() {
    const auth = await this.authRepository.getAuthenticatedClient();
    if (!auth) return { connected: false };

    try {
      await auth.getAccessToken();
      return { connected: true };
    } catch (error) {
      const providerCode = error.response?.data?.error;
      if (providerCode === "invalid_grant" || error.message === "invalid_grant") {
        return { connected: false };
      }
      throw error;
    }
  }

  async createAuthorization() {
    const auth = await this.authRepository.createOAuthClient();
    const state = crypto.randomBytes(32).toString("hex");
    const url = auth.generateAuthUrl({
      access_type: "offline",
      scope: this.config.scopes,
      include_granted_scopes: true,
      prompt: "consent",
      state,
    });
    return { state, url };
  }

  async completeAuthorization({ code, state, expectedState, providerError }) {
    if (providerError) {
      throw new AppError(400, `Google authorization failed: ${providerError}`);
    }
    if (!code || !state || !expectedState || state !== expectedState) {
      throw new AppError(400, "Invalid OAuth code or state.");
    }

    const auth = await this.authRepository.createOAuthClient();
    const { tokens } = await auth.getToken(code);
    await this.authRepository.saveToken(tokens);
    return { connected: true };
  }

  async requireAuthenticatedClient() {
    const auth = await this.authRepository.getAuthenticatedClient();
    if (!auth) {
      throw new AppError(
        401,
        "Google Drive is not connected. Open /api/auth/google first.",
      );
    }
    return auth;
  }
}
