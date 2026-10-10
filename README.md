# Himalayan Kettle: a website that ignores your mouse

A prototype for a creative design course. It looks like an ordinary cafe
website, but the mouse does nothing. The webcam watches you instead: your
head moves a dot, holding still on a button presses it, an open palm scrolls,
and leaning towards the screen zooms the photo you are looking at. Nobody
explains the rules. You find them out.

The target reaction is surprise. The same site also runs in three input modes
(mouse, head only, head + hands) so it doubles as a small empathy study of what
the web feels like when a mouse is not an option.

## Running it

Open `index.html` in Chrome and allow the camera. Nothing to install.

The page loads two things from the web: the MediaPipe face and hand landmark
models (from jsDelivr and Google's model storage) and the photos (from
Wikimedia Commons). Everything else is in this repository. Tracking runs
entirely in the browser; the camera image is never shown on the page and
never leaves the laptop.

To serve it over HTTP instead (for example to open it from another device):

    python3 -m http.server 8000

and visit `http://localhost:8000`. The camera only works over `https://`,
`localhost` or a local `file://` URL.

## Facilitator keys

Press `?` on the page to see these.

| Key     | What it does                                                            |
| ------- | ----------------------------------------------------------------------- |
| Space   | Start a participant session: recalibrates the neutral head pose, resets timers, new session id in the log |
| R       | Recalibrate (participant sits still, looks at the centre of the screen) |
| 1 2 3   | Input mode: 1 mouse, 2 head only, 3 head + hands                        |
| N       | Start the next task                                                     |
| Enter   | Mark the current task done by hand (tasks also complete automatically)  |
| H       | Show the next discovery hint now                                        |
| D       | Debug overlay with live tracking values and a camera thumbnail          |
| S       | Download the event log as CSV                                           |
| Esc     | Close overlays                                                          |

## The study

Each participant does the same three tasks in each mode:

1. Find the price of a cinnamon bun (completes when the Bakes tab is opened)
2. Zoom in on the mountain photo (completes when it reaches 1.8x)
3. Order two cinnamon buns for pickup (completes when the order is placed)

The log (`S`) is a CSV with the columns `session_id, t_ms, mode, task, event,
detail`. Events include `session_start`, `calibrated`, `mouse_activity`,
`mouse_click_ignored`, `hint_shown`, `dwell_click`, `first_click`,
`scroll_start`, `scroll_stop`, `zoom`, `task_start`, `task_complete` and
`order_placed`. Time to first click and the hint level needed are the
discovery measures; task durations compare the modes.

## Tuning

All the numbers that decide how the interaction feels are in `js/config.js`:
cursor gain, the One Euro filter, dwell time, hand scroll speed and the zoom
curve. They can be changed live from the browser console
(`body_cafe.config.gain_yaw = 3`) and copied into the file once they feel
right.

## Files

    index.html          the café page
    css/site.css        styles for the page
    css/body_input.css  the dot, the ring and the facilitator overlays
    js/site.js          menu tabs, order form, confirmation dialog
    js/config.js        tuning constants
    js/body_input.js    tracking, cursor, dwell click, scroll, zoom, hints, log

## Credits

Photos from Wikimedia Commons under their Creative Commons licences; each one
is linked from the page footer. Face and hand tracking by
[MediaPipe](https://github.com/google-ai-edge/mediapipe). The cafe is
fictional.
