export function parseCookies(request) {
  return Object.fromEntries(
    (request.headers.cookie || "")
      .split(";")
      .filter(Boolean)
      .map((cookie) => {
        const separator = cookie.indexOf("=");
        const key = separator === -1 ? cookie : cookie.slice(0, separator);
        const value = separator === -1 ? "" : cookie.slice(separator + 1);
        return [key.trim(), decodeURIComponent(value)];
      }),
  );
}
