/* 理化小老師 · 動畫場景引擎
   每一題的動畫 = 一個場景設定：{type:"場景類型", ...參數}
   題庫、解題模板、AI 老師都用同一種格式，網頁負責把它畫出來。

   場景類型：
   motion    直線運動（一個或多個物體、可分段、可畫 x-t / v-t 圖、可直立做自由落體）
   pendulum  單擺（比較擺長、擺錘質量、擺幅）
   forces    受力分析＋牛頓第二定律（箭頭長短＝力的大小，算合力、加速度）
   inertia   慣性（公車煞車／起動，乘客傾倒）
   action    作用力與反作用力（兩人互推）
   circular  圓周運動（切線速度、向心力、繩斷沿切線飛出、繞地球、位移與路徑長）
   gravity   萬有引力（質量、距離改變時引力變幾倍）
*/
(function(){
"use strict";
const FONT = "'Microsoft JhengHei','Noto Sans TC',sans-serif";
const C = {v:"#2563eb", a:"#ea580c", net:"#9333ea", ink:"#111827", muted:"#6b7280", sky:"#e0f2fe", brand:"#1e3a8a", ok:"#15803d"};
const PAL = ["#dc2626","#2563eb","#16a34a","#9333ea"];
const FORCE_COLOR = {applied:"#dc2626", friction:"#b45309", normal:"#16a34a", weight:"#7c3aed", net:"#9333ea"};

let cv = null, g = null, W = 900, H = 420;

/* ---------- 小工具 ---------- */
function fmt(x, d){
  if(typeof x!=="number" || !isFinite(x)) return "?";
  const p = Math.pow(10, d==null ? 3 : d);
  let r = Math.round(x*p)/p; if(Object.is(r,-0)) r = 0;
  return (r<0?"−":"") + String(Math.abs(r));
}
const num = (x, def) => (typeof x==="number" && isFinite(x)) ? x : (typeof x==="string" && x.trim()!=="" && isFinite(+x)) ? +x : def;
const clamp = (x, a, b) => Math.max(a, Math.min(b, x));
const smooth = x => { x = clamp(x,0,1); return x*x*(3-2*x); };
function niceStep(range){
  for(const s of [0.1,0.2,0.25,0.5,1,2,2.5,5,10,20,25,50,100,200,250,500,1000,2000,5000]) if(range/s <= 7) return s;
  return Math.pow(10, Math.ceil(Math.log10(range/7)));
}
function font(sz, bold){ g.font = (bold?"bold ":"") + sz + "px " + FONT; }
function text(s, x, y, o){
  o = o || {};
  font(o.size||15, o.bold); g.fillStyle = o.color||C.ink; g.textAlign = o.align||"left";
  g.fillText(String(s), x, y);
}
// 自動換行，回傳最後一行的下一行 y
function wrap(s, x, y, maxW, o){
  o = o || {}; font(o.size||15, o.bold); g.fillStyle = o.color||C.ink; g.textAlign = "left";
  const lh = o.lh || Math.round((o.size||15)*1.5);
  let line = "";
  for(const ch of String(s)){
    if(ch==="\n"){ g.fillText(line, x, y); y += lh; line = ""; continue; }
    if(g.measureText(line+ch).width > maxW && line){ g.fillText(line, x, y); y += lh; line = ch; }
    else line += ch;
  }
  if(line){ g.fillText(line, x, y); y += lh; }
  return y;
}
function arrow(x1, y1, x2, y2, color, label, o){
  o = o || {};
  const dx = x2-x1, dy = y2-y1, L = Math.hypot(dx, dy);
  g.strokeStyle = color; g.fillStyle = color; g.lineWidth = o.w||5; g.lineCap = "round";
  if(L < 8){ g.beginPath(); g.arc(x1, y1, 4, 0, 7); g.fill(); }
  else{
    const ux = dx/L, uy = dy/L, h = Math.min(16, L*0.55), s = h*0.62;
    g.beginPath(); g.moveTo(x1, y1); g.lineTo(x2-ux*h, y2-uy*h); g.stroke();
    g.beginPath(); g.moveTo(x2, y2); g.lineTo(x2-ux*h-uy*s, y2-uy*h+ux*s); g.lineTo(x2-ux*h+uy*s, y2-uy*h-ux*s); g.closePath(); g.fill();
  }
  if(label){
    const vertical = Math.abs(dy) > Math.abs(dx);
    const lx = o.lx!=null ? o.lx : (vertical ? x1 + (o.side==="left" ? -10 : 10) : (x1+x2)/2);
    const ly = o.ly!=null ? o.ly : (vertical ? (y1+y2)/2 + 5 : y1 - 12);
    text(label, lx, ly, {color, bold:true, size:o.size||15, align: o.align || (vertical ? (o.side==="left"?"right":"left") : "center")});
  }
}
function dashLine(x1, y1, x2, y2, color, w){
  g.strokeStyle = color; g.lineWidth = w||2; g.setLineDash([6,5]);
  g.beginPath(); g.moveTo(x1,y1); g.lineTo(x2,y2); g.stroke(); g.setLineDash([]);
}
function rrect(x, y, w, h, r){ g.beginPath(); if(g.roundRect) g.roundRect(x, y, w, h, r); else g.rect(x, y, w, h); }
function sky(y0, y1, c0, c1){
  const gr = g.createLinearGradient(0, y0, 0, y1); gr.addColorStop(0, c0||"#e0f2fe"); gr.addColorStop(1, c1||"#f8fafc");
  g.fillStyle = gr; g.fillRect(0, y0, W, y1-y0);
}

/* ---------- 物體圖示 ---------- */
function drawCar(px, base, color, flip){
  g.save(); g.translate(px, base); if(flip) g.scale(-1, 1);
  g.fillStyle = color||"#dc2626";
  rrect(-38, -34, 76, 22, 6); g.fill();
  rrect(-22, -50, 40, 20, 8); g.fill();
  g.fillStyle = "#bfdbfe"; g.fillRect(-16, -46, 12, 12); g.fillRect(0, -46, 12, 12);
  g.fillStyle = "#111827"; for(const dx of [-22,22]){ g.beginPath(); g.arc(dx, -10, 9, 0, 7); g.fill(); }
  g.fillStyle = "#9ca3af"; for(const dx of [-22,22]){ g.beginPath(); g.arc(dx, -10, 3.5, 0, 7); g.fill(); }
  g.restore();
  return 50;
}
function drawPerson(px, base, color, h, lean, phase){
  h = h||70; lean = lean||0;
  g.save(); g.translate(px, base); g.rotate(lean);
  g.strokeStyle = color||"#1f2937"; g.fillStyle = color||"#1f2937"; g.lineWidth = Math.max(3, h/16); g.lineCap = "round";
  const legH = h*0.42, bodyH = h*0.36, head = h*0.11, sw = phase==null ? 0.25 : Math.sin(phase)*0.45;
  g.beginPath();
  g.moveTo(0, -legH); g.lineTo(Math.sin(sw)*legH, 0);
  g.moveTo(0, -legH); g.lineTo(-Math.sin(sw)*legH, 0);
  g.moveTo(0, -legH); g.lineTo(0, -legH-bodyH);
  g.moveTo(0, -legH-bodyH*0.8); g.lineTo(-Math.sin(sw)*bodyH*0.9, -legH-bodyH*0.2);
  g.moveTo(0, -legH-bodyH*0.8); g.lineTo(Math.sin(sw)*bodyH*0.9, -legH-bodyH*0.2);
  g.stroke();
  g.beginPath(); g.arc(0, -legH-bodyH-head, head, 0, 7); g.fill();
  g.restore();
  return h;
}
function drawIcon(icon, px, base, color, v, t){
  if(icon==="car") return drawCar(px, base, color, v<0);
  if(icon==="person") return drawPerson(px, base, color, 64, 0, Math.abs(v)>1e-9 ? t*9 : null);
  if(icon==="block"){ g.fillStyle = color; rrect(px-26, base-40, 52, 40, 6); g.fill(); return 40; }
  if(icon==="ball" || !icon){ g.fillStyle = color; g.beginPath(); g.arc(px, base-15, 15, 0, 7); g.fill();
    g.fillStyle = "rgba(255,255,255,.45)"; g.beginPath(); g.arc(px-5, base-20, 5, 0, 7); g.fill(); return 30; }
  // 其他：當作文字／emoji
  font(34); g.textAlign = "center"; g.fillStyle = color; g.fillText(icon, px, base-4); return 36;
}

/* ---------- 座標圖 ---------- */
function plot(r, T, series, o){
  o = o || {};
  const N = 160;
  let lo = 0, hi = 0;
  for(const s of series) for(let i=0;i<=N;i++){ const v = s.f(T*i/N); if(isFinite(v)){ lo = Math.min(lo, v); hi = Math.max(hi, v); } }
  if(hi-lo < 1e-9) hi = lo + 1;
  const pad = (hi-lo)*0.1; hi += pad; if(lo < 0) lo -= pad;
  const X = t => r.x0 + (t/T)*(r.x1-r.x0);
  const Y = v => r.y1 - (v-lo)/(hi-lo)*(r.y1-r.y0);
  // 格線
  const ys = niceStep(hi-lo), ts = niceStep(T);
  g.lineWidth = 1; g.strokeStyle = "#eef2f7";
  font(12); g.fillStyle = "#4b5563"; g.textAlign = "right";
  for(let v = Math.ceil(lo/ys)*ys; v <= hi+1e-9; v += ys){
    g.beginPath(); g.moveTo(r.x0, Y(v)); g.lineTo(r.x1, Y(v)); g.stroke();
    g.fillText(fmt(v, 2), r.x0-5, Y(v)+4);
  }
  g.textAlign = "center";
  for(let t = 0; t <= T+1e-9; t += ts){
    g.beginPath(); g.moveTo(X(t), r.y0); g.lineTo(X(t), r.y1); g.stroke();
    g.fillText(fmt(t, 2), X(t), r.y1+14);
  }
  g.strokeStyle = "#6b7280"; g.lineWidth = 1.5;
  g.beginPath(); g.moveTo(r.x0, r.y0-4); g.lineTo(r.x0, r.y1); g.moveTo(r.x0, Y(0)); g.lineTo(r.x1+8, Y(0)); g.stroke();
  text(o.yLabel||"", r.x0+6, r.y0-6, {size:13, bold:true, color:"#374151"});
  text(o.tLabel||"t", r.x1+8, Y(0)-6, {size:13, color:"#374151", align:"right"});
  const now = clamp(o.now==null ? T : o.now, 0, T);
  // 面積（v-t 圖的位移）
  if(o.shade!=null && now > 0){
    const f = series[o.shade].f;
    g.fillStyle = "rgba(37,99,235,.16)"; g.beginPath(); g.moveTo(X(0), Y(0));
    for(let i=0;i<=N;i++){ const t = now*i/N; g.lineTo(X(t), Y(f(t))); }
    g.lineTo(X(now), Y(0)); g.closePath(); g.fill();
    if(o.areaLabel){
      const tm = now/2;
      text(o.areaLabel, X(tm), (Y(0)+Y(f(tm)))/2 + 5, {size:13, bold:true, color:C.brand, align:"center"});
    }
  }
  for(const s of series){
    g.strokeStyle = "#cbd5e1"; g.lineWidth = 2; g.setLineDash([5,5]);
    g.beginPath(); for(let i=0;i<=N;i++){ const t = T*i/N; i ? g.lineTo(X(t), Y(s.f(t))) : g.moveTo(X(t), Y(s.f(t))); } g.stroke();
    g.setLineDash([]);
    g.strokeStyle = s.color; g.lineWidth = 3;
    g.beginPath(); for(let i=0;i<=N;i++){ const t = now*i/N; i ? g.lineTo(X(t), Y(s.f(t))) : g.moveTo(X(t), Y(s.f(t))); } g.stroke();
    g.fillStyle = s.color; g.beginPath(); g.arc(X(now), Y(s.f(now)), 5, 0, 7); g.fill();
  }
  return {X, Y};
}

/* ======================================================================
   motion：直線運動
   {type:"motion", bodies:[{label, icon:"car|ball|person|block|emoji", color, x0, v0,
                            segs:[{t:時間, a:加速度, v:這段一開始的速度(可省)}]}],
    graph:"vt|xt|both|none", vertical:"down|up"(自由落體用), units:{x,t,v,a},
    marks:[{x, label}], showPath:true, posLabel:"向東為正 →", T}
   ====================================================================== */
function mkBody(b, i){
  const segs = []; let x = num(b.x0, 0), v = num(b.v0, 0), t0 = 0;
  const list = Array.isArray(b.segs) && b.segs.length ? b.segs : [{t: num(b.t, 5), a: num(b.a, 0)}];
  for(const s of list.slice(0, 12)){
    if(num(s.v, null)!==null) v = num(s.v, 0);
    const a = num(s.a, 0), d = Math.max(0, num(s.t, 0));
    segs.push({t0, t1:t0+d, x0:x, v0:v, a});
    x += v*d + 0.5*a*d*d; v += a*d; t0 += d;
  }
  const end = {x, v, t:t0};
  const seg = t => segs.find(s => t <= s.t1 + 1e-12);
  return {
    label: b.label || "", icon: b.icon || "car", color: b.color || PAL[i % PAL.length], x0: num(b.x0, 0), end,
    pos(t){ const s = seg(t); if(!s) return end.x + end.v*(t-end.t); const d = t-s.t0; return s.x0 + s.v0*d + 0.5*s.a*d*d; },
    vel(t){ const s = seg(t); if(!s) return end.v; return s.v0 + s.a*(t-s.t0); },
    acc(t){ const s = seg(t); return s ? s.a : 0; }
  };
}
function pathLen(b, t){ let s = 0; const n = 240; for(let i=0;i<n;i++){ s += Math.abs(b.vel(t*(i+0.5)/n)) * t/n; } return s; }

const motion = {
  hint(s){
    const gph = s.graph || "vt";
    return (s.strobe ? "黃色點＝每隔相同時間留下的位置：點的間隔越大，跑得越快。" : "") + "藍色箭頭＝速度，橘色箭頭＝加速度。" +
      (gph==="vt" ? "下方是「速度–時間圖」，藍色面積就是位移。" : gph==="xt" ? "下方是「位置–時間圖」，線越斜代表跑越快。" : gph==="both" ? "下方左邊是「位置–時間圖」，右邊是「速度–時間圖」。" : "");
  },
  init(s){
    const U = Object.assign({x:"m", t:"s", v:"m/s", a:"m/s²"}, s.units||{});
    const raw = Array.isArray(s.bodies) && s.bodies.length ? s.bodies : [s];
    const bodies = raw.slice(0, 3).map(mkBody);
    let T = num(s.T, 0) || Math.max(...bodies.map(b=>b.end.t)); if(!(T>0)) T = 5;
    let mn = Infinity, mx = -Infinity;
    for(const b of bodies) for(let i=0;i<=200;i++){ const x = b.pos(T*i/200); mn = Math.min(mn, x); mx = Math.max(mx, x); }
    for(const m of (s.marks||[])){ const x = num(m.x, null); if(x!==null){ mn = Math.min(mn, x); mx = Math.max(mx, x); } }
    if(num(s.ground, null)!==null){ mn = Math.min(mn, s.ground); mx = Math.max(mx, s.ground); }
    if(mx-mn < 1e-9){ mn -= 1; mx += 1; }
    let maxV = 1e-9;
    for(const b of bodies) for(let i=0;i<=200;i++) maxV = Math.max(maxV, Math.abs(b.vel(T*i/200)));
    const vert = s.vertical==="down" || s.vertical==="up" ? s.vertical : null;
    return {s, U, bodies, T, mn, mx, maxV, vert, graph: s.graph || "vt",
            dur: U.t==="s" ? clamp(T*1000, 3000, 8000) : 5000};
  },
  draw(st, t){ st.vert ? motion.vertical(st, t) : motion.horizontal(st, t); },
  graphs(st, t, rects){
    const {bodies, U, T} = st, gph = st.graph, single = bodies.length===1;
    const vs = bodies.map(b=>({f:t=>b.vel(t), color:b.color}));
    const xs = bodies.map(b=>({f:t=>b.pos(t), color:b.color}));
    const disp = single ? bodies[0].pos(t) - bodies[0].x0 : 0;
    const vOpt = {yLabel:`v (${U.v})`, tLabel:`t (${U.t})`, now:t, shade: single ? 0 : null,
                  areaLabel: single && t>0 && Math.abs(disp)>1e-9 ? `面積 = 位移 = ${fmt(disp)} ${U.x}` : ""};
    const xOpt = {yLabel:`位置 (${U.x})`, tLabel:`t (${U.t})`, now:t};
    if(gph==="vt") plot(rects[0], T, vs, vOpt);
    else if(gph==="xt") plot(rects[0], T, xs, xOpt);
    else if(gph==="both"){ plot(rects[0], T, xs, xOpt); plot(rects[1], T, vs, vOpt); }
  },
  hud(st, t, x, y, align){
    const {bodies, U} = st;
    const lines = [`t = ${fmt(t, 2)} ${U.t}`];
    for(const b of bodies){
      const nm = bodies.length>1 ? b.label + "：" : "";
      lines.push(`${nm}v = ${fmt(b.vel(t), 2)} ${U.v}　位置 = ${fmt(b.pos(t), 2)} ${U.x}`);
    }
    if(st.s.showPath && bodies.length===1){
      const b = bodies[0];
      lines.push(`位移 = ${fmt(b.pos(t)-b.x0, 2)} ${U.x}　路徑長 = ${fmt(pathLen(b, t), 2)} ${U.x}`);
    }
    lines.forEach((l, i)=>text(l, x, y + i*19, {size:14, bold:i===0, align}));
  },
  horizontal(st, t){
    const {s, bodies, U, T, mn, mx, maxV} = st;
    const hasG = st.graph!=="none";
    const n = bodies.length, hudLast = 22 + 19*(n + (s.showPath && n===1 ? 1 : 0));
    const top = Math.max(64, hudLast + 34), bot = hasG ? 214 : H-70;
    sky(0, bot);
    text(s.posLabel || "正方向（+）→", 14, 24, {bold:true, size:15, color:C.brand});
    motion.hud(st, t, W-14, 22, "right");
    const L = 70, R = W-60, sc = (R-L)/(mx-mn), X = x => L + (x-mn)*sc;
    // 標記
    const marks = (s.marks||[]).slice();
    if(s.start!==false && !marks.some(m=>Math.abs(num(m.x,1e9)-bodies[0].x0) < 1e-9)) marks.push({x:bodies[0].x0, label:"出發點"});
    for(const m of marks){ const x = num(m.x, null); if(x===null) continue;
      dashLine(X(x), top-4, X(x), bot, "#16a34a"); text(m.label||"", X(x), top-8, {size:13, color:"#15803d", align:"center", bold:true}); }
    // 刻度
    const step = niceStep(mx-mn);
    g.fillStyle = "#374151";
    for(let m = Math.ceil(mn/step)*step; m <= mx+1e-9; m += step){
      g.fillRect(X(m)-1, bot, 2, 7); text(`${fmt(m,2)} ${U.x}`, X(m), bot+21, {size:12, align:"center", color:"#374151"});
    }
    const laneH = (bot-top)/n, roadH = n===1 ? 22 : 12;
    bodies.forEach((b, i)=>{
      const base = top + laneH*(i+1) - roadH;
      g.fillStyle = "#4b5563"; g.fillRect(0, base, W, roadH);
      if(n===1){ g.strokeStyle = "#f9fafb"; g.setLineDash([18,14]); g.lineWidth = 2; g.beginPath(); g.moveTo(0, base+roadH/2); g.lineTo(W, base+roadH/2); g.stroke(); g.setLineDash([]); }
      const x = b.pos(t), v = b.vel(t), a = b.acc(t), px = X(x);
      // 頻閃／打點：每隔相同時間在路上留下一個點
      const ns = num(s.strobe, 0);
      if(ns > 0) for(let k=0; k<=ns; k++){ const tk = T*k/ns; if(tk > t+1e-9) break;
        g.fillStyle = "#facc15"; g.beginPath(); g.arc(X(b.pos(tk)), base + roadH/2, 5, 0, 7); g.fill();
        g.strokeStyle = "#78350f"; g.lineWidth = 1; g.stroke(); }
      const ih = drawIcon(b.icon, px, base, b.color, v, t);
      if(n>1) text(b.label, 10, base-6, {size:14, bold:true, color:b.color});
      const vy = base - ih - 16;
      if(n > 1){   // 多個物體：速度箭頭畫在車頭前面，才不會擠在一起
        const sg = v < 0 ? -1 : 1, x0 = px + sg*42, ay = base - ih/2 - 2, x1 = x0 + v/maxV*90;
        if(Math.abs(v) > 1e-9) arrow(x0, ay, x1, ay, C.v, "", {w:4});
        text(`v = ${fmt(v,2)}`, (Math.abs(v) > 1e-9 ? x1 : x0) + sg*6, ay+5, {size:13, bold:true, color:C.v, align: sg>0 ? "left" : "right"});
      }else
      arrow(px, vy, px + v/maxV*120, vy, C.v, `v = ${fmt(v,2)} ${U.v}`, {size:14});
      if(laneH >= 120 && Math.abs(a) > 1e-12 && t < T-1e-9) arrow(px, vy-36, px + Math.sign(a)*80, vy-36, C.a, `a = ${fmt(a,2)} ${U.a}`, {size:14});
      if(n===1 && t >= T-1e-9 && Math.abs(v) < 1e-9 && Math.abs(b.acc(T-1e-6))>1e-12) text("停下來了！", px, vy-36, {bold:true, size:16, color:C.ok, align:"center"});
    });
    if(hasG){
      const y0 = bot+48, y1 = H-24;
      if(st.graph==="both"){ const mid = W/2; motion.graphs(st, t, [{x0:62, y0, x1:mid-30, y1}, {x0:mid+50, y0, x1:W-28, y1}]); }
      else motion.graphs(st, t, [{x0:70, y0, x1:W-30, y1}]);
    }
  },
  vertical(st, t){
    const {s, bodies, U, T, mn, mx, maxV} = st, down = st.vert==="down";
    const colR = Math.min(320, W*0.4), top = 50, bot = H-36;
    sky(0, H); g.fillStyle = "#fff"; g.fillRect(colR, 0, W-colR, H);
    g.strokeStyle = "#e5e7eb"; g.lineWidth = 1; g.beginPath(); g.moveTo(colR, 0); g.lineTo(colR, H); g.stroke();
    text(s.posLabel || (down ? "向下為正（+）↓" : "向上為正（+）↑"), 12, 24, {bold:true, size:15, color:C.brand});
    const sc = (bot-top)/(mx-mn), Y = x => down ? top + (x-mn)*sc : bot - (x-mn)*sc;
    const step = niceStep(mx-mn);
    g.fillStyle = "#374151";
    for(let m = Math.ceil(mn/step)*step; m <= mx+1e-9; m += step){
      g.fillRect(58, Y(m)-1, 8, 2); text(`${fmt(m,2)} ${U.x}`, 54, Y(m)+4, {size:12, align:"right", color:"#374151"});
    }
    g.fillStyle = "#94a3b8"; g.fillRect(64, top, 2, bot-top);
    if(num(s.ground, null)!==null){ g.fillStyle = "#a16207"; g.fillRect(70, Y(s.ground) + (down?15:0), colR-80, 14); }
    for(const m of (s.marks||[])){ const x = num(m.x, null); if(x===null) continue; dashLine(70, Y(x), colR-10, Y(x), "#16a34a"); text(m.label||"", colR-12, Y(x)-5, {size:13, color:"#15803d", align:"right", bold:true}); }
    const cx = colR*0.42;
    bodies.forEach((b, i)=>{
      const x = b.pos(t), v = b.vel(t), a = b.acc(t), py = Y(x), bx = cx + i*46;
      g.fillStyle = b.color; g.beginPath(); g.arc(bx, py, 14, 0, 7); g.fill();
      g.fillStyle = "rgba(255,255,255,.45)"; g.beginPath(); g.arc(bx-4, py-5, 4.5, 0, 7); g.fill();
      const dir = down ? 1 : -1;
      if(i===0){
        const vEnd = py + dir*v/maxV*110, aEnd = py + dir*Math.sign(a)*60;
        arrow(bx+40, py, bx+40, vEnd, C.v, `v = ${fmt(v,2)}`, {size:14, lx:bx+40, ly:Math.min(py, vEnd)-10, align:"center"});
        if(Math.abs(a) > 1e-12) arrow(bx+120, py, bx+120, aEnd, C.a, `a = ${fmt(a,2)}`, {size:14, lx:bx+120, ly:Math.min(py, aEnd)-10, align:"center"});
      }
    });
    const hx = colR + 16;
    motion.hud(st, t, hx, 24, "left");
    const extra = 19*(bodies.length + (s.showPath ? 1 : 0)) + 34;
    const y0 = extra + 22, y1 = H-26, x0 = hx + 48, x1 = W-24;
    if(st.graph==="both"){ const mid = (y0+y1)/2; motion.graphs(st, t, [{x0, y0, x1, y1:mid-22}, {x0, y0:mid+22, x1, y1}]); }
    else if(st.graph!=="none") motion.graphs(st, t, [{x0, y0, x1, y1}]);
  }
};

/* ======================================================================
   pendulum：單擺   {type:"pendulum", items:[{L:擺長(m), m:質量, amp:擺幅(度), label}], g:9.8, T}
   ====================================================================== */
const pendulum = {
  hint(){ return "週期＝來回擺動一次的時間。擺長越長，週期越長；和擺錘輕重、擺幅（小角度時）無關。"; },
  init(s){
    const g0 = num(s.g, 9.8);
    const items = (Array.isArray(s.items) && s.items.length ? s.items : [{L:1}]).slice(0, 3).map((it, i)=>{
      const L = Math.max(0.05, num(it.L, 1));
      return {L, m: Math.max(0.01, num(it.m, 1)), amp: clamp(num(it.amp, 12), 2, 30)*Math.PI/180,
              label: it.label || `擺長 ${fmt(L*100, 1)} cm`, color: it.color || PAL[i], P: 2*Math.PI*Math.sqrt(L/g0)};
    });
    const maxP = Math.max(...items.map(i=>i.P));
    const T = num(s.T, 0) || maxP*3;
    return {s, items, T, dur: clamp(T*1000, 4000, 14000)};
  },
  draw(st, t){
    const {items} = st, n = items.length;
    sky(0, H, "#f0f9ff", "#ffffff");
    const pivotY = 46, maxL = Math.max(...items.map(i=>i.L)), ppm = (H-170)/maxL, minM = Math.min(...items.map(i=>i.m));
    g.fillStyle = "#475569"; g.fillRect(20, pivotY-10, W-40, 8);
    text(`t = ${fmt(t, 2)} 秒`, W-14, 24, {size:15, bold:true, align:"right"});
    items.forEach((it, i)=>{
      const px = W*(i+0.5)/n, Lp = it.L*ppm, th = it.amp*Math.cos(2*Math.PI*t/it.P);
      g.strokeStyle = "#cbd5e1"; g.lineWidth = 2; g.setLineDash([4,5]);
      g.beginPath(); g.arc(px, pivotY, Lp, Math.PI/2-it.amp, Math.PI/2+it.amp); g.stroke(); g.setLineDash([]);
      dashLine(px, pivotY, px, pivotY+Lp+20, "#e2e8f0", 1);
      const bx = px + Lp*Math.sin(th), by = pivotY + Lp*Math.cos(th);
      g.strokeStyle = "#334155"; g.lineWidth = 2; g.beginPath(); g.moveTo(px, pivotY); g.lineTo(bx, by); g.stroke();
      const rad = clamp(11 + 9*(Math.cbrt(it.m/minM)-1), 11, 28);
      g.fillStyle = it.color; g.beginPath(); g.arc(bx, by, rad, 0, 7); g.fill();
      g.fillStyle = "#334155"; g.beginPath(); g.arc(px, pivotY, 4, 0, 7); g.fill();
      const count = Math.floor(t/it.P + 1e-6);
      text(it.label, px, H-62, {size:15, bold:true, align:"center", color:it.color});
      if(st.s.showP!==false) text(`週期約 ${fmt(it.P, 2)} 秒`, px, H-40, {size:14, align:"center"});
      text(`已經來回 ${count} 次`, px, H-18, {size:14, align:"center", color:C.muted});
    });
  }
};

/* ======================================================================
   forces：受力分析＋牛頓第二定律
   {type:"forces", m:質量, obj:"木箱", unit:"N", surface:"rough|smooth|table|none",
    forces:[{label:"拉力", v:20, dir:"right|left|up|down", kind:"applied|friction|normal|weight"}],
    v0:初速, T:秒數, static:true(不動)}
   ====================================================================== */
function sumText(list, pos, neg){
  const p = list.filter(f=>f.dir===pos), q = list.filter(f=>f.dir===neg);
  if(!p.length && !q.length) return null;
  let s = p.map(f=>fmt(f.v)).join(" + ") || "0";
  if(q.length) s += " − " + q.map(f=>fmt(f.v)).join(" − ");
  return s;
}
const DIR_NAME = {right:"向右", left:"向左", up:"向上", down:"向下"};
const forces = {
  hint(){ return "箭頭的長短代表力的大小，紫色箭頭是合力。合力 ＝ 0 時，物體保持原來的運動狀態（靜止或等速）。"; },
  init(s){
    const m = Math.max(1e-6, num(s.m, 1)), unit = s.unit || "N";
    const list = (Array.isArray(s.forces) ? s.forces : []).slice(0, 6).map(f=>({
      label: f.label || "力", v: Math.abs(num(f.v, 0)), dir: DIR_NAME[f.dir] ? f.dir : "right",
      kind: f.kind || (/摩擦/.test(f.label||"") ? "friction" : /重/.test(f.label||"") ? "weight" : /支撐|正向|垂直/.test(f.label||"") ? "normal" : "applied")}));
    const netH = list.reduce((s,f)=>s + (f.dir==="right" ? f.v : f.dir==="left" ? -f.v : 0), 0);
    const netV = list.reduce((s,f)=>s + (f.dir==="up" ? f.v : f.dir==="down" ? -f.v : 0), 0);
    const a = s.static ? 0 : netH/m, v0 = s.static ? 0 : num(s.v0, 0), T = num(s.T, 3);
    const xs = []; for(let i=0;i<=60;i++){ const tt = T*i/60; xs.push(v0*tt + 0.5*a*tt*tt); }
    const maxF = Math.max(1e-9, ...list.map(f=>f.v), Math.abs(netH));
    return {s, m, unit, list, netH, netV, a, v0, T, xmin: Math.min(...xs), xmax: Math.max(...xs), maxF,
            dur: clamp(T*1000, 3000, 7000)};
  },
  draw(st, t){
    const {s, m, unit, list, netH, netV, a, v0, T, xmin, xmax, maxF} = st;
    const floorY = 190, topY = 0;
    sky(topY, floorY);
    // 地面
    const surf = s.surface || "rough";
    if(surf!=="none"){
      g.fillStyle = surf==="smooth" ? "#bae6fd" : surf==="table" ? "#d6a46c" : "#a8a29e"; g.fillRect(0, floorY, W, 18);
      if(surf==="rough"){ g.strokeStyle = "#78716c"; g.lineWidth = 1; for(let x=0;x<W;x+=12){ g.beginPath(); g.moveTo(x, floorY+18); g.lineTo(x+10, floorY); g.stroke(); } }
      text(surf==="smooth" ? "光滑（沒有摩擦）" : surf==="table" ? "桌面" : "粗糙地面", 12, floorY+14, {size:12, color:"#334155"});
    }
    const x = v0*t + 0.5*a*t*t, v = v0 + a*t, range = xmax-xmin;
    const lenOf = d => Math.max(0, ...list.filter(f=>f.dir===d).map(f=>26 + f.v/maxF*130));
    const L = Math.max(130, 52 + lenOf("left") + 60), R = Math.min(W-130, W - 52 - lenOf("right") - 60);
    const bx = range > 1e-9 && R > L ? L + (x-xmin)/range*(R-L) : W*0.45;
    if(range > 1e-9){ g.fillStyle = "#64748b"; for(let i=0;i<=10;i++) g.fillRect(L + (R-L)*i/10 - 1, floorY+18, 2, 6); }
    const bw = 104, bh = 72, by = floorY - bh, cy = floorY - bh/2;
    g.fillStyle = "#f59e0b"; rrect(bx-bw/2, by, bw, bh, 8); g.fill();
    g.strokeStyle = "#b45309"; g.lineWidth = 2; rrect(bx-bw/2, by, bw, bh, 8); g.stroke();
    text(s.obj || "物體", bx, cy-2, {size:15, bold:true, align:"center", color:"#451a03"});
    text(`${fmt(m)} kg`, bx, cy+18, {size:14, align:"center", color:"#451a03"});
    // 力的箭頭
    const lenH = f => 26 + f.v/maxF*130, lenV = f => 18 + f.v/maxF*42;
    let rN = 0, lN = 0;
    for(const f of list){
      const col = FORCE_COLOR[f.kind] || FORCE_COLOR.applied, lab = `${f.label} ${fmt(f.v)} ${unit}`;
      if(f.dir==="right" || f.dir==="left"){
        const sg = f.dir==="right" ? 1 : -1;
        const y = f.kind==="friction" ? floorY-8 : cy - 12 - (sg>0 ? rN++ : lN++)*30;
        const x0 = bx + sg*bw/2;
        arrow(x0, y, x0 + sg*lenH(f), y, col, lab, {size:14});
      }else if(f.dir==="up"){
        arrow(bx+18, by, bx+18, by - lenV(f), col, lab, {size:14});
      }else{
        arrow(bx-18, floorY, bx-18, floorY + lenV(f), col, lab, {size:14, side:"left"});
      }
    }
    // 合力
    const ny = 34;
    if(s.showNet!==false){
      if(Math.abs(netH) > 1e-9) arrow(bx, ny, bx + Math.sign(netH)*lenH({v:Math.abs(netH)}), ny, FORCE_COLOR.net, `合力 ${fmt(Math.abs(netH))} ${unit}`, {size:14, ly:ny-10});
      else text("水平合力 = 0", bx, ny, {size:15, bold:true, color:FORCE_COLOR.net, align:"center"});
    }
    if(!s.static) text(`t = ${fmt(t, 2)} s　v = ${fmt(v, 2)} m/s`, W-14, 22, {size:14, bold:true, align:"right"});
    // 下方說明
    const py = 272, small = W < 720;
    const tw = small ? W - 28 : W*0.56;
    const hs = sumText(list, "right", "left"), vs = sumText(list, "up", "down");
    const lines = [];
    if(hs!==null){
      const d = Math.abs(netH) < 1e-9 ? "" : netH > 0 ? "（向右）" : "（向左）";
      lines.push(`水平方向合力 = ${hs} = ${fmt(Math.abs(netH))} ${unit}${d}`);
      if(!s.static){
        lines.push(Math.abs(netH) < 1e-9
          ? `合力 = 0 → a = 0，${Math.abs(v0)>1e-9 ? "保持等速度前進" : "保持靜止"}（牛頓第一定律）`
          : `a = 合力 ÷ m = ${fmt(Math.abs(netH))} ÷ ${fmt(m)} = ${fmt(Math.abs(a))} m/s²`);
      }
    }
    if(vs!==null) lines.push(`垂直方向：${vs} = ${fmt(Math.abs(netV))} ${unit}${Math.abs(netV)<1e-9 ? "（上下平衡）" : ""}`);
    if(s.note) lines.push(s.note);
    let yy = py;
    for(const l of lines) yy = wrap(l, 14, yy, tw, {size: small ? 14 : 15, bold: l===lines[1] && !s.static});
    if(!small && !s.static){
      plot({x0: W*0.64, y0: py-20, x1: W-26, y1: H-26}, T, [{f: tt=>v0 + a*tt, color:C.v}], {yLabel:"v (m/s)", tLabel:"t (s)", now:t});
    }
  }
};

/* ======================================================================
   inertia：慣性   {type:"inertia", mode:"brake|start"}
   ====================================================================== */
const inertia = {
  hint(s){ if(s.mode==="coin") return "卡片被快速抽走時，硬幣因為慣性保持靜止，接著因重力掉下。"; return s.mode==="start" ? "車子突然起動時，乘客的身體因為慣性還想「保持靜止」，所以會向後傾。" : "車子突然煞車時，乘客的身體因為慣性還想「保持原來的速度」，所以會向前傾。"; },
  init(s){ if(s.mode==="coin") return {s, coin:true, T:3, dur:5000}; return {s, start: s.mode==="start", T:6, dur:7500}; },
  // 硬幣放在卡片上、卡片快速彈走 → 硬幣因為慣性留在原地，掉進瓶子
  coin(st, t){
    sky(0, H, "#f8fafc", "#ffffff");
    const cx = W*0.4, tableY = H-80, bw = 90, bh = 150, neck = 34, topY = tableY - bh - 30;
    g.fillStyle = "#a16207"; g.fillRect(0, tableY, W, 14);
    g.fillStyle = "rgba(186,230,253,.55)"; g.strokeStyle = "#0284c7"; g.lineWidth = 2;
    rrect(cx-bw/2, tableY-bh, bw, bh, 14); g.fill(); g.stroke();
    g.fillRect(cx-neck/2, topY, neck, 30); g.strokeRect(cx-neck/2, topY, neck, 30);
    const flick = 0.8, fly = clamp((t-flick)/0.15, 0, 1);
    const cardX = cx - 70 + fly*(W);   // 卡片一下子被彈走
    g.fillStyle = "#f472b6"; g.fillRect(cardX, topY-8, 140, 8);
    const fall = Math.max(0, t - flick - 0.05), coinBottom = tableY - 10;
    const cy = Math.min(topY - 16 + 0.5*900*fall*fall, coinBottom - 8);
    g.fillStyle = "#facc15"; g.beginPath(); g.ellipse(cx, cy, 16, 6, 0, 0, 7); g.fill(); g.strokeStyle = "#a16207"; g.stroke();
    if(t < flick) arrow(cx+90, topY-30, cx+30, topY-30, "#dc2626", "手指準備彈卡片", {size:14, ly:topY-42});
    text(`t = ${fmt(t, 2)} s`, W-14, 24, {size:14, bold:true, align:"right"});
    const msg = t < flick ? "硬幣放在卡片上，卡片放在瓶口。" : t < flick + 0.3 ? "卡片被快速彈走！硬幣幾乎沒有受到水平的力，因為慣性，留在原地。" : "硬幣下面沒有支撐了，受重力直直掉進瓶子裡。";
    wrap(msg, W*0.62, 80, W*0.36, {size:16, bold:true});
  },
  prof(st, t){
    if(st.start){
      const v = t<1.5 ? 0 : t<3.5 ? (t-1.5)/2 : 1;
      const x = t<1.5 ? 0 : t<3.5 ? (t-1.5)*(t-1.5)/4 : 1 + (t-3.5);
      const lean = t<1.5 ? 0 : t<3.5 ? -0.38*smooth((t-1.5)/0.5) : -0.38*(1-smooth((t-3.5)/0.7));
      const phase = t<1.5 ? "車子停著：乘客和車子都靜止。" : t<3.5 ? "車子突然向前起動！乘客的腳跟著車子動，但上半身因為慣性還想保持靜止 → 向後傾。" : "車子等速前進：乘客跟車子一起前進，身體慢慢站直。";
      return {v, x, lean, phase, acc: t>=1.5 && t<3.5 ? 1 : 0};
    }
    const v = t<2 ? 1 : t<4 ? 1-(t-2)/2 : 0;
    const x = t<2 ? t : t<4 ? 2 + (t-2) - (t-2)*(t-2)/4 : 3;
    const lean = t<2 ? 0 : t<4 ? 0.38*smooth((t-2)/0.5) : 0.38*(1-smooth((t-4)/0.7));
    const phase = t<2 ? "公車等速前進：乘客和車子用一樣的速度前進。" : t<4 ? "公車突然煞車！乘客的腳跟著車子變慢，但上半身因為慣性還想保持原來的速度 → 向前傾。" : "公車停下來了，乘客慢慢站直。";
    return {v, x, lean, phase, acc: t>=2 && t<4 ? -1 : 0};
  },
  draw(st, t){
    if(st.coin) return inertia.coin(st, t);
    const p = inertia.prof(st, t), groundY = 300;
    sky(0, groundY);
    // 背景（樹）往後退
    const off = p.x*320;
    for(let k=-1; k<12; k++){
      const tx = ((k*170 - off) % (W+170) + (W+170)) % (W+170) - 85;
      g.fillStyle = "#92400e"; g.fillRect(tx-4, groundY-70, 8, 70);
      g.fillStyle = "#4ade80"; g.beginPath(); g.arc(tx, groundY-82, 26, 0, 7); g.fill();
    }
    g.fillStyle = "#4b5563"; g.fillRect(0, groundY, W, 26);
    g.strokeStyle = "#f9fafb"; g.lineWidth = 3; g.setLineDash([24,18]); g.lineDashOffset = off;
    g.beginPath(); g.moveTo(0, groundY+13); g.lineTo(W, groundY+13); g.stroke(); g.setLineDash([]); g.lineDashOffset = 0;
    // 公車
    const bw = Math.min(520, W-120), bx = W/2 - bw/2, bt = 128, bb = groundY-14;
    g.fillStyle = "#facc15"; rrect(bx, bt, bw, bb-bt, 16); g.fill();
    g.fillStyle = "#bae6fd"; rrect(bx+16, bt+14, bw-32, 82, 8); g.fill();
    g.fillStyle = "#eab308"; g.fillRect(bx, bb-26, bw, 10);
    g.fillStyle = "#111827"; for(const dx of [70, bw-70]){ g.beginPath(); g.arc(bx+dx, bb+2, 18, 0, 7); g.fill(); }
    g.fillStyle = "#9ca3af"; for(const dx of [70, bw-70]){ g.beginPath(); g.arc(bx+dx, bb+2, 7, 0, 7); g.fill(); }
    g.fillStyle = "#f59e0b"; g.fillRect(bx+bw-10, bt+100, 10, 22);
    // 乘客（車內）
    drawPerson(W/2, bb-28, "#1e3a8a", 104, p.lean, null);
    text("乘客", W/2 + 44, bt+36, {size:13, bold:true, color:"#1e3a8a"});
    // 速度箭頭
    if(p.v > 1e-6) arrow(W/2-60, 96, W/2-60 + p.v*150, 96, C.v, "車子的速度", {size:14});
    else text("車子：靜止", W/2, 100, {size:15, bold:true, color:C.v, align:"center"});
    if(p.acc) arrow(W/2 + (p.acc>0 ? -90 : 90), 58, W/2 + (p.acc>0 ? 30 : -30), 58, C.a, p.acc>0 ? "加速" : "煞車（減速）", {size:14});
    text("前進方向 →", 14, 24, {size:15, bold:true, color:C.brand});
    g.fillStyle = "rgba(255,255,255,.94)"; g.fillRect(0, groundY+26, W, H-groundY-26);
    wrap(p.phase, 16, groundY+54, W-32, {size: W<720 ? 15 : 17, bold:true, color:"#111827"});
  }
};

/* ======================================================================
   action：作用力與反作用力（兩人互推）
   {type:"action", m1, m2, F, labels:["小明","小華"], tp:互推時間, T, unit:"N"}
   ====================================================================== */
const action = {
  hint(){ return "互推時，兩人受到的力大小相等、方向相反（作用力與反作用力）。質量越小的人，加速度越大，滑得越快。"; },
  init(s){
    const m1 = Math.max(1e-6, num(s.m1, 60)), m2 = Math.max(1e-6, num(s.m2, 40)), F = Math.abs(num(s.F, 120));
    const tp = clamp(num(s.tp, 1), 0.2, 3), T = num(s.T, 4);
    const lab = Array.isArray(s.labels) ? s.labels : ["甲","乙"];
    const a1 = F/m1, a2 = F/m2;
    const d = (a, t) => t<=tp ? 0.5*a*t*t : 0.5*a*tp*tp + a*tp*(t-tp);
    const maxd = Math.max(d(a1, T), d(a2, T)) + 0.5;
    return {s, m1, m2, F, tp, T, a1, a2, d, maxd, unit: s.unit||"N", l1: lab[0]||"甲", l2: lab[1]||"乙", dur: clamp(T*1000*1.4, 4000, 8000)};
  },
  draw(st, t){
    const {m1, m2, F, tp, a1, a2, d, maxd, unit, l1, l2} = st;
    const ice = 250;
    sky(0, ice, "#eff6ff", "#f8fafc");
    g.fillStyle = "#dbeafe"; g.fillRect(0, ice, W, 22); text("光滑冰面", 12, ice+16, {size:12, color:"#1e40af"});
    const gap = 34, sc = (W/2-80-gap)/(maxd-0.5), mx = Math.max(m1, m2);
    const x1 = W/2 - gap - d(a1, t)*sc, x2 = W/2 + gap + d(a2, t)*sc;
    const h1 = 84 + 40*m1/mx, h2 = 84 + 40*m2/mx;
    const icons = Array.isArray(st.s.icons) ? st.s.icons : [];
    const who = (ic, x, col, h) => { if(ic==="ball"){ g.fillStyle = col; g.beginPath(); g.arc(x, ice-18, 18, 0, 7); g.fill(); } else drawPerson(x, ice, col, h, 0, null); };
    who(icons[0], x1, "#dc2626", h1);
    who(icons[1], x2, "#2563eb", h2);
    text(`${l1}（${fmt(m1)} kg）`, x1 + 16, ice+44, {size:14, bold:true, align:"right", color:"#dc2626"});
    text(`${l2}（${fmt(m2)} kg）`, x2 - 16, ice+44, {size:14, bold:true, align:"left", color:"#2563eb"});
    const pushing = t < tp;
    if(pushing){
      const L = 110, y = ice - 70;
      arrow(x1, y, x1 - L, y, "#b91c1c", `${l2}推${l1} ${fmt(F)} ${unit}`, {size:14});
      arrow(x2, y-34, x2 + L, y-34, "#1d4ed8", `${l1}推${l2} ${fmt(F)} ${unit}`, {size:14});
    }else{
      const v1 = a1*tp, v2 = a2*tp, mv = Math.max(v1, v2), y = ice - Math.max(h1, h2) - 22;
      arrow(x1, y, x1 - v1/mv*110, y, C.v, `v = ${fmt(v1, 2)} m/s`, {size:14});
      arrow(x2, y, x2 + v2/mv*110, y, C.v, `v = ${fmt(v2, 2)} m/s`, {size:14});
    }
    text(pushing ? "互推中：兩人受到的力大小相等、方向相反" : "分開後：不再受力，各自在冰面上等速滑行", W/2, 26, {size:16, bold:true, align:"center", color:C.brand});
    text(`t = ${fmt(t, 2)} s`, W-14, 52, {size:14, align:"right"});
    let y = ice + 78;
    y = wrap(`作用力 = 反作用力 = ${fmt(F)} ${unit}（同時出現、大小相等、方向相反，作用在不同物體上）`, 16, y, W-32, {size:15});
    y = wrap(`加速度 a = F ÷ m：${l1} ${fmt(F)} ÷ ${fmt(m1)} = ${fmt(a1, 2)} m/s²；${l2} ${fmt(F)} ÷ ${fmt(m2)} = ${fmt(a2, 2)} m/s²`, 16, y, W-32, {size:15, bold:true});
  }
};

/* ======================================================================
   circular：圓周運動
   {type:"circular", r:半徑, period:週期, center:"pin|earth|none", obj:"ball|moon|emoji",
    release:繩斷的時間, showDisp:true(畫位移與路徑長), units:{r:"m", t:"s"}, lines:[說明], T}
   ====================================================================== */
const circular = {
  hint(s){
    if(s.showDisp) return "橘色是走過的路徑（路徑長），綠色箭頭是位移（起點指向現在位置）。繞一圈回到起點時，位移是 0。";
    if(s.center==="earth") return "月球繞地球轉，需要的向心力就是地球對月球的萬有引力。";
    return "藍色箭頭＝速度（沿切線，方向一直在變），紅色箭頭＝向心力（指向圓心）。";
  },
  init(s){
    const r = Math.max(1e-6, num(s.r, 1)), P = Math.max(0.1, num(s.period, 2));
    const release = num(s.release, null);
    const T = num(s.T, 0) || (release!==null ? release + P*0.2 : s.showDisp ? P : P*2);
    const U = Object.assign({r:"m", t:"s"}, s.units||{});
    return {s, r, P, release, T, U, v: 2*Math.PI*r/P, dur: clamp(T*1000*(num(s.slow, 1)), 4000, 10000)};
  },
  draw(st, t){
    const {s, r, P, release, U, v} = st, earth = s.center==="earth";
    if(earth){ g.fillStyle = "#0f172a"; g.fillRect(0, 0, W, H);
      g.fillStyle = "#e2e8f0"; for(let i=0;i<60;i++){ const sx = (i*137.5)%W, sy = (i*71.3)%H; g.fillRect(sx, sy, 1.6, 1.6); } }
    else sky(0, H, "#f8fafc", "#ffffff");
    const ink = earth ? "#e2e8f0" : C.ink;
    const cx = W*0.3, cy = H*0.5 + 6, R = Math.min(H*0.5-48, W*0.23);
    g.strokeStyle = earth ? "#475569" : "#cbd5e1"; g.lineWidth = 2; g.setLineDash([6,6]);
    g.beginPath(); g.arc(cx, cy, R, 0, 7); g.stroke(); g.setLineDash([]);
    const P_ = th => ({x: cx + R*Math.cos(th), y: cy - R*Math.sin(th)});
    const Tg = th => ({x: -Math.sin(th), y: -Math.cos(th)});
    const released = release!==null && t > release;
    const th = 2*Math.PI*(released ? release : t)/P;
    let p = P_(th);
    if(released){
      const d = Tg(th), sp = 2*Math.PI*R/P;
      dashLine(p.x, p.y, p.x + d.x*1200, p.y + d.y*1200, "#94a3b8", 2);
      p = {x: p.x + d.x*sp*(t-release), y: p.y + d.y*sp*(t-release)};
    }
    // 中心
    if(earth){ const gr = g.createRadialGradient(cx-10, cy-10, 6, cx, cy, 42); gr.addColorStop(0, "#60a5fa"); gr.addColorStop(1, "#1d4ed8");
      g.fillStyle = gr; g.beginPath(); g.arc(cx, cy, 40, 0, 7); g.fill(); g.fillStyle = "#4ade80"; g.beginPath(); g.arc(cx-10, cy-6, 13, 0, 7); g.arc(cx+14, cy+12, 9, 0, 7); g.fill();
      text("地球", cx, cy+60, {size:14, bold:true, color:ink, align:"center"}); }
    else if(s.center!=="none"){ g.fillStyle = "#334155"; g.beginPath(); g.arc(cx, cy, 6, 0, 7); g.fill(); text("圓心", cx, cy+24, {size:13, color:C.muted, align:"center"}); }
    // 位移／路徑
    if(s.showDisp){
      const s0 = P_(0);
      g.strokeStyle = "#f97316"; g.lineWidth = 6; g.beginPath(); g.arc(cx, cy, R, 0, -Math.min(th, 2*Math.PI*0.9999), true); g.stroke();
      g.fillStyle = "#15803d"; g.beginPath(); g.arc(s0.x, s0.y, 7, 0, 7); g.fill(); text("起點", s0.x+12, s0.y+20, {size:13, bold:true, color:"#15803d"});
      if(Math.hypot(p.x-s0.x, p.y-s0.y) > 6) arrow(s0.x, s0.y, p.x, p.y, "#16a34a", "", {w:4});
    }
    // 繩子
    if(s.center==="pin" || (!s.center && !s.showDisp)){ if(!released){ g.strokeStyle = "#64748b"; g.lineWidth = 2; g.beginPath(); g.moveTo(cx, cy); g.lineTo(p.x, p.y); g.stroke(); } }
    // 物體
    const obj = s.obj || (earth ? "moon" : "ball");
    if(obj==="moon"){ g.fillStyle = "#cbd5e1"; g.beginPath(); g.arc(p.x, p.y, 14, 0, 7); g.fill(); g.fillStyle = "#94a3b8"; g.beginPath(); g.arc(p.x-4, p.y-3, 4, 0, 7); g.fill(); text("月球", p.x, p.y-22, {size:13, bold:true, color:ink, align:"center"}); }
    else if(obj==="ball"){ g.fillStyle = "#dc2626"; g.beginPath(); g.arc(p.x, p.y, 13, 0, 7); g.fill(); }
    else { font(30); g.textAlign = "center"; g.fillStyle = ink; g.fillText(obj, p.x, p.y+10); }
    // 箭頭
    if(!s.showDisp){
      const d = Tg(th);
      arrow(p.x, p.y, p.x + d.x*86, p.y + d.y*86, "#3b82f6", "速度", {size:14, lx: p.x + d.x*100, ly: p.y + d.y*100 + 5});
      if(!released){ const ux = (cx-p.x)/R, uy = (cy-p.y)/R;
        arrow(p.x, p.y, p.x + ux*R*0.55, p.y + uy*R*0.55, "#ef4444", earth ? "萬有引力" : "向心力", {size:14, lx: p.x + ux*R*0.3 + 0, ly: p.y + uy*R*0.3 - 12}); }
    }
    // 右側說明
    const tx = W*0.58, tw = W - tx - 16;
    let y = 40;
    y = wrap(`t = ${fmt(t, 2)} ${U.t}`, tx, y, tw, {size:15, bold:true, color:ink}) + 4;
    const lines = Array.isArray(s.lines) ? s.lines.slice() : [];
    if(s.showDisp){
      const ang = th, path = r*ang, disp = 2*r*Math.abs(Math.sin(ang/2));
      lines.unshift(`路徑長（橘色）= ${fmt(path, 1)} ${U.r}`, `位移大小（綠色）= ${fmt(disp, 1)} ${U.r}`);
      if(t >= st.T - 1e-6) lines.push("回到起點：位移 = 0，路徑長 = 一圈的長度。");
    }else if(!lines.length){
      lines.push(`半徑 r = ${fmt(r)} ${U.r}，週期 T = ${fmt(P)} ${U.t}`);
      lines.push(`速率 v = 2πr ÷ T ≈ ${fmt(v, 2)} ${U.r}/${U.t}`);
      lines.push("速率不變，但速度方向一直改變 → 有加速度");
      lines.push(earth ? "向心力來自地球的萬有引力，指向地球中心" : "合力（向心力）一直指向圓心");
    }
    if(released) lines.push("繩子斷了！沒有向心力，球沿「切線方向」等速直線飛出（慣性）。");
    for(const l of lines) y = wrap(l, tx, y, tw, {size: W<720 ? 14 : 15, color:ink}) + 6;
  }
};

/* ======================================================================
   gravity：萬有引力   {type:"gravity", cases:[{m1, m2, r, label}]}  第一個是原來的情況
   ====================================================================== */
function ratioText(k){
  if(Math.abs(k-1) < 1e-6) return "F";
  if(k > 1) return `${fmt(k, 2)} F`;
  const inv = 1/k;
  return Math.abs(inv - Math.round(inv)) < 1e-6 ? `F 的 1/${Math.round(inv)}` : `${fmt(k, 3)} F`;
}
const gravity = {
  hint(){ return "萬有引力 F 和兩個質量的乘積成正比，和距離的平方成反比：距離變 2 倍，引力變成 1/4。"; },
  init(s){
    const cases = (Array.isArray(s.cases) && s.cases.length ? s.cases : [{m1:1, m2:1, r:1}]).slice(0, 5).map((c, i)=>({
      m1: Math.max(1e-6, num(c.m1, 1)), m2: Math.max(1e-6, num(c.m2, 1)), r: Math.max(1e-6, num(c.r, 1)), label: c.label || (i ? `情況 ${i+1}` : "原來")}));
    const b = cases[0], f = c => c.m1*c.m2/(c.r*c.r)/(b.m1*b.m2/(b.r*b.r));
    const hold = 2.8, T = hold*cases.length - 0.6;
    return {s, cases, f, hold, T, dur: T*1000, rmax: Math.max(...cases.map(c=>c.r)), mmax: Math.max(...cases.map(c=>Math.max(c.m1, c.m2)))};
  },
  draw(st, t){
    const {cases, f, hold, rmax, mmax} = st;
    g.fillStyle = "#0f172a"; g.fillRect(0, 0, W, H);
    g.fillStyle = "#e2e8f0"; for(let i=0;i<50;i++){ g.fillRect((i*137.5)%W, (i*71.3)%H, 1.5, 1.5); }
    const idx = clamp(Math.floor(t/hold), 0, cases.length-1), loc = t - idx*hold;
    const prev = cases[Math.max(0, idx-1)], cur = cases[idx], mix = idx ? smooth(loc/0.8) : 1;
    const lerp = (a, b) => a + (b-a)*mix;
    const c = {m1: lerp(prev.m1, cur.m1), m2: lerp(prev.m2, cur.m2), r: lerp(prev.r, cur.r)};
    const k = f(c);
    const cx = W*0.36, cy = 150, sep = c.r/rmax*W*0.5;
    const rad = m => 14 + 20*Math.cbrt(m/mmax);
    const x1 = cx - sep/2, x2 = cx + sep/2, r1 = rad(c.m1), r2 = rad(c.m2);
    g.fillStyle = "#f97316"; g.beginPath(); g.arc(x1, cy, r1, 0, 7); g.fill();
    g.fillStyle = "#38bdf8"; g.beginPath(); g.arc(x2, cy, r2, 0, 7); g.fill();
    text(`m₁ = ${fmt(c.m1, 2)}`, x1, cy - r1 - 12, {size:14, bold:true, color:"#fdba74", align:"center"});
    text(`m₂ = ${fmt(c.m2, 2)}`, x2, cy - r2 - 12, {size:14, bold:true, color:"#7dd3fc", align:"center"});
    const room = Math.max(10, sep/2 - Math.max(r1, r2) - 8), al = clamp(16 + 34*k, 10, room);
    arrow(x1 + r1 + 2, cy, x1 + r1 + 2 + al, cy, "#facc15", "", {w:4});
    arrow(x2 - r2 - 2, cy, x2 - r2 - 2 - al, cy, "#facc15", "", {w:4});
    g.strokeStyle = "#94a3b8"; g.lineWidth = 1.5; g.beginPath(); g.moveTo(x1, cy+52); g.lineTo(x2, cy+52); g.stroke();
    text(`距離 r = ${fmt(c.r, 2)}`, cx, cy+72, {size:14, color:"#e2e8f0", align:"center"});
    // 長條圖
    const bx = W*0.8, base = H-60, unitH = 52, bh = Math.min(base-50, unitH*k);
    g.strokeStyle = "#64748b"; g.setLineDash([4,4]); g.strokeRect(bx-24, base-unitH, 48, unitH); g.setLineDash([]);
    g.fillStyle = "#facc15"; g.fillRect(bx-24, base-bh, 48, bh);
    text("引力大小", bx, base+20, {size:13, color:"#e2e8f0", align:"center"});
    text(ratioText(k), bx, base-bh-10, {size:17, bold:true, color:"#fde047", align:"center"});
    text("虛線框 = 原來的 F", bx, base+38, {size:12, color:"#94a3b8", align:"center"});
    let y = 252;
    y = wrap(`${idx+1}／${cases.length}　${cur.label}`, 16, y, W*0.62, {size:17, bold:true, color:"#fde047"});
    y = wrap("萬有引力：F ∝ m₁ × m₂ ÷ r²", 16, y+4, W*0.62, {size:15, color:"#e2e8f0"});
    if(idx>0){ const b = cases[0];
      wrap(`(${fmt(cur.m1/b.m1, 2)} × ${fmt(cur.m2/b.m2, 2)}) ÷ ${fmt(cur.r/b.r, 2)}² = ${fmt(f(cur), 3)} → 引力變成 ${ratioText(f(cur))}`, 16, y+4, W*0.62, {size:15, bold:true, color:"#e2e8f0"}); }
  }
};

const TYPES = {motion, pendulum, forces, inertia, action, circular, gravity};

/* ---------- 播放器 ---------- */
const P = {spec:null, type:null, st:null, t:0, raf:0, err:""};
function render(){
  if(!g) return;
  g.setTransform(1,0,0,1,0,0); g.clearRect(0, 0, W, H);
  if(!P.type){
    sky(0, H, "#f8fafc", "#ffffff");
    text(P.err || "這題沒有動畫", W/2, H/2, {size:18, color:C.muted, align:"center"});
    return;
  }
  try{ P.type.draw(P.st, P.t); }
  catch(e){ console.warn("動畫錯誤", e); g.setTransform(1,0,0,1,0,0); g.clearRect(0,0,W,H); text("動畫的參數有問題，畫不出來", W/2, H/2, {size:18, color:C.muted, align:"center"}); }
}
function stop(){ cancelAnimationFrame(P.raf); P.raf = 0; }
const Scenes = {
  types: Object.keys(TYPES),
  mount(canvas){ cv = canvas; g = cv.getContext("2d"); W = cv.width; H = cv.height; render(); },
  valid(spec){ return !!(spec && typeof spec==="object" && TYPES[spec.type]); },
  hint(spec){ try{ return Scenes.valid(spec) ? (TYPES[spec.type].hint ? TYPES[spec.type].hint(spec) : "") : ""; }catch(e){ return ""; } },
  load(spec){
    stop(); P.spec = spec; P.t = 0; P.err = "";
    W = cv.width; H = cv.height;
    if(!Scenes.valid(spec)){ P.type = null; P.st = null; P.err = spec ? "這種動畫還不支援" : "這題沒有動畫"; render(); return false; }
    P.type = TYPES[spec.type];
    try{ P.st = P.type.init(spec); }catch(e){ console.warn(e); P.type = null; P.err = "動畫的參數有問題，畫不出來"; }
    render(); return !!P.type;
  },
  resize(){
    if(!cv) return; W = cv.width; H = cv.height;
    if(P.type){ const t = P.t; try{ P.st = P.type.init(P.spec); }catch(e){} P.t = t; }
    render();
  },
  reset(){ stop(); P.t = 0; render(); },
  end(){ stop(); if(P.st) P.t = P.st.T; render(); },
  seek(f){ stop(); if(P.st) P.t = P.st.T*clamp(f, 0, 1); render(); },
  play(){
    if(!P.type) return;
    stop();
    const T = P.st.T, dur = P.st.dur || 5000, start = performance.now();
    const tick = now => {
      const f = Math.min(1, (now-start)/dur);
      P.t = T*f; render();
      if(f < 1) P.raf = requestAnimationFrame(tick); else P.raf = 0;
    };
    P.raf = requestAnimationFrame(tick);
  },
  playing(){ return !!P.raf; }
};
window.Scenes = Scenes;
})();
