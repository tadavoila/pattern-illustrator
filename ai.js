/* ai.js 
- Uses Gemini API to create a panel of swatches
- I consulted ChatGPT5 to help with debugging errors with integrating the API calls.
- Primarily consulted the following websites:
  - https://ai.google.dev/gemini-api/docs/quickstart (API integration)
  - https://developer.mozilla.org/en-US/docs/Web/API/Fetch_API/Using_Fetch (POST requests)
- Sends a POST request with a text prompt to the /api/palette Gemini API endpoint to generate and display an AI-created color palette.
*/

(() => {
  let inputEl, buttonEl, statusEl;
  let inited = false;

  // Default: production on Vercel
  let ENDPOINT = "/api/palette";

  // If running locally (e.g., Live Server on a different port), point to local Node server
  if (
    typeof window !== "undefined" &&
    (window.location.hostname === "localhost" ||
      window.location.hostname === "127.0.0.1")
  ) {
    ENDPOINT = "http://localhost:8787/api/palette";
  }

  // Prompt
  async function generateColors() {
    const prompt = (inputEl.value || "").trim();
    if (!prompt) {
      statusEl.textContent = 'Enter a prompt (e.g., "ocean colors").';
      return;
    }

    buttonEl.disabled = true;
    statusEl.textContent = "Generating…";

    try {
      const resp = await fetch(ENDPOINT, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Accept: "application/json"
        },
        body: JSON.stringify({ prompt })
      });

      const text = await resp.text();
      if (!resp.ok) {
        throw new Error(`Server error ${resp.status}: ${text}`);
      }
      const data = JSON.parse(text);

      if (!Array.isArray(data.colors) || data.colors.length === 0) {
        throw new Error("No colors returned from server");
      }

      // Broadcast to the main app
      window.dispatchEvent(
        new CustomEvent("ai-palette", { detail: { colors: data.colors } })
      );
      statusEl.textContent = `Got ${data.colors.length} colors. Click a swatch in the app.`;
    } catch (err) {
      console.error(err);
      statusEl.textContent = `Error: ${err.message}`;
      // Broadcast a fallback so the UI can react
      window.dispatchEvent(
        new CustomEvent("ai-palette", {
          detail: { colors: ["#FF0000"] }
        })
      );
    } finally {
      buttonEl.disabled = false;
    }
  }

  function init(opts = {}) {
    if (inited) return; // avoid duplicate panels if init is called twice
    inited = true;

    // Allow endpoint override if needed
    if (typeof opts.endpoint === "string" && opts.endpoint.trim()) {
      ENDPOINT = opts.endpoint.trim();
    }

    // UI
    const x = opts.x ?? 40;
    const y = opts.y ?? 340;

    const wrap = document.createElement("div");
    wrap.style.position = "absolute";
    wrap.style.left = `${x}px`;
    wrap.style.top = `${y}px`;
    wrap.style.fontFamily = "cursive";
    wrap.style.fontSize = "12px";
    wrap.style.color = "#111";

    const title = document.createElement("div");
    title.innerHTML = "<b>AI Palette:</b>";
    title.style.marginBottom = "6px";
    title.style.fontSize = "14px";
    wrap.appendChild(title);

    inputEl = document.createElement("input");
    inputEl.type = "text";
    inputEl.placeholder = "e.g., night sky";
    inputEl.style.width = "220px";
    inputEl.style.padding = "6px 8px";
    inputEl.style.border = "1px solid #ddd";
    inputEl.style.borderRadius = "8px";
    inputEl.style.outline = "none";
    inputEl.style.fontFamily = "cursive";
    inputEl.style.fontSize = "12px";
    inputEl.addEventListener("keydown", (e) => {
      if (e.key === "Enter") generateColors();
    });
    wrap.appendChild(inputEl);

    buttonEl = document.createElement("button");
    buttonEl.textContent = "Generate Colors";
    buttonEl.style.marginLeft = "8px";
    buttonEl.style.padding = "8px 8px";
    buttonEl.style.background = "#207c1bff";
    buttonEl.style.color = "#fff";
    buttonEl.style.border = "none";
    buttonEl.style.borderRadius = "8px";
    buttonEl.style.cursor = "pointer";
    buttonEl.style.fontFamily = "cursive";
    buttonEl.style.fontSize = "12px";
    buttonEl.style.minWidth = "120px";
    buttonEl.style.height = "32px";
    buttonEl.addEventListener("click", generateColors);
    wrap.appendChild(buttonEl);

    statusEl = document.createElement("div");
    statusEl.style.marginTop = "6px";
    statusEl.style.color = "#444";
    statusEl.textContent = "Type a prompt and click Generate Colors.";
    wrap.appendChild(statusEl);

    document.body.appendChild(wrap);
  }

  window.AIPalette = { init };
})();
