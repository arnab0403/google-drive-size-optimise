import { parseCookies } from "../utils/cookies.js";

export default class AuthController {
  constructor(authService, config) {
    this.authService = authService;
    this.config = config;
  }

  cookieOptions(includeMaxAge = true) {
    return {
      httpOnly: true,
      sameSite: "lax",
      secure: this.config.baseUrl.startsWith("https://"),
      ...(includeMaxAge ? { maxAge: 10 * 60 * 1000 } : {}),
    };
  }

  status = async (request, response) => {
    response.json(await this.authService.getStatus());
  };

  connect = async (request, response) => {
    const authorization = await this.authService.createAuthorization();
    response.cookie(
      "oauth_state",
      authorization.state,
      this.cookieOptions(),
    );
    response.redirect(authorization.url);
  };

  callback = async (request, response) => {
    const cookies = parseCookies(request);
    response.clearCookie("oauth_state", this.cookieOptions(false));
    const result = await this.authService.completeAuthorization({
      code: request.query.code,
      state: request.query.state,
      expectedState: cookies.oauth_state,
      providerError: request.query.error,
    });
    if (this.config.frontendUrl) {
      const redirectUrl = new URL(this.config.frontendUrl);
      redirectUrl.searchParams.set("googleDrive", "connected");
      return response.redirect(redirectUrl.toString());
    }

    return response.json({
      ...result,
      message: "Google Drive connected successfully.",
    });
  };
}
