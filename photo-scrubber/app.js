"use strict";
const $ = (id) => document.getElementById(id);
const photo = $("photo"),
  view = photo.getContext("2d"),
  overlay = $("overlay"),
  guide = overlay.getContext("2d");
const committed = document.createElement("canvas"),
  committedCtx = committed.getContext("2d");
let dirty = true;
const original = document.createElement("canvas"),
  source = original.getContext("2d");
const effectLayer = document.createElement("canvas"),
  effectCtx = effectLayer.getContext("2d");
const mask = document.createElement("canvas"),
  maskCtx = mask.getContext("2d");
const piece = document.createElement("canvas"),
  pieceCtx = piece.getContext("2d");
const tiny = document.createElement("canvas"),
  tinyCtx = tiny.getContext("2d", { willReadFrequently: true });
let tool = "brush",
  history = [],
  future = [],
  draft = null,
  pointerId = null,
  loaded = false,
  comparing = false;
let filename = "photo",
  effectKey = "",
  renderFrame = 0,
  loadToken = 0,
  busy = false;
const MAX_PIXELS = 4_000_000,
  MAX_SIDE = 3072,
  MAX_EDITS = 100;
const say = (message) => {
  $("status").textContent = message;
};
function resizeCanvases(w, h) {
  for (const c of [
    photo,
    overlay,
    original,
    committed,
    effectLayer,
    mask,
    piece,
  ]) {
    c.width = w;
    c.height = h;
  }
  effectKey = "";
}
function fit() {
  if (!loaded) return;
  const box = $("workspace").getBoundingClientRect(),
    scale = Math.min(
      (box.width - 26) / photo.width,
      (box.height - 26) / photo.height,
    );
  $("canvas-wrap").style.width = Math.floor(photo.width * scale) + "px";
  $("canvas-wrap").style.height = Math.floor(photo.height * scale) + "px";
}
function settings() {
  return {
    tool,
    effect: $("effect").value,
    strength: +$("strength").value,
    size: (+$("size").value / 100) * Math.min(photo.width, photo.height),
    color: $("cover-color").value,
  };
}
// Effects are generated once per settings combination from the committed edits, so a later stroke cannot uncover an earlier cover.
// Blur uses a small software box blur, avoiding Canvas filter support differences.
function buildEffect(op) {
  const key = [op.effect, op.strength, op.color].join(":");
  if (key === effectKey) return;
  effectKey = key;
  const w = photo.width,
    h = photo.height;
  effectCtx.clearRect(0, 0, w, h);
  if (op.effect === "solid") {
    effectCtx.fillStyle = op.color;
    effectCtx.fillRect(0, 0, w, h);
    return;
  }
  if (op.effect === "pixelate") {
    const block = Math.max(
      2,
      Math.round(Math.min(w, h) * (0.004 + (op.strength / 100) * 0.075)),
    );
    tiny.width = Math.max(1, Math.ceil(w / block));
    tiny.height = Math.max(1, Math.ceil(h / block));
    tinyCtx.drawImage(committed, 0, 0, tiny.width, tiny.height);
    effectCtx.imageSmoothingEnabled = false;
    effectCtx.drawImage(tiny, 0, 0, w, h);
    effectCtx.imageSmoothingEnabled = true;
    return;
  }
  const scale = Math.min(1, 900 / Math.max(w, h));
  tiny.width = Math.max(1, Math.round(w * scale));
  tiny.height = Math.max(1, Math.round(h * scale));
  tinyCtx.drawImage(committed, 0, 0, tiny.width, tiny.height);
  const data = tinyCtx.getImageData(0, 0, tiny.width, tiny.height),
    a = data.data;
  // Premultiply to avoid transparent pixels bleeding dark fringes into a blur.
  for (let i = 0; i < a.length; i += 4) {
    const alpha = a[i + 3] / 255;
    a[i] *= alpha;
    a[i + 1] *= alpha;
    a[i + 2] *= alpha;
  }
  const radius = Math.max(
    1,
    Math.round(Math.min(w, h) * (0.002 + (op.strength / 100) * 0.035) * scale),
  );
  for (let pass = 0; pass < 3; pass++)
    boxBlur(a, tiny.width, tiny.height, radius);
  for (let i = 0; i < a.length; i += 4) {
    if (a[i + 3]) {
      const inv = 255 / a[i + 3];
      a[i] *= inv;
      a[i + 1] *= inv;
      a[i + 2] *= inv;
    }
  }
  tinyCtx.putImageData(data, 0, 0);
  effectCtx.drawImage(tiny, 0, 0, w, h);
}
function boxBlur(data, w, h, r) {
  const temp = new Uint8ClampedArray(data.length),
    span = 2 * r + 1;
  for (let y = 0; y < h; y++)
    for (let c = 0; c < 4; c++) {
      let sum = 0;
      for (let i = -r; i <= r; i++)
        sum += data[(y * w + Math.max(0, Math.min(w - 1, i))) * 4 + c];
      for (let x = 0; x < w; x++) {
        temp[(y * w + x) * 4 + c] = sum / span;
        sum +=
          data[(y * w + Math.min(w - 1, x + r + 1)) * 4 + c] -
          data[(y * w + Math.max(0, x - r)) * 4 + c];
      }
    }
  for (let x = 0; x < w; x++)
    for (let c = 0; c < 4; c++) {
      let sum = 0;
      for (let i = -r; i <= r; i++)
        sum += temp[(Math.max(0, Math.min(h - 1, i)) * w + x) * 4 + c];
      for (let y = 0; y < h; y++) {
        data[(y * w + x) * 4 + c] = sum / span;
        sum +=
          temp[(Math.min(h - 1, y + r + 1) * w + x) * 4 + c] -
          temp[(Math.max(0, y - r) * w + x) * 4 + c];
      }
    }
}
function paintMask(op) {
  maskCtx.clearRect(0, 0, mask.width, mask.height);
  maskCtx.fillStyle = "#000";
  maskCtx.strokeStyle = "#000";
  maskCtx.lineWidth = op.size;
  maskCtx.lineCap = "round";
  maskCtx.lineJoin = "round";
  if (op.tool === "box") {
    const [a, b] = [op.points[0], op.points[op.points.length - 1]];
    maskCtx.fillRect(
      Math.min(a.x, b.x),
      Math.min(a.y, b.y),
      Math.abs(a.x - b.x),
      Math.abs(a.y - b.y),
    );
  } else {
    const a = op.points[0];
    maskCtx.beginPath();
    maskCtx.arc(a.x, a.y, op.size / 2, 0, Math.PI * 2);
    maskCtx.fill();
    maskCtx.beginPath();
    maskCtx.moveTo(a.x, a.y);
    for (const p of op.points.slice(1)) maskCtx.lineTo(p.x, p.y);
    maskCtx.stroke();
  }
}
function apply(op) {
  buildEffect(op);
  paintMask(op);
  pieceCtx.clearRect(0, 0, piece.width, piece.height);
  pieceCtx.globalCompositeOperation = "source-over";
  pieceCtx.drawImage(effectLayer, 0, 0);
  pieceCtx.globalCompositeOperation = "destination-in";
  pieceCtx.drawImage(mask, 0, 0);
  pieceCtx.globalCompositeOperation = "source-over";
  view.drawImage(piece, 0, 0);
}
function render() {
  renderFrame = 0;
  if (!loaded) return;
  if (dirty) {
    view.clearRect(0, 0, photo.width, photo.height);
    view.drawImage(original, 0, 0);
    for (const op of history) {
      committedCtx.clearRect(0, 0, photo.width, photo.height);
      committedCtx.drawImage(photo, 0, 0);
      effectKey = "";
      apply(op);
    }
    committedCtx.clearRect(0, 0, photo.width, photo.height);
    committedCtx.drawImage(photo, 0, 0);
    effectKey = "";
    dirty = false;
  }
  view.clearRect(0, 0, photo.width, photo.height);
  view.drawImage(comparing ? original : committed, 0, 0);
  if (!comparing && draft) apply(draft);
  updateButtons();
}
function schedule() {
  if (!renderFrame) renderFrame = requestAnimationFrame(render);
}
function updateButtons() {
  $("undo").disabled = !history.length || busy;
  $("redo").disabled = !future.length || busy;
  $("clear").disabled = !history.length || busy;
  $("download").disabled = !loaded || busy || Boolean(draft);
  $("whole").disabled = !loaded || busy;
}
function resetCompare() {
  comparing = false;
  $("compare").textContent = "Show original";
  $("compare").setAttribute("aria-pressed", "false");
}
function commit() {
  if (!draft) return;
  const op = draft;
  draft = null;
  pointerId = null;
  guide.clearRect(0, 0, overlay.width, overlay.height);
  if (op.tool === "box") {
    const a = op.points[0],
      b = op.points.at(-1);
    if (Math.abs(a.x - b.x) < 1 || Math.abs(a.y - b.y) < 1) {
      schedule();
      return;
    }
  }
  // Commit only the new operation; ordinary drawing never replays the history.
  if (dirty) render();
  view.clearRect(0, 0, photo.width, photo.height);
  view.drawImage(committed, 0, 0);
  apply(op);
  committedCtx.clearRect(0, 0, photo.width, photo.height);
  committedCtx.drawImage(photo, 0, 0);
  effectKey = "";
  history.push(op);
  future = [];
  schedule();
  say(
    history.length + " edit" + (history.length === 1 ? "" : "s") + " applied.",
  );
}
function cancel() {
  draft = null;
  pointerId = null;
  guide.clearRect(0, 0, overlay.width, overlay.height);
  schedule();
}
function point(event) {
  const r = overlay.getBoundingClientRect();
  return {
    x: Math.max(
      0,
      Math.min(photo.width, ((event.clientX - r.left) / r.width) * photo.width),
    ),
    y: Math.max(
      0,
      Math.min(
        photo.height,
        ((event.clientY - r.top) / r.height) * photo.height,
      ),
    ),
  };
}
function drawGuide(p) {
  guide.clearRect(0, 0, overlay.width, overlay.height);
  if (!loaded || comparing) return;
  const scale = photo.width / overlay.getBoundingClientRect().width;
  guide.lineWidth = 1.5 * scale;
  guide.strokeStyle = "#fff";
  guide.shadowColor = "#000";
  guide.shadowBlur = 2 * scale;
  if (draft?.tool === "box") {
    const a = draft.points[0];
    guide.setLineDash([5 * scale, 4 * scale]);
    guide.strokeRect(a.x, a.y, p.x - a.x, p.y - a.y);
    guide.setLineDash([]);
  } else if (tool === "brush") {
    guide.beginPath();
    guide.arc(p.x, p.y, settings().size / 2, 0, Math.PI * 2);
    guide.stroke();
  }
  guide.shadowBlur = 0;
}
overlay.addEventListener("pointerdown", (event) => {
  if (!loaded || busy || draft || event.button !== 0) return;
  if (history.length >= MAX_EDITS) {
    say(
      "This photo has 100 edits. Download it, or undo an edit to keep working.",
    );
    return;
  }
  event.preventDefault();
  resetCompare();
  pointerId = event.pointerId;
  overlay.setPointerCapture(pointerId);
  draft = { ...settings(), points: [point(event)] };
  schedule();
});
overlay.addEventListener("pointermove", (event) => {
  const p = point(event);
  if (draft && event.pointerId === pointerId) {
    if (draft.tool === "box") draft.points[1] = p;
    else {
      const previous = draft.points.at(-1);
      if (
        Math.hypot(p.x - previous.x, p.y - previous.y) >
        Math.max(1, draft.size / 12)
      )
        draft.points.push(p);
    }
    schedule();
  }
  drawGuide(p);
});
overlay.addEventListener("pointerup", (event) => {
  if (event.pointerId !== pointerId) return;
  if (draft) {
    if (draft.tool === "box") draft.points[1] = point(event);
    else draft.points.push(point(event));
  }
  commit();
});
overlay.addEventListener("pointercancel", cancel);
overlay.addEventListener("lostpointercapture", () => {
  if (draft) cancel();
});
overlay.addEventListener("pointerleave", () => {
  if (!draft) guide.clearRect(0, 0, overlay.width, overlay.height);
});
async function load(file) {
  if (!file) return;
  if (
    !/^image\/(jpeg|png|webp|avif|heic|heif)$/i.test(file.type) &&
    !(file.type === "" && /\.(jpe?g|png|webp|avif|heic|heif)$/i.test(file.name))
  ) {
    say(
      "Please choose a still photo: JPEG, PNG, WebP, AVIF, or HEIC. Videos and SVG files are not supported.",
    );
    return;
  }
  if (file.size > 40 * 1024 * 1024) {
    say("Please choose a photo smaller than 40 MB.");
    return;
  }
  const token = ++loadToken;
  busy = true;
  cancel();
  updateButtons();
  say("Opening photo…");
  let objectUrl;
  try {
    objectUrl = URL.createObjectURL(file);
    const img = new Image();
    img.src = objectUrl;
    await img.decode();
    if (token !== loadToken) return;
    const factor = Math.min(
      1,
      MAX_SIDE / img.naturalWidth,
      MAX_SIDE / img.naturalHeight,
      Math.sqrt(MAX_PIXELS / (img.naturalWidth * img.naturalHeight)),
    );
    const w = Math.max(1, Math.round(img.naturalWidth * factor)),
      h = Math.max(1, Math.round(img.naturalHeight * factor));
    resizeCanvases(w, h);
    source.drawImage(img, 0, 0, w, h);
    filename = (file.name || "photo").replace(/\.[^.]+$/, "");
    history = [];
    future = [];
    draft = null;
    dirty = true;
    loaded = true;
    resetCompare();
    $("drop-zone").hidden = true;
    $("editor").hidden = false;
    fit();
    render();
    $("dimensions").textContent =
      w.toLocaleString() + " × " + h.toLocaleString() + " px";
    say(
      factor < 1
        ? "Photo resized for smooth editing. The download uses the dimensions shown below."
        : "Ready. Choose a tool and scrub an area.",
    );
  } catch {
    if (token === loadToken)
      say(
        "This photo could not be opened. Try exporting it as JPEG or PNG first.",
      );
  } finally {
    if (objectUrl) URL.revokeObjectURL(objectUrl);
    if (token === loadToken) {
      busy = false;
      updateButtons();
    }
  }
}
$("choose").onclick = $("replace").onclick = () => {
  if (!busy) $("file").click();
};
$("file").onchange = () => {
  load($("file").files[0]);
  $("file").value = "";
};
for (const button of document.querySelectorAll("[data-tool]"))
  button.onclick = () => {
    cancel();
    tool = button.dataset.tool;
    for (const b of document.querySelectorAll("[data-tool]"))
      b.setAttribute("aria-pressed", b === button);
    $("size-group").hidden = tool !== "brush";
    $("hint").textContent =
      tool === "brush"
        ? "Paint over an area. Each stroke uses the current effect and strength."
        : "Drag a box over an area. Each box uses the current effect and strength.";
  };
$("strength").oninput = () =>
  ($("strength-value").textContent = $("strength").value);
$("size").oninput = () => ($("size-value").textContent = $("size").value + "%");
$("effect").onchange = () => {
  $("strength-group").hidden = $("effect").value === "solid";
  $("color-group").hidden = $("effect").value !== "solid";
};
$("undo").onclick = () => {
  cancel();
  resetCompare();
  if (history.length) future.push(history.pop());
  dirty = true;
  schedule();
};
$("redo").onclick = () => {
  cancel();
  resetCompare();
  if (future.length) history.push(future.pop());
  dirty = true;
  schedule();
};
$("clear").onclick = () => {
  if (!confirm("Clear all edits on this photo?")) return;
  cancel();
  history = [];
  future = [];
  dirty = true;
  resetCompare();
  schedule();
  say("All edits cleared.");
};
$("whole").onclick = () => {
  if (busy || history.length >= MAX_EDITS) return;
  cancel();
  resetCompare();
  draft = {
    ...settings(),
    tool: "box",
    points: [
      { x: 0, y: 0 },
      { x: photo.width, y: photo.height },
    ],
  };
  commit();
};
$("compare").onclick = () => {
  if (draft || busy) return;
  comparing = !comparing;
  $("compare").setAttribute("aria-pressed", comparing);
  $("compare").textContent = comparing ? "Show edits" : "Show original";
  guide.clearRect(0, 0, overlay.width, overlay.height);
  schedule();
};
$("download").onclick = async () => {
  if (!loaded || busy || draft) return;
  busy = true;
  updateButtons();
  resetCompare();
  render();
  say("Preparing download…");
  try {
    const mime = $("format").value;
    const output = document.createElement("canvas");
    output.width = photo.width;
    output.height = photo.height;
    const c = output.getContext("2d");
    if (mime === "image/jpeg") {
      c.fillStyle = "#fff";
      c.fillRect(0, 0, output.width, output.height);
    }
    c.drawImage(photo, 0, 0);
    const blob = await new Promise((resolve) =>
      output.toBlob(resolve, mime, 0.94),
    );
    if (!blob) throw new Error("Export failed");
    const url = URL.createObjectURL(blob),
      link = document.createElement("a");
    link.href = url;
    link.download =
      filename + "-scrubbed." + (mime === "image/png" ? "png" : "jpg");
    document.body.append(link);
    link.click();
    link.remove();
    setTimeout(() => URL.revokeObjectURL(url), 60000);
    say("Photo downloaded. Your original file is unchanged.");
  } catch {
    say("The download could not be created. Try a smaller photo.");
  } finally {
    busy = false;
    updateButtons();
  }
};
document.addEventListener("keydown", (event) => {
  if (!loaded || busy) return;
  if (event.key === "Escape") {
    cancel();
    resetCompare();
    schedule();
    return;
  }
  if (/INPUT|SELECT|TEXTAREA/.test(event.target.tagName)) return;
  if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "z") {
    event.preventDefault();
    (event.shiftKey ? $("redo") : $("undo")).click();
  }
});
for (const name of ["dragenter", "dragover"])
  document.addEventListener(name, (event) => {
    event.preventDefault();
    $("drop-zone").classList.add("dragging");
  });
document.addEventListener("dragleave", (event) => {
  if (!event.relatedTarget) $("drop-zone").classList.remove("dragging");
});
document.addEventListener("drop", (event) => {
  event.preventDefault();
  $("drop-zone").classList.remove("dragging");
  if (busy) return;
  const files = event.dataTransfer.files;
  if (files.length !== 1) {
    say("Choose one photo at a time.");
    return;
  }
  load(files[0]);
});
document.addEventListener("paste", (event) => {
  if (busy) return;
  const files = [...event.clipboardData.files];
  if (files.length) {
    event.preventDefault();
    load(files[0]);
  }
});
new ResizeObserver(fit).observe($("workspace"));
