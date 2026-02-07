# Methods Map — openclaw-voice-call

Maps plugin methods to asterisk-api endpoints and their current implementation status.

## LLM Tool — `voice_call`

Actions registered via `registerTool()` in `tool.ts` for LLM agent use.

| Action | asterisk-api Call | Client Method | Status |
|--------|-------------------|---------------|--------|
| `initiate_call` | `POST /calls` | `client.originate()` | V1 |
| `continue_call` | `POST /calls/:id/play` | `client.playMedia()` | V1 (placeholder — plays `sound:hello-world`, needs TTS) |
| `speak_to_user` | `POST /calls/:id/play` | `client.playMedia()` | V1 (placeholder — plays `sound:hello-world`, needs TTS) |
| `end_call` | `DELETE /calls/:id` | `client.hangup()` | V1 |
| `get_status` | `GET /calls/:id` | `client.getCall()` | V1 ✅ (cache-first) |
| `list_calls` | — (in-memory) | `eventManager.getActiveCalls()` | V1 ✅ |
| `answer_inbound` | — | — | V2 — accept/greet inbound call |
| `listen` | — | — | V2 — start listening for caller speech (STT) |
| `transfer_call` | `POST /calls/:id/transfer` | — | V2 — not in client yet |

## Gateway RPC Methods — `voicecall.*`

Registered via `registerGatewayMethod()` in `rpc.ts`.

| RPC Method | asterisk-api Call | Client Method | Status |
|------------|-------------------|---------------|--------|
| `voicecall.initiate` | `POST /calls` | `client.originate()` | V1 |
| `voicecall.continue` | `POST /calls/:id/play` | `client.playMedia()` | V1 (placeholder) |
| `voicecall.speak` | `POST /calls/:id/play` | `client.playMedia()` | V1 (placeholder) |
| `voicecall.end` | `DELETE /calls/:id` | `client.hangup()` | V1 |
| `voicecall.status` | `GET /calls/:id` | `client.getCall()` | V1 |
| `voicecall.inbound.accept` | — | — | V2 — handle inbound call event |
| `voicecall.inbound.reject` | — | — | V2 — reject/ignore inbound call |
| `voicecall.record.start` | `POST /calls/:id/record` | `client.startRecording()` | V1 (client ready, RPC not wired) |
| `voicecall.record.stop` | `DELETE /recordings/:name` | — | V2 |

## CLI Commands — `voicecall *`

Registered via `registerCli()` in `cli.ts`.

| Command | asterisk-api Call | Client Method | Status |
|---------|-------------------|---------------|--------|
| `voicecall call` | `POST /calls` | `client.originate()` | V1 |
| `voicecall status` | `GET /calls/:id` | `client.getCall()` | V1 |
| `voicecall end` | `DELETE /calls/:id` | `client.hangup()` | V1 |
| `voicecall speak` | `POST /calls/:id/play` | `client.playMedia()` | V1 |
| `voicecall list` | `GET /calls` | `client.listCalls()` | V1 |
| `voicecall health` | `GET /health` | `client.health()` | V1 |
| `voicecall listen` | `WS /events` | `client.connectEvents()` | V1 ✅ (via EventManager) |

## REST Client — `AsteriskApiClient`

Methods in `client.ts` that wrap asterisk-api HTTP calls.

| Client Method | asterisk-api Endpoint | HTTP | Status |
|---------------|----------------------|------|--------|
| `health()` | `GET /health` | GET | V1 |
| `originate()` | `POST /calls` | POST | V1 |
| `getCall()` | `GET /calls/:id` | GET | V1 |
| `listCalls()` | `GET /calls` | GET | V1 |
| `playMedia()` | `POST /calls/:id/play` | POST | V1 |
| `startRecording()` | `POST /calls/:id/record` | POST | V1 |
| `hangup()` | `DELETE /calls/:id` | DELETE | V1 |
| `sendDtmf()` | `POST /calls/:id/dtmf` | POST | V1 |
| `connectEvents()` | `WS /events` | WS | V1 — **not implemented yet** |
| `listEndpoints()` | `GET /endpoints` | GET | V2 — not in client yet |
| `transferCall()` | `POST /calls/:id/transfer` | POST | V2 — not in client yet |
| `playFile()` | `POST /calls/:id/play/file` | POST | V2 — upload raw audio + play (for TTS audio) |

## TTS/STT Integration — Available OpenClaw Plugins

Both services run on the same NAS (192.168.2.198) and are existing OpenClaw plugins.

### TTS — `qwen3-tts` plugin

| | Details |
|--|---------|
| **Plugin** | `qwen3-tts` (OpenClaw plugin at `~/Dev/qwen3-tts`) |
| **Server** | `http://192.168.2.198:8101` |
| **API** | `POST /v1/audio/speech` (OpenAI-compatible) |
| **Request** | `{ input, voice, response_format, speed, instruct }` |
| **Response** | Binary audio buffer (mp3/wav/flac/ogg) |
| **Voices** | 15 voices — `vivian`, `serena`, `dylan`, `eric`, `ryan`, `aiden`, `uncle_fu`, `ono_anna`, `sohee` + 6 OpenAI aliases |
| **Formats** | mp3 (default), wav, flac, ogg |
| **Features** | Speed control (0.25–4.0), emotion/tone instruction via `instruct` param |
| **Tool name** | `qwen_tts` — registered in OpenClaw agent tools |
| **Audio path** | Generated files saved to `~/.openclaw/media/tts/`, auto-cleaned after 5min |
| **Mode** | **Batch only** — streaming needed for V2 voice calls (upstream supports it) |

### STT — `qwen3-asr` plugin

| | Details |
|--|---------|
| **Plugin** | `qwen3-asr` (OpenClaw plugin at `~/Dev/qwen3-asr`) |
| **Server** | `http://192.168.2.198:8100` |
| **API** | `POST /v1/audio/transcriptions` (OpenAI-compatible) |
| **Request** | Multipart FormData: `{ file, model, language, response_format }` |
| **Response** | `{ success: true, text: "transcribed text", language: "auto" }` |
| **Formats** | wav, mp3, flac, ogg, mp4, m4a, webm |
| **Model** | `Qwen3-ASR` (default) |
| **Languages** | Auto-detect, Japanese, English, Chinese |
| **Tool name** | `qwen_asr` — registered in OpenClaw agent tools |
| **Retries** | Max 2, exponential backoff (500ms, 1000ms) |
| **Mode** | **Batch only** — full audio in, full text out. No streaming yet (upstream supports it) |

### Streaming — V2 prerequisite

| Service | Current | Upstream | V2 Action |
|---------|---------|----------|-----------|
| `qwen3-tts` | Batch | Streaming capable | Implement WebSocket streaming endpoint |
| `qwen3-asr` | Batch | Streaming capable | Implement WebSocket real-time transcription |

Streaming is **required** for V2 voice calls. No batch fallback — going straight to real-time duplex.

### TTS/STT voice call integration — V2 (real-time duplex)

Same pattern as official OpenClaw voice-call plugin (Twilio Media Streams), self-hosted via Asterisk External Media:

```
Asterisk External Media channel (ARI POST /channels/externalMedia)
  → opens WebSocket carrying raw audio (RTP) bidirectionally
  → bridged with caller's channel

Caller speaks → External Media WS → audio frames
  → qwen3-asr streaming WS: real-time partial transcripts
    → LLM processes text as it arrives
      → qwen3-tts streaming WS: audio chunks as LLM generates
        → External Media WS → Asterisk → caller hears in real-time
```

## Event Handling

### V1 — WS Event Listener ✅ IMPLEMENTED

The plugin connects to asterisk-api's WS `/events` stream on startup and stays connected. This gives real-time awareness of all call events without polling.

| Component | Description | Status |
|-----------|-------------|--------|
| WS connection | Connect to `ws://asterisk-api:3456/events`, auto-reconnect | V1 ✅ |
| Event router | Dispatch events by type (`call.created`, `call.state_changed`, `call.dtmf`, `call.ended`, etc.) | V1 ✅ |
| Snapshot sync | On connect, receive `snapshot` with all active calls | V1 ✅ |
| Webhook handler | HTTP POST receiver at `serve.port` / `serve.path` | V2 — not implemented |

**What V1 WS gives us:**
- Know instantly when outbound call is answered/ended (no polling)
- React to DTMF in real-time
- See inbound calls arrive (log/notify, even before V2 handles them)
- Playback/recording finished confirmations
- Foundation for V2 inbound pipeline

**Events available from asterisk-api WS `/events`:**
```
snapshot              — on connect, current active calls
call.created          — new call (inbound or outbound)
call.state_changed    — ringing, answered, etc.
call.ready            — outbound channel entered Stasis
call.dtmf             — DTMF digit received
call.playback_finished — audio playback completed
call.recording_finished — recording completed
call.ended            — call hung up (with cause)
bridge.created        — bridge created
bridge.destroyed      — bridge destroyed
```

### V2 — Inbound Call + Real-time Duplex Pipeline

Builds on V1 WS listener. Adds inbound call handling and real-time audio.

| Step | Component | Description | Status |
|------|-----------|-------------|--------|
| 1 | Inbound filter | Check `inboundPolicy` + `allowFrom` config to accept/reject | V2 (config ready) |
| 2 | External Media | ARI `externalMedia` channel → WS raw audio bridge with caller | V2 |
| 3 | Streaming STT | `qwen3-asr` streaming WS → real-time transcription | V2 (implement streaming) |
| 4 | Streaming TTS | `qwen3-tts` streaming WS → real-time audio generation | V2 (implement streaming) |
| 5 | Conversation agent | Hand off to LLM agent for interactive voice conversation | V2 |
| 6 | Barge-in / VAD | Voice activity detection to manage turn-taking | V2 |

## Config Fields vs Implementation

| Config Field | File | Used By | Status |
|-------------|------|---------|--------|
| `asteriskApiUrl` | `config.ts` | `client.ts`, `tool.ts`, `rpc.ts`, `cli.ts` | V1 — active |
| `asteriskApiKey` | `config.ts` | `client.ts` | V1 — active |
| `fromNumber` | `config.ts` | `tool.ts`, `rpc.ts`, `cli.ts` | V1 — active |
| `toNumber` | `config.ts` | — | V1 — defined but unused |
| `defaultEndpoint` | `config.ts` | `tool.ts`, `rpc.ts`, `cli.ts` | V1 — active |
| `inboundPolicy` | `config.ts` | — | V2 — defined, not implemented |
| `allowFrom` | `config.ts` | — | V2 — defined, not implemented |
| `serve.port` | `config.ts` | — | V2 — webhook server port, not implemented |
| `serve.path` | `config.ts` | — | V2 — webhook server path, not implemented |
| `publicUrl` | `config.ts` | — | V2 — for NAT/tunnel webhook URL, not implemented |

## Architecture — V1 vs V2

### V1 (current + needed) — Outbound call control + WS event stream
```
LLM Agent / CLI / RPC
  → voice_call tool (tool.ts)
    → AsteriskApiClient (client.ts)
      → asterisk-api REST (HTTP) → Asterisk ARI
      → asterisk-api WS /events → real-time call state ← (not implemented yet)
```

### V2 (planned) — Real-time duplex with streaming TTS/STT
```
Outbound + Inbound (same real-time pipeline):

  Call established (outbound originate or inbound StasisStart)
    → ARI creates External Media channel (WS audio)
    → Bridge caller channel ↔ External Media channel
    → Bidirectional audio over WebSocket:

        Caller speaks
          → audio frames via External Media WS
            → qwen3-asr streaming WS → real-time transcripts
              → LLM agent processes text
                → qwen3-tts streaming WS → audio chunks
                  → External Media WS → Asterisk → caller hears response

  Inbound-specific:
    Phone call → Asterisk → ARI StasisStart
      → asterisk-api WS /events → openclaw-voice-call listener
        → inboundPolicy filter → accept/reject
          → enter real-time pipeline above
```

V1 remaining work:
- Add `connectEvents()` WS listener to `AsteriskApiClient`
- Wire WS events into plugin lifecycle (connect on register, reconnect on drop)

V2 prerequisites (on top of V1):
- Implement streaming on `qwen3-tts` (upstream supports it)
- Implement streaming on `qwen3-asr` (upstream supports it)
- Add ARI External Media support to `asterisk-api`
