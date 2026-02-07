# OpenClaw Voice Call Plugin (FreePBX/Asterisk)

Voice calling via Asterisk/FreePBX using ARI and the asterisk-api bridge.

## Features

- 📞 **Outbound calls** — Initiate calls to phone numbers via OpenClaw agent
- 🔌 **WebSocket events** — Real-time call state via asterisk-api `/events`
- 🛡️ **Allowlist** — Restrict calls to approved numbers (at asterisk-api level)
- 🎯 **LLM tool** — `voice_call` tool for agent use
- 🖥️ **CLI commands** — `voicecall call`, `voicecall list`, etc.
- 🔗 **RPC methods** — `voicecall.initiate`, `voicecall.status`, etc.

## Architecture

```
OpenClaw Agent
    ↓ voice_call tool
openclaw-voice-call plugin
    ↓ REST API + WebSocket
asterisk-api (bridge service)
    ↓ ARI
FreePBX / Asterisk
    ↓ SIP trunk
PSTN / Phone
```

## Prerequisites

1. **FreePBX/Asterisk** with ARI enabled
2. **asterisk-api** bridge service running ([jaaacki/asterisk-api](https://github.com/jaaacki/asterisk-api))
3. **OpenClaw** installed

## Installation

1. Clone this repo to your plugins directory:
   ```bash
   cd ~/Dev
   git clone https://github.com/jaaacki/openclaw-voice-call.git
   ```

2. Add to OpenClaw config (`~/.openclaw/openclaw.json`):
   ```json
   {
     "extensions": {
       "voice-call-freepbx": {
         "path": "~/Dev/openclaw-voice-call",
         "config": {
           "asteriskApiUrl": "http://localhost:3456",
           "fromNumber": "+6512345678",
           "outboundTrunk": "PJSIP/{number}@your-trunk-name",
           "defaultEndpoint": "PJSIP/101"
         }
       }
     }
   }
   ```

3. Restart OpenClaw:
   ```bash
   openclaw gateway restart
   ```

## Configuration

| Option | Required | Description |
|--------|----------|-------------|
| `asteriskApiUrl` | Yes | URL of asterisk-api service |
| `asteriskApiKey` | No | API key if asterisk-api requires auth |
| `fromNumber` | Yes | Caller ID in E.164 format (e.g., `+6512345678`) |
| `outboundTrunk` | No | Trunk pattern with `{number}` placeholder |
| `defaultEndpoint` | No | Default SIP endpoint (default: `PJSIP/101`) |
| `inboundPolicy` | No | `disabled` or `allowlist` (default: `disabled`) |
| `allowFrom` | No | Array of allowed inbound caller IDs |

### Outbound Trunk Pattern

The `outboundTrunk` config specifies how to dial external numbers:

```json
// Common patterns:
"outboundTrunk": "PJSIP/{number}@trunk-provider"
"outboundTrunk": "PJSIP/trunk-name/{number}"
"outboundTrunk": "SIP/{number}@gateway"
```

## Usage

### LLM Tool

The agent can use the `voice_call` tool:

```
Call 659654255 and tell them about the meeting tomorrow.
```

### CLI Commands

```bash
# Check health
openclaw voicecall health

# List active calls
openclaw voicecall list

# Initiate a call
openclaw voicecall call --to 659654255

# Get call status
openclaw voicecall status --call-id <id>

# End a call
openclaw voicecall end --call-id <id>
```

### Tool Actions

| Action | Parameters | Description |
|--------|------------|-------------|
| `initiate_call` | `to`, `message?`, `mode?` | Start outbound call |
| `speak_to_user` | `callId`, `message` | Play audio (TTS placeholder) |
| `continue_call` | `callId`, `message` | Continue conversation |
| `end_call` | `callId` | Hang up |
| `get_status` | `callId` | Get call state |
| `list_calls` | — | List all active calls |

## Allowlist

The allowlist is managed at the **asterisk-api** level, not in this plugin.

Edit `asterisk-api/allowlist.json`:
```json
{
  "inbound": ["659654255"],
  "outbound": ["659654255"]
}
```

Empty arrays = allow all (open mode).

## Testing

See [TESTS.md](./TESTS.md) for the full test checklist.

Quick test:
```bash
# 1. Check asterisk-api is running
curl http://localhost:3456/health

# 2. Check plugin is loaded
openclaw status

# 3. Initiate test call
openclaw voicecall call --to 659654255
```

## Roadmap

- [x] V1: Outbound calls via REST + WebSocket events
- [ ] V2: Inbound call handling
- [ ] V2: Streaming TTS (qwen3-tts)
- [ ] V2: Streaming STT (qwen3-asr)
- [ ] V2: Real-time duplex conversation

## License

MIT
