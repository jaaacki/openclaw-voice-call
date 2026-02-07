# Changelog

## [0.4.1] - 2026-02-07

### Summary
Support asterisk-api v0.3.1 streaming TTS via ExternalMedia WebSocket.

### Added
- `call.playback_stream_started`, `call.playback_stream_finished`, `call.playback_stream_error` event types and handlers

### Changed
- Updated docs to reflect streaming TTS architecture (no shared filesystem needed)
- Requires asterisk-api v0.3.1+

## [0.4.0] - 2026-02-07

### Summary
Migrate TTS from local file-based workaround to server-side `POST /calls/:id/speak` endpoint (asterisk-api v0.3.0).

### Added
- `AsteriskApiClient.speak()` — server-side TTS synthesis + playback via `POST /calls/:id/speak`
- `SpeakResponse` type with text, voice, language, durationSeconds
- Event handling for `call.speak_started`, `call.speak_finished`, `call.speak_error` WebSocket events
- Event-driven state transitions (SPEAKING on speak_started, LISTENING/IDLE on speak_finished)
- CLI `--voice` and `--language` options for `voicecall speak` command
- Voice parameter support in RPC `voicecall.speak` and `voicecall.continue` methods

### Changed
- `index.ts` onTranscriptionFinal: uses `client.speak()` instead of local TTS + playMedia
- Tool `speak` action: uses `client.speak()` instead of `generateSpeech()` + `playMedia()`
- Tool `continue_call` action: uses `client.speak()` instead of placeholder `playMedia("sound:hello-world")`
- Tool `speak_to_user` action: uses `client.speak()` instead of placeholder `playMedia("sound:hello-world")`
- CLI `voicecall speak`: uses `client.speak()` with voice/language options
- RPC `voicecall.speak` and `voicecall.continue`: use `client.speak()` with voice parameter
- Default TTS voice updated from `"alloy"` (OpenAI) to Qwen3-TTS voices (`vivian` default)
- `openclaw.plugin.json`: allow additional properties in config schema

### Removed
- `src/tts.ts` — local TTS module (`generateSpeech()`, `cleanupAudioFile()`) no longer needed
- `ttsApiUrl` config field — TTS is now handled server-side by asterisk-api

## [0.3.1] - 2026-02-07

### Fixed
- `start_listening` now calls `POST /calls/:id/audio/start` (live ASR pipeline) instead of `POST /calls/:id/record` (file-based recording)
- `stop_listening` now calls `POST /calls/:id/audio/stop` to tear down audio capture and ASR session

### Added
- `AsteriskApiClient.startAudioCapture()` — starts Snoop → ExternalMedia → ASR WebSocket pipeline
- `AsteriskApiClient.stopAudioCapture()` — stops audio capture and cleans up resources

## [0.3.0] - 2026-02-07

### Summary
Complete conversation loop implementation with transcription handling, agent integration, and TTS playback.

### Features
- ✅ **Transcription Event Handling** - Buffers partial transcriptions and processes final text
- ✅ **Conversation State Machine** - IDLE → LISTENING → PROCESSING → SPEAKING → IDLE
- ✅ **Agent Integration** - Automatic agent invocation on final transcription
- ✅ **TTS Generation** - Text-to-speech via `http://192.168.2.198:8101/v1/audio/speech`
- ✅ **Audio Playback** - Plays generated speech to caller
- ✅ **Conversation History** - Tracks full conversation context per call
- ✅ **New Tool Actions:**
  - `speak` - Generate TTS and play to caller
  - `start_listening` - Begin audio capture + transcription
  - `stop_listening` - Stop audio capture
- ✅ **Conversation Mode** - Enables continuous back-and-forth dialogue
- ✅ **State-Aware Processing** - Ignores transcriptions during SPEAKING state (no barge-in)

### Added
- `src/tts.ts` - TTS integration module with `generateSpeech()` and `cleanupAudioFile()`
- `ConversationContext` type for per-call state management
- `ConversationState` type: `"IDLE" | "LISTENING" | "PROCESSING" | "SPEAKING"`
- `TranscriptionEvent` type for `call.transcription` WebSocket events
- `ttsApiUrl` config option (default: `http://192.168.2.198:8101`)
- Conversation state tracking in `VoiceCallEventManager`
- Partial transcription buffering
- Automatic cleanup of temporary audio files
- `onTranscriptionFinal` callback in EventManager
- Conversation mode toggle per call

### Changed
- EventManager now handles `call.transcription` events
- Tool schema extended with `speak`, `start_listening`, `stop_listening` actions
- Conversation context created on-demand and cleaned up on call end
- Plugin now auto-responds to transcriptions with agent-generated speech

### Technical Details
- TTS generates WAV files in `/tmp/` with auto-cleanup after 60s
- Playback uses existing `POST /calls/:id/play` endpoint with `sound:` prefix
- State transitions prevent transcription processing during speech playback
- Conversation history preserved until call ends
- Agent integration currently uses echo response (TODO: full OpenClaw agent invocation)

## [0.2.0] - 2026-02-07

### Summary
First complete release with WebSocket event streaming and outbound call support.

### Features
- ✅ WebSocket connection to asterisk-api `/events`
- ✅ Real-time call state tracking
- ✅ Outbound calls via `voice_call` tool
- ✅ Trunk pattern configuration
- ✅ CLI commands (`voicecall call`, `list`, `status`, `end`)
- ✅ RPC methods (`voicecall.initiate`, etc.)
- ✅ Full documentation (README.md, TESTS.md)

### Breaking Changes
- `initiate_call` now requires `to` (phone number) instead of optional endpoint override

## [0.1.8] - 2026-02-07

### Added
- `outboundTrunk` config option for trunk pattern with `{number}` placeholder
- `README.md` with full setup and usage documentation
- `TESTS.md` with comprehensive test checklist

### Changed
- `initiate_call` now uses `outboundTrunk` pattern if configured
- Better endpoint construction logic: trunk pattern → defaultEndpoint append → fallback

## [0.1.7] - 2026-02-07

### Added
- `list_calls` action to show all active calls from WebSocket cache
- Tool now uses EventManager for client access and call state
- Shows `wsConnected` status in responses
- Cache-first lookup for `get_status` (falls back to REST API)

### Changed
- `initiate_call` now takes `to` (phone number) as required param instead of optional `to` endpoint
- Endpoint is auto-built from phone number + defaultEndpoint config
- Tool validates call existence before `continue_call` and `speak_to_user`
- Better error messages when calls not found

## [0.1.6] - 2026-02-07

### Added
- `src/events.ts` — VoiceCallEventManager class for WebSocket lifecycle management
- Singleton pattern: `initEventManager()`, `getEventManager()`, `stopEventManager()`
- Active call tracking via in-memory Map (populated from snapshot + events)
- Event dispatcher with `onCallEvent` callback
- Auto-start WebSocket connection on plugin register
- Cleanup on plugin unload via `api.onUnload()`

### Changed
- `index.ts` now initializes and starts the event manager on register
- Plugin logs significant call events (call.created, call.ended)

## [0.1.5] - 2026-02-07

### Added
- WebSocket client in `AsteriskApiClient` for real-time event streaming
- `connectEvents(options)` — connect to asterisk-api `/events` WebSocket
- `disconnectEvents()` — close WebSocket connection
- `isEventsConnected()` — check connection status
- Auto-reconnect with configurable delay (default 3s)
- Event types: `snapshot`, `call.created`, `call.state_changed`, `call.ready`, `call.ended`, etc.
- `EventConnectionOptions` interface with callbacks: `onConnect`, `onDisconnect`, `onError`, `onEvent`, `onSnapshot`

### Changed
- Updated `types.ts` with full event type definitions from asterisk-api

## [0.1.4] - 2026-02-07

### Added
- Gateway RPC methods (`src/rpc.ts`) via `api.registerGatewayMethod`
- Methods: `voicecall.initiate`, `voicecall.continue`, `voicecall.speak`, `voicecall.end`, `voicecall.status`
- Each handler parses params, calls AsteriskApiClient, and responds with ok/error
- Wired RPC registration into `index.ts` register() function

## [0.1.3] - 2026-02-07

### Added
- CLI commands (`src/cli.ts`) under `voicecall` namespace via `api.registerCli`
- Commands: `voicecall call`, `voicecall status`, `voicecall end`, `voicecall speak`, `voicecall list`, `voicecall health`
- Each command creates an AsteriskApiClient and outputs formatted JSON
- Wired CLI registration into `index.ts` register() function

## [0.1.2] - 2026-02-07

### Added
- Voice call tool registration (`src/tool.ts`) with `voice_call` tool for LLM agent use
- Tool actions: `initiate_call`, `continue_call`, `speak_to_user`, `end_call`, `get_status`
- TypeBox parameter schema matching moltbot voice-call pattern
- Wired tool registration into `index.ts` register() function
- Added `@sinclair/typebox` dependency

## [0.1.1] - 2026-02-07

### Added
- Zod config schema (`src/config.ts`) with asteriskApiUrl, fromNumber, defaultEndpoint, inboundPolicy, serve, etc.
- Runtime DI module (`src/runtime.ts`) with `setVoiceCallRuntime()` / `getVoiceCallRuntime()`
- Type definitions (`src/types.ts`) for call records, events, and API responses
- AsteriskApiClient (`src/client.ts`) wrapping all asterisk-api REST endpoints
- `.gitignore` for node_modules and dist
- Updated `index.ts` to follow openclaw-bitrix24 plugin registration pattern

## [0.1.0] - 2026-02-07

### Added
- Plugin stub with `register(api)` entry point
- Plugin manifest `openclaw.plugin.json`
- Package config with openclaw peer dependency
