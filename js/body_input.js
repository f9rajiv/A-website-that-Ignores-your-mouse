// Body input layer: the webcam replaces the mouse.
//
// Head pose moves a dot, holding still on a target clicks it, an open palm
// scrolls, leaning in zooms the photo under the dot. Face and hand landmarks
// come from MediaPipe running in the browser; the camera image is never shown
// (except in the facilitator debug overlay, key D).
//
// Depends on js/config.js (the tuning constants) being loaded first.

const mode_names = { 1: "mouse", 2: "head", 3: "head_hands" };

const state = {
  mode: config.start_mode,
  tracking_status: "loading",
  face_found: false,
  face_last_seen: 0,
  calibrating: false,
  calibration_samples: [],
  neutral: null,             // { yaw, pitch, nx, ny, size } of the participant's resting pose
  raw: { yaw: 0, pitch: 0, nx: 0, ny: 0, size: 0 },
  cursor: { x: innerWidth / 2, y: innerHeight / 2 },
  dwell: { target: null, started_at: 0, spent_target: null, cooldown_until: 0 },
  hand: { present: false, open: false, y: 0.5, scroll_v: 0 },
  scroll_state: "none",      // none | up | down
  scroll_source: "none",
  scroll_started_at: 0,
  zoom: { photo: null, scale: 1, target_scale: 1, origin_x: 50, origin_y: 50, max_scale: 1 },
  session: { id: null, started_at: 0 },
  fps: 0,
  frame_count: 0,
  debug: false,
};

const el = {
  html: document.documentElement,
  cursor: document.getElementById("body_cursor"),
  ring: document.querySelector("#body_cursor .ring_fg"),
  scroll_indicator: document.getElementById("scroll_indicator"),
  video: document.getElementById("webcam_feed"),
  debug: document.getElementById("debug_panel"),
  toast: document.getElementById("facilitator_toast"),
  keys: document.getElementById("keys_sheet"),
  modal: document.getElementById("order_modal"),
};
const ring_circumference = 163.4;

function now_ms() { return performance.now(); }

let toast_timer = null;
function toast(text) {
  el.toast.textContent = text;
  el.toast.classList.add("is_visible");
  clearTimeout(toast_timer);
  toast_timer = setTimeout(() => el.toast.classList.remove("is_visible"), 1800);
}

/* One Euro filter: steady when the head is still, responsive when it moves */
class one_euro_filter {
  constructor(min_cutoff, beta, d_cutoff) {
    this.min_cutoff = min_cutoff;
    this.beta = beta;
    this.d_cutoff = d_cutoff;
    this.x_prev = null;
    this.dx_prev = 0;
    this.t_prev = null;
  }
  alpha(cutoff, dt) {
    const tau = 1 / (2 * Math.PI * cutoff);
    return 1 / (1 + tau / dt);
  }
  filter(x, t) {
    if (this.x_prev === null) { this.x_prev = x; this.t_prev = t; return x; }
    const dt = Math.max((t - this.t_prev) / 1000, 1 / 240);
    const dx = (x - this.x_prev) / dt;
    const a_d = this.alpha(this.d_cutoff, dt);
    const dx_hat = a_d * dx + (1 - a_d) * this.dx_prev;
    const cutoff = this.min_cutoff + this.beta * Math.abs(dx_hat);
    const a = this.alpha(cutoff, dt);
    const x_hat = a * x + (1 - a) * this.x_prev;
    this.x_prev = x_hat; this.dx_prev = dx_hat; this.t_prev = t;
    return x_hat;
  }
  reset() { this.x_prev = null; this.dx_prev = 0; this.t_prev = null; }
}
const filter_x = new one_euro_filter(config.filter_min_cutoff, config.filter_beta, config.filter_d_cutoff);
const filter_y = new one_euro_filter(config.filter_min_cutoff, config.filter_beta, config.filter_d_cutoff);

/* Modes and sessions */
function set_mode(mode) {
  state.mode = mode;
  const body_mode = mode !== 1;
  el.html.classList.toggle("body_mode", body_mode);
  if (!body_mode) {
    el.cursor.classList.remove("is_visible", "is_over_target");
    clear_gaze();
    set_scroll_state("none", "none");
  }
  toast(`mode: ${mode_names[mode]}`);
}

function start_session() {
  state.session = { id: "s" + Date.now().toString(36), started_at: now_ms() };
  start_calibration();
  toast(`session ${state.session.id} started, calibrating`);
}

function start_calibration() {
  state.calibrating = true;
  state.calibration_samples = [];
}

function finish_calibration() {
  const s = state.calibration_samples;
  const median = (key) => {
    const v = s.map((x) => x[key]).sort((a, b) => a - b);
    return v[Math.floor(v.length / 2)];
  };
  state.neutral = { yaw: median("yaw"), pitch: median("pitch"), nx: median("nx"), ny: median("ny"), size: median("size") };
  state.calibrating = false;
  filter_x.reset(); filter_y.reset();
  toast("calibrated");
}

document.getElementById("mouse_blocker").addEventListener("wheel", (e) => e.preventDefault(), { passive: false });

/* Facilitator keys */
document.addEventListener("keydown", (e) => {
  if (e.key === "?" || (e.key === "/" && e.shiftKey)) { el.keys.classList.toggle("is_visible"); e.preventDefault(); return; }
  if (e.key === "Escape") { el.keys.classList.remove("is_visible"); return; }
  if (e.code === "Space") { e.preventDefault(); start_session(); return; }
  const k = e.key.toLowerCase();
  if (k === "r") { start_calibration(); toast("recalibrating, sit still"); }
  else if (k === "1" || k === "2" || k === "3") set_mode(Number(k));
  else if (k === "d") { state.debug = !state.debug; el.debug.classList.toggle("is_visible", state.debug); el.video.classList.toggle("is_visible", state.debug); }
});

/* Tracking */
let face_landmarker = null;
let hand_landmarker = null;
let last_video_time = -1;

async function start_tracking() {
  try {
    const base = `https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@${config.mediapipe_version}`;
    const vision = await import(`${base}/vision_bundle.mjs`);
    const fileset = await vision.FilesetResolver.forVisionTasks(`${base}/wasm`);
    const make = async (cls, model_url, extra, delegate) =>
      cls.createFromOptions(fileset, { baseOptions: { modelAssetPath: model_url, delegate }, runningMode: "VIDEO", ...extra });
    try {
      face_landmarker = await make(vision.FaceLandmarker, config.face_model_url, { numFaces: 1 }, "GPU");
      hand_landmarker = await make(vision.HandLandmarker, config.hand_model_url, { numHands: 1, minHandDetectionConfidence: 0.6 }, "GPU");
    } catch (gpu_error) {
      console.warn("GPU delegate failed, falling back to CPU", gpu_error);
      face_landmarker = await make(vision.FaceLandmarker, config.face_model_url, { numFaces: 1 }, "CPU");
      hand_landmarker = await make(vision.HandLandmarker, config.hand_model_url, { numHands: 1, minHandDetectionConfidence: 0.6 }, "CPU");
    }
    const stream = await navigator.mediaDevices.getUserMedia({
      video: { width: config.camera_width, height: config.camera_height, facingMode: "user" }, audio: false,
    });
    el.video.srcObject = stream;
    await new Promise((resolve) => (el.video.onloadeddata = resolve));
    state.tracking_status = "ready";
    start_calibration();
    toast("tracking ready. Press Space when the participant sits down, ? for keys");
  } catch (error) {
    state.tracking_status = "error: " + (error && error.message ? error.message : error);
    console.error(error);
    toast("tracking failed. Press D for details (internet and camera permission needed)");
  }
}

function dist(a, b, aspect) {
  const dx = (a.x - b.x) * aspect;
  const dy = a.y - b.y;
  return Math.hypot(dx, dy);
}

function process_face(result, t) {
  const faces = result && result.faceLandmarks;
  if (!faces || faces.length === 0) {
    if (state.face_found && t - state.face_last_seen > config.face_lost_ms) {
      state.face_found = false;
    }
    return;
  }
  const lm = faces[0];
  const aspect = el.video.videoWidth / el.video.videoHeight || 4 / 3;
  // Landmark indices: 1 nose tip, 234 / 454 cheeks, 10 forehead, 152 chin.
  const nose = lm[1], cheek_l = lm[234], cheek_r = lm[454], forehead = lm[10], chin = lm[152];
  const yaw = (nose.x - (cheek_l.x + cheek_r.x) / 2) / Math.max(1e-4, cheek_r.x - cheek_l.x);
  const pitch = (nose.y - (forehead.y + chin.y) / 2) / Math.max(1e-4, chin.y - forehead.y);
  const size = dist(cheek_l, cheek_r, aspect);
  state.raw = { yaw, pitch, nx: nose.x, ny: nose.y, size };
  state.face_last_seen = t;
  if (!state.face_found) { state.face_found = true; }

  if (state.calibrating) {
    state.calibration_samples.push({ ...state.raw });
    if (state.calibration_samples.length >= config.calibration_frames) finish_calibration();
    state.cursor.x = innerWidth / 2; state.cursor.y = innerHeight / 2;
    return;
  }
  if (!state.neutral) return;
  const n = state.neutral;
  const sx = config.mirror_x ? -1 : 1;
  const raw_x = innerWidth / 2 + sx * ((yaw - n.yaw) * config.gain_yaw + (nose.x - n.nx) * config.gain_translate_x) * innerWidth;
  const raw_y = innerHeight / 2 + ((pitch - n.pitch) * config.gain_pitch + (nose.y - n.ny) * config.gain_translate_y) * innerHeight;
  const margin = 8;
  state.cursor.x = Math.max(margin, Math.min(innerWidth - margin, filter_x.filter(raw_x, t)));
  state.cursor.y = Math.max(margin, Math.min(innerHeight - margin, filter_y.filter(raw_y, t)));

  const size_ratio = size / n.size;
  const lean = size_ratio - 1 - config.zoom_dead_band;
  state.zoom.target_scale = lean > 0 ? Math.min(config.zoom_max, 1 + lean * config.zoom_gain) : 1;
}

function process_hands(result) {
  const hands = result && result.landmarks;
  if (!hands || hands.length === 0) {
    state.hand.present = false; state.hand.open = false; state.hand.scroll_v = 0;
    return;
  }
  const lm = hands[0];
  const wrist = lm[0];
  const palm_y = (lm[0].y + lm[5].y + lm[9].y + lm[13].y + lm[17].y) / 5;
  let extended = 0;
  for (const [tip, pip] of [[8, 6], [12, 10], [16, 14], [20, 18]]) {
    const d_tip = Math.hypot(lm[tip].x - wrist.x, lm[tip].y - wrist.y);
    const d_pip = Math.hypot(lm[pip].x - wrist.x, lm[pip].y - wrist.y);
    if (d_tip > d_pip * 1.15) extended++;
  }
  state.hand.present = true;
  state.hand.open = extended >= 3;
  state.hand.y = palm_y;
  const offset = palm_y - config.hand_scroll_center;
  if (!state.hand.open || Math.abs(offset) < config.hand_scroll_dead_band) { state.hand.scroll_v = 0; return; }
  const strength = Math.min(1, (Math.abs(offset) - config.hand_scroll_dead_band) / 0.3);
  state.hand.scroll_v = Math.sign(offset) * (strength * strength) * config.hand_scroll_max_px_s;
}

/* Per frame: cursor, dwell, scroll, zoom */
let gazed_element = null;
function set_gaze(element) {
  if (gazed_element === element) return;
  clear_gaze();
  gazed_element = element;
  if (element) element.classList.add("is_gazed");
}
function clear_gaze() {
  if (gazed_element) gazed_element.classList.remove("is_gazed");
  gazed_element = null;
}

function hit_test(x, y) {
  const current = state.dwell.target;
  if (current && current.isConnected) {
    const r = current.getBoundingClientRect();
    const pad = config.sticky_pad_px;
    if (x >= r.left - pad && x <= r.right + pad && y >= r.top - pad && y <= r.bottom + pad) {
      return { target: current, stack: document.elementsFromPoint(x, y) };
    }
  }
  const stack = document.elementsFromPoint(x, y);
  const modal_open = el.modal.classList.contains("is_open");
  for (const node of stack) {
    if (node.id === "mouse_blocker" || node.id === "body_cursor" || node.closest("#body_cursor")) continue;
    const target = node.closest("[data-target]");
    if (!target) continue;
    if (target.classList.contains("gallery_photo")) continue;        // photos zoom, they don't click
    if (target.disabled) continue;
    if (modal_open && !target.closest("#order_modal")) continue;      // the dialog keeps focus
    return { target, stack };
  }
  return { target: null, stack };
}

function set_scroll_state(direction, source) {
  if (state.scroll_state === direction) return;
  if (state.scroll_state !== "none")  state.scroll_state = direction;
  state.scroll_source = source;
  state.scroll_started_at = now_ms();
  if (direction !== "none")  el.scroll_indicator.classList.toggle("is_up", direction === "up");
  el.scroll_indicator.classList.toggle("is_down", direction === "down");
}

function update_frame(t, dt) {
  const body_mode = state.mode !== 1;
  const active = body_mode && state.tracking_status === "ready" && state.face_found && !state.calibrating && state.neutral;
  el.cursor.classList.toggle("is_visible", !!active);

  if (!active) {
    if (state.dwell.target) { state.dwell.target = null; clear_gaze(); }
    el.ring.style.strokeDashoffset = ring_circumference;
    el.cursor.classList.remove("is_over_target");
    set_scroll_state("none", "none");
    update_zoom(null, dt);
    return;
  }

  const { x, y } = state.cursor;
  el.cursor.style.transform = `translate(${x}px, ${y}px)`;

  // dwell
  const { target, stack } = hit_test(x, y);
  if (target !== state.dwell.target) {
    state.dwell.target = target;
    state.dwell.started_at = t;
    if (target !== state.dwell.spent_target) state.dwell.spent_target = null;
  }
  set_gaze(target);
  el.cursor.classList.toggle("is_over_target", !!target);
  let progress = 0;
  if (target && target !== state.dwell.spent_target && t >= state.dwell.cooldown_until) {
    progress = Math.min(1, (t - state.dwell.started_at) / config.dwell_ms);
    if (progress >= 1) {
      fire_dwell_click(target, t);
      progress = 0;
    }
  }
  el.ring.style.strokeDashoffset = ring_circumference * (1 - progress);

  // scroll
  let scroll_v = 0, source = "none";
  const modal_open = el.modal.classList.contains("is_open");
  if (state.mode === 3 && state.hand.scroll_v !== 0) { scroll_v = state.hand.scroll_v; source = "hand"; }
  else if (!target && !modal_open) {
    const zone = innerHeight * config.edge_zone;
    if (y > innerHeight - zone) { scroll_v = config.edge_scroll_max_px_s * (y - (innerHeight - zone)) / zone; source = "edge"; }
    else if (y < zone) { scroll_v = -config.edge_scroll_max_px_s * (zone - y) / zone; source = "edge"; }
  }
  if (modal_open) scroll_v = 0;
  if (scroll_v !== 0) {
    window.scrollBy(0, scroll_v * dt);
    set_scroll_state(scroll_v > 0 ? "down" : "up", source);
  } else set_scroll_state("none", "none");

  // zoom
  let photo = null;
  for (const node of stack) { const p = node.closest && node.closest(".gallery_photo"); if (p) { photo = p; break; } }
  update_zoom(photo, dt);

}

function fire_dwell_click(target, t) {
  state.dwell.spent_target = target;
  state.dwell.cooldown_until = t + config.dwell_cooldown_ms;
  el.cursor.classList.remove("is_clicked");
  void el.cursor.offsetWidth;
  el.cursor.classList.add("is_clicked");
  target.click();
}

function update_zoom(hovered_photo, dt) {
  const z = state.zoom;
  if (hovered_photo && (z.photo !== hovered_photo)) {
    if (z.photo) release_zoom_photo();
    z.photo = hovered_photo;
    z.max_scale = 1;
    hovered_photo.classList.add("is_focused");
  }
  if (z.photo && hovered_photo === z.photo) {
    const r = z.photo.getBoundingClientRect();
    z.origin_x = Math.max(0, Math.min(100, ((state.cursor.x - r.left) / r.width) * 100));
    z.origin_y = Math.max(0, Math.min(100, ((state.cursor.y - r.top) / r.height) * 100));
  }
  const wants = z.photo ? (state.face_found ? z.target_scale : 1) : 1;
  z.scale += (wants - z.scale) * config.zoom_smoothing;
  if (z.photo) {
    const img = z.photo.querySelector("img");
    img.style.transformOrigin = `${z.origin_x}% ${z.origin_y}%`;
    img.style.transform = `scale(${z.scale.toFixed(3)})`;
    if (z.scale > z.max_scale) z.max_scale = z.scale;
    if (!hovered_photo && z.scale < 1.02) release_zoom_photo();
  }
}

function release_zoom_photo() {
  const z = state.zoom;
  if (!z.photo) return;
  const img = z.photo.querySelector("img");
  img.style.transform = "";
  z.photo.classList.remove("is_focused");
  if (z.max_scale > 1.05)  z.photo = null; z.scale = 1; z.max_scale = 1;
}

/* Main loop */
let last_t = now_ms();
let fps_accum = 0, fps_frames = 0;

function loop() {
  const t = now_ms();
  const dt = Math.min(0.1, (t - last_t) / 1000);
  last_t = t;
  state.frame_count++;
  fps_accum += dt; fps_frames++;
  if (fps_accum >= 0.5) { state.fps = Math.round(fps_frames / fps_accum); fps_accum = 0; fps_frames = 0; }

  if (state.tracking_status === "ready" && face_landmarker && el.video.currentTime !== last_video_time) {
    last_video_time = el.video.currentTime;
    try {
      process_face(face_landmarker.detectForVideo(el.video, t), t);
      if (state.mode === 3 && state.frame_count % config.hand_frame_skip === 0) process_hands(hand_landmarker.detectForVideo(el.video, t));
      else if (state.mode !== 3) state.hand.scroll_v = 0;
    } catch (error) { console.warn(error); }
  } else if (state.tracking_status === "ready" && state.face_found && t - state.face_last_seen > config.face_lost_ms) {
    state.face_found = false;  }

  update_frame(t, dt);
  if (state.debug) render_debug();
  requestAnimationFrame(loop);
}

function render_debug() {
  const n = state.neutral;
  const r = state.raw;
  const lines = [
    `status   ${state.tracking_status}   fps ${state.fps}`,
    `mode     ${mode_names[state.mode]}   session ${state.session.id || "-"}`,
    `face     ${state.face_found ? "found" : "lost"}${state.calibrating ? "  CALIBRATING " + state.calibration_samples.length : ""}`,
    `yaw      ${r.yaw.toFixed(3)}  (neutral ${n ? n.yaw.toFixed(3) : "-"})`,
    `pitch    ${r.pitch.toFixed(3)}  (neutral ${n ? n.pitch.toFixed(3) : "-"})`,
    `size     ${r.size.toFixed(3)}  ratio ${n ? (r.size / n.size).toFixed(2) : "-"}  zoom ${state.zoom.scale.toFixed(2)}`,
    `cursor   ${Math.round(state.cursor.x)}, ${Math.round(state.cursor.y)}  target ${state.dwell.target ? state.dwell.target.dataset.target : "-"}`,
    `hand     ${state.hand.present ? (state.hand.open ? "open" : "closed") : "none"}  y ${state.hand.y.toFixed(2)}  v ${Math.round(state.hand.scroll_v)}`,
    `scroll   ${state.scroll_state} (${state.scroll_source})`,
  ];
  el.debug.textContent = lines.join("\n");
}

/* Boot */
set_mode(config.start_mode);
window.body_cafe = { state, config, set_mode, start_session };   // for tuning from the console
start_tracking();
requestAnimationFrame(loop);
