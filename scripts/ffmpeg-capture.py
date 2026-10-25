#!/usr/bin/env python3
"""Use H.264 for Puppeteer's genuine timestamped screen frames.

The stock recorder uses single-thread VP9 even for MP4. On a software GPU
that encoder can fall far behind playback. This wrapper only changes the
codec and pixel format; Puppeteer still supplies every image and timestamp.
"""
import os
import sys

args = sys.argv[1:]
converted = []
index = 0
capture = False
while index < len(args):
    option = args[index]
    if option in ("-deadline", "-cpu-used"):
        index += 2
        continue
    if option == "-vcodec" and index + 1 < len(args) and args[index + 1] == "vp9":
        converted.extend([option, "libx264"])
        capture = True
        index += 2
        continue
    converted.append(option)
    index += 1
if capture:
    converted[-1:-1] = ["-preset", "ultrafast", "-pix_fmt", "yuv420p"]
os.execv("/usr/bin/ffmpeg", ["ffmpeg", *converted])
