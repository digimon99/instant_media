// instant_media — Generate media via builder2.com permanent CDN API
// Returns a permanent CDN URL immediately (~50ms). URL is live instantly.
// Response includes embed_markdown and embed_html for easy embedding.
// Perfect for blog featured images, post media, or any case needing an image URL.

// Dual-host (2026-09-11 PhonkNation incident: api.builder2.com edge dropped
// POSTs entirely — zero jobs at origin — while www.builder2.com served fine
// in the same minutes). Generate/media calls try each host once.
// Single-source portability: BUILDER2_BASE_URL env override points the skill
// at any self-hosted Builder2 instance (NXagents never sets it — inert here).
// Dual-host failover applies only to the default SaaS hosts; a self-hosted
// override has no www-alt.
var BASE_URL = (typeof env !== "undefined" && env && env.BUILDER2_BASE_URL) ? String(env.BUILDER2_BASE_URL).trim().replace(/\/$/, "") : "https://api.builder2.com";
var BASE_URL_ALT = (BASE_URL === "https://api.builder2.com") ? "https://www.builder2.com" : BASE_URL;
function postBuildMedia(payload, headers) {
  try {
    return fetchJSONPost(BASE_URL + "/api/v1/build-media", payload, headers);
  } catch (e) {
    var msg = String(e);
    if (/empty response body|http error 5|http error 52|timeout|connection/i.test(msg)) {
      return fetchJSONPost(BASE_URL_ALT + "/api/v1/build-media", payload, headers);
    }
    throw e;
  }
}

var apiKey = (typeof env !== "undefined" && env && env.BUILDER2_API_KEY) ? String(env.BUILDER2_API_KEY).trim() : "";

// Single-source portability: external loaders (plain Node, Bun, tool runners)
// may not inject the NXagents host helpers. When require is reachable we
// polyfill curl-backed SYNC HTTP (Promise fetch cannot be awaited from ES5
// sync code) + fs-backed readFile. Under the NXagents goja VM require does
// not exist and the host helpers win — this whole block no-ops.
if (typeof env === "undefined") { env = {}; }
if (typeof input === "undefined") { input = {}; }

(function () {
  if (typeof fetchJSONPost !== "undefined") return; // host provides the helpers
  var hasRequire = (typeof require === "function");
  if (!hasRequire) return; // host must inject fetchJSON* itself (see OSS README)
  var cp = require("child_process");
  var fs = require("fs");

  function httpJson(method, url, payload, headers) {
    var args = ["-sS", "-m", "180", "-X", method, url];
    for (var k in headers || {}) {
      args.push("-H"); args.push(k + ": " + headers[k]);
    }
    var body = null;
    if (payload !== undefined && payload !== null) {
      body = (typeof payload === "string") ? payload : JSON.stringify(payload);
      args.push("-H", "Content-Type: application/json");
      args.push("--data-binary", "@-");
    }
    var opts = { input: body || "", maxBuffer: 32 * 1024 * 1024, timeout: 185000 };
    var out;
    try {
      out = cp.execSync("curl " + args.map(shellQuote).join(" "), opts).toString();
    } catch (e) {
      throw new Error("http " + method + " " + url + " failed: " + String(e.message || e));
    }
    if (!out) throw new Error("empty response body from " + url);
    try {
      return JSON.parse(out);
    } catch (e2) {
      throw new Error("non-JSON response from " + url + ": " + out.substring(0, 200));
    }
  }
  function shellQuote(a) {
    return "'" + String(a).replace(/'/g, "'\\''") + "'";
  }

  var g = (typeof globalThis !== "undefined") ? globalThis : (typeof global !== "undefined" ? global : this);
  g.fetchJSON = function (url, headers) { return httpJson("GET", url, null, headers); };
  g.fetchJSONPost = function (url, payload, headers) { return httpJson("POST", url, payload, headers); };
  g.fetchJSONPut = function (url, payload, headers) { return httpJson("PUT", url, payload, headers); };
  g.fetchJSONDelete = function (url, headers) { return httpJson("DELETE", url, null, headers); };
  if (typeof readFile === "undefined") {
    g.readFile = function (path) {
      try { return fs.readFileSync(String(path), "utf8"); }
      catch (e) { return { error: String(e.message || e) }; }
    };
  }
})();

function authHeaders() {
  return {
    "Authorization": "Bearer " + apiKey,
    "Content-Type": "application/json"
  };
}

function slugify(text) {
  return String(text)
    .toLowerCase()
    .replace(/[^a-z0-9\s-]/g, "")
    .trim()
    .replace(/\s+/g, "-")
    .replace(/-+/g, "-")
    .substring(0, 80);
}

function actionGenerate(params) {
  var contentType = params.content_type || "image";

  // video_file: full video_workflow spec from a workspace JSON file — the
  // same mechanism as blogpost_service article_file (Steve-approved
  // 2026-09-01). The agent checkpoints video.json (clips, music, globals)
  // and submits just the path, instead of emitting a giant schema-dense
  // tool payload — the exact regime where models drop required fields
  // (music/merge_animate_audio/lyrics-stub incidents). The file IS the
  // spec: action + content_type stay from the call, everything else is
  // replaced by the file's fields; downstream normalization (clips
  // mapping, music/lyrics parsing) runs unchanged on the merged params.
  if (params.video_file) {
    if (params.clips) {
      return { success: false, error: "pass EITHER video_file OR clips[] — not both (the file is the complete spec)" };
    }
    var vr = readFile(String(params.video_file));
    if (!vr || !vr.ok) {
      return { success: false, error: "Cannot read video_file '" + params.video_file + "': " + (vr && vr.error ? vr.error : "unknown error") };
    }
    var vspec;
    try {
      vspec = JSON.parse(String(vr.content));
    } catch (e) {
      return { success: false, error: "video_file '" + params.video_file + "' is not valid JSON: " + (e && e.message ? e.message : String(e)) + " — fix the file (watch trailing commas / unescaped quotes), then resubmit the same call" };
    }
    if (!vspec || typeof vspec !== "object" || Array.isArray(vspec)) {
      return { success: false, error: "video_file must contain a JSON OBJECT with clips/music/globals — got " + (Array.isArray(vspec) ? "an array" : typeof vspec) };
    }
    var hasClips = !!(vspec.clips && vspec.clips.length);
    var wrapperSpec = String(vspec.video_type || "") === "music_instrumental";
    if (!hasClips && !wrapperSpec) {
      return { success: false, error: "video_file '" + params.video_file + "' has no clips[] — the file must carry the complete timeline (or video_type 'music_instrumental' to auto-build the single cover clip)" };
    }
    var videoKeys = ["clips", "music", "aspect_ratio", "voice", "narration_flow", "merge_animate_audio",
      "with_character", "audio_url", "subtitle_style", "lyrics", "video_type", "enable_stream",
      "prompt", "title", "media_slug", "source_url", "count", "model", "custom_mode", "style",
      "instrumental", "character_id", "character_slug", "character_image_url", "image_size",
      "fallback_generation_prompt", "cover_image_url", "animate_prompt"];
    for (var vi = 0; vi < videoKeys.length; vi++) {
      delete params[videoKeys[vi]];
      if (vspec[videoKeys[vi]] !== undefined) {
        params[videoKeys[vi]] = vspec[videoKeys[vi]];
      }
    }
    console.log("instant_media: video spec loaded from video_file '" + params.video_file + "' (" + String(vr.content).length + " bytes, " + vspec.clips.length + " clips)");
  }

  // audiobook_file: full audiobook spec from a workspace JSON file — the
  // video_file mechanism applied to audiobooks. The agent checkpoints
  // audiobook.json (clips, music, voice, category) and submits the path.
  if (params.audiobook_file) {
    if (params.clips) {
      return { success: false, error: "pass EITHER audiobook_file OR clips[] — not both (the file is the complete spec)" };
    }
    var ar = readFile(String(params.audiobook_file));
    if (!ar || !ar.ok) {
      return { success: false, error: "Cannot read audiobook_file '" + params.audiobook_file + "': " + (ar && ar.error ? ar.error : "unknown error") };
    }
    var aspec;
    try {
      aspec = JSON.parse(String(ar.content));
    } catch (e) {
      return { success: false, error: "audiobook_file '" + params.audiobook_file + "' is not valid JSON: " + (e && e.message ? e.message : String(e)) };
    }
    if (!aspec || typeof aspec !== "object" || Array.isArray(aspec)) {
      return { success: false, error: "audiobook_file must contain a JSON OBJECT with clips[] — got " + (Array.isArray(aspec) ? "an array" : typeof aspec) };
    }
    if (!aspec.clips || !aspec.clips.length) {
      return { success: false, error: "audiobook_file '" + params.audiobook_file + "' has no clips[] — each clip needs tts_text + image_url" };
    }
    var abKeys = ["clips", "music", "voice", "category", "title", "cover_url", "prompt", "media_slug"];
    for (var ai = 0; ai < abKeys.length; ai++) {
      delete params[abKeys[ai]];
      if (aspec[abKeys[ai]] !== undefined) {
        params[abKeys[ai]] = aspec[abKeys[ai]];
      }
    }
    console.log("instant_media: audiobook spec loaded from audiobook_file '" + params.audiobook_file + "' (" + String(ar.content).length + " bytes, " + aspec.clips.length + " clips)");
  }

  // Arg-drop leniency: for music, a `lyrics` field IS the prompt (custom
  // mode contract) — accept it when prompt is missing.
  if (contentType === "music" && !params.prompt && params.lyrics) {
    params.prompt = typeof params.lyrics === "string" ? params.lyrics : params.prompt;
  }

  if (contentType !== "image_proxy" && contentType !== "page_screenshot" && contentType !== "transcribe" && contentType !== "audiobook" && !params.prompt) {
    return { success: false, error: "prompt is required for generate action" };
  }
  if (contentType === "audiobook" && !params.clips) {
    return { success: false, error: "clips[] is required for audiobook (each clip: tts_text + image_url) — or pass audiobook_file with the complete spec" };
  }
  if (contentType === "image_proxy" && !params.image_url) {
    return { success: false, error: "image_url is required for image_proxy content type" };
  }
  if (contentType === "page_screenshot" && !params.page_url) {
    return { success: false, error: "page_url is required for page_screenshot content type" };
  }
  if (contentType === "transcribe" && !params.audio_url) {
    return { success: false, error: "audio_url is required for transcribe content type" };
  }

  var slug = params.media_slug || slugify(params.prompt || params.image_url || params.page_url || params.audio_url || "");
  if (!slug) {
    slug = "media-" + Date.now();
  }

  var count = params.count || 1;
  if (count < 1) count = 1;
  if (count > 4) count = 4;

  var payload = {
    prompt: String(params.prompt || ""),
    content_type: contentType,
    media_slug: slug,
    count: (contentType === "image_proxy" || contentType === "page_screenshot" || contentType === "transcribe" || contentType === "audiobook") ? 1 : count
  };

  // transcribe: audio_url is the payload (prompt is cosmetic/label only).
  // wait_seconds=40: short audio (≤ ~10-15 min) transcribes within the
  // server-side sync window → the response carries the transcript INLINE
  // (single call, no polling). Longer audio falls back to async (poll
  // embed status) — handled below via resp.status/transcript.
  if (contentType === "transcribe") {
    payload.audio_url = String(params.audio_url);
    payload.wait_seconds = 40;
  }

  if (contentType === "image_proxy") {
    payload.image_url = String(params.image_url);
    if (params.fallback_generation_prompt) {
      payload.fallback_generation_prompt = String(params.fallback_generation_prompt);
    }
  }
  if (contentType === "page_screenshot") {
    payload.page_url = String(params.page_url);
  }

  // video_workflow: declarative timeline → server-side assembled video
  // (stock footage + AI clips + TTS narration + burned subtitles)
  if (contentType === "video_workflow") {
    if (params.aspect_ratio) {
      payload.aspect_ratio = String(params.aspect_ratio);
    }
    if (params.voice) {
      payload.voice = String(params.voice);
    }
    if (params.narration_flow) {
      payload.narration_flow = true;
    }
    if (params.merge_animate_audio) {
      payload.merge_animate_audio = true;
    }
    if (params.with_character) {
      payload.with_character = true;
    }
    // music: accept object OR JSON-string form (models often serialize
    // nested values as strings — parse back rather than silently drop)
    var music = params.music;
    if (typeof music === "string") {
      try { music = JSON.parse(music); } catch (e) { music = null; }
    }
    if (music && typeof music === "object") {
      payload.music = music;
    } else if (typeof params.music === "string" && params.music.trim()) {
      // bare string = treat as music prompt (music: "warm acoustic")
      payload.music = { prompt: params.music.trim() };
    }
    // enable_stream: HLS packaging — permanent URL becomes .m3u8
    // (stream-copy, near-zero cost). MP4 still available at mp4_url.
    // DEFAULT TRUE (platform standard since Build 1076): pass
    // enable_stream: false explicitly for a plain .mp4 permanent URL.
    if (params.enable_stream === false) {
      payload.enable_stream = false;
    } else {
      payload.enable_stream = true;
    }
    // audio_url: pre-existing track (song/voiceover) becomes the timeline
    // spine — no TTS, clips auto-fit to its duration (music bed ignored)
    if (params.audio_url) {
      payload.audio_url = String(params.audio_url);
    }
    // subtitle_style: ASS preset (clean|bold-caps|boxed|neon|minimal)
    if (params.subtitle_style) {
      payload.subtitle_style = String(params.subtitle_style);
    }
    // lyrics: vocal-synced lyric display. {text: "..."} = plain lyrics
    // (backend transcribes via wizper + aligns each line to the vocals);
    // {lrc: "[00:12.34]..."} = exact timed lyrics.
    // lyrics: accept object OR JSON-string form; string with [mm:ss.xx]
    // timestamps = LRC, otherwise plain lyric text
    var lyr = params.lyrics;
    if (typeof lyr === "string") {
      if (/\[\d{1,3}:\d{1,2}(\.\d{1,3})?\]/.test(lyr)) {
        lyr = { lrc: lyr };
      } else {
        lyr = { text: lyr };
      }
    }
    if (lyr && typeof lyr === "object") {
      payload.lyrics = {
        text: lyr.text ? String(lyr.text) : "",
        lrc: lyr.lrc ? String(lyr.lrc) : ""
      };
    }
    // video_type: expand wrapper-friendly top-level params into the proper
    // clips[] payload so simple callers (music_instrumental with just
    // audio_url + cover_image_url + animate_prompt) work without hand-
    // building clip objects.
    var vtype = params.video_type ? String(params.video_type) : "";
    if (vtype === "music_instrumental" && !params.clips) {
      var mClip = {
        duration: 10, // nominal — auto-fits to the full track
        motion: params.animate_prompt ? "animate" : "zoom_in_slow"
      };
      if (params.cover_image_url) mClip.image_url = String(params.cover_image_url);
      else if (params.image_prompt) mClip.image_prompt = String(params.image_prompt);
      if (params.animate_prompt) mClip.animate_prompt = String(params.animate_prompt);
      if (params.title) mClip.subtitle = String(params.title);
      payload.clips = [mClip];
    }

    // clips: accept array OR JSON-string form (some models serialize nested
    // arrays as strings — parse it back rather than fail)
    var clips = params.clips;
    if (typeof clips === "string") {
      try { clips = JSON.parse(clips); } catch (e) { clips = null; }
    }
    if (clips && typeof clips === "object" && clips.length) {
      payload.clips = clips.map(function (c) {
        return {
          duration: Number(c.duration) || 5,
          stock_query: c.stock_query ? String(c.stock_query) : "",
          visual_prompt: c.visual_prompt ? String(c.visual_prompt) : "",
          fallback_prompt: c.fallback_prompt ? String(c.fallback_prompt) : "",
          character_image_url: c.character_image_url ? String(c.character_image_url) : "",
          image_url: c.image_url ? String(c.image_url) : "",
          image_prompt: c.image_prompt ? String(c.image_prompt) : "",
          motion: c.motion ? String(c.motion) : "",
          animate_prompt: c.animate_prompt ? String(c.animate_prompt) : "",
          tts_text: c.tts_text ? String(c.tts_text) : "",
          tts_voice: c.tts_voice ? String(c.tts_voice) : "",
          subtitle: c.subtitle ? String(c.subtitle) : "",
          subtitle_style: c.subtitle_style ? String(c.subtitle_style) : "",
          transition: c.transition ? String(c.transition) : "",
          transition_duration: Number(c.transition_duration) || 0,
          color_grade: c.color_grade ? String(c.color_grade) : ""
        };
      });
    }
  }

  // audiobook: TTS spine + timed manifest (clips with images + nested
  // subtitle events; optional ducked music bed). Receipt `url` = manifest
  // permanent URL (.json, placeholder from t=0); `audio_url` = full.mp3.
  if (contentType === "audiobook") {
    payload.count = 1;
    if (params.voice) payload.voice = String(params.voice);
    if (params.category) payload.category = String(params.category);
    if (params.title) payload.title = String(params.title);
    if (params.cover_url) payload.cover_url = String(params.cover_url);
    var abMusic = params.music;
    if (typeof abMusic === "string") {
      try { abMusic = JSON.parse(abMusic); } catch (e) { abMusic = null; }
    }
    if (abMusic && typeof abMusic === "object") {
      payload.music = abMusic;
    } else if (typeof params.music === "string" && params.music.trim()) {
      payload.music = { prompt: params.music.trim() };
    }
    var abClips = params.clips;
    if (typeof abClips === "string") {
      try { abClips = JSON.parse(abClips); } catch (e) { abClips = null; }
    }
    if (abClips && typeof abClips === "object" && abClips.length) {
      payload.clips = abClips.map(function (c) {
        return {
          tts_text: c.tts_text ? String(c.tts_text) : "",
          image_url: c.image_url ? String(c.image_url) : "",
          title: c.title ? String(c.title) : "",
          kind: c.kind ? String(c.kind) : ""
        };
      });
    }
  }

  if ((contentType === "image" || contentType === "infographic") && params.image_size) {
    payload.image_size = String(params.image_size);
  }

  // Featured-image art direction (2026-09-02; revised same day): builder2
  // is neutral by default; THIS tool layer opts ONE-OFF featured images IN
  // so they stop converging on the model-default teal-orange dark-moody
  // look. Scope narrowed after the Ollie incident: infographic SERIES
  // (text cards that must share one visual system per episode/post —
  // abc_explores, teaching decks) got randomized card-by-card and broke
  // coherence. Rule now: content_type image → enhance ON by default
  // (character jobs are still server-refused); infographic → OFF by
  // default, ON only when the caller explicitly sets enhance_prompt=true
  // (a deliberate one-off variety pick). Explicit false always wins.
  if (contentType === "image" || contentType === "infographic") {
    var wantsEnhance = params.enhance_prompt;
    if (wantsEnhance === undefined || wantsEnhance === null || wantsEnhance === "") {
      // SaaS default: ON for image (art-direction engine exists), OFF for
      // infographic. A BUILDER2_BASE_URL override (self-hosted) flips image
      // to opt-in — self-hosted servers may lack the art-direction engine.
      wantsEnhance = contentType === "image" && BASE_URL === "https://api.builder2.com";
    }
    payload.enhance_prompt = !!wantsEnhance;
    if (payload.enhance_prompt) {
      var etid = String(params.enhance_typeid || "").trim();
      if (!etid && slug && /thumb|cover|hero|featured/.test(slug)) etid = "article";
      if (!etid && contentType === "infographic") etid = "card";
      if (etid) payload.enhance_typeid = etid;
    }
  }

  if (params.character_id) {
    payload.character_id = String(params.character_id);
  }
  if (params.character_slug) {
    payload.character_slug = String(params.character_slug);
  }
  if (params.character_image_url) {
    payload.character_image_url = String(params.character_image_url);
  }

  // Anti-pattern guard (soft, fire-and-forget): agents sometimes write
  // `mode:"character"` INTO THE PROMPT TEXT believing it switches the
  // generation mode. It does not — mode is a receipt/response field set
  // by the server only when character_slug/character_image_url/character_id
  // was supplied. A prose-only prompt produces a generic lookalike with no
  // character likeness (real incident: two avatar-less CTA cards,
  // 2026-08-27). Strip the bogus keyword and warn in the receipt so the
  // agent can re-submit correctly. NEVER reject the submission.
  var characterModeInPrompt = false;
  if ((contentType === "image" || contentType === "infographic") &&
      !payload.character_slug && !payload.character_image_url && !payload.character_id &&
      typeof payload.prompt === "string" && /mode\s*:\s*"?character"?/i.test(payload.prompt)) {
    characterModeInPrompt = true;
    payload.prompt = payload.prompt
      .replace(/mode\s*:\s*"?character"?\s*[—–-]*\s*/gi, "")
      .replace(/^\s*[\u2014\u2013-]\s*/, "")
      .trim();
  }

  // Music-specific parameters (content_type: "music")
  if (contentType === "music") {
    if (params.model) {
      payload.model = String(params.model);
    }
    if (params.custom_mode) {
      payload.custom_mode = true;
      if (params.style) {
        payload.style = String(params.style);
      }
      if (params.title) {
        payload.title = String(params.title);
      }
    }
    if (params.instrumental) {
      payload.instrumental = true;
    }
    // Pass webhook URL so builder2 notifies NXagents when music is ready
    // The handler downloads the MP3 and pushes to chat
    var whBase = (env && env.WEBHOOK_BASE_URL) ? String(env.WEBHOOK_BASE_URL).replace(/\/$/, "") : "";
    var whUid = (env && env.USER_ID) ? String(env.USER_ID) : "";
    var whAid = (env && env.AGENT_ID) ? String(env.AGENT_ID) : "";
    var whSid = (env && env.SESSION_ID) ? String(env.SESSION_ID) : "";
    if (whBase && whUid) {
      payload.webhook_url = whBase + "/webhooks/vendor/builder2/music?user_id=" + encodeURIComponent(whUid) + "&agent_id=" + encodeURIComponent(whAid) + "&session_id=" + encodeURIComponent(whSid);
    }
  }

  try {
    var resp = postBuildMedia(payload, authHeaders());

    if (resp && resp.permanent_url) {
      // transcribe sync path: server waited and the transcript is INLINE —
      // return it whole (text/chunks/languages/duration) in one call.
      if (contentType === "transcribe" && resp.status === "completed" && resp.transcript) {
        return {
          success: true,
          status: "completed",
          transcript: resp.transcript,
          media_url: resp.media_url || "",
          url: resp.permanent_url,
          job_id: resp.job_id || "",
          media_slug: resp.media_slug || slug,
          message: "Transcription complete (returned inline). transcript.text = full plain text; transcript.chunks = per-segment {timestamp:[start,end], text}; transcript.languages; transcript.duration_seconds. Raw JSON artifact also at media_url."
        };
      }
      var baseMessage = (contentType === "image_proxy")
        ? "Proxied image URL is live immediately. The image will appear at this URL within seconds."
        : (contentType === "page_screenshot")
        ? "Screenshot URL is live immediately. The page screenshot will appear at this URL within ~5-10 seconds."
        : (contentType === "video_workflow")
        ? (resp.stream_enabled
          ? "Video workflow accepted (STREAMING). The 'url' field is the job's ONE permanent URL — an HLS stream (.m3u8). Use it for publishing/embedding (players stream adaptively). The raw MP4 file is at 'media_url' ONLY for downloads/non-HLS fallbacks — never publish it. Assembly ~1-3 minutes (" + (resp.job_id || "") + "). Poll GET " + BASE_URL + "/api/v1/embed/" + (resp.job_id || "JOB_ID") + "/status until status=completed (stream_url confirms the playlist)."
          : "Video workflow accepted. The server assembles stock/AI clips + narration + subtitles into a publish-ready video — typically 1-3 minutes (" + (resp.job_id || "") + "). Poll GET " + BASE_URL + "/api/v1/embed/" + (resp.job_id || "JOB_ID") + "/status until status=completed. The permanent URL serves the finished MP4 automatically.")
        : (contentType === "music")
        ? "Music URL is live immediately (silent placeholder MP3). " + (resp.custom_mode ? "Custom mode (lyrics as prompt)." : "Standard mode (AI-generated lyrics).") + " Suno generates 2 songs (~30-90s), both saved as variants. Audio appears at the URL within ~30-90 seconds."
        : (contentType === "video")
        ? "Video URL is live immediately. The generated video will appear at this URL within ~1-2 minutes."
        : (contentType === "tts")
        ? "TTS audio URL is live immediately. The generated audio will appear at this URL within ~5-10 seconds."
        : (contentType === "transcribe")
        ? "Transcription submitted (fal-ai/wizper). Poll GET " + BASE_URL + "/api/v1/embed/" + (resp.job_id || "JOB_ID") + "/status until status=completed, then read the 'transcript' field: {text, chunks:[{timestamp:[start,end], text}], languages, duration_seconds}. The raw JSON artifact is also at the media_url. Typical: ~10s for 3 min of audio."
        : "Image URL is live immediately. The generated image will appear at this URL within ~5-10 seconds.";

      if (characterModeInPrompt) {
        baseMessage = "⚠️ CHARACTER WARNING: 'mode:character' was found in your PROMPT TEXT and has been stripped. mode is a RECEIPT field (you READ it after submission), never a prompt keyword — and because no character_slug / character_image_url was supplied, this image will NOT contain your character's likeness (it will be a generic person/scene). This submission stands (fire-and-forget), but you should immediately re-submit with character_slug (e.g. character_slug=\"leo-tech\") or character_image_url and use THAT receipt's url instead. Receipt mode below is '" + (resp.mode || "standard") + "'. " + baseMessage;
      }

      // TTS language-mix note (video_workflow): builder2 detected written-
      // Cantonese and written-Mandarin clips mixed in one narration — TTS
      // will switch accents mid-video. Non-fatal by design; echo the note
      // prominently so the agent can fix tts_text and re-submit BEFORE
      // publishing (real incident 2026-08-27: clip 1 drifted to Mandarin,
      // video published with switched accents).
      var ttsMix = null;
      if (contentType === "video_workflow" && resp.tts_language_mix) {
        ttsMix = resp.tts_language_mix;
        baseMessage = "⚠️ TTS LANGUAGE MIX WARNING: clips " + JSON.stringify(ttsMix.mandarin_idx || []) + " are written-Mandarin while clips " + JSON.stringify(ttsMix.cantonese_idx || []) + " are written-Cantonese — narration will SWITCH ACCENTS mid-video. This job still renders (fire-and-forget), but before publishing you should rewrite the Mandarin clips' tts_text in ONE consistent written language and re-submit the video_workflow, then use the new receipt's url. " + baseMessage;
      }

      var result = {
        success: true,
        url: resp.permanent_url,
        job_id: resp.job_id || "",
        media_slug: resp.media_slug || slug,
        count: resp.count || count,
        default_variant_index: resp.default_variant_index !== undefined ? resp.default_variant_index : 1,
        status: resp.status || "generating",
        model: resp.model || "",
        requested_model: (params.model ? String(params.model) : ""),
        image_size_used: payload.image_size || "",
        mode: resp.mode || "standard",
        custom_mode: resp.custom_mode || false,
        source_url: resp.source_url || "",
        source_page_url: resp.source_page_url || "",
        stream_enabled: resp.stream_enabled || false,
        embed_markdown: resp.embed_markdown || "",
        embed_html: resp.embed_html || "",
        message: baseMessage
      };
      if (contentType === "music" && params.model && resp.model) {
        var reqM = String(params.model).trim();
        var ranM = String(resp.model).trim();
        var uuidRe = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
        if (reqM && ranM && reqM !== ranM && !uuidRe.test(reqM)) {
          result.warning = "model_mismatch: you requested '" + reqM + "' but the job ran on '" + ranM + "' — your tool call carried the WRONG model string (you likely copied the example's model). Re-emit ONE corrected call with model: \"" + reqM + "\" copied verbatim; do NOT copy the SKILL.md example model. 2026-09-05 incident: 4 jobs billed this way.";
        }
      }
      if (characterModeInPrompt) {
        result.warning = "character_mode_missing: 'mode:character' was written in the prompt text but no character_slug/character_image_url was supplied — image contains NO character likeness. Re-submit with character_slug.";
      }
      if ((contentType === "image" || contentType === "infographic") && !payload.image_size) {
        result.warning = (result.warning ? result.warning + " | " : "") + "image_size_missing: you omitted image_size, so the server chose its DEFAULT ORIENTATION — if your workflow needs portrait/vertical, this image is now WRONG. Re-emit ONE corrected call with image_size: \"portrait_16_9\" (2026-09-08 Cindy travel-gallery incident: 3 landscape photos published from field-dropped parallel calls).";
      }
      if (ttsMix) {
        result.warning = (result.warning ? result.warning + " | " : "") + "tts_language_mix: mandarin clips " + JSON.stringify(ttsMix.mandarin_idx || []) + " vs cantonese clips " + JSON.stringify(ttsMix.cantonese_idx || []) + " — accents will switch mid-video; rewrite tts_text in ONE written language and re-submit.";
        result.tts_language_mix = ttsMix;
      }
      return result;
    } else {
      // Raw response rides INSIDE the error string so the model cannot
      // drop it from its report (Tiffany 2026-09-13: "Unexpected response"
      // twice with no builder2 job = unclassifiable 2xx body).
      return {
        success: false,
        error: (resp && resp.error) ? resp.error :
          "Unexpected response from builder2 API — no job was created (nothing billed). This is the edge-blip signature: the generate never reached builder2 or the response was not a receipt. Raw response: " + JSON.stringify(resp).substring(0, 300),
        hint: "ONE same-payload retry is correct; if it fails again: checkpoint + STOP per outage discipline. NEVER a third attempt or diagnostic variants."
      };
    }
  } catch (e) {
    return {
      success: false,
      error: "builder2 API request failed: " + String(e)
    };
  }
}

function actionRegenerate(params) {
  if (!params.slot_key) {
    return { success: false, error: "slot_key is required for regenerate action" };
  }

  var payload = {};
  if (params.prompt) {
    payload.prompt = String(params.prompt);
  }
  if (params.content_type) {
    payload.content_type = params.content_type;
  }
  if (params.count) {
    payload.qty = params.count;
  }

  try {
    var resp = fetchJSONPost(BASE_URL + "/api/v1/slots/" + encodeURIComponent(params.slot_key) + "/regenerate", payload, authHeaders());

    if (resp && (resp.slot_url || resp.job_id)) {
      return {
        success: true,
        url: resp.slot_url || "",
        job_id: resp.job_id || "",
        slot_key: resp.slot_key || params.slot_key,
        status: "generating",
        message: "Slot regenerated. CDN URL stays the same."
      };
    } else {
      return {
        success: false,
        error: (resp && resp.error) ? resp.error :
          "Unexpected response from builder2 API — no job was created. Raw response: " + JSON.stringify(resp).substring(0, 300)
      };
    }
  } catch (e) {
    return {
      success: false,
      error: "builder2 API request failed: " + String(e)
    };
  }
}

function actionListSlots(params) {
  params = params || {};
  try {
    // media_slug prefix filter: one call recovers a whole post deck when
    // slugs follow the per-post prefix convention. Without it the gallery
    // is SHARED across all posts — match by slug, not prompt archaeology.
    var url = BASE_URL + "/api/v1/slots?limit=50";
    var slug = params.media_slug ? String(params.media_slug).trim() : "";
    if (slug) {
      url += "&media_slug=" + encodeURIComponent(slug);
    }
    var resp = fetchJSON(url, authHeaders());

    // slots:null + total present = a VALID EMPTY LISTING (e.g. a
    // media_slug filter with zero matches) — not an error (Tiffany
    // 2026-09-14: an empty listing fell into the generate-style error
    // message and the model misread it as a generation outage).
    if (resp && !resp.slots && (resp.total !== undefined)) {
      resp.slots = [];
    }
    if (resp && resp.slots) {
      var out = {
        success: true,
        count: resp.slots.length,
        slots: resp.slots
      };
      if (slug) {
        out.filtered_by_media_slug = slug;
        out.note = "filtered by media_slug prefix — every slot whose job slug starts with '" + slug + "'. Rows carry job_id + media_slug + active_variant.preview_url for direct recovery.";
      } else {
        out.note = "shared gallery (all posts). Pass media_slug prefix to scope to one post's deck. Rows carry job_id + media_slug + active_variant.preview_url.";
      }
      return out;
    } else {
      return {
        success: false,
        error: (resp && resp.error) ? resp.error :
          "Unexpected response from builder2 API — no job was created. Raw response: " + JSON.stringify(resp).substring(0, 300)
      };
    }
  } catch (e) {
    return {
      success: false,
      error: "builder2 API request failed: " + String(e)
    };
  }
}

// actionJobInfo — verify a media job BY JOB ID (the truthful check for
// "does this job/URL exist?"). get_slot takes a slot_KEY, not a job id —
// passing a job id there 404s and has sent agents into verification
// spirals where they regenerated perfectly good media (Leo's cover
// incident, 2026-09-03). GET /jobs/{job_id} returns status + URL.
function actionJobInfo(params) {
  if (!params.job_id) {
    return { success: false, error: "job_id is required for job_info action" };
  }
  var resp;
  try {
    resp = fetchJSON(BASE_URL + "/api/v1/jobs/" + encodeURIComponent(params.job_id), authHeaders());
  } catch (e) {
    return { success: false, job_id: params.job_id, exists: false, error: "job not found: " + String(e.message || e) };
  }
  if (!resp) {
    return { success: false, job_id: params.job_id, exists: false, error: "empty response" };
  }
  var j = resp.job || resp;
  // slots arrives as { "0": [ {preview_url, content_type, ...} ] } —
  // the variant URLs ARE the media (jobs without media_slug have no
  // separate permanent_url field).
  var variantURL = "";
  if (j.slots && typeof j.slots === "object") {
    for (var k in j.slots) {
      var arr = j.slots[k];
      if (arr && arr.length && arr[0].preview_url) { variantURL = arr[0].preview_url; break; }
    }
  }
  return {
    success: true,
    exists: true,
    job_id: params.job_id,
    status: j.status,
    content_type: j.content_type,
    media_slug: j.media_slug || null,
    permanent_url: j.permanent_url || variantURL,
    created_at: j.created_at,
    note: "Job exists server-side. If status=completed, the media is REAL — do not regenerate it. Use permanent_url (or the variant URL) when embedding."
  };
}

function actionGetSlot(params) {
  if (!params.slot_key) {
    return { success: false, error: "slot_key is required for get_slot action" };
  }

  try {
    var resp = fetchJSON(BASE_URL + "/api/v1/slots/" + encodeURIComponent(params.slot_key), authHeaders());

    if (resp && resp.key) {
      return {
        success: true,
        slot: resp
      };
    } else {
      return {
        success: false,
        error: (resp && resp.error) ? resp.error : "Slot not found"
      };
    }
  } catch (e) {
    return {
      success: false,
      error: "builder2 API request failed: " + String(e)
    };
  }
}

if (!apiKey) {
  return JSON.stringify({
    success: false,
    error: "BUILDER2_API_KEY not configured. Configure the builder2 vendor service in Settings > Services."
  });
}

// "generate" is the default action — models occasionally drop the field
// (glm-5.x parallel-batch arg-drop; real incidents 2026-08-30/31).
// Default action = list_slots (read-only): a field-dropped or bare call
// lands on information, never on a billed generation. Agents that meant
// generate get a gallery receipt back and self-correct on the next call.
var action = input && input.action ? String(input.action) : "list_slots";
if (action === "get" || action === "create" || action === "new") {
  action = "generate"; // near-miss synonyms
}
// Generate-shape routing (2026-09-14, owner decision — replaces the
// corrective-error guard): a call carrying GENERATION fields but NO action
// (glm field-drop; Tiffany Marigolds incident aborted a whole run as a
// phantom outage) forwards to builder2 AS A GENERATE. Complete payloads
// simply succeed; incomplete ones get builder2's real validation error
// for self-correction. A failed/invalid submit creates no job and costs
// nothing. Bare calls (no generate fields) stay read-only list_slots.
if (action === "list_slots" && !input.action) {
  var genFields = ["prompt", "content_type", "character_slug", "character_image_url", "image_size", "audio_url", "page_url", "image_url", "clips", "video_file", "audiobook_file", "post_file"];
  for (var gi = 0; gi < genFields.length; gi++) {
    var v = input[genFields[gi]];
    if (v !== undefined && v !== null && v !== "") {
      action = "generate";
      break;
    }
  }
}

var result;

switch (action) {
  case "generate":
    // Pass the entire input through — the schema enumerates valid fields and
    // actionGenerate picks what it needs per content_type (clips/aspect_ratio/
    // voice/narration_flow/music for video_workflow, fallback_generation_prompt
    // for image_proxy, etc.). A field whitelist here previously DROPPED video_
    // workflow timelines silently.
    result = actionGenerate(input);
    break;

  case "regenerate":
    result = actionRegenerate(input);
    break;

  case "list_slots":
    result = actionListSlots(input);
    break;

  case "job_info":
    result = actionJobInfo(input);
    break;

  case "get_slot":
    result = actionGetSlot({
      slot_key: input.slot_key
    });
    break;

  default:
    result = {
      success: false,
      error: "Unknown action: " + action + ". Valid actions: list_slots (default), generate, regenerate, get_slot, job_info"
    };
}

return JSON.stringify(result);
