# OpenClaw Voice Call Plugin (FreePBX/Asterisk)

Voice calling via Asterisk/FreePBX using ARI and the asterisk-api bridge.

## Features

- **Outbound calls** — Initiate calls to phone numbers via OpenClaw agent
- **Server-side TTS** — Text-to-speech via asterisk-api `POST /calls/:id/speak` (Qwen3-TTS)
- **Conversation loop** — Transcription -> agent -> TTS -> playback cycle
- **WebSocket events** — Real-time call state via asterisk-api `/events`
- **Allowlist** — Restrict calls to approved numbers (at asterisk-api level)
- **LLM tool** — `voice_call` tool for agent use
- **CLI commands** — `voicecall call`, `voicecall speak`, `voicecall list`, etc.
- **RPC methods** — `voicecall.initiate`, `voicecall.speak`, `voicecall.status`, etc.

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
2. **asterisk-api v0.3.0+** bridge service running ([jaaacki/asterisk-api](https://github.com/jaaacki/asterisk-api)) — includes server-side TTS
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

> **Note:** TTS configuration (`ttsApiUrl`, voice, language) is managed on the **asterisk-api** side, not in this plugin. See asterisk-api `.env` for `TTS_URL`, `TTS_DEFAULT_VOICE`, etc.

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
Call 6596542555 and tell them about the meeting tomorrow.
```

### CLI Commands

```bash
# Check health
openclaw voicecall health

# List active calls
openclaw voicecall list

# Initiate a call
openclaw voicecall call --to 6596542555

# Speak text into active call (server-side TTS)
openclaw voicecall speak --call-id <id> --message "Hello, how are you?"
openclaw voicecall speak --call-id <id> --message "Bonjour" --voice serena --language French

# Get call status
openclaw voicecall status --call-id <id>

# End a call
openclaw voicecall end --call-id <id>
```

### Tool Actions

| Action | Parameters | Description |
|--------|------------|-------------|
| `initiate_call` | `to`, `message?`, `mode?` | Start outbound call |
| `speak` | `callId`, `text`, `voice?` | Speak text via server-side TTS (Qwen3-TTS) |
| `speak_to_user` | `callId`, `message` | Speak message to caller via TTS |
| `continue_call` | `callId`, `message` | Continue conversation via TTS |
| `start_listening` | `callId` | Start audio capture + ASR transcription |
| `stop_listening` | `callId` | Stop audio capture + ASR |
| `end_call` | `callId` | Hang up |
| `get_status` | `callId` | Get call state |
| `list_calls` | — | List all active calls |

### Available TTS Voices

Voices are provided by Qwen3-TTS on the asterisk-api server:

`vivian` (default), `serena`, `uncle_fu`, `dylan`, `eric`, `ryan`, `aiden`, `ono_anna`, `sohee`

## Allowlist

The allowlist is managed at the **asterisk-api** level, not in this plugin.

Edit `asterisk-api/allowlist.json`:
```json
{
  "inbound": ["6596542555"],
  "outbound": ["6596542555"]
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
openclaw voicecall call --to 6596542555
```

## Roadmap

- [x] V1: Outbound calls via REST + WebSocket events
- [x] V2: Conversation loop (transcription -> agent -> TTS -> playback)
- [x] V2: Server-side TTS via Qwen3-TTS
- [x] V2: Live ASR via audio capture pipeline
- [ ] V3: Inbound call handling
- [ ] V3: Real-time duplex conversation (barge-in support)

## License

MIT
