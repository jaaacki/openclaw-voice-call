# Test Plan for v0.3.0 - Conversation Loop

## Prerequisites

- [ ] asterisk-api v0.2.1+ running with transcription support
- [ ] TTS API running at http://192.168.2.198:8101
- [ ] FreePBX/Asterisk configured and reachable
- [ ] OpenClaw plugin loaded: `openclaw plugin list`
- [ ] Test phone available (e.g., 659654255)

## Test 1: Basic TTS Playback (No Transcription)

**Goal:** Verify TTS generation and playback work independently

```bash
# Step 1: Initiate call
openclaw tool voice_call '{
  "action": "initiate_call",
  "to": "659654255",
  "mode": "notify"
}'

# Note the callId from response

# Step 2: Wait for call to be answered (check phone rings and answer it)

# Step 3: Speak to the call
openclaw tool voice_call '{
  "action": "speak",
  "callId": "YOUR_CALL_ID",
  "text": "Hello, this is a test of the text to speech system. Can you hear me clearly?",
  "voice": "alloy"
}'

# Step 4: Listen on phone - should hear TTS voice

# Step 5: Try different voices
openclaw tool voice_call '{
  "action": "speak",
  "callId": "YOUR_CALL_ID",
  "text": "This is the Nova voice",
  "voice": "nova"
}'

# Step 6: End call
openclaw tool voice_call '{
  "action": "end_call",
  "callId": "YOUR_CALL_ID"
}'
```

**Expected Results:**
- [ ] Call connects successfully
- [ ] TTS audio plays clearly on phone
- [ ] Different voices sound distinct
- [ ] No errors in logs
- [ ] Call ends cleanly

## Test 2: Listening Mode (Transcription Only)

**Goal:** Verify transcription events are received and buffered

```bash
# Step 1: Initiate call
openclaw tool voice_call '{
  "action": "initiate_call",
  "to": "659654255",
  "mode": "conversation"
}'

# Step 2: Start listening
openclaw tool voice_call '{
  "action": "start_listening",
  "callId": "YOUR_CALL_ID"
}'

# Step 3: Speak into phone: "Hello, testing one two three"

# Step 4: Check logs for transcription events
# Should see:
# - [EventManager] Partial transcription for ...
# - [EventManager] Final transcription for ...

# Step 5: Stop listening
openclaw tool voice_call '{
  "action": "stop_listening",
  "callId": "YOUR_CALL_ID"
}'

# Step 6: End call
openclaw tool voice_call '{
  "action": "end_call",
  "callId": "YOUR_CALL_ID"
}'
```

**Expected Results:**
- [ ] Listening mode activates
- [ ] Partial transcriptions appear in logs
- [ ] Final transcription triggers after speech ends
- [ ] Conversation state: IDLE → LISTENING → PROCESSING → LISTENING → IDLE
- [ ] No audio feedback loops

## Test 3: Full Conversation Loop (Echo Mode)

**Goal:** Verify complete transcription → agent → TTS → playback cycle

```bash
# Step 1: Initiate call with conversation mode
openclaw tool voice_call '{
  "action": "initiate_call",
  "to": "659654255",
  "mode": "conversation"
}'

# Step 2: Start listening
openclaw tool voice_call '{
  "action": "start_listening",
  "callId": "YOUR_CALL_ID"
}'

# Step 3: Speak into phone: "Hello, how are you?"

# Step 4: Wait for agent response (should hear "I heard you say: Hello, how are you?")

# Step 5: Speak again: "What time is it?"

# Step 6: Wait for agent response (echo again)

# Step 7: Check conversation history
openclaw tool voice_call '{
  "action": "get_status",
  "callId": "YOUR_CALL_ID"
}'

# Step 8: End call
openclaw tool voice_call '{
  "action": "end_call",
  "callId": "YOUR_CALL_ID"
}'
```

**Expected Results:**
- [ ] Each spoken phrase triggers transcription
- [ ] Agent processes transcription (echo mode)
- [ ] TTS generates response audio
- [ ] Response plays back on phone
- [ ] State machine cycles correctly
- [ ] Conversation history accumulates
- [ ] No state machine deadlocks

## Test 4: State Machine Behavior

**Goal:** Verify state transitions and guards

```bash
# Step 1: Start call and listening
openclaw tool voice_call '{"action": "initiate_call", "to": "659654255"}'
openclaw tool voice_call '{"action": "start_listening", "callId": "YOUR_CALL_ID"}'

# Step 2: While speaking, try to speak (should queue or ignore)
# Speak into phone and immediately send:
openclaw tool voice_call '{
  "action": "speak",
  "callId": "YOUR_CALL_ID",
  "text": "This should work after current speech"
}'

# Step 3: Verify state in logs
# Should see SPEAKING state, then transition back to LISTENING

# Step 4: Speak during agent speech
# Start agent speaking:
openclaw tool voice_call '{"action": "speak", "callId": "YOUR_CALL_ID", "text": "I am speaking a long sentence that will take several seconds to complete"}'

# While it's speaking, speak into phone
# Expected: Transcriptions should be ignored during SPEAKING state

# Step 5: Check logs
# Should see: "Ignoring transcription during SPEAKING state"
```

**Expected Results:**
- [ ] SPEAKING state prevents transcription processing
- [ ] State transitions are logged correctly
- [ ] No race conditions or stuck states
- [ ] Sequential operations work in order

## Test 5: Error Handling

**Goal:** Verify graceful error handling

```bash
# Test 5a: Invalid call ID
openclaw tool voice_call '{
  "action": "speak",
  "callId": "invalid-call-id",
  "text": "This should fail"
}'
# Expected: "Call invalid-call-id not found"

# Test 5b: Empty text
openclaw tool voice_call '{
  "action": "speak",
  "callId": "VALID_CALL_ID",
  "text": ""
}'
# Expected: "text required" error

# Test 5c: TTS API unreachable
# 1. Stop TTS API temporarily
# 2. Try to speak
openclaw tool voice_call '{
  "action": "speak",
  "callId": "VALID_CALL_ID",
  "text": "This will fail"
}'
# Expected: TTS API error, state resets to LISTENING

# Test 5d: Call hangup during conversation
# 1. Start conversation
# 2. Hangup from phone side
# 3. Verify cleanup
# Expected: Conversation context deleted, no memory leaks
```

**Expected Results:**
- [ ] Clear error messages
- [ ] State resets on errors
- [ ] No crashes or hangs
- [ ] Cleanup on premature call end
- [ ] Resources released properly

## Test 6: Performance and Cleanup

**Goal:** Verify resource management

```bash
# Step 1: Check temp files before
ls -lh /tmp/tts-*

# Step 2: Run conversation
openclaw tool voice_call '{"action": "initiate_call", "to": "659654255"}'
openclaw tool voice_call '{"action": "start_listening", "callId": "CALL_ID"}'
# Speak several times

# Step 3: Check temp files during
ls -lh /tmp/tts-*
# Should see WAV files

# Step 4: Wait 60+ seconds after call ends

# Step 5: Check temp files after cleanup
ls -lh /tmp/tts-*
# Should be cleaned up

# Step 6: Check memory usage
openclaw status
# Note memory usage

# Step 7: Run 10 calls in sequence
for i in {1..10}; do
  echo "Call $i"
  # ... run call sequence
done

# Step 8: Check memory usage again
openclaw status
# Should not have grown significantly
```

**Expected Results:**
- [ ] Temp files created in /tmp/
- [ ] Files cleaned up after 60 seconds
- [ ] No file descriptor leaks
- [ ] Memory stays stable across multiple calls
- [ ] Conversation contexts properly deleted

## Test 7: Integration with asterisk-api

**Goal:** Verify WebSocket event stream works correctly

```bash
# Step 1: Check WebSocket connection
openclaw tool voice_call '{"action": "list_calls"}'
# Should show: "wsConnected": true

# Step 2: Monitor logs while making call
tail -f ~/.openclaw/logs/openclaw.log | grep voice-call-freepbx

# Step 3: Initiate call
openclaw tool voice_call '{"action": "initiate_call", "to": "659654255"}'

# Expected log sequence:
# - call.created event
# - call.ready event
# - call.answered event
# - (speak) call.playback_finished event
# - call.ended event

# Step 4: Verify all events logged
# Step 5: Verify active calls tracked correctly
```

**Expected Results:**
- [ ] WebSocket connects on plugin load
- [ ] Auto-reconnects on disconnect
- [ ] All call events received
- [ ] Snapshot received on connect
- [ ] Active calls tracked correctly

## Completion Checklist

- [ ] All Test 1 steps pass (TTS playback)
- [ ] All Test 2 steps pass (transcription)
- [ ] All Test 3 steps pass (full loop)
- [ ] All Test 4 steps pass (state machine)
- [ ] All Test 5 steps pass (error handling)
- [ ] All Test 6 steps pass (performance)
- [ ] All Test 7 steps pass (integration)
- [ ] No memory leaks observed
- [ ] No orphaned files in /tmp
- [ ] Logs are clear and informative
- [ ] Ready for production use

## Known Limitations (v0.3.0)

- Agent integration is echo mode only (TODO: full OpenClaw agent)
- No barge-in support (user can't interrupt agent speech)
- No stop recording endpoint (stop_listening doesn't actually stop recording)
- Voice selection is manual (no auto-selection)
- Conversation history grows unbounded (consider truncation)

## Next Steps

After successful testing:
1. Integrate full OpenClaw agent (replace echo mode)
2. Add barge-in support (monitor transcriptions during SPEAKING)
3. Implement stop recording in asterisk-api
4. Add conversation history truncation/summarization
5. Add voice preference configuration
6. Add metrics/analytics
