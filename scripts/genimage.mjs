/**
 * Generate a game asset with the Gemini image API.
 *
 * The key lives in .env.local as GEMINI_API_KEY and is never bundled — this is
 * a build-time tool, run by hand, that writes straight into src/assets/.
 *
 *   node scripts/genimage.mjs --out src/assets/map-frostline-card.png "a prompt"
 *   node scripts/genimage.mjs --out src/assets/icon.png --aspect 1:1 --model pro "a prompt"
 *   node scripts/genimage.mjs --out src/assets/x.png --ref src/assets/splash-key-art.jpg "match this style: ..."
 *
 * Flags:
 *   --out <path>     required. Extension is corrected to match what the API returns.
 *   --model <id>     "flash" (default), "pro", or a full model id.
 *   --aspect <r>     1:1 2:3 3:2 3:4 4:3 4:5 5:4 9:16 16:9 21:9   (default 16:9)
 *   --size <s>       1K (default) | 2K | 4K
 *   --ref <path>     reference image sent alongside the prompt. Repeatable.
 *   --n <count>      generate N variants as name-1.png, name-2.png ... (default 1)
 */

import { readFile, writeFile, mkdir } from "node:fs/promises";
import { existsSync } from "node:fs";
import https from "node:https";
import path from "node:path";

const MODELS = {
  flash: "gemini-3.1-flash-image",
  pro: "gemini-3-pro-image",
};

const MIME_EXT = {
  "image/png": ".png",
  "image/jpeg": ".jpg",
  "image/webp": ".webp",
};

/** Pull KEY=value pairs out of .env.local / .env without adding a dotenv dep. */
async function loadKey() {
  if (process.env.GEMINI_API_KEY) return process.env.GEMINI_API_KEY.trim();
  for (const file of [".env.local", ".env"]) {
    if (!existsSync(file)) continue;
    const hit = (await readFile(file, "utf8")).match(/^\s*GEMINI_API_KEY\s*=\s*(.+)$/m);
    if (hit) return hit[1].trim().replace(/^["']|["']$/g, "");
  }
  throw new Error("GEMINI_API_KEY not found — add it to .env.local");
}

function parseArgs(argv) {
  const opts = { model: "flash", aspect: "16:9", size: "1K", refs: [], n: 1 };
  const words = [];
  for (let i = 0; i < argv.length; i += 1) {
    const a = argv[i];
    if (a === "--out") opts.out = argv[++i];
    else if (a === "--model") opts.model = argv[++i];
    else if (a === "--aspect") opts.aspect = argv[++i];
    else if (a === "--size") opts.size = argv[++i];
    else if (a === "--ref") opts.refs.push(argv[++i]);
    else if (a === "--n") opts.n = Number(argv[++i]) || 1;
    else if (a === "--prompt") words.push(argv[++i]);
    else if (a.startsWith("--")) throw new Error(`unknown flag ${a}`);
    else words.push(a);
  }
  opts.prompt = words.join(" ").trim();
  if (!opts.out) throw new Error("--out <path> is required");
  if (!opts.prompt) throw new Error("no prompt given");
  return opts;
}

async function refPart(file) {
  const ext = path.extname(file).toLowerCase();
  const mime = ext === ".png" ? "image/png" : ext === ".webp" ? "image/webp" : "image/jpeg";
  return { inlineData: { mimeType: mime, data: (await readFile(file)).toString("base64") } };
}

/**
 * POST JSON and return the parsed reply.
 *
 * Deliberately node:https and not fetch — undici hardcodes a 10s connect
 * timeout and the TLS handshake to Google from here regularly takes longer than
 * that, so fetch fails with UND_ERR_CONNECT_TIMEOUT on a perfectly good link.
 */
function postJson(url, key, body) {
  const payload = Buffer.from(JSON.stringify(body));
  const target = new URL(url);
  return new Promise((resolve, reject) => {
    const req = https.request(
      {
        hostname: target.hostname,
        path: target.pathname + target.search,
        method: "POST",
        timeout: 180_000,
        headers: {
          "Content-Type": "application/json",
          "X-goog-api-key": key,
          "Content-Length": payload.length,
        },
      },
      (res) => {
        const chunks = [];
        res.on("data", (c) => chunks.push(c));
        res.on("end", () => {
          const text = Buffer.concat(chunks).toString("utf8");
          let json = null;
          try {
            json = JSON.parse(text);
          } catch {
            /* fall through to the status check below */
          }
          resolve({ status: res.statusCode ?? 0, json, text });
        });
      },
    );
    req.on("timeout", () => req.destroy(new Error("request timed out after 180s")));
    req.on("error", reject);
    req.end(payload);
  });
}

/** One API round trip → every image part it returned. Retries a flaky connect once. */
async function generate(key, model, parts, aspect, size) {
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`;
  const body = {
    contents: [{ parts }],
    generationConfig: { responseModalities: ["IMAGE"], imageConfig: { aspectRatio: aspect, imageSize: size } },
  };

  let res;
  for (let attempt = 1; ; attempt += 1) {
    try {
      res = await postJson(url, key, body);
      break;
    } catch (err) {
      if (attempt >= 3) throw err;
      console.log(`  connect failed (${err.message}) — retry ${attempt + 1}/3`);
    }
  }

  const { status, json, text } = res;
  if (status < 200 || status >= 300 || !json || json.error) {
    const err = json?.error;
    throw new Error(`API ${status} ${err?.status ?? ""} — ${err?.message ?? text.slice(0, 300)}`);
  }

  const cand = json.candidates?.[0];
  const out = (cand?.content?.parts ?? []).filter((p) => p.inlineData?.data);
  if (out.length === 0) {
    // A refusal or safety block comes back as text, or as no candidate at all.
    const said = (cand?.content?.parts ?? []).map((p) => p.text).filter(Boolean).join(" ");
    const why = cand?.finishReason ?? json.promptFeedback?.blockReason ?? "unknown";
    throw new Error(`no image returned (finishReason: ${why})${said ? ` — model said: ${said}` : ""}`);
  }
  return out;
}

const opts = parseArgs(process.argv.slice(2));
const key = await loadKey();
const model = MODELS[opts.model] ?? opts.model;

const parts = [];
for (const r of opts.refs) {
  if (!existsSync(r)) throw new Error(`--ref not found: ${r}`);
  parts.push(await refPart(r));
}
parts.push({ text: opts.prompt });

await mkdir(path.dirname(opts.out), { recursive: true });
const base = opts.out.replace(/\.[^./\\]+$/, "");
let written = 0;

for (let i = 0; i < opts.n; i += 1) {
  const images = await generate(key, model, parts, opts.aspect, opts.size);
  for (const img of images) {
    const ext = MIME_EXT[img.inlineData.mimeType] ?? ".png";
    const suffix = opts.n > 1 || images.length > 1 ? `-${written + 1}` : "";
    const file = `${base}${suffix}${ext}`;
    const bytes = Buffer.from(img.inlineData.data, "base64");
    await writeFile(file, bytes);
    console.log(`${file}  ${(bytes.length / 1024).toFixed(0)} KB  ${model} ${opts.aspect} ${opts.size}`);
    written += 1;
  }
}
