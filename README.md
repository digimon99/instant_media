# instant_media

**Generate images, music, videos, and speech from your AI agent — permanent CDN URLs in ~50ms.**

A portable, dependency-free skill for any agent runtime that supports `SKILL.md` + JavaScript
skills (NXagents and compatible loaders). Works against [Builder2](https://www.builder2.com)
by default, or any self-hosted Builder2 instance.

---

## Why

Agents need media, but most generation APIs are async, slow, and return links that rot.
`instant_media` wraps the Builder2 media pipeline so your agent submits one call and gets a
**permanent CDN URL back in ~50ms** — a placeholder serves immediately, and the real image,
song, video, or voiceover lands at that same URL within seconds to minutes. Fire-and-forget:
no polling, no job management, no broken links.

- **Instant URLs** — every generation returns its final public URL immediately
- **Everything media** — images, infographics, music (lyrics-to-song), slide-synced
  audiobooks, full AI videos with narration + subtitles, TTS voiceovers, stock footage,
  screenshots, transcription
- **Resumable video pipeline** — declarative clip timelines with per-clip images,
  TTS narration, animate/zoom motion, subtitles, music beds; completed assets are
  content-hashed and reused on regenerate (edit one clip, re-bill nothing else)
- **Character consistency** — attach a reference image to any generation to keep the
  same character across scenes

---

## What it generates

| Content type | What you get | Turnaround |
|---|---|---|
| `image` / `infographic` | Single image or diagram, any size | ~5-15s |
| `music` | Full songs (lyrics-to-song custom mode or describe-it mode), 2 variants | ~30-90s |
| `video_workflow` | Assembled vertical/landscape video: clips + narration + subtitles + music bed, HLS streaming | ~1-3min |
| `tts` | Voiceover audio (multilingual) | ~5-15s |
| `transcribe` | Timestamped transcript (word-level chunks) | ~10s |
| `page_screenshot` | Full-page website capture | ~10s |
| `image_proxy` | Re-host any external image on permanent CDN | ~1s |

Plus `regenerate` / `get_slot` / `list_slots` for variant management.

---

## Install

```bash
git clone https://github.com/digimon99/instant_media.git <skills-dir>/instant_media
```

or copy the raw trio (`SKILL.md`, `index.js`, `schema.json`) into your skills folder.

### Runtime requirements

A Goja/ES5-style JS sandbox exposing `input`, `env`, `fetch`, `console` (NXagents provides
these out of the box). Optional: `WEBHOOK_BASE_URL`/`USER_ID`/`AGENT_ID`/`SESSION_ID` envs
enable completion webhooks back to your agent runtime.

---

## Configuration

| Env var | Required | Purpose |
|---|---|---|
| `BUILDER2_API_KEY` | yes | Builder2 API key (prefix `bk2_`) |
| `BUILDER2_BASE_URL` | no | Self-hosted Builder2 (default `https://api.builder2.com`) |

Get a key at [builder2.com](https://www.builder2.com) → Settings → API Keys.

---

## Quick start

**An image:**
```json
{ "action": "generate", "content_type": "image",
  "prompt": "neon-lit Tokyo alley in the rain, cinematic, portrait",
  "image_size": "portrait_16_9" }
```

**A song (your lyrics):**
```json
{ "action": "generate", "content_type": "music", "custom_mode": true,
  "prompt": "[Verse]\nCity lights blur into gold...",
  "style": "dream pop, female vocals, 90bpm", "title": "Golden Hour" }
```

**A narrated video:**
```json
{ "action": "generate", "content_type": "video_workflow",
  "narration_flow": true, "aspect_ratio": "9:16", "voice": "puck",
  "clips": [
    { "image_url": "https://cdn.builder2.com/...", "tts_text": "Hook line here.",
      "duration": 8, "motion": "animate", "subtitle": "" },
    { "image_url": "https://cdn.builder2.com/...", "tts_text": "Point one.",
      "duration": 10, "motion": "zoom_in_slow" }
  ],
  "music": { "prompt": "lo-fi electronic, 110bpm", "volume": 0.35 } }
```

Every response carries `url` (the permanent public URL — use for embedding/publishing),
`media_url` (raw file, downloads only for video), `job_id`, and `embed_markdown`/`embed_html`.

---

## House rules baked into the skill

- **Parallel calls are allowed and encouraged** (fire-and-forget) — but every call must
  carry its complete payload; on a validation error, re-issue ONE corrected call
- `prompt` is required and must be the **full content** (lyrics, concept, scene) — never a label
- Video permanent URLs are **HLS streams** (`.m3u8`) — publish those, never the raw MP4
- Placeholders (gray image / silent MP3 / placeholder MP4) mean "still rendering" —
  use the URL as-is; the real file replaces it automatically

Full parameter reference and the complete video_workflow timeline schema live in
[`SKILL.md`](./SKILL.md).

---

## Works great with

- [`blogpost_service`](https://github.com/digimon99/blogpost_service) — generate the
  featured image with `instant_media`, publish the post with `blogpost_service`

---

## License

MIT — see [LICENSE](./LICENSE).
