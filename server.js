/* server.js — Using Gemini 2.5 Flash
- Serves the Pattern Illustrator frontend (index.html + JS/CSS)
- Hosts Express routes (/api/palette, /api/art, /api/list-models) that call
  the Gemini 2.5 Flash API to generate color palettes and vector stroke art.
*/

import express from "express";
import cors from "cors";
import bodyParser from "body-parser";
import "dotenv/config";
import path from "path";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// IMPORTANT: Vercel's working directory is your repo root
const ROOT_DIR = process.cwd();

const app = express();

/* ------------ Middleware ------------ */

// allow requests from your own frontend (and localhost for dev)
app.use(cors());
app.use(bodyParser.json());

// serve ALL static files from the repo root:
//   /index.html, /style.css, /stroke.js, /libraries/p5.min.js, etc.
app.use(express.static(ROOT_DIR));

/* ------------ Frontend route ------------ */

// root -> your canvas app
app.get("/", (_req, res) => {
  res.sendFile(path.join(ROOT_DIR, "index.html"));
});

/* ------------ Gemini config ------------ */

const API_KEY = process.env.GEMINI_API_KEY;
if (!API_KEY) {
  console.error("❌ WARNING: GEMINI_API_KEY not found in environment");
}

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

/* ------------ /api/palette ------------ */

app.post("/api/palette", async (req, res) => {
  console.log("\n=== /api/palette Request ===");
  console.log("Request body:", req.body);

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
      contents: [{ role: "user", parts: [{ text: fullPrompt }] }],
    };

    const resp = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json; charset=utf-8" },
      body: JSON.stringify(payload),
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
    res.json(palette);
  } catch (err) {
    console.error("Palette error:", err);
    res.status(500).json({
      colors: ["#808080"],
      error: err?.message || "Unknown error",
      type: err?.name || "Error",
    });
  }
});

/* ------------ /api/art ------------ */

app.post("/api/art", async (req, res) => {
  console.log("\n=== /api/art Request ===");

  if (!API_KEY) {
    return res.status(500).json({ error: "GEMINI_API_KEY not configured" });
  }

  const userPrompt = String(req.body?.prompt || "").slice(0, 600).trim();
  const existingRaw = Array.isArray(req.body?.existing) ? req.body.existing : [];
  const existing = existingRaw
    .slice(0, 600)
    .map((s) => ({
      color: typeof s.color === "string" ? s.color : null,
      thickness: Number(s.thickness) || 4,
      opacity: Number(s.opacity) || 100,
      eraser: !!s.eraser,
      points: Array.isArray(s.points)
        ? s.points
            .slice(0, 1200)
            .map((p) => ({
              x: Number(p.x),
              y: Number(p.y),
            }))
            .filter((p) => Number.isFinite(p.x) && Number.isFinite(p.y))
        : [],
    }));

  try {
    if (!userPrompt) throw new Error("No prompt provided");

    const sys = `You are a detailed vector line art generator for a drawing canvas.

INPUT:
- "prompt": user request (e.g., "beach on a sunny day").
- "existing": OPTIONAL array of current strokes, each:
  { "color":"#RRGGBB" | null, "thickness":number, "opacity":number,
    "eraser":false, "points":[{"x":number,"y":number}, ...] }

TASK:
Generate NEW, complementary strokes. Use "existing" to infer composition, scale, and style.
If "existing" is empty or missing, rely solely on "prompt".

OUTPUT (JSON ONLY; no backticks, no comments):
{"strokes":[{"color":"#RRGGBB","thickness":1,"opacity":60,"eraser":false,"points":[{"x":0,"y":0}]}]}`;

    const userJson = JSON.stringify({ prompt: userPrompt, existing });
    const fullPrompt = `${sys}\n\n${userJson}`;

    const url = `https://generativelanguage.googleapis.com/${API_VERSION}/models/${MODEL}:generateContent?key=${encodeURIComponent(
      API_KEY
    )}`;
    const payload = {
      contents: [{ role: "user", parts: [{ text: fullPrompt }] }],
    };

    const resp = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json; charset=utf-8" },
      body: JSON.stringify(payload),
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

    let art = JSON.parse(match[0]);
    const isHex = (c) => typeof c === "string" && /^#[0-9A-F]{6}$/i.test(c);
    if (!Array.isArray(art?.strokes)) art = { strokes: [] };

    let totalPoints = 0;
    const MAX_TOTAL_POINTS = 15000;

    art.strokes = art.strokes
      .map((s) => {
        const pts = Array.isArray(s.points) ? s.points : [];
        let kept = [];
        for (const p of pts) {
          if (totalPoints >= MAX_TOTAL_POINTS) break;
          const x = Number(p.x),
            y = Number(p.y);
          if (Number.isFinite(x) && Number.isFinite(y)) {
            kept.push({ x, y });
            totalPoints++;
          }
        }
        kept = kept.filter(
          (p, i, a) => i === 0 || p.x !== a[i - 1].x || p.y !== a[i - 1].y
        );

        return {
          color: isHex(s.color) ? s.color.toUpperCase() : "#000000",
          thickness: Math.max(1, Math.min(40, Number(s.thickness) || 4)),
          opacity: Math.max(60, Math.min(100, Number(s.opacity) || 100)),
          eraser: false,
          points: kept.slice(0, 800),
        };
      })
      .filter((s) => s.points.length >= 2);

    if (!art.strokes.length) {
      art = {
        strokes: [
          {
            color: "#000000",
            thickness: 4,
            opacity: 100,
            eraser: false,
            points: [
              { x: 0, y: 0 },
              { x: 160, y: 60 },
              { x: 290, y: 10 },
              { x: 360, y: 90 },
            ],
          },
        ],
      };
    }

    res.json(art);
  } catch (err) {
    console.error("ART error:", err);
    res.status(500).json({
      strokes: [
        {
          color: "#000000",
          thickness: 4,
          opacity: 100,
          eraser: false,
          points: [
            { x: 0, y: 0 },
            { x: 160, y: 60 },
            { x: 290, y: 10 },
            { x: 360, y: 90 },
          ],
        },
      ],
      error: err?.message || "Unknown error",
    });
  }
});

/* ------------ /api/list-models ------------ */

app.get("/api/list-models", async (_req, res) => {
  if (!API_KEY) {
    return res.status(500).json({ error: "GEMINI_API_KEY not configured" });
  }

  try {
    const url = `https://generativelanguage.googleapis.com/v1/models?key=${encodeURIComponent(
      API_KEY
    )}`;
    const response = await fetch(url);
    const data = await response.json();
    if (!response.ok) {
      throw new Error(
        `ListModels error ${response.status}: ${JSON.stringify(data)}`
      );
    }
    res.json(data);
  } catch (err) {
    console.error("ListModels error:", err);
    res.status(500).json({ error: err.message });
  }
});

/* ------------ Start server ------------ */

const port = process.env.PORT || 8787;
app.listen(port, () => {
  console.log(`🚀 Server running on http://localhost:${port}`);
  console.log(`🧠 Using model: ${MODEL}`);
  console.log("✅ Ready for / (frontend), /api/palette, and /api/art");
});
