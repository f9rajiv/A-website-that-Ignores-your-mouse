# Himalayan Kettle: a website that ignores your mouse

A prototype for a creative design course. It looks like an ordinary cafe
website, but the mouse does nothing. The webcam watches you instead: your
head moves a dot, holding still on a button presses it, an open palm scrolls,
and leaning towards the screen zooms the photo you are looking at.

## Running it

Open `index.html` in Chrome and allow the camera. Nothing to install.

The page loads the MediaPipe face and hand landmark models from the web and
the photos from Wikimedia Commons. Tracking runs entirely in the browser; the
camera image is never shown on the page and never leaves the laptop.

## Keys

Press `?` on the page.

Key    What it does                                                       
Space  Start a session: calibrates the neutral head pose over about 1.5 s    
R      Recalibrate                                                         
1 2 3  Input mode: 1 mouse, 2 head only, 3 head + hands                    
D      Debug overlay with live tracking values and a camera thumbnail      
Esc    Close overlays                                                      

## Tuning

The numbers that decide how it feels are in `js/config.js`: cursor gain, the
One Euro smoothing filter, dwell time, hand scroll speed and the zoom curve.
They can be changed live from the browser console
(`body_cafe.config.gain_yaw = 3`) and copied into the file once they feel
right.

## Files

    index.html          the cafe page
    css/site.css        styles for the page
    css/body_input.css  the dot, the ring and the facilitator overlays
    js/site.js          menu tabs, order form, confirmation dialog
    js/config.js        tuning constants
    js/body_input.js    tracking, cursor, dwell click, scroll, zoom

## Credits
 Face and hand tracking by
[MediaPipe](https://github.com/google-ai-edge/mediapipe). The cafe is
fictional.
