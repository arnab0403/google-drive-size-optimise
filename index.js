import app from "./src/app.js";
import config from "./src/config/index.js";

app.listen(config.port, () => {
  console.log(`API listening on ${config.baseUrl}`);
  console.log(`Google OAuth callback: ${config.googleRedirectUri}`);
});
