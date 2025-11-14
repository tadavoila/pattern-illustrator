// api/palette.js
// Serverless function for generating palettes with Gemini 2.5 Flash

const API_KEY = process.env.GEMINI_API_KEY;
const API_VERSION = "v1";
const MODEL = "gemini-2.5-flash";

function extractTextFromCandidates(data) {
  const cand = data?.candidates?.[0];
  const parts = cand?.content?.parts || [];
  return parts.map((p) => p.text || "").join("").trim();
}

function ensureValidPalette(json) {
  if (!json || !Array.isArray(json.colors)) {
    throw new Error("Invalid response format: missing colors array");
  }
  const isHex = (c) => typeof c === "string" && /^#[0-9A-F]{6}$/i.test(c);
  if (!json.colors.every(isHex)) {
    throw new Error("Invalid hex color codes in response");
  }
  return json;
}

export default async function handler(req, res) {
  if (req.method !== "POST") {
    res.setHeader("Allow", "POST");
    return res.status(405).json({ error: "Method not allowed" });
  }

  if (!API_KEY) {
    return res.status(500).json({ error: "GEMINI_API_KEY not configured" });
  }

  try {
    const user = String(req.body?.prompt || "").slice(0, 600).trim();
    if (!user) throw new Error("No prompt provided");

    const sys = `You are a color palette generator.
ONLY return a valid JSON object in this format: {"colors":["#RRGGBB","#RRGGBB"]}.
Each color must be a valid 6-digit hex code starting with #.
Generate between 4-5 colors that work well together.
Do not include comments, explanations, markdown, or any text outside of the JSON object because they will cause critical errors.
No other text or explanation.`;

    const fullPrompt = `${sys}\n\nUser requested colors for: ${user}`;

    const url = `https://generativelanguage.googleapis.com/${API_VERSION}/models/${MODEL}:generateContent?key=${encodeURIComponent(
      API_KEY
    )}`;
    const payload = {
      contents: [{ role: "user", parts: [{ text: fullPrompt }] }]
    };

    const resp = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json; charset=utf-8" },
      body: JSON.stringify(payload)
    });

    const data = await resp.json();
    if (!resp.ok) {
      const apiMsg =
        data?.error?.message ||
        data?.message ||
        JSON.stringify(data).slice(0, 400);
      throw new Error(`Gemini API error ${resp.status}: ${apiMsg}`);
    }

    const text = extractTextFromCandidates(data);
    const match = text.match(/\{[\s\S]*\}/);
    if (!match) throw new Error("No JSON object found in model response");

    const palette = ensureValidPalette(JSON.parse(match[0]));
    return res.status(200).json(palette);
  } catch (err) {
    console.error("Palette error:", err);
    return res.status(500).json({
      colors: ["#808080"],
      error: err?.message || "Unknown error",
      type: err?.name || "Error"
    });
  }
}
