# Voice Call Plugin — Test Checklist

## Prerequisites

| Item | Status | Notes |
|------|--------|-------|
| asterisk-api running | ⬜ | `http://localhost:3456` |
| FreePBX/Asterisk connected | ⬜ | ARI WebSocket active |
| Plugin loaded in OpenClaw | ⬜ | Check `openclaw status` |
| WebSocket connected | ⬜ | Check logs for "Connected to asterisk-api events" |
| Allowlist configured | ⬜ | `659654255` in asterisk-api `allowlist.json` |

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
| Call to allowed number | `voice_call { action: "initiate_call", to: "659654255" }` | Call initiated, callId returned | ⬜ |
| Call to blocked number | `voice_call { action: "initiate_call", to: "999999999" }` | 403 blocked by allowlist | ⬜ |
| Phone rings | — | Target phone receives call | ⬜ |
| Call state tracked | `voice_call { action: "list_calls" }` | Shows active call | ⬜ |

### 4. Call Operations

| Test | Command | Expected | Status |
|------|---------|----------|--------|
| Get status | `voice_call { action: "get_status", callId: "..." }` | Returns call details | ⬜ |
| Speak to user | `voice_call { action: "speak_to_user", callId: "...", message: "hello" }` | Audio plays (placeholder sound) | ⬜ |
| End call | `voice_call { action: "end_call", callId: "..." }` | Call hung up | ⬜ |

### 5. List Calls

| Test | Command | Expected | Status |
|------|---------|----------|--------|
| List active | `voice_call { action: "list_calls" }` | Array of active calls | ⬜ |
| After hangup | `voice_call { action: "list_calls" }` | Call removed from list | ⬜ |

### 6. Inbound Call (Future - V2)

| Test | Expected | Status |
|------|----------|--------|
| Inbound from allowed | Call answered | ⬜ |
| Inbound from blocked | Call rejected/hung up | ⬜ |

## Integration Test Script

```bash
#!/bin/bash
# Run from OpenClaw CLI or via agent

# 1. Check health
openclaw voicecall health

# 2. List current calls
openclaw voicecall list

# 3. Initiate call to test number
openclaw voicecall call --to 659654255

# 4. Wait for answer, then speak
# openclaw voicecall speak --call-id <id> --message "Hello, this is a test"

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
| Audio doesn't play | Check Asterisk sounds path, format compatibility |

## Sign-off

| Tester | Date | Version | Result |
|--------|------|---------|--------|
| | | 0.1.8 | |
