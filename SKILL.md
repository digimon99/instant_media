---
name: instant_media
description: >-
  Generate images, music, video, and TTS instantly via builder2.com CDN — returns a permanent URL within ~50ms.

> **Parallel calls are ALLOWED and encouraged** (fire-and-forget — submit cover + music
> + images in one batch). ONE rule: EVERY call must carry its COMPLETE payload — full
> `prompt` (the actual lyrics/concept text, never a short label) and `content_type`.
> If a call returns "prompt is required", re-issue ONE corrected call with the full
> payload — never re-emit the whole batch. (`action` defaults to `generate` when omitted.)
  The preferred tool for ALL media generation: avatars, banners, featured images, illustrations,
  thumbnails, diagrams, logos, songs, or any visual/audio content. Returns embed_markdown and embed_html.
  The URL is live immediately (placeholder while generating, real content in ~5-90s depending on type).
  For music: supports simple mode (describe song) and custom mode (write lyrics + style tags). Models: suno-v5.5 (default), suno-v5, suno-v4.5plus (legacy).
permissions:
  - fetch
  - log
  - env
is_enabled: true
---

# instant_media

> **Open-source edition** — point at any Builder2 instance with `BUILDER2_BASE_URL`
> (default `https://api.builder2.com`) and authenticate with `BUILDER2_API_KEY`
> (your key, prefix `bk2_`).

Generate media (images, video, TTS, music) via builder2.com's permanent CDN slot API. Returns a **permanent CDN URL** immediately (~50ms) — the URL is live instantly and serves the generated content once ready.

## Content Types

| Type | Description | Key Parameters |
|------|-------------|----------------|
| `image` (default) | AI-generated image from text prompt | `prompt`, `image_size`, `count` |
| `infographic` | Data-driven infographic (charts, stats, timelines) | `prompt`, `image_size` |
| `image_proxy` | Download an external image and re-serve via CDN | `image_url` (required) |
| `page_screenshot` | Screenshot a webpage via headless Chromium | `page_url` (required) |
| `video` | AI-generated video (single clip) | `prompt` |
| `video_workflow` | **Complete publish-ready video**: mixed stock/AI clips + TTS narration + burned subtitles, assembled server-side | `clips` (required), `aspect_ratio`, `voice` |
| `tts` | Text-to-speech audio | `prompt` |
| `music` | AI-generated music | `prompt` |
| `transcribe` | Audio/video → text with timestamps | `audio_url` (required) |

## When to Use This Tool

Use `instant_media` whenever you need to generate an image and get back a URL. Common scenarios:

- **Chat**: User asks for an image, avatar, banner, logo, illustration — generate and return the URL/embed
- **Channel/Blog setup**: User needs an avatar or banner image — generate and provide the URL
- **Blog workflows**: Generate featured images and in-content images — use the URL in blogpost_service
- **Any visual content**: Diagrams, thumbnails, cover art, social media graphics, infographics

### Verifying a claimed job/URL — `job_info`, never `get_slot`

To check whether a media job really exists (e.g. a cover image claimed in an earlier turn), call `instant_media job_info` with `job_id`. `get_slot` takes a **slot_key**, not a job id — passing a job id returns 404 and has caused agents to regenerate perfectly good media on a false negative. If `job_info` returns `status: completed` and the `permanent_url` serves, the media is REAL — stop verifying, never regenerate.

### Comparison with other image tools

| Tool | Returns | Speed | Best for |
|------|---------|-------|----------|
| **instant_media** | Permanent CDN URL + embed codes | ~50ms | **Always prefer this** — any time you need a URL |
| `generate_image` | Pushes image to chat via WebSocket (no URL) | Async | Only when user just wants to see an image in chat |
| `workflow_image` | Relative URL (/storage/...) | 5-15s sync | Legacy — prefer instant_media instead |

## API

**Endpoint:** `POST https://api.builder2.com/api/v1/build-media`
**Auth:** `Authorization: Bearer bk2_...` (BUILDER2_API_KEY env var)

## Actions

### generate
Generate media from a prompt. Returns a permanent CDN URL immediately.

**Parameters:**
- `action`: "generate"
- `prompt` (**REQUIRED**): Text description of the desired image
- `content_type` (optional): "image" (default) | "infographic" | "image_proxy" | "page_screenshot" | "video" | "tts" | "music"
  - `infographic` — same interface as image, but uses an optimal model for data-driven infographic visuals (charts, stats, timelines, process flows, comparisons). Use when the user wants an infographic specifically.
  - `image_proxy` — downloads an external image (via `image_url` param) and re-serves it via builder2 CDN. Use for real-world images that can't be AI-generated: product photos (e.g., RTX 5090), stock photos (e.g., Vancouver sunset), screenshots. Returns a permanent slug URL + `source_url` for attribution.
  - `page_screenshot` — renders a webpage via headless Chromium (via `page_url` param) and captures a JPEG screenshot. Use for news article screenshots, source citations, proof of fact. Returns a permanent slug URL + `source_page_url` for attribution.
- `media_slug` (optional): URL-friendly name. Auto-generated from prompt if omitted
- `count` (optional): Number of variants (1-4, default 1)
- `image_size` (optional, image only): Aspect ratio preset. The closest supported value is chosen per model. Default `landscape_16_9`. Options:
  - `landscape_16_9` — wide banner / featured image (16:9)
  - `landscape_4_3` — classic landscape (4:3)
  - `square` — avatar / logo / album art (1:1)
  - `portrait_4_3` — portrait (3:4)
  - `portrait_16_9` — tall / story / reel (9:16)
- `character_id` (optional): Generate with a character's traits (physical & soul) auto-injected
- `character_slug` (optional): Alternative to character_id — use the character's URL slug
- `character_image_url` (optional): Custom reference image URL for image-edit mode. Uses an image-edit model that takes the reference image + your prompt to produce images matching the reference. Use this with your own avatar (from `get_agent_info`) to generate self-portraits in different scenes/outfits. Example: `character_image_url="https://www.nxagents.net/storage/avatar.png"`
- `image_url` (**REQUIRED for image_proxy**): Source image URL to proxy. Only used with `content_type: "image_proxy"`. Downloads the external image and re-serves it via builder2 CDN. The response includes `source_url` for attribution.
- `fallback_generation_prompt` (image_proxy): Short topic description of what the image shows (e.g. `"bitcoin price surge, financial chart illustration"`). When the source URL is dead (404/link rot — common with news-site images), the platform generates a replacement image using this prompt instead of failing the job. **Always provide it when proxying news/media images.**
- `page_url` (**REQUIRED for page_screenshot**): Webpage URL to screenshot. Only used with `content_type: "page_screenshot"`. Renders the page via headless Chromium and captures a JPEG screenshot. The response includes `source_page_url` for attribution.

**Returns:**
```json
{
  "success": true,
  "url": "https://cdn.builder2.com/w/blog-featured-ai/job_bbb60d20-028",
  "job_id": "job_bbb60d20-028",
  "media_slug": "blog-featured-ai",
  "status": "generating",
  "model": "fal-ai/nano-banana-pro",
  "mode": "standard",
  "embed_markdown": "![](https://www.builder2.com/embed/job_bbb60d20-028/image)",
  "embed_html": "<iframe src=\"https://www.builder2.com/embed/job_bbb60d20-028\" width=\"100%\" height=\"500\" ...></iframe>"
}
```

**Response fields:**

| Field | Description |
|-------|-------------|
| `url` | Permanent CDN URL — use as `featuredimage` or in `<img>` tags |
| `job_id` | Job identifier for tracking |
| `media_slug` | URL-friendly slug |
| `status` | `"generating"` — image renders at URL within ~5-10s |
| `model` | AI model used (e.g., `fal-ai/nano-banana-pro`) |
| `mode` | `"standard"` or `"character"` (if character_id/slug was used) |
| `embed_markdown` | Markdown image embed — works in any markdown renderer |
| `embed_html` | HTML iframe embed — rich interactive experience for web UIs |

The `url` field is the permanent CDN URL. Use it directly as a `featuredimage` value or in any `<img>` tag. The image renders automatically once generation completes (~5-10s backend-side).

The `embed_html` can be used in web pages for a rich interactive experience (auto-refreshes from loading state to media, supports image grids and video players).

## ⚠️ CRITICAL — After Generating: Display the Image in Chat

When you call this tool and get a successful result, you MUST display the generated image(s) inline in your chat response using markdown image syntax with the `url` field:

```
![description](url)
```

**DO:**
```markdown
Here's the avatar I generated:

![Developer workshop avatar — dark neon tech style](https://cdn.builder2.com/w/i/dev-workshop-avatar/job_abc123)
```

**DO NOT:**
- Show bare URLs as text: `URL: https://cdn.builder2.com/...`
- Put URLs in a table without markdown image tags
- Only show the embed_markdown or embed_html fields — always use `![](url)` with the `url` field

If you generated multiple variants, embed each one:
```markdown
![Variant 1 — description](url1)
![Variant 2 — description](url2)
```

### regenerate
Regenerate media for an existing slot. Same CDN URL, new image.

**Parameters:**
- `action`: "regenerate"
- `slot_key`: The slot key to regenerate
- `prompt` (optional): New prompt (reuses last if omitted)

### list_slots
List all your media slots.

**Parameters:**
- `action`: "list_slots"

### get_slot
Get details of a specific slot.

**Parameters:**
- `action`: "get_slot"
- `slot_key`: The slot key

## Usage Examples

```json
// Generate an avatar (square)
{"action": "generate", "prompt": "developer workshop logo, dark tech style, terminal code glow, orange-blue neon", "count": 1, "image_size": "square"}

// Generate a banner (16:9 landscape)
{"action": "generate", "prompt": "wide banner: dark blue background with scrolling code on left, circuit board texture", "media_slug": "dev-workshop-banner", "count": 1, "image_size": "landscape_16_9"}

// Generate a blog featured image (4:3 landscape)
{"action": "generate", "prompt": "modern data center with AI servers, blue lighting, professional photography", "image_size": "landscape_4_3"}

// Generate a portrait/story image (9:16)
{"action": "generate", "prompt": "futuristic city skyline at dusk, neon lights", "image_size": "portrait_16_9"}

// Generate an infographic (data-driven visual with optimal model)
{"action": "generate", "content_type": "infographic", "prompt": "Q3 revenue growth infographic with bar chart, key metrics, and trend arrows, modern corporate style", "image_size": "landscape_16_9", "count": 1}

// Generate multiple variants
{"action": "generate", "prompt": "stock market chart showing upward trend", "count": 3}

// Generate with a character
{"action": "generate", "prompt": "walking through a neon city at night", "character_slug": "aria", "count": 2}

// Generate with a custom reference image (e.g., your own avatar for self-portraits)
{"action": "generate", "prompt": "wearing a red dress at a gala event, elegant, professional photography", "character_image_url": "https://www.nxagents.net/storage/.../avatar.png", "image_size": "portrait_4_3", "count": 1}

// Generate using your agent avatar (call get_agent_info first to get avatar_url)
{"action": "generate", "prompt": "presenting at a tech conference, confident, professional", "character_image_url": "AGENT_AVATAR_URL", "image_size": "landscape_16_9", "count": 2}

// Proxy an external image (real product photo, stock photo, etc.)
{"action": "generate", "content_type": "image_proxy", "image_url": "https://example.com/rtx-5090-product-shot.jpg", "media_slug": "rtx-5090-product", "prompt": "NVIDIA RTX 5090 graphics card", "fallback_generation_prompt": "NVIDIA RTX 5090 graphics card product shot"}
// → Returns: { url: "https://cdn.builder2.com/w/i/rtx-5090-product/job_xxx.jpeg", source_url: "https://example.com/rtx-5090-product-shot.jpg", ... }

// Screenshot a webpage (news article, source citation)
{"action": "generate", "content_type": "page_screenshot", "page_url": "https://news-site.com/breaking-article", "media_slug": "breaking-news-source", "prompt": "Breaking news source screenshot"}
// → Returns: { url: "https://cdn.builder2.com/w/i/breaking-news-source/job_xxx.jpeg", source_page_url: "https://news-site.com/breaking-article", ... }

// Regenerate an existing slot (same URL, new image)
{"action": "regenerate", "slot_key": "dev-workshop-banner", "prompt": "updated banner design with new colors"}

// Proxy an external image to builder2 CDN
{"action": "generate", "content_type": "image_proxy", "image_url": "https://example.com/product-photo.jpg", "media_slug": "product-shot", "fallback_generation_prompt": "product photo of the item described in the article"}

// Screenshot a webpage
{"action": "generate", "content_type": "page_screenshot", "page_url": "https://example.com/article", "media_slug": "article-screenshot"}

// List all your media slots
{"action": "list_slots"}
```

## Music Generation

Generate AI music via Suno. Returns a permanent MP3 URL immediately (silent placeholder). Suno generates 2 songs (~30-90s), both saved as variants.

### Simple Mode (describe the song)
```json
{"action": "generate", "content_type": "music", "prompt": "A cheerful summer pop song about road trips and adventure", "model": "suno-v4.5"}
```

### Custom Mode (write lyrics + control style)
```json
{"action": "generate", "content_type": "music", "prompt": "[Verse]\nPack the car, hit the road\nSun is high, feeling bold\n[Chorus]\nSummer nights, living right\nDriving till the morning light", "custom_mode": true, "style": "pop, upbeat, electronic, female vocals, 120bpm", "title": "Summer Anthem", "model": "suno-v5.5"}
```

### Instrumental (no vocals)
```json
{"action": "generate", "content_type": "music", "prompt": "lo-fi chillhop for studying", "instrumental": true}
```

### Music Parameters

| Parameter | Description |
|-----------|-------------|
| `model` | `suno-v5.5` (default — always use this), or legacy `suno-v5` / `suno-v4.5plus` |
| `custom_mode` | `true` = prompt IS the lyrics. `false` (default) = prompt describes the song |
| `style` | Style tags for custom mode (e.g., "pop, electronic, female vocals") |
| `title` | Song title (custom mode only) |
| `instrumental` | `true` = instrumental only, no vocals |

## 🎬 Video Workflow — Complete Video Production (comprehensive guide)

`content_type: "video_workflow"` produces a **publish-ready video in one call**: free stock footage and/or AI-generated clips, per-clip TTS narration, burned-in subtitles — assembled server-side with ffmpeg into one MP4 at a permanent CDN URL.

**This is the RIGHT choice for short videos** (news recaps, explainers, trivia, blog-to-video, social posts). Use plain `video` only for a single hero AI clip.

### How to design the timeline

You write a **clips[] array** — each clip is one visual shot with its narration. The server finds/generates each visual, synthesizes narration, times subtitles, and concatenates everything.

```json
{"action": "generate", "content_type": "video_workflow", "media_slug": "bitcoin-recap-aug20",
 "aspect_ratio": "9:16", "voice": "am_michael",
 "clips": [
   {"duration": 5, "stock_query": "stock market trading floor", "tts_text": "Bitcoin crossed seventy thousand today.", "fallback_prompt": "busy stock trading floor with rising charts, cinematic"},
   {"duration": 5, "stock_query": "tokyo street night neon", "tts_text": "Markets from Tokyo to Toronto are euphoric.", "fallback_prompt": "neon lit street at night, rain reflections, cinematic"},
   {"duration": 5, "visual_prompt": "glowing golden bitcoin coin rising over a city skyline, vertical, cinematic", "tts_text": "Analysts say the rally is just getting started."}
 ]}
```

### video_file — submit from a JSON file (PREFERRED for full videos)

Writing 5-10 clips inline is the largest tool payload you ever emit — and the place models drop required fields. Instead: write the complete spec to a workspace `video.json` (clips, music, globals — everything except action/content_type), read it back once to verify, then submit the path:

```json
{"action": "generate", "content_type": "video_workflow", "video_file": "videos/myvideo/video.json"}
```

Mutually exclusive with inline `clips[]`; invalid JSON returns a precise error — fix the file with `edit_file`, resubmit the same call. `video_type: "music_instrumental"` specs (no clips) are supported. The file is the checkpoint: resumable, reusable, diffable.

### Art direction (enhance_prompt) — optional, one-off variety only

Set `enhance_prompt: true` to have the server append a curated STYLE DIRECTION directive (pool by `enhance_typeid`: article/music/video/audiobook/card) with recent-style exclusion — one-off featured images stop converging on the same look. Off by default in this open-source edition (server-side feature; unsupported servers ignore the field).

⚠️ **Never enable it for a themed series**: a post's set of cards/illustrations must share one visual system — enabling art direction randomizes each image independently and breaks the series' coherence. One-offs only.

### Clip design rules (follow ALL of these)

1. **Stock first, AI for the rest.** ~70-90% of shots in a typical short video are generic B-roll ("ocean waves", "city traffic", "office work") — free stock footage is instant, free, and looks real. Use `visual_prompt` ONLY for abstract/specific/branded shots stock can't find (a glowing coin over a skyline, a product hero shot).
2. **ALWAYS pair `stock_query` with `fallback_prompt`.** If stock comes up empty, the fallback keeps production moving instead of failing.
3. **Stock queries: 2-4 generic visual words.** "ocean waves sunset" ✓ — "Bitcoin's August 2026 rally above 70k resistance" ✗ (search engines match visuals, not concepts).
4. **visual_prompt style**: cinematic descriptors + mention **"vertical"** for 9:16. One visual idea per clip.
5. **Narration pacing: ≤2.5 words per second of duration.** A 5s clip carries ~12 words max. Count your words; trim or extend duration.
6. **Clip duration 2-40s; 2-10 clips; total ≤150s (measured narration).** For a 30-60s social video: 6-10 clips of 4-6s each. Teaching formats (word deep-dives, explainers) may use one long 30-40s card with a full spoken read — budget sum ≤ ~130s since real TTS runs 10-20% long.
7. **Hook first.** Clip 1 must grab attention (question, bold statement, striking visual).
8. **One idea per clip** — both the visual AND the narration sentence.
9. **Languages**: `tts_text` any language; voice "mandarin" for Chinese (`"voice": "mandarin"`), subtitle defaults to tts_text. Match voice language to narration language.

### Aspect ratio & voice

- `aspect_ratio`: `"9:16"` vertical (TikTok/Shorts/Reels — default for social), `"16:9"` landscape (YouTube/nxplace embeds), `"1:1"` square.
- `voice`: **narrator gender/persona**. Male Chinese narrator → `voice: "male"` (or `"charon"`); female Chinese → `"kore"`; male EN → `"puck"`; female EN → `"aoede"`; or any Gemini persona name. Legacy `"mandarin"` = female CJK. You can also set `vocal_gender: "male"|"female"`.
- ⚠️ **ONE written language for ALL tts_text** — never mix 書面普通話 (的/是/了) with 廣東話口語 (嘅/係/咗/喺) across clips: TTS reads each clip in its written language and the narration will switch accents mid-video. Pick Cantonese-written OR Mandarin-written for every clip consistently.

### Music-driven videos (audio_url) — general audio mode

Any pre-existing audio track can be the timeline spine instead of TTS: **music videos, podcast clips, ads with licensed beds**.

```json
{"action": "generate", "content_type": "video_workflow", "media_slug": "song-lyric-video",
 "aspect_ratio": "9:16", "audio_url": "https://media.builder2.com/w/m/my-song.mp3", "subtitle_style": "neon",
 "clips": [
   {"duration": 3, "image_url": "https://.../cover.jpg", "motion": "zoom_in_slow", "subtitle": ""},
   {"duration": 8, "stock_query": "autumn leaves street", "subtitle": "秋天的风 吹过那条街"},
   {"duration": 8, "stock_query": "coffee shop window rain", "subtitle": "咖啡馆的窗 还是那个位置"},
   {"duration": 5, "image_url": "https://.../cover.jpg", "motion": "fade_out", "subtitle": ""}
 ]}
```

- **`audio_url`**: no TTS is generated; total duration = audio duration (3s–10min). Clip durations are **auto-fit** (scaled proportionally, min 2s each, residual holds on the last clip). `narration_flow` is mutually exclusive; `music` bed is ignored.
- **Limits in audio mode**: up to 30 clips, 1–30s each (pre-fit values). A clip whose visual fails fails the job (dropping a clip would desync lyrics) — always pair `stock_query` with `fallback_prompt`.
- **`lyrics: {text}`** — plain lyrics (with `[Verse]`/`[Chorus]` tags, stripped automatically): the backend transcribes the track and aligns every line to when it is actually sung — instrumental intros/solos get no text, garbled ASLR doesn't matter (fuzzy match). Or **`lyrics: {lrc}`** for exact timed lyrics. Lyrics replace per-clip subtitles; language must match the audio (mismatch → lyrics skipped with a warning).
- **`subtitle_style`** (top-level, per-clip override via `clips[].subtitle_style`): `clean` (default white + black outline) · `bold-caps` (heavy uppercase) · `boxed` (dark caption card) · `neon` (cyan/pink glow) · `minimal` (small, unobtrusive). Subtitles start on the cut (no TTS lead-in).
- **`merge_animate_audio: true`** (video_workflow, narration mode): clips with `motion: "animate"` generate a soundscape alongside the animation — this mixes each animate clip's generated audio into the final mix at low volume (0.30), sidechain-ducked under the narration (same protection as the music bed). Only animate-generated clips contribute — stock/uploaded video audio is NEVER included. Write `animate_prompt` with scene atmosphere AND sound cues (e.g. "slow push-in, neon flickers, ambient electric hum") so the generated soundscape fits the scene.
- **`clips[].subtitle` accepts ONLY three things**: `""` (empty = auto-caption from that clip's `tts_text`), `"none"` (suppress subtitles for that clip — use for image cards whose artwork already carries text), or your own literal caption text. Style names like `minimal`/`clean` are **`subtitle_style` values — NEVER `subtitle` values**; writing a style name into `subtitle` burns that literal word onto the video (real incident 2026-08-28: `subtitle:"minimal"` → the word "minimal" appeared on screen).
- **Transitions** (audio mode only): `clips[].transition: "fade"|"dissolve"|"fadeblack"|"fadewhite"` + `transition_duration` (0.3–2s, default 0.5). Durations auto-extend so total still equals the audio. Forbidden with narration (overlaps would desync speech).
- **Short footage never freezes**: stock shorter than its fitted slot auto-slow-mos (≥half slot) or ping-pong loops seamlessly (<half, ≤10s sources) — no frozen last frame.
- **`clips[].color_grade`**: `warm | cool | vintage | cinematic | bw` per clip.
- **New motion presets** (image clips): `zoom_in_slow`, `zoom_out_slow` (gentler Ken Burns for long scenes) and `fade_out` (static card dissolving to black — ending/outro cards).

### Verifying the music bed (narration videos)

Music generation is soft-fail: if the bed can't be generated (transient), the video completes WITHOUT
music and the embed status shows it. After submitting a video_workflow with `music`, verify ONCE via
embed status — do NOT judge by re-watching the URL (CDN caching can serve the previous render):
```
GET https://api.builder2.com/api/v1/embed/{job_id}/status
→ response_body.music = {"status":"ok"}  ✓ music mixed
→ response_body.music = {"status":"skipped"} — bed failed; regenerate the job (regenerates bump the
  default variant so the permanent URL serves the new render)
```

### Async behavior — poll for completion

Returns instantly with the permanent URL; assembly runs server-side (~1-3 min; stock-only ~1 min, AI clips add ~2 min each). **Poll until ready:**
```
GET https://api.builder2.com/api/v1/embed/{job_id}/status   → {"status":"completed"|"processing"|"failed", ...}
```
Poll every ~20s, max ~5 min. The permanent URL serves the finished MP4 automatically once complete. NEVER report the video as done to the user before status=completed.

### Streaming (enable_stream)

**DEFAULT ON**: every video_workflow returns the job's ONE permanent URL as `.m3u8` (HLS packaged in ~1-2s via stream-copy — adaptive streaming, zero per-minute cost). The MP4 is still uploaded and reachable at `media_url` (raw R2 file URL) for downloads/non-HLS fallbacks — never publish it. Pass `enable_stream: false` only when a plain `.mp4` permanent URL is specifically required. The poll-for-completion flow is unchanged (embed status also reports `stream_url`).

### Publishing

Embed in nxplace posts via `blogpost_service create_post` with `videoslist: [url]` (or audioslist fallback). The MP4 is H.264 + AAC, faststart — plays everywhere including iOS.

## Transcription (content_type: "transcribe")

Transcribe any public audio/video URL to timestamped text (fal-ai/wizper, ~10s for 3 min of audio). Multilingual (mixed CJK + English works). No `prompt` needed — `audio_url` is the input.

**SYNC by default**: the skill passes `wait_seconds: 40` — short audio (≤ ~10-15 min) returns the **full transcript inline in the same call** (no polling). Only long audio (30-60 min) falls back to async: then poll the embed status.

```json
{"action": "generate", "content_type": "transcribe", "audio_url": "https://cdn.builder2.com/w/t/some-narration/job_xxx.mp3", "media_slug": "feynman-narration-transcript"}
```

- **Short audio** → response is `status: "completed"` with `transcript` inline:
```json
"transcript": {
  "text": "full plain transcript...",
  "chunks": [{"timestamp": [0.24, 6.84], "text": "私语长 今日主题 费曼学习法"}, ...],
  "languages": ["en"],
  "duration_seconds": 68.08
}
```
- **Long audio** → response `status: "generating"`: poll `GET https://api.builder2.com/api/v1/embed/{job_id}/status` (~15s intervals) until completed, then read `transcript`. Both URLs serve a `{"status":"generating"}` placeholder JSON from t=0, replaced by the real transcript on completion.

Use cases: subtitle generation for existing audio, meeting/podcast summarization, converting your own TTS output back to timed text, logging voice memos. The per-chunk timestamps make it suitable for LRC/lyric timing extraction.

## Checkpointing generated URLs (all agents, mandatory habit)

The permanent URL returned by `instant_media` is the ONLY handle to your generated media. **Immediately after every generate call, persist the URL to a workspace file** (the workflow's tracking file, a `media.json` in the run folder — whatever your skill uses):

```
write_file path=blogs/{workflow}/{date}/media.json  content={"cover_url": "...", "music_url": "..."}
```

Why: sessions get interrupted between generation and publish. A URL that exists only in conversation context is effectively LOST — and the failure mode is the agent **regenerating the media** (another suno/kling call, real money) just to recover an address. One 5-second write_file per generation eliminates that class entirely.

Rules:
- Checkpoint in the SAME step as the generation call — never "after the remaining calls".
- Update incrementally (append each URL as it arrives).
- At publish time, read URLs from the checkpoint file — never regenerate to recover a URL.

## Configuration

Requires `BUILDER2_API_KEY` environment variable (starts with `bk2_`). Configured via the builder2 vendor service in Settings > Services.
