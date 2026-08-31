// instant_media — Generate media via builder2.com permanent CDN API
// Returns a permanent CDN URL immediately (~50ms). URL is live instantly.
// Response includes embed_markdown and embed_html for easy embedding.
// Perfect for blog featured images, post media, or any case needing an image URL.

// Open-source edition: works against https://api.builder2.com by default,
// or any self-hosted Builder2 instance via BUILDER2_BASE_URL.
var BASE_URL = (env && env.BUILDER2_BASE_URL) ? String(env.BUILDER2_BASE_URL).trim().replace(/\/$/, "") : "https://api.builder2.com";

var apiKey = env && env.BUILDER2_API_KEY ? String(env.BUILDER2_API_KEY).trim() : "";

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

  // Arg-drop leniency: for music, a `lyrics` field IS the prompt (custom
  // mode contract) — accept it when prompt is missing.
  if (contentType === "music" && !params.prompt && params.lyrics) {
    params.prompt = typeof params.lyrics === "string" ? params.lyrics : params.prompt;
  }

  if (contentType !== "image_proxy" && contentType !== "page_screenshot" && contentType !== "transcribe" && !params.prompt) {
    return { success: false, error: "prompt is required for generate action" };
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
    count: (contentType === "image_proxy" || contentType === "page_screenshot" || contentType === "transcribe") ? 1 : count
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

  if ((contentType === "image" || contentType === "infographic") && params.image_size) {
    payload.image_size = String(params.image_size);
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
    var resp = fetchJSONPost(BASE_URL + "/api/v1/build-media", payload, authHeaders());

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
        mode: resp.mode || "standard",
        custom_mode: resp.custom_mode || false,
        source_url: resp.source_url || "",
        source_page_url: resp.source_page_url || "",
        stream_enabled: resp.stream_enabled || false,
        embed_markdown: resp.embed_markdown || "",
        embed_html: resp.embed_html || "",
        message: baseMessage
      };
      if (characterModeInPrompt) {
        result.warning = "character_mode_missing: 'mode:character' was written in the prompt text but no character_slug/character_image_url was supplied — image contains NO character likeness. Re-submit with character_slug.";
      }
      if (ttsMix) {
        result.warning = (result.warning ? result.warning + " | " : "") + "tts_language_mix: mandarin clips " + JSON.stringify(ttsMix.mandarin_idx || []) + " vs cantonese clips " + JSON.stringify(ttsMix.cantonese_idx || []) + " — accents will switch mid-video; rewrite tts_text in ONE written language and re-submit.";
        result.tts_language_mix = ttsMix;
      }
      return result;
    } else {
      return {
        success: false,
        error: (resp && resp.error) ? resp.error : "Unexpected response from builder2 API",
        raw: JSON.stringify(resp).substring(0, 500)
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
        error: (resp && resp.error) ? resp.error : "Unexpected response from builder2 API"
      };
    }
  } catch (e) {
    return {
      success: false,
      error: "builder2 API request failed: " + String(e)
    };
  }
}

function actionListSlots() {
  try {
    var resp = fetchJSON(BASE_URL + "/api/v1/slots", authHeaders());

    if (resp && resp.slots) {
      return {
        success: true,
        count: resp.slots.length,
        slots: resp.slots
      };
    } else {
      return {
        success: false,
        error: (resp && resp.error) ? resp.error : "Unexpected response from builder2 API"
      };
    }
  } catch (e) {
    return {
      success: false,
      error: "builder2 API request failed: " + String(e)
    };
  }
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
    error: "BUILDER2_API_KEY not configured (set the env variable with your Builder2 API key, prefix bk2_). Configure the builder2 vendor service in Settings > Services."
  });
}

// "generate" is the default action — models occasionally drop the field
// (glm-5.x parallel-batch arg-drop; real incidents 2026-08-30/31).
var action = input && input.action ? String(input.action) : "generate";
if (action === "get" || action === "create" || action === "new") {
  action = "generate"; // near-miss synonyms
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
    result = actionListSlots();
    break;

  case "get_slot":
    result = actionGetSlot({
      slot_key: input.slot_key
    });
    break;

  default:
    result = {
      success: false,
      error: "Unknown action: " + action + ". Valid actions: generate, regenerate, list_slots, get_slot"
    };
}

return JSON.stringify(result);
