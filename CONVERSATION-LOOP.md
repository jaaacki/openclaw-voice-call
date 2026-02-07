# Conversation Loop Implementation (v0.3.0)

## Overview

This document describes the complete conversation loop implementation for openclaw-voice-call, enabling real-time voice conversations between callers and the OpenClaw agent.

## Architecture

```
┌─────────────┐         ┌──────────────┐         ┌─────────────┐
│   Caller    │◄───────►│ Asterisk ARI │◄───────►│ OpenClaw    │
│  (Phone)    │  Audio  │  + API       │ WebSocket│   Agent     │
└─────────────┘         └──────────────┘         └─────────────┘
                              │                          │
                              │ Transcription            │
                              ▼                          ▼
                        ┌──────────────┐         ┌─────────────┐
                        │ Transcriber  │         │ TTS API     │
                        │   (STT)      │         │ (Speech)    │
                        └──────────────┘         └─────────────┘
```

## Conversation State Machine

```
     ┌────────────────────────────────────────┐
     │                                        │
     │    START                               │
     ▼                                        │
  ┌──────┐                                    │
  │ IDLE │                                    │
  └──┬───┘                                    │
     │ start_listening                        │
     ▼                                        │
┌────────────┐                                │
│ LISTENING  │◄──┐                            │
└─────┬──────┘   │                            │
      │          │ (partial transcriptions)   │
      │          │                            │
      │ final    │                            │
      │ trans.   │                            │
      ▼          │                            │
┌─────────────┐  │                            │
│ PROCESSING  │  │                            │
└─────┬───────┘  │                            │
      │          │                            │
      │ agent    │                            │
      │ response │                            │
      ▼          │                            │
┌────────────┐   │                            │
│ SPEAKING   │───┘                            │
└─────┬──────┘                                │
      │                                       │
      │ (playback finished)                   │
      │                                       │
      └───────────────────────────────────────┘
      (back to LISTENING if conversation mode,
       or IDLE if one-shot mode)
```

## Components

### 1. Event Manager (`src/events.ts`)

**New Features:**
- Conversation context tracking per call
- Partial transcription buffering
- State management (IDLE → LISTENING → PROCESSING → SPEAKING)
- `onTranscriptionFinal` callback for agent processing

**Key Methods:**
- `getConversationContext(callId)` - Get/create conversation state
- `setConversationState(callId, state)` - Transition states
- `enableConversationMode(callId)` - Enable continuous conversation
- `handleTranscription(event)` - Process transcription events

**State Logic:**
- Ignores transcriptions during SPEAKING state (no barge-in)
- Buffers partial transcriptions until final
- Triggers agent processing on final transcription
- Maintains conversation history

### 2. TTS Module (`src/tts.ts`)

**Functions:**
- `generateSpeech(options)` - Convert text to audio file
  - Calls TTS API at `http://192.168.2.198:8101/v1/audio/speech`
  - Saves WAV file to `/tmp/`
  - Returns path and metadata
- `cleanupAudioFile(path)` - Remove temporary audio files

**TTS API:**
```typescript
POST http://192.168.2.198:8101/v1/audio/speech
Content-Type: application/json

{
  "input": "Hello, how can I help you?",
  "voice": "alloy",
  "response_format": "wav"
}
```

**Available Voices:**
- alloy, echo, fable, onyx, nova, shimmer, vivian, serena, etc.

### 3. Tool Actions (`src/tool.ts`)

**New Actions:**

#### `speak`
Generate TTS and play to caller:
```json
{
  "action": "speak",
  "callId": "abc123",
  "text": "Hello, how are you?",
  "voice": "alloy"
}
```

**Flow:**
1. Transition to SPEAKING
2. Generate TTS audio
3. Play via asterisk-api
4. Add to conversation history
5. Transition back to LISTENING (or IDLE)

#### `start_listening`
Begin audio capture and transcription:
```json
{
  "action": "start_listening",
  "callId": "abc123"
}
```

**Flow:**
1. Enable conversation mode
2. Transition to LISTENING
3. Start recording (triggers transcription events)

#### `stop_listening`
Stop audio capture:
```json
{
  "action": "stop_listening",
  "callId": "abc123"
}
```

**Flow:**
1. Transition to IDLE
2. Stop transcription

### 4. Plugin Integration (`index.ts`)

**Transcription Handler:**
```typescript
onTranscriptionFinal: async (callId, text, context) => {
  // 1. Get agent response (currently echo for testing)
  const agentResponse = `I heard you say: ${text}`;
  
  // 2. Generate TTS
  const ttsResult = await generateSpeech({
    baseUrl: config.ttsApiUrl,
    text: agentResponse,
    voice: "alloy"
  });
  
  // 3. Transition to SPEAKING
  eventManager.setConversationState(callId, "SPEAKING");
  
  // 4. Play audio
  await client.playMedia(callId, `sound:${ttsResult.audioPath}`);
  
  // 5. Add to history
  context.history.push({
    role: "assistant",
    content: agentResponse,
    timestamp: new Date().toISOString()
  });
  
  // 6. Transition back to LISTENING
  eventManager.setConversationState(callId, "LISTENING");
}
```

## Configuration

**New Config Option:**
```typescript
{
  "ttsApiUrl": "http://192.168.2.198:8101"
}
```

## Data Structures

### ConversationContext
```typescript
{
  state: "IDLE" | "LISTENING" | "PROCESSING" | "SPEAKING",
  partialText: string,
  history: Array<{
    role: "user" | "assistant",
    content: string,
    timestamp: string
  }>,
  lastStateChange: string,
  conversationMode: boolean
}
```

### TranscriptionEvent
```typescript
{
  type: "call.transcription",
  callId: string,
  text: string,
  is_final: boolean,
  confidence?: number,
  timestamp: string
}
```

## Testing

### Manual Test Flow

1. **Initiate Call:**
```bash
openclaw voicecall call --to 659654255
# Note the callId from response
```

2. **Start Listening:**
```bash
openclaw tool voice_call '{"action": "start_listening", "callId": "YOUR_CALL_ID"}'
```

3. **Speak into phone** - Should see:
   - Partial transcriptions in logs
   - Final transcription triggers agent
   - TTS generation
   - Audio playback
   - State transitions

4. **Check Status:**
```bash
openclaw tool voice_call '{"action": "get_status", "callId": "YOUR_CALL_ID"}'
```

5. **Manual Speak:**
```bash
openclaw tool voice_call '{
  "action": "speak",
  "callId": "YOUR_CALL_ID",
  "text": "This is a test message",
  "voice": "nova"
}'
```

6. **End Call:**
```bash
openclaw tool voice_call '{"action": "end_call", "callId": "YOUR_CALL_ID"}'
```

### Expected Log Output

```
[voice-call-freepbx] Call initiated to 659654255: abc123
[EventManager] Connected to asterisk-api events
[EventManager] Conversation mode enabled for abc123
[EventManager] Call abc123 state: LISTENING
[EventManager] Partial transcription for abc123: Hello...
[EventManager] Partial transcription for abc123: Hello how...
[EventManager] Final transcription for abc123: Hello how are you
[EventManager] Call abc123 state: PROCESSING
[voice-call-freepbx] Processing transcription for abc123: Hello how are you
[voice-call-freepbx] Generating TTS for abc123: I heard you say: Hello how are you
[EventManager] Call abc123 state: SPEAKING
[voice-call-freepbx] Playing audio to abc123: /tmp/tts-1707123456789-abc123.wav
[voice-call-freepbx] Played response to abc123: I heard you say: Hello how are you
[EventManager] Call abc123 state: LISTENING
```

## Future Enhancements

### TODO: Full Agent Integration
Replace the echo response with actual OpenClaw agent invocation:

```typescript
// Get agent response
const agentResponse = await api.invokeAgent({
  sessionId: callId,
  input: text,
  context: {
    conversationHistory: context.history,
    mode: "voice"
  }
});
```

### TODO: Barge-in Support
Allow user to interrupt agent speech:
- Monitor transcriptions during SPEAKING
- Cancel playback on user speech
- Transition back to LISTENING

### TODO: Stop Recording Endpoint
Add `stopRecording(callId)` to asterisk-api client for clean stop_listening.

### TODO: Advanced Voice Selection
- Per-user voice preferences
- Context-aware voice selection
- Emotion-based voice modulation

## Troubleshooting

### Transcriptions Not Arriving
- Check asterisk-api v0.2.1 or later
- Verify WebSocket connection: `list_calls` should show `wsConnected: true`
- Check asterisk-api logs for transcription errors

### TTS Generation Fails
- Verify TTS API is running: `curl http://192.168.2.198:8101/health`
- Check TTS API logs
- Verify `/tmp/` directory is writable

### Audio Not Playing
- Check asterisk-api logs for playback errors
- Verify audio file exists in `/tmp/`
- Test with static sound file first

### State Machine Stuck
- Check conversation context: `getConversationContext(callId)`
- Look for error logs during state transitions
- Call ends should auto-cleanup context

## Performance Considerations

### Audio File Cleanup
- Files auto-deleted after 60 seconds
- Temp files in `/tmp/` - cleared on reboot
- Consider implementing periodic cleanup for long-running systems

### Memory Management
- Conversation contexts cleared on call end
- History grows with conversation length
- Consider truncating history after N messages

### Latency
- TTS generation: ~500ms-2s depending on text length
- Transcription: Real-time streaming (minimal latency)
- Agent processing: Depends on agent complexity
- Total round-trip: ~1-3 seconds typical

## Version History

**v0.3.0** - Initial conversation loop implementation
- Transcription event handling
- Agent integration (echo mode)
- TTS generation and playback
- State machine implementation
- New tool actions: speak, start_listening, stop_listening
