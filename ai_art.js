/* ai_art.js
   - Uses Gemini API to create art with strokes
   - I created this file by duplicating ai.js and modifying it for the art prompt, so no AI was used in creating this specific file.
   - Sends a POST request with a text prompt and the current canvas strokes to the /api/art Gemini API endpoint 
      to generate new AI-drawn strokes and add them to the canvas.
*/

(() => {
  let inputEl, buttonEl, statusEl;
  let inited = false;

  // Default: production on Vercel
  let ENDPOINT = "/api/art";

  // Local dev heuristic: if running a static server on localhost on a port
  // other than 3000 (Vercel dev) or 8787 (Node API), point API to 8787.
  // Keep relative path for Vercel dev and production.
  if (
    typeof window !== "undefined" &&
    (window.location.hostname === "localhost" ||
      window.location.hostname === "127.0.0.1")
  ) {
    const p = String(window.location.port || "");
    if (p && p !== "3000" && p !== "8787") {
      ENDPOINT = "http://localhost:8787/api/art";
    }
  }

  function serializeExisting() {
    // Pull the current canvas strokes into plain JSON 
    if (!Array.isArray(window.strokes)) return [];
    return window.strokes.map((s) => ({
      color: null,
      thickness: Number(s.thickness) || 4,
      opacity: Number(s.opacity) || 100,
      eraser: !!s.eraser,
      points: Array.isArray(s.points)
        ? s.points.map((p) => ({ x: Number(p.x), y: Number(p.y) }))
        : []
    }));
  }

  // Prompt
  async function generateArt() {
    const prompt = (inputEl.value || "").trim();
    if (!prompt) {
      statusEl.textContent =
        'Enter a prompt (e.g., "add a star on top of the Christmas tree").';
      return;
    }

    const existing = serializeExisting();

    buttonEl.disabled = true;
    statusEl.textContent = "Generating…";

    try {
      const resp = await fetch(ENDPOINT, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Accept: "application/json"
        },
        body: JSON.stringify({ prompt, existing })
      });

      const txt = await resp.text();
      if (!resp.ok) {
        throw new Error(`Server error ${resp.status}: ${txt.slice(0, 400)}`);
      }

      let data;
      try {
        data = JSON.parse(txt);
      } catch (e) {
        throw new Error("Response was not valid JSON");
      }

      if (!data || !Array.isArray(data.strokes)) {
        throw new Error("No 'strokes' array in response");
      }

      // App.js listens for "ai-art" and inserts strokes
      window.dispatchEvent(new CustomEvent("ai-art", { detail: data }));

      statusEl.textContent = `Placed ${data.strokes.length} stroke${
        data.strokes.length === 1 ? "" : "s"
      } on canvas.`;
    } catch (err) {
      console.error(err);
      statusEl.textContent = `Error: ${err.message}`;

      // Fallback
      window.dispatchEvent(
        new CustomEvent("ai-art", {
          detail: {
            strokes: [
              {
                color: "#000000",
                thickness: 4,
                opacity: 100,
                eraser: false,
                points: [
                  { x: 0, y: 0 },
                  { x: 120, y: 40 },
                  { x: 220, y: 10 },
                  { x: 300, y: 90 }
                ]
              }
            ]
          }
        })
      );
    } finally {
      buttonEl.disabled = false;
    }
  }

  function init(opts = {}) {
    if (inited) return; // avoid duplicate panels if init is called twice
    inited = true;

    if (typeof opts.endpoint === "string" && opts.endpoint.trim()) {
      ENDPOINT = opts.endpoint.trim();
    }

    const x = Number.isFinite(opts.x) ? opts.x : 40;
    const y = Number.isFinite(opts.y) ? opts.y : 720;

    // UI
    const wrap = document.createElement("div");
    wrap.style.position = "absolute";
    wrap.style.left = `${x}px`;
    wrap.style.top = `${y}px`;
    wrap.style.fontFamily = "cursive";
    wrap.style.fontSize = "12px";
    wrap.style.color = "#111";

    const title = document.createElement("div");
    title.innerHTML = "<b>AI Art:</b>";
    title.style.marginBottom = "6px";
    title.style.fontSize = "14px";
    wrap.appendChild(title);

    inputEl = document.createElement("input");
    inputEl.type = "text";
    inputEl.placeholder = "e.g., beach on a sunny day";
    inputEl.style.width = "220px";
    inputEl.style.padding = "6px 8px";
    inputEl.style.border = "1px solid #ddd";
    inputEl.style.borderRadius = "8px";
    inputEl.style.outline = "none";
    inputEl.style.fontFamily = "cursive";
    inputEl.style.fontSize = "12px";
    inputEl.addEventListener("keydown", (e) => {
      if (e.key === "Enter") generateArt();
    });
    wrap.appendChild(inputEl);

    buttonEl = document.createElement("button");
    buttonEl.textContent = "Generate Art";
    buttonEl.style.marginLeft = "8px";
    buttonEl.style.padding = "8px 8px";
    buttonEl.style.background = "#d75f7dff";
    buttonEl.style.color = "#fff";
    buttonEl.style.border = "none";
    buttonEl.style.borderRadius = "8px";
    buttonEl.style.cursor = "pointer";
    buttonEl.style.fontFamily = "cursive";
    buttonEl.style.fontSize = "12px";
    buttonEl.style.minWidth = "120px";
    buttonEl.style.height = "32px";
    buttonEl.addEventListener("click", generateArt);
    wrap.appendChild(buttonEl);

    statusEl = document.createElement("div");
    statusEl.style.marginTop = "6px";
    statusEl.style.color = "#444";
    statusEl.textContent = "Type a prompt and click Generate Art.";
    wrap.appendChild(statusEl);

    document.body.appendChild(wrap);
  }

  window.AIArt = { init };
})();
