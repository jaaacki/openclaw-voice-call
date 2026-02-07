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
    to: Type.String({ description: "Phone number to call (e.g. 659654255)" }),
    message: Type.Optional(
      Type.String({ description: "Intro message to speak when call connects" }),
    ),
    mode: Type.Optional(
      Type.Union([Type.Literal("notify"), Type.Literal("conversation")]),
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
      "Make and control voice calls via FreePBX/Asterisk. Use initiate_call to call a phone number.",
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

            api.logger.info(
              `[voice-call-freepbx] Call initiated to ${to}: ${result.callId}`,
            );

            const message = String(params.message || "").trim();

            return json({
              callId: result.callId,
              to,
              endpoint,
              initiated: true,
              message: message || undefined,
              mode: params.mode ?? "notify",
              wsConnected: eventManager.isConnected(),
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

            // Placeholder: play a sound; full TTS pipeline comes later
            await client.playMedia(callId, "sound:hello-world");

            return json({ callId, success: true, message, callState: call.status });
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

            // Placeholder: play a sound; real TTS integration comes later
            await client.playMedia(callId, "sound:hello-world");

            return json({ callId, success: true, callState: call.status });
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
