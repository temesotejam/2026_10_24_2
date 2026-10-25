/** Actual action timestamps are local to each recorded part, before the speed change. */
export function narrationCues(metadata, speed = 1.5) {
  const parts = new Map();
  let offset = 0;
  for (const part of metadata.parts) {
    parts.set(part.path, { offset, duration: part.duration });
    offset += part.duration;
  }
  const observed = [...(metadata.narration ?? [])];
  for (const part of metadata.parts)
    if (part.error)
      observed.push({
        part: part.path,
        seconds: Math.max(0, part.duration - 6),
        text: "操作を調整するため、通常保存から再開します。",
      });
  const events = observed
    .filter((event) => {
      const part = parts.get(event.part);
      return part && event.seconds >= 0 && event.seconds < part.duration && event.text.trim();
    })
    .map((event) => ({
      start: (parts.get(event.part).offset + event.seconds) / speed,
      text: event.text,
    }))
    .sort((a, b) => a.start - b.start);
  return events
    .map((event, index) => ({
      ...event,
      end: Math.min(
        event.start + 5.5,
        (events[index + 1]?.start ?? Infinity) - 0.1,
        offset / speed,
      ),
    }))
    .filter((cue) => cue.end - cue.start >= 0.6);
}

function timestamp(seconds, ass = false) {
  const units = ass ? 100 : 1000;
  const t = Math.round(seconds * units);
  const h = Math.floor(t / (3600 * units));
  const m = Math.floor(t / (60 * units)) % 60;
  const s = Math.floor(t / units) % 60;
  return `${ass ? h : String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}${ass ? "." : ","}${String(t % units).padStart(ass ? 2 : 3, "0")}`;
}

export function srt(cues) {
  return cues
    .map((cue, i) => `${i + 1}\n${timestamp(cue.start)} --> ${timestamp(cue.end)}\n${cue.text}\n`)
    .join("\n");
}

export function ass(cues) {
  const header = `[Script Info]
ScriptType: v4.00+
PlayResX: 960
PlayResY: 540
WrapStyle: 0

[V4+ Styles]
Format: Name, Fontname, Fontsize, PrimaryColour, SecondaryColour, OutlineColour, BackColour, Bold, Italic, Underline, StrikeOut, ScaleX, ScaleY, Spacing, Angle, BorderStyle, Outline, Shadow, Alignment, MarginL, MarginR, MarginV, Encoding
Style: Narration,Noto Sans CJK JP,24,&H00FFFFFF,&H00FFFFFF,&H90000000,&H90000000,0,0,0,0,100,100,0,0,3,2,0,8,36,36,64,1

[Events]
Format: Layer, Start, End, Style, Name, MarginL, MarginR, MarginV, Effect, Text
`;
  return (
    header +
    cues
      .map((cue) => {
        const text = cue.text
          .replaceAll("\\", "＼")
          .replaceAll("{", "｛")
          .replaceAll("}", "｝")
          .replaceAll("\n", "\\N");
        return `Dialogue: 0,${timestamp(cue.start, true)},${timestamp(cue.end, true)},Narration,,0,0,0,,${text}\n`;
      })
      .join("")
  );
}
