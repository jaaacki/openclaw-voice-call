/**
 * Voice Call Tool Registration
 * Registers the voice_call tool with OpenClaw for LLM agent use
 *
 * @module tool
 */

import { Type } from "@sinclair/typebox";

import type { OpenClawPluginApi } from "openclaw/plugin-sdk";

import { getEventManager } from "./events.js";
import type { VoiceCallFreepbxConfig } from "./config.js";

// ---------------------------------------------------------------------------
// Tool parameter schema (TypeBox union, same pattern as moltbot voice-call)
// ---------------------------------------------------------------------------

const VoiceCallToolSchema = Type.Union([
  Type.Object({
    action: Type.Literal("initiate_call"),
    to: Type.String({ description: "Phone number to call (e.g. 6596542555)" }),
    message: Type.Optional(
      Type.String({ description: "Intro message to speak when call connects" }),
    ),
    mode: Type.Optional(
      Type.Union([Type.Literal("notify"), Type.Literal("conversation")], {
        description: "notify = hang up after speaking, conversation = keep call open (default)",
      }),
    ),
  }),
  Type.Object({
    action: Type.Literal("continue_call"),
    callId: Type.String({ description: "Call ID" }),
    message: Type.String({ description: "Follow-up message to speak" }),
  }),
  Type.Object({
    action: Type.Literal("speak_to_user"),
    callId: Type.String({ description: "Call ID" }),
    message: Type.String({ description: "Message to speak to the user" }),
  }),
  Type.Object({
    action: Type.Literal("speak"),
    callId: Type.String({ description: "Call ID" }),
    text: Type.String({ description: "Text to convert to speech and play" }),
    voice: Type.Optional(
      Type.String({ description: "TTS voice (vivian, serena, dylan, eric, ryan, aiden, etc.)" }),
    ),
  }),
  Type.Object({
    action: Type.Literal("start_listening"),
    callId: Type.String({ description: "Call ID" }),
  }),
  Type.Object({
    action: Type.Literal("stop_listening"),
    callId: Type.String({ description: "Call ID" }),
  }),
  Type.Object({
    action: Type.Literal("end_call"),
    callId: Type.String({ description: "Call ID" }),
  }),
  Type.Object({
    action: Type.Literal("get_status"),
    callId: Type.String({ description: "Call ID" }),
  }),
  Type.Object({
    action: Type.Literal("list_calls"),
  }),
  // ---- Compound actions (save LLM round-trips) ----
  Type.Object({
    action: Type.Literal("call_and_listen"),
    to: Type.String({ description: "Phone number to call" }),
    greeting: Type.Optional(
      Type.String({ description: "Greeting to speak when connected (default: 'Hello, how can I help you?')" }),
    ),
  }),
  Type.Object({
    action: Type.Literal("call_and_talk"),
    to: Type.String({ description: "Phone number to call" }),
    message: Type.String({ description: "Message to speak when call connects" }),
    mode: Type.Optional(
      Type.Union([Type.Literal("notify"), Type.Literal("conversation")]),
    ),
  }),
  Type.Object({
    action: Type.Literal("listen_and_respond"),
    callId: Type.String({ description: "Call ID" }),
    reply: Type.String({ description: "Message to speak before listening for user response" }),
  }),
]);

// ---------------------------------------------------------------------------
// Registration
// ---------------------------------------------------------------------------

export function registerVoiceCallTool(
  api: OpenClawPluginApi,
  config: VoiceCallFreepbxConfig,
): void {
  api.registerTool({
    name: "voice_call",
    label: "Voice Call",
    description:
      "Make and control voice calls via FreePBX/Asterisk. " +
      "For outbound calls prefer compound actions to reduce round-trips: " +
      "call_and_listen (dial → greet → return utterance), " +
      "call_and_talk (dial → speak → optionally hang up), " +
      "listen_and_respond (speak reply → return next utterance). " +
      "Use initiate_call only when you need manual control.",
    parameters: VoiceCallToolSchema,
    async execute(_toolCallId: string, params: Record<string, unknown>) {
      const json = (payload: unknown) => ({
        content: [
          { type: "text" as const, text: JSON.stringify(payload, null, 2) },
        ],
        details: payload,
      });

      // Get the event manager (initialized on plugin load)
      const eventManager = getEventManager();
      if (!eventManager) {
        return json({ error: "Voice call service not initialized" });
      }

      const client = eventManager.getClient();

      try {
        const action = params?.action as string | undefined;

        switch (action) {
          case "initiate_call": {
            const to = String(params.to || "").trim();
            if (!to) throw new Error("to (phone number) required");

            // Build endpoint from phone number using outboundTrunk pattern or defaultEndpoint
            let endpoint: string;
            if (config.outboundTrunk) {
              // Use trunk pattern with {number} placeholder
              endpoint = config.outboundTrunk.replace("{number}", to);
            } else if (config.defaultEndpoint.includes("/")) {
              // Append number to default endpoint
              endpoint = `${config.defaultEndpoint}/${to}`;
            } else {
              // Fallback: PJSIP/number
              endpoint = `PJSIP/${to}`;
            }

            const result = await client.originate(endpoint, config.fromNumber);
            const callId = result.callId;

            api.logger.info(
              `[voice-call-freepbx] Call initiated to ${to}: ${callId}`,
            );

            const message = String(params.message || "").trim();
            const mode = String(params.mode || "conversation");

            // Poll REST API until call is answered (max 30s)
            // Always wait for answer — if no message, speak a brief hold prompt
            // so the user knows the call is live while the agent continues processing.
            const MAX_WAIT_MS = 30_000;
            const POLL_INTERVAL_MS = 1_000;
            const ANSWERED_STATES = new Set(["answered", "speaking", "playing", "ready"]);
            const TERMINAL_STATES = new Set(["ended", "failed", "hangup", "no-answer", "busy"]);
            const startTime = Date.now();
            let answeredState: string | null = null;

            while (Date.now() - startTime < MAX_WAIT_MS) {
              await new Promise<void>((r) => setTimeout(r, POLL_INTERVAL_MS));

              let callStatus: { callId: string; status: string };
              try {
                callStatus = await client.getCall(callId);
              } catch {
                // 404 — call already ended
                return json({ callId, to, endpoint, initiated: true, error: "Call ended before answering" });
              }

              if (ANSWERED_STATES.has(callStatus.status)) {
                answeredState = callStatus.status;
                break;
              }
              if (TERMINAL_STATES.has(callStatus.status)) {
                return json({ callId, to, endpoint, initiated: true, error: `Call ended before answering: ${callStatus.status}` });
              }
            }

            if (!answeredState) {
              return json({ callId, to, endpoint, initiated: true, error: "Timeout: call not answered within 30s" });
            }

            // Brief pause to let Stasis app initialise after channel goes Up
            await new Promise<void>((r) => setTimeout(r, 500));

            if (!message) {
              // No message — return immediately so agent can continue (call stays open)
              return json({ callId, to, endpoint, initiated: true, answered: true });
            }

            api.logger.info(`[voice-call-freepbx] Speaking to ${callId}: "${message.substring(0, 60)}"`);
            const speakResult = await client.speak(callId, message);

            if (mode === "notify") {
              // Hang up after speaking
              await client.hangup(callId);
              return json({
                callId,
                to,
                endpoint,
                initiated: true,
                messageSpoken: true,
                callEnded: true,
                durationSeconds: speakResult.durationSeconds,
              });
            }

            // Conversation mode — return with callId so agent can continue
            return json({
              callId,
              to,
              endpoint,
              initiated: true,
              messageSpoken: true,
              mode: "conversation",
              durationSeconds: speakResult.durationSeconds,
            });
          }

          case "continue_call": {
            const callId = String(params.callId || "").trim();
            const message = String(params.message || "").trim();
            if (!callId || !message) {
              throw new Error("callId and message required");
            }

            // Check if call exists in our active calls
            const call = eventManager.getCall(callId);
            if (!call) {
              return json({ error: `Call ${callId} not found in active calls` });
            }

            const result = await client.speak(callId, message);

            return json({ callId, success: true, message, callState: call.status, durationSeconds: result.durationSeconds });
          }

          case "speak_to_user": {
            const callId = String(params.callId || "").trim();
            const message = String(params.message || "").trim();
            if (!callId || !message) {
              throw new Error("callId and message required");
            }

            // Check if call exists
            const call = eventManager.getCall(callId);
            if (!call) {
              return json({ error: `Call ${callId} not found in active calls` });
            }

            const result = await client.speak(callId, message);

            return json({ callId, success: true, callState: call.status, durationSeconds: result.durationSeconds });
          }

          case "end_call": {
            const callId = String(params.callId || "").trim();
            if (!callId) throw new Error("callId required");

            await client.hangup(callId);

            return json({ callId, success: true, ended: true });
          }

          case "get_status": {
            const callId = String(params.callId || "").trim();
            if (!callId) throw new Error("callId required");

            // First check our local cache from WebSocket events
            const cachedCall = eventManager.getCall(callId);
            if (cachedCall) {
              return json({ found: true, source: "cache", call: cachedCall });
            }

            // Fall back to REST API
            try {
              const call = await client.getCall(callId);
              return json({ found: true, source: "api", call });
            } catch {
              return json({ found: false, callId });
            }
          }

          case "list_calls": {
            const activeCalls = eventManager.getActiveCalls();
            return json({
              count: activeCalls.length,
              calls: activeCalls,
              wsConnected: eventManager.isConnected(),
            });
          }

          case "speak": {
            const callId = String(params.callId || "").trim();
            const text = String(params.text || "").trim();
            if (!callId || !text) {
              throw new Error("callId and text required");
            }

            // Check if call exists
            const call = eventManager.getCall(callId);
            if (!call) {
              return json({ error: `Call ${callId} not found in active calls` });
            }

            const voice = String(params.voice || "").trim() || undefined;

            // Server-side TTS — speak() blocks until playback finishes
            // State transitions handled by call.speak_started/finished events
            api.logger.info(`[voice-call-freepbx] Speaking to ${callId}: ${text.substring(0, 50)}...`);
            const result = await client.speak(callId, text, { voice });

            // Add to conversation history
            const context = eventManager.getConversationContext(callId);
            context.history.push({
              role: "assistant",
              content: text,
              timestamp: new Date().toISOString(),
            });

            return json({
              callId,
              success: true,
              text,
              voice: result.voice,
              language: result.language,
              durationSeconds: result.durationSeconds,
            });
          }

          case "start_listening": {
            const callId = String(params.callId || "").trim();
            if (!callId) throw new Error("callId required");

            // Check if call exists
            if (!eventManager.getCall(callId)) {
              return json({ error: `Call ${callId} not found in active calls` });
            }

            // Wait for the call to be answered only if not already answered.
            // initiate_call now always waits for answer, so this is usually a no-op.
            {
              const ANSWER_WAIT_MS = 30_000;
              const ANSWER_POLL_MS = 500;
              const ANSWERED_STATES = new Set(["answered", "speaking", "playing", "ready", "up"]);
              const TERMINAL_STATES = new Set(["ended", "failed", "hangup", "no-answer", "busy"]);
              const answerStart = Date.now();

              while (Date.now() - answerStart < ANSWER_WAIT_MS) {
                let status: { callId: string; status: string };
                try {
                  status = await client.getCall(callId);
                } catch {
                  return json({ error: "Call ended before being answered" });
                }

                const s = (status.status ?? "").toLowerCase();
                if (ANSWERED_STATES.has(s)) break;
                if (TERMINAL_STATES.has(s)) {
                  return json({ error: `Call ended before being answered: ${status.status}` });
                }

                await new Promise<void>((r) => setTimeout(r, ANSWER_POLL_MS));
              }
            }

            // Enable conversation mode and transition to LISTENING
            eventManager.enableConversationMode(callId);
            eventManager.setConversationState(callId, "LISTENING");

            // Start ASR and speak "Go ahead." in parallel — saves ~2s vs sequential
            await Promise.all([
              client.startAudioCapture(callId),
              client.speak(callId, "Go ahead.").catch(() => { /* non-fatal */ }),
            ]);

            // Block until the first utterance is detected (or call ends / aborted).
            // The transcription text is returned as the tool result so it naturally
            // appears in the agent's chat as output.
            const LISTEN_TIMEOUT_MS = 5 * 60 * 1000; // 5 minutes max wait
            const utterance = await new Promise<string>((resolve, reject) => {
              const timer = setTimeout(() => {
                eventManager.rejectTranscriptionWaiter(callId, new Error("start_listening timed out after 5 minutes"));
              }, LISTEN_TIMEOUT_MS);

              // Clean up timer when the waiter resolves/rejects
              eventManager.setTranscriptionWaiter(
                callId,
                (text) => { clearTimeout(timer); resolve(text); },
                (err)  => { clearTimeout(timer); reject(err); },
              );
            });

            // Stop audio capture after receiving the utterance so ASR can free resources
            try {
              await client.stopAudioCapture(callId);
            } catch {
              // Non-fatal: audio may have already stopped
            }
            eventManager.setConversationState(callId, "IDLE");

            return json({
              callId,
              success: true,
              utterance,
              message: "User speech captured",
            });
          }

          case "stop_listening": {
            const callId = String(params.callId || "").trim();
            if (!callId) throw new Error("callId required");

            // Check if call exists
            const call = eventManager.getCall(callId);
            if (!call) {
              return json({ error: `Call ${callId} not found in active calls` });
            }

            // Reject any blocked start_listening so it returns immediately
            eventManager.rejectTranscriptionWaiter(callId, new Error("Listening stopped by stop_listening action"));

            // Stop live audio capture + ASR pipeline
            await client.stopAudioCapture(callId);

            // Transition to IDLE
            eventManager.setConversationState(callId, "IDLE");

            return json({
              callId,
              success: true,
              state: "IDLE",
              message: "Audio capture and transcription stopped",
            });
          }

          // ------------------------------------------------------------------
          // Compound actions — collapse multiple tool calls into one to
          // eliminate intermediate LLM round-trips (~4s saved per hop).
          // All logic lives here in the plugin connector, safe from
          // openclaw core updates.
          // ------------------------------------------------------------------

          case "call_and_listen": {
            // dial → wait for answer → speak greeting → listen → return utterance
            // Saves 1 LLM hop vs: initiate_call → LLM → start_listening
            const to = String(params.to || "").trim();
            if (!to) throw new Error("to (phone number) required");

            let endpoint: string;
            if (config.outboundTrunk) {
              endpoint = config.outboundTrunk.replace("{number}", to);
            } else if (config.defaultEndpoint.includes("/")) {
              endpoint = `${config.defaultEndpoint}/${to}`;
            } else {
              endpoint = `PJSIP/${to}`;
            }

            const origResult = await client.originate(endpoint, config.fromNumber);
            const callId = origResult.callId;
            api.logger.info(`[voice-call-freepbx] call_and_listen: initiated to ${to}: ${callId}`);

            // Poll until answered
            const MAX_WAIT_MS = 30_000;
            const POLL_MS = 500;
            const ANSWERED_STATES = new Set(["answered", "speaking", "playing", "ready"]);
            const TERMINAL_STATES = new Set(["ended", "failed", "hangup", "no-answer", "busy"]);
            const startTime = Date.now();
            let answered = false;

            while (Date.now() - startTime < MAX_WAIT_MS) {
              await new Promise<void>((r) => setTimeout(r, POLL_MS));
              let callStatus: { callId: string; status: string };
              try {
                callStatus = await client.getCall(callId);
              } catch {
                return json({ callId, to, error: "Call ended before answering" });
              }
              if (ANSWERED_STATES.has(callStatus.status)) { answered = true; break; }
              if (TERMINAL_STATES.has(callStatus.status)) {
                return json({ callId, to, error: `Call ended before answering: ${callStatus.status}` });
              }
            }
            if (!answered) {
              return json({ callId, to, error: "Timeout: call not answered within 30s" });
            }

            // Brief pause for Stasis init
            await new Promise<void>((r) => setTimeout(r, 500));

            const greeting = String(params.greeting || "Hello, how can I help you?").trim();

            // Enable conversation mode
            eventManager.enableConversationMode(callId);
            eventManager.setConversationState(callId, "LISTENING");

            // Speak greeting + start ASR in parallel
            await Promise.all([
              client.startAudioCapture(callId),
              client.speak(callId, greeting).catch(() => { /* non-fatal */ }),
            ]);

            api.logger.info(`[voice-call-freepbx] call_and_listen: listening on ${callId}`);

            // Block until utterance
            const LISTEN_TIMEOUT_MS = 5 * 60 * 1000;
            const utterance = await new Promise<string>((resolve, reject) => {
              const timer = setTimeout(() => {
                eventManager.rejectTranscriptionWaiter(callId, new Error("call_and_listen timed out after 5 minutes"));
              }, LISTEN_TIMEOUT_MS);
              eventManager.setTranscriptionWaiter(
                callId,
                (text) => { clearTimeout(timer); resolve(text); },
                (err)  => { clearTimeout(timer); reject(err); },
              );
            });

            try { await client.stopAudioCapture(callId); } catch { /* non-fatal */ }
            eventManager.setConversationState(callId, "IDLE");

            return json({ callId, to, endpoint, greeting, utterance, message: "User speech captured" });
          }

          case "call_and_talk": {
            // dial → wait for answer → speak message → optionally hang up
            // Cleaner than initiate_call for cases where message is always provided
            const to = String(params.to || "").trim();
            const message = String(params.message || "").trim();
            if (!to) throw new Error("to (phone number) required");
            if (!message) throw new Error("message required");

            let endpoint: string;
            if (config.outboundTrunk) {
              endpoint = config.outboundTrunk.replace("{number}", to);
            } else if (config.defaultEndpoint.includes("/")) {
              endpoint = `${config.defaultEndpoint}/${to}`;
            } else {
              endpoint = `PJSIP/${to}`;
            }

            const origResult = await client.originate(endpoint, config.fromNumber);
            const callId = origResult.callId;

            const MAX_WAIT_MS = 30_000;
            const POLL_MS = 500;
            const ANSWERED_STATES = new Set(["answered", "speaking", "playing", "ready"]);
            const TERMINAL_STATES = new Set(["ended", "failed", "hangup", "no-answer", "busy"]);
            const startTime = Date.now();
            let answered = false;

            while (Date.now() - startTime < MAX_WAIT_MS) {
              await new Promise<void>((r) => setTimeout(r, POLL_MS));
              let callStatus: { callId: string; status: string };
              try {
                callStatus = await client.getCall(callId);
              } catch {
                return json({ callId, to, error: "Call ended before answering" });
              }
              if (ANSWERED_STATES.has(callStatus.status)) { answered = true; break; }
              if (TERMINAL_STATES.has(callStatus.status)) {
                return json({ callId, to, error: `Call ended before answering: ${callStatus.status}` });
              }
            }
            if (!answered) {
              return json({ callId, to, error: "Timeout: call not answered within 30s" });
            }

            await new Promise<void>((r) => setTimeout(r, 500));

            const speakResult = await client.speak(callId, message);
            const mode = String(params.mode || "notify");

            if (mode === "notify") {
              await client.hangup(callId);
              return json({ callId, to, endpoint, messageSpoken: true, callEnded: true, durationSeconds: speakResult.durationSeconds });
            }

            return json({ callId, to, endpoint, messageSpoken: true, mode: "conversation", durationSeconds: speakResult.durationSeconds });
          }

          case "listen_and_respond": {
            // speak reply → start ASR → block until utterance → return
            // Saves 1 LLM hop per conversation turn vs: speak → LLM → start_listening
            const callId = String(params.callId || "").trim();
            const reply = String(params.reply || "").trim();
            if (!callId || !reply) throw new Error("callId and reply required");

            if (!eventManager.getCall(callId)) {
              return json({ error: `Call ${callId} not found in active calls` });
            }

            // Speak the reply first (blocks until playback done)
            await client.speak(callId, reply);

            // Add to conversation history
            const context = eventManager.getConversationContext(callId);
            context.history.push({ role: "assistant", content: reply, timestamp: new Date().toISOString() });

            // Enable listening
            eventManager.enableConversationMode(callId);
            eventManager.setConversationState(callId, "LISTENING");

            await client.startAudioCapture(callId);

            api.logger.info(`[voice-call-freepbx] listen_and_respond: listening on ${callId}`);

            const LISTEN_TIMEOUT_MS = 5 * 60 * 1000;
            const utterance = await new Promise<string>((resolve, reject) => {
              const timer = setTimeout(() => {
                eventManager.rejectTranscriptionWaiter(callId, new Error("listen_and_respond timed out after 5 minutes"));
              }, LISTEN_TIMEOUT_MS);
              eventManager.setTranscriptionWaiter(
                callId,
                (text) => { clearTimeout(timer); resolve(text); },
                (err)  => { clearTimeout(timer); reject(err); },
              );
            });

            try { await client.stopAudioCapture(callId); } catch { /* non-fatal */ }
            eventManager.setConversationState(callId, "IDLE");

            return json({ callId, reply, utterance, message: "User speech captured" });
          }

          default:
            throw new Error(`Unknown action: ${action}`);
        }
      } catch (err) {
        return json({
          error: err instanceof Error ? err.message : String(err),
        });
      }
    },
  });
}
