# Changelog

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
