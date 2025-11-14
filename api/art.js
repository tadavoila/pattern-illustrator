// api/art.js
// Serverless function for generating vector strokes with Gemini 2.5 Flash

const API_KEY = process.env.GEMINI_API_KEY;
const API_VERSION = "v1";
const MODEL = "gemini-2.5-flash";

function extractTextFromCandidates(data) {
  const cand = data?.candidates?.[0];
  const parts = cand?.content?.parts || [];
  return parts.map((p) => p.text || "").join("").trim();
}

export default async function handler(req, res) {
  if (req.method !== "POST") {
    res.setHeader("Allow", "POST");
    return res.status(405).json({ error: "Method not allowed" });
  }

  if (!API_KEY) {
    return res.status(500).json({ error: "GEMINI_API_KEY not configured" });
  }

  console.log("\n=== /api/art Request ===");

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
              y: Number(p.y)
            }))
            .filter((p) => Number.isFinite(p.x) && Number.isFinite(p.y))
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

TASK:
Generate NEW, complementary strokes. Use "existing" to infer composition, scale, and style.
If "existing" is empty or missing, rely solely on "prompt".

PLACEMENT & COMPOSITION:
- If the prompt implies attaching to a subject (e.g., "star on top of the tree", "eyes on the face", "roof on the house"):
  1) Try to locate the subject in "existing" by its silhouette or likely geometry.
  2) If found, place the new strokes appropriately relative to that subject.
  3) If NOT found, sketch a minimal, recognizable version of that subject first, then add the requested detail.

NEW DRAWINGS:
- Be as detailed as possible using mixed short and long strokes to create a recognizable drawing.
- Total new strokes: 20..60. Total points across all new strokes ≤ 15000.

STYLE:
- Match existing palette (prefer colors already present); you may add up to 2 new harmonious hues.
- Keep thickness in the typical existing range (±25%).
- Favor smooth, flowing polylines with natural curvature.

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
- Geometry hygiene: no NaN/Infinity, no duplicate consecutive points.
- Avoid drawing on top of existing strokes unless the user asks to modify/fill.

VALIDATION:
- Return a single JSON object matching the schema above. No extra keys. No markdown.`;

    const userJson = JSON.stringify({ prompt: userPrompt, existing });
    const fullPrompt = `${sys}\n\n${userJson}`;

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
          const x = Number(p.x);
          const y = Number(p.y);
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
          points: kept.slice(0, 800)
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
              { x: 480, y: 200 },
              { x: 520, y: 260 },
              { x: 560, y: 210 },
              { x: 600, y: 270 }
            ]
          }
        ]
      };
    }

    return res.status(200).json(art);
  } catch (err) {
    console.error("ART error:", err);
    return res.status(500).json({
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
            { x: 360, y: 90 }
          ]
        }
      ],
      error: err?.message || "Unknown error"
    });
  }
}
