// api/server.js
// Vercel entrypoint that wraps the Express app.

import app from "../server.js";

export default function handler(req, res) {
  return app(req, res);
}
