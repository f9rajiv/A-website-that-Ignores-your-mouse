// Tuning constants for the body input layer.
// Change these first when the demo feels off. They can also be changed live
// from the browser console, e.g.  body_cafe.config.gain_yaw = 3

const config = {
  // Cursor mapping. yaw = head turn left/right, pitch = nod up/down.
  // Units: fraction of the screen per unit of relative nose offset.
  gain_yaw: 2.4,
  gain_pitch: 4.6,
  gain_translate_x: 1.3,      // extra response to shifting the whole head sideways
  gain_translate_y: 1.3,
  mirror_x: true,             // the webcam is mirrored relative to the screen; keep true

  // One Euro filter. Lower min_cutoff = smoother but laggier; higher beta = less lag on fast moves.
  filter_min_cutoff: 1.1,
  filter_beta: 0.006,
  filter_d_cutoff: 1.0,

  // Dwell click.
  dwell_ms: 1000,
  dwell_cooldown_ms: 600,
  sticky_pad_px: 26,          // hit area grows by this once a target is being dwelt on

  // Calibration.
  calibration_frames: 45,     // about 1.5 s at 30 fps

  // Edge scroll (head modes): cursor near the top or bottom edge scrolls when not over a target.
  edge_zone: 0.09,
  edge_scroll_max_px_s: 650,

  // Hand scroll (mode 3): open palm, its height in the frame sets direction and speed.
  hand_scroll_center: 0.55,   // normalised y in the camera frame that means "no scroll"
  hand_scroll_dead_band: 0.08,
  hand_scroll_max_px_s: 950,
  hand_frame_skip: 2,         // run hand tracking every N frames

  // Lean zoom.
  zoom_dead_band: 0.06,       // ignore face size changes smaller than this ratio
  zoom_gain: 4.0,
  zoom_max: 2.4,
  zoom_smoothing: 0.14,
  zoom_task_threshold: 1.8,

  // Discovery hints: seconds after session start with no dwell click yet.
  hint_times_s: [15, 30, 45],
  hint_texts: [
    "Psst. This page isn't listening to your mouse.",
    "It's watching you instead. Try turning your head, slowly.",
    "Look at a button and hold still to press it. Raise a hand to scroll.",
  ],

  // Tracking sources. The library and models are loaded from the web.
  mediapipe_version: "1.0.1",
  face_model_url: "https://storage.googleapis.com/mediapipe-models/face_landmarker/face_landmarker/float16/1/face_landmarker.task",
  hand_model_url: "https://storage.googleapis.com/mediapipe-models/hand_landmarker/hand_landmarker/float16/1/hand_landmarker.task",
  camera_width: 640,
  camera_height: 480,
  face_lost_ms: 400,
  start_mode: 3,              // 1 mouse, 2 head, 3 head + hands
};
