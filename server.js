/* server.js — Using Gemini 2.5 Flash
- Hosts Express routes (/palette, /art, /list-models) that call the Gemini 2.5 Flash API
  to generate color palettes and vector stroke art, validate JSON, and return responses.
-  I consulted ChatGPT5 for the following:
    - Help with creating the server architecture and request–response flow
    - Help with debugging errors with integrating the API calls
- Primarily consulted the following:
    - https://ai.google.dev/gemini-api/docs (Gemini API integration)
    - https://expressjs.com/ (ExpressJS documentation)
    - https://github.com/expressjs/cors (CORS)
    - Various Google search results while debugging.
    - My experience interning at Amazon this past summer building AI agents and designing system prompts
*/
import express from "express";
import cors from "cors";
import bodyParser from "body-parser";
import "dotenv/config"; // loads .env from project root (must include GEMINI_API_KEY)

const app = express();

// Allow local Live Server / frontend origins
app.use(cors({
  origin: [/^http:\/\/localhost:\d+$/, /^http:\/\/127\.0\.0\.1:\d+$/],
}));
app.use(bodyParser.json());

// --- Verify API key ---
const API_KEY = process.env.GEMINI_API_KEY;
if (!API_KEY) {
  console.error("❌ ERROR: GEMINI_API_KEY not found in environment");
  process.exit(1);
}

// --- Model + API version ---
const API_VERSION = "v1";
const MODEL = "gemini-2.5-flash";

// --- Helper functions ---
function extractTextFromCandidates(data) {
  const cand = data?.candidates?.[0];
  const parts = cand?.content?.parts || [];
  return parts.map(p => p.text || "").join("").trim();
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

/* ---------------- Quiet common GETs ---------------- */
app.get("/", (_req, res) => {
  res.status(200).send("🎨 API running. POST /palette for palettes, /art for strokes.");
});
app.get("/favicon.ico", (_req, res) => res.status(204).end());
app.get("/.well-known/appspecific/com.chrome.devtools.json", (_req, res) => res.status(204).end());

/* ---------------- Palette route (unchanged) ---------------- */
app.post("/palette", async (req, res) => {
  console.log("\n=== /palette Request ===");
  console.log("Request body:", req.body);

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

    const url = `https://generativelanguage.googleapis.com/${API_VERSION}/models/${MODEL}:generateContent?key=${encodeURIComponent(API_KEY)}`;
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

/* ---------------- ART route ---------------- */
app.post("/art", async (req, res) => {
  console.log("\n=== /art Request ===");
  // Pull and lightly bound inputs
  const userPrompt = String(req.body?.prompt || "").slice(0, 600).trim();
  const existingRaw = Array.isArray(req.body?.existing) ? req.body.existing : [];
  const existing = existingRaw
    .slice(0, 600) // cap number of strokes sent to model
    .map((s) => ({
      color: typeof s.color === "string" ? s.color : null,
      thickness: Number(s.thickness) || 4,
      opacity: Number(s.opacity) || 100,
      eraser: !!s.eraser,
      points: Array.isArray(s.points)
        ? s.points.slice(0, 1200).map((p) => ({
            x: Number(p.x),
            y: Number(p.y),
          })).filter(p => Number.isFinite(p.x) && Number.isFinite(p.y))
        : []
    }));

  try {
    if (!userPrompt) throw new Error("No prompt provided");

    const sys = `You are a detailed vector line art generator for a drawing canvas.

INPUT:
- "prompt": user request (e.g., "beach on a sunny day").
- "existing": OPTIONAL array of current strokes, each:
  { "color":"#RRGGBB" | null, "thickness":number, "opacity":number,
    "eraser":false, "points":[{"x":number,"y":number}, ...] }
  Coordinates are in a shared local space. Some fields may be null.

TASK:
Generate NEW, complementary strokes. Use "existing" to infer composition, scale, and style.
If "existing" is empty or missing, rely solely on "prompt".

PLACEMENT & COMPOSITION:
- If the prompt implies attaching to a subject (e.g., "star on top of the tree", "eyes on the face", "roof on the house"):
  1) Try to locate the subject in "existing" by its silhouette or likely geometry (e.g., a conical/triangular cluster for a tree).
  2) If found, place the new strokes appropriately relative to that subject (e.g., star centered above the tree apex).
  3) If NOT found, sketch a minimal, recognizable version of that subject first, then add the requested detail.
- Preserve overall scale and placement; integrate into current composition, not overwrite it.

NEW DRAWINGS:
- Be at detailed as possible by using a mixture of short and long strokes to create a recognizeable drawing. 
- However, stay within the stroke constraints: Total new strokes: 20..60. Total points across all new strokes ≤ 15000.

STYLE:
- Match existing palette (prefer colors already present); you may add up to 2 harmonious new hues.
- Keep thickness in the typical existing range (±25%).
- Favor smooth, flowing polylines with natural curvature; recognizable but detailed forms.

OUTPUT (JSON ONLY; no backticks, no comments):
{
  "strokes": [
    {
      "color": "#RRGGBB",
      "thickness": 1-40,
      "opacity": 60-100,
      "eraser": false,
      "points": [{"x": number, "y": number}] // 2..800 points
    }
  ]
}

CONSTRAINTS:
- Total new strokes: 20..60. Total points across all new strokes ≤ 15000.
- Colors: 6-digit hex only.
- Geometry hygiene: no NaN/Infinity, no duplicate consecutive points, avoid zero-length segments.
- Avoid drawing on top of existing strokes unless the user asks to modify or fill a drawing.

VALIDATION:
- Return a single JSON object matching the schema above. No extra keys. No markdown.
- Do not include comments, explanations, markdown, or any text outside of the JSON object because they will cause critical errors.`;

    // Put user inputs as compact JSON after the instructions
    const userJson = JSON.stringify({ prompt: userPrompt, existing });
    const fullPrompt = `${sys}\n\n${userJson}`;

    const url = `https://generativelanguage.googleapis.com/${API_VERSION}/models/${MODEL}:generateContent?key=${encodeURIComponent(API_KEY)}`;
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
      const apiMsg = data?.error?.message || data?.message || JSON.stringify(data).slice(0, 400);
      throw new Error(`Gemini API error ${resp.status}: ${apiMsg}`);
    }

    const text = extractTextFromCandidates(data);
    const match = text.match(/\{[\s\S]*\}/);
    if (!match) throw new Error("No JSON object found in model response");

    let art = JSON.parse(match[0]);

    // --- Minimal validation/sanitization ---
    const isHex = (c) => typeof c === "string" && /^#[0-9A-F]{6}$/i.test(c);
    if (!Array.isArray(art?.strokes)) art = { strokes: [] };

    // clamp totals
    let totalPoints = 0;
    const MAX_TOTAL_POINTS = 15000;

    art.strokes = art.strokes.map((s) => {
      const pts = Array.isArray(s.points) ? s.points : [];
      // limit points per stroke and total
      let kept = [];
      for (const p of pts) {
        if (totalPoints >= MAX_TOTAL_POINTS) break;
        const x = Number(p.x), y = Number(p.y);
        if (Number.isFinite(x) && Number.isFinite(y)) {
          kept.push({ x, y });
          totalPoints++;
        }
      }
      kept = kept.filter((p, i, a) => i === 0 || p.x !== a[i-1].x || p.y !== a[i-1].y);

      return {
        color: isHex(s.color) ? s.color.toUpperCase() : "#000000",
        thickness: Math.max(1, Math.min(40, Number(s.thickness) || 4)),
        opacity: Math.max(60, Math.min(100, Number(s.opacity) || 100)),
        eraser: false, // force false
        points: kept.slice(0, 800)
      };
    }).filter((s) => s.points.length >= 2);

    // Fallback if nothing valid
    if (!art.strokes.length) {
      art = {
        strokes: [{
          color: "#000000",
          thickness: 4,
          opacity: 100,
          eraser: false,
          points: [{x:480,y:200},{x:520,y:260},{x:560,y:210},{x:600,y:270}]
        }]
      };
    }

    res.json(art);
  } catch (err) {
    console.error("ART error:", err);
    res.status(500).json({
      strokes: [{
        color: "#000000",
        thickness: 4,
        opacity: 100,
        eraser: false,
        points: [{x:0,y:0},{x:160,y:60},{x:290,y:10},{x:360,y:90}]
      }],
      error: err?.message || "Unknown error"
    });
  }
});

/* ---------------- ListModels ---------------- */
app.get("/list-models", async (_req, res) => {
  try {
    const url = `https://generativelanguage.googleapis.com/v1/models?key=${encodeURIComponent(API_KEY)}`;
    const response = await fetch(url);
    const data = await response.json();
    if (!response.ok) {
      throw new Error(`ListModels error ${response.status}: ${JSON.stringify(data)}`);
    }
    res.json(data);
  } catch (err) {
    console.error("ListModels error:", err);
    res.status(500).json({ error: err.message });
  }
});

/* ---------------- Start server ----------------- */
const port = process.env.PORT || 8787;
app.listen(port, () => {
  console.log(`🚀 Server running on http://localhost:${port}`);
  console.log(`🧠 Using model: ${MODEL}`);
  console.log("✅ Ready for /palette and /art");
});
