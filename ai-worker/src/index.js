// 理化小老師 · AI 中繼站（Cloudflare Worker）
// 網頁 → 這裡 → Claude。Claude 的金鑰存在 Cloudflare 的「祕密變數」ANTHROPIC_API_KEY，不會出現在網頁裡。
import Anthropic from "@anthropic-ai/sdk";

// 只有這些網站可以使用（避免別人拿去用、花你的錢）
const ALLOWED_ORIGINS = [
  "https://a1011755-lucky.github.io",
  "http://localhost:8765",
];
// 用 Sonnet 5.5：看照片、解國中理化綽綽有餘，價格約 Opus 的一半
const MODEL = "claude-sonnet-5-5";

const SYSTEM = `你是台灣國中理化（自然科學）的補教名師，學生是國中生。

規則：
- 一律用繁體中文、台灣用語，口吻親切，像在黑板前一步一步講給學生聽。
- 題目可能在照片裡（可能歪斜、模糊、手寫），學生打的文字也可能是照片辨識出來的，會有錯字。兩者都有時以照片為準，先把題目整理成正確、完整的文字。
- 解題步驟：先定義正方向或列出已知條件（含單位）→ 選公式並說明為什麼用它 → 代入計算（單位要跟著寫）→ 說明答案的意義。
- 符號用 Unicode（v₀、m/s²、×、÷、√），不要用 LaTeX，不要用 Markdown。
- 每一步簡短清楚，3～6 步為主。
- 如果學生有給自己算的答案：比對正確答案，在 mistake 說明他可能錯在哪一步（正負號、單位換算、公式選錯、漏了 ½…）；答對就稱讚他。沒給答案時 mistake 留空字串。
- 照片看不清楚、不是題目、或不是國中理化範圍時：notPhysics 設為 true，answer 寫原因（例如「照片太模糊，請重拍」），steps 留空陣列。

動畫（scene）：網頁會依照你給的參數畫動畫。題目適合時一定要給，數字要和題目一致；都不適合時 scene 設為 null。可用的類型：
- 直線運動：{"type":"motion","graph":"vt|xt|both","bodies":[{"label":"甲車","icon":"car|ball|person","v0":初速,"segs":[{"t":這段秒數,"a":加速度,"v":這段開始時的速度(可省略)}]}],"units":{"x":"m","t":"s","v":"m/s","a":"m/s²"},"marks":[{"x":位置,"label":"名稱"}],"showPath":true}（最多 3 個物體；自由落體加 "vertical":"down"）
- 單擺：{"type":"pendulum","items":[{"L":擺長公尺,"m":質量,"amp":擺幅度數,"label":"說明"}]}
- 受力與 F=ma：{"type":"forces","m":質量kg,"obj":"木塊","surface":"rough|smooth|table|none","v0":初速,"T":秒數,"static":false,"forces":[{"label":"拉力","v":大小,"dir":"right|left|up|down","kind":"applied|friction|normal|weight"}]}
- 慣性：{"type":"inertia","mode":"brake|start"}
- 作用力與反作用力（兩人互推）：{"type":"action","m1":60,"m2":40,"F":120,"labels":["小明","小華"]}
- 圓周運動：{"type":"circular","r":半徑,"period":週期,"center":"pin|earth|none","release":繩斷的秒數或省略,"showDisp":false}
- 萬有引力比較：{"type":"gravity","cases":[{"m1":1,"m2":1,"r":1,"label":"原來"},{"m1":1,"m2":1,"r":2,"label":"距離變 2 倍"}]}

只輸出一個 JSON 物件，不要有其他文字：
{"question":"整理後的完整題目","topic":"單元名稱，例如 直線運動、浮力、電路","steps":[{"title":"這一步在做什麼","body":"詳細說明"}],"answer":"最後答案（含單位）","mistake":"","notPhysics":false,"scene":null}`;

const SCENE_TYPES = ["motion", "pendulum", "forces", "inertia", "action", "circular", "gravity"];
// 動畫設定只收已知的類型，而且不能太大
function cleanScene(s) {
  if (!s || typeof s !== "object" || Array.isArray(s) || !SCENE_TYPES.includes(s.type)) return null;
  try { return JSON.stringify(s).length <= 4000 ? JSON.parse(JSON.stringify(s)) : null; } catch { return null; }
}

const str = (v, max) => (typeof v === "string" ? v : v == null ? "" : String(v)).slice(0, max);

function reply(data, status, cors) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { ...cors, "Content-Type": "application/json; charset=utf-8" },
  });
}

export default {
  async fetch(request, env) {
    const origin = request.headers.get("Origin") || "";
    const allowed = ALLOWED_ORIGINS.includes(origin);
    const cors = {
      "Access-Control-Allow-Origin": allowed ? origin : ALLOWED_ORIGINS[0],
      "Access-Control-Allow-Methods": "POST, OPTIONS",
      "Access-Control-Allow-Headers": "Content-Type",
      "Vary": "Origin",
    };
    if (request.method === "OPTIONS") return new Response(null, { status: 204, headers: cors });
    if (request.method === "GET") return reply({ ok: true, msg: "理化小老師 AI 中繼站運作中", key: !!env.ANTHROPIC_API_KEY }, 200, cors);
    if (request.method !== "POST") return reply({ error: "只接受 POST" }, 405, cors);
    if (!allowed) return reply({ error: "這個網站不能使用 AI 老師" }, 403, cors);
    if (!env.ANTHROPIC_API_KEY) return reply({ error: "中繼站還沒設定 AI 金鑰" }, 500, cors);
    if (+(request.headers.get("Content-Length") || 0) > 3_000_000) return reply({ error: "照片太大" }, 413, cors);

    let body;
    try { body = await request.json(); } catch { return reply({ error: "資料格式不對" }, 400, cors); }
    const question = str(body.question, 3000).trim();
    const studentAnswer = body.studentAnswer == null ? "" : str(body.studentAnswer, 40);
    const content = [];
    if (typeof body.image === "string" && body.image) {
      const m = body.image.match(/^data:(image\/(?:jpeg|png|webp|gif));base64,([A-Za-z0-9+/=]+)$/);
      if (!m) return reply({ error: "照片格式不對" }, 400, cors);
      content.push({ type: "image", source: { type: "base64", media_type: m[1], data: m[2] } });
    }
    if (!content.length && !question) return reply({ error: "沒有題目" }, 400, cors);

    let text = content.length ? "題目在照片裡。\n" : "";
    if (question) text += `學生打的題目文字${content.length ? "（照片辨識出來的，可能有錯字）" : ""}：\n${question}\n`;
    if (studentAnswer) text += `學生自己算出的答案：${studentAnswer}\n`;
    content.push({ type: "text", text });

    const client = new Anthropic({ apiKey: env.ANTHROPIC_API_KEY });
    let msg;
    try {
      msg = await client.messages.create({
        model: MODEL,
        max_tokens: 12000,
        system: SYSTEM,
        output_config: { effort: "medium" },
        messages: [{ role: "user", content }],
      });
    } catch (err) {
      console.error("Claude 錯誤", err.status, err.message);
      const s = err.status;
      const why = s === 429 || s === 529 ? "AI 現在太忙，請過一下再試"
        : s === 401 ? "AI 金鑰不對，請老師檢查中繼站設定"
        : s === 400 && /credit|balance/i.test(err.message || "") ? "AI 帳戶餘額不足，請老師儲值"
        : `AI 連線失敗（${s || "網路"}）`;
      return reply({ error: why }, 502, cors);
    }

    if (msg.stop_reason === "refusal") return reply({ error: "AI 老師沒辦法回答這題" }, 422, cors);
    const out = msg.content.filter(b => b.type === "text").map(b => b.text).join("");
    const a = out.indexOf("{"), b = out.lastIndexOf("}");
    let j;
    try { j = JSON.parse(out.slice(a, b + 1)); } catch {
      console.error("JSON 解析失敗", msg.stop_reason, out.slice(0, 300));
      return reply({ error: "AI 回覆的格式不對，請再按一次" }, 502, cors);
    }
    return reply({
      question: str(j.question, 2000),
      topic: str(j.topic, 30),
      steps: (Array.isArray(j.steps) ? j.steps : []).slice(0, 10)
        .map(s => ({ title: str(s && s.title, 80), body: str(s && s.body, 1500) })),
      answer: str(j.answer, 300),
      mistake: str(j.mistake, 1000),
      notPhysics: j.notPhysics === true,
      scene: cleanScene(j.scene),
    }, 200, cors);
  },
};
