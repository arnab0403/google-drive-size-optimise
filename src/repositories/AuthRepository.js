import fs from "node:fs/promises";
import { google } from "googleapis";

export default class AuthRepository {
  constructor(config) {
    this.config = config;
  }

  async createOAuthClient() {
    const credentials = JSON.parse(
      await fs.readFile(this.config.paths.credentials, "utf8"),
    );
    const keys = credentials.web || credentials.installed;

    if (!keys?.client_id || !keys?.client_secret) {
      throw new Error(
        "credentials.json does not contain valid Google OAuth credentials.",
      );
    }

    return new google.auth.OAuth2(
      keys.client_id,
      keys.client_secret,
      this.config.googleRedirectUri,
    );
  }

  async readToken() {
    try {
      return JSON.parse(await fs.readFile(this.config.paths.token, "utf8"));
    } catch (error) {
      if (error.code === "ENOENT") return null;
      throw error;
    }
  }

  async saveToken(tokens) {
    const previous = (await this.readToken()) || {};
    const token = {
      ...previous,
      ...tokens,
      refresh_token: tokens.refresh_token || previous.refresh_token,
      scope: tokens.scope || this.config.scopes.join(" "),
    };

    await fs.writeFile(
      this.config.paths.token,
      JSON.stringify(token, null, 2),
      { mode: 0o600 },
    );
    return token;
  }

  async getAuthenticatedClient() {
    const token = await this.readToken();
    if (!token) return null;

    const grantedScopes = new Set(
      (token.scope || "").split(/\s+/).filter(Boolean),
    );
    const hasScopes = this.config.scopes.every((scope) =>
      grantedScopes.has(scope),
    );
    const hasAccessToken =
      token.access_token && token.expiry_date > Date.now() + 60_000;

    if (!hasScopes || (!token.refresh_token && !hasAccessToken)) return null;

    const auth = await this.createOAuthClient();
    auth.setCredentials(token);
    return auth;
  }
}
