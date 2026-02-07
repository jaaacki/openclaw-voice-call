# Voice Call Plugin — Test Checklist

## Prerequisites

| Item | Status | Notes |
|------|--------|-------|
| asterisk-api v0.3.0+ running | ⬜ | `http://localhost:3456` |
| FreePBX/Asterisk connected | ⬜ | ARI WebSocket active |
| Plugin loaded in OpenClaw | ⬜ | Check `openclaw status` |
| WebSocket connected | ⬜ | Check logs for "Connected to asterisk-api events" |
| Allowlist configured | ⬜ | `6596542555` in asterisk-api `allowlist.json` |
| Qwen3-TTS model loaded | ⬜ | First speak may take 10-20s if model is idle |

## Configuration

Plugin config in `~/.openclaw/openclaw.json` under `extensions.voice-call-freepbx`:

```json
{
  "asteriskApiUrl": "http://localhost:3456",
  "fromNumber": "+6512345678",
  "outboundTrunk": "PJSIP/{number}@trunk-name",
  "defaultEndpoint": "PJSIP/101"
}
```

> TTS config (voice, language, TTS URL) is on the asterisk-api side (`.env`).

## Test Cases

### 1. Health Check

| Test | Command | Expected | Status |
|------|---------|----------|--------|
| CLI health | `openclaw voicecall health` | `{ status: "ok", ari: true }` | ⬜ |
| API health | `curl localhost:3456/health` | `{ status: "ok" }` | ⬜ |

### 2. WebSocket Events

| Test | Expected | Status |
|------|----------|--------|
| Snapshot on connect | Logs show "Snapshot received: N active calls" | ⬜ |
| Auto-reconnect | Disconnect/reconnect within 3s | ⬜ |

### 3. Outbound Call (initiate_call)

| Test | Command | Expected | Status |
|------|---------|----------|--------|
| Call to allowed number | `voice_call { action: "initiate_call", to: "6596542555" }` | Call initiated, callId returned | ⬜ |
| Call to blocked number | `voice_call { action: "initiate_call", to: "999999999" }` | 403 blocked by allowlist | ⬜ |
| Phone rings | — | Target phone receives call | ⬜ |
| Call state tracked | `voice_call { action: "list_calls" }` | Shows active call | ⬜ |

### 4. Server-side TTS (speak)

| Test | Command | Expected | Status |
|------|---------|----------|--------|
| Speak with default voice | `voice_call { action: "speak", callId: "...", text: "Hello" }` | TTS plays to caller, returns durationSeconds | ⬜ |
| Speak with custom voice | `voice_call { action: "speak", callId: "...", text: "Hello", voice: "serena" }` | Uses serena voice | ⬜ |
| speak_to_user | `voice_call { action: "speak_to_user", callId: "...", message: "Hello" }` | TTS plays via speak endpoint | ⬜ |
| continue_call | `voice_call { action: "continue_call", callId: "...", message: "How are you?" }` | TTS plays via speak endpoint | ⬜ |
| CLI speak | `openclaw voicecall speak --call-id <id> --message "Test"` | TTS plays, JSON result printed | ⬜ |
| CLI speak with voice | `openclaw voicecall speak --call-id <id> --message "Test" --voice dylan` | Uses dylan voice | ⬜ |
| RPC voicecall.speak | `voicecall.speak { callId, message, voice }` | TTS plays, returns result | ⬜ |
| Cold start delay | First speak after TTS idle (~120s) | Completes within 30s timeout | ⬜ |

### 5. TTS WebSocket Events

| Test | Expected | Status |
|------|----------|--------|
| call.speak_started | State transitions to SPEAKING | ⬜ |
| call.speak_finished | State transitions to LISTENING (conversation mode) or IDLE | ⬜ |
| call.speak_error | Error logged, state resets to LISTENING/IDLE | ⬜ |

### 6. Conversation Loop

| Test | Expected | Status |
|------|----------|--------|
| start_listening | Audio capture + ASR pipeline starts, state → LISTENING | ⬜ |
| Partial transcription | Buffered, logged at debug level | ⬜ |
| Final transcription | Agent invoked, response spoken via server-side TTS | ⬜ |
| State during TTS | Transcriptions ignored while SPEAKING | ⬜ |
| After TTS completes | State returns to LISTENING (conversation mode) | ⬜ |
| stop_listening | Audio capture stops, state → IDLE | ⬜ |

### 7. Call Operations

| Test | Command | Expected | Status |
|------|---------|----------|--------|
| Get status | `voice_call { action: "get_status", callId: "..." }` | Returns call details | ⬜ |
| End call | `voice_call { action: "end_call", callId: "..." }` | Call hung up | ⬜ |
| List active | `voice_call { action: "list_calls" }` | Array of active calls | ⬜ |
| After hangup | `voice_call { action: "list_calls" }` | Call removed from list | ⬜ |

### 8. Inbound Call (Future)

| Test | Expected | Status |
|------|----------|--------|
| Inbound from allowed | Call answered | ⬜ |
| Inbound from blocked | Call rejected/hung up | ⬜ |

## Integration Test Script

```bash
#!/bin/bash
# Run from OpenClaw CLI

# 1. Check health
openclaw voicecall health

# 2. List current calls
openclaw voicecall list

# 3. Initiate call to test number
openclaw voicecall call --to 6596542555

# 4. Wait for answer, then speak
# openclaw voicecall speak --call-id <id> --message "Hello, this is a test"
# openclaw voicecall speak --call-id <id> --message "Testing voice" --voice serena

# 5. End call
# openclaw voicecall end --call-id <id>
```

## Troubleshooting

| Issue | Check |
|-------|-------|
| "Voice call service not initialized" | Plugin not loaded, check `openclaw status` |
| "Outbound call blocked by allowlist" | Add number to `asterisk-api/allowlist.json` |
| No WebSocket events | Check asterisk-api is running, check firewall |
| Call fails to originate | Check trunk config, SIP registration |
| TTS timeout / slow first response | Qwen3-TTS model reloading after idle (~10-20s), asterisk-api has 30s timeout |
| TTS speak_error | Check asterisk-api logs for TTS server connectivity |
| No transcription events | Check audio capture started (`start_listening`), ASR server running |

## Sign-off

| Tester | Date | Version | Result |
|--------|------|---------|--------|
| | | 0.4.0 | |
