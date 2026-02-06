/**
 * Voice Call Tool Registration
 * Registers the voice_call tool with OpenClaw for LLM agent use
 *
 * @module tool
 */

import { Type } from "@sinclair/typebox";

import type { OpenClawPluginApi } from "openclaw/plugin-sdk";

import { AsteriskApiClient } from "./client.js";
import type { VoiceCallFreepbxConfig } from "./config.js";

// ---------------------------------------------------------------------------
// Tool parameter schema (TypeBox union, same pattern as moltbot voice-call)
// ---------------------------------------------------------------------------

const VoiceCallToolSchema = Type.Union([
  Type.Object({
    action: Type.Literal("initiate_call"),
    message: Type.String({ description: "Intro message to speak when call connects" }),
    to: Type.Optional(
      Type.String({ description: "SIP endpoint override (e.g. PJSIP/102)" }),
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
]);

// ---------------------------------------------------------------------------
// Registration
// ---------------------------------------------------------------------------

export function registerVoiceCallTool(
  api: OpenClawPluginApi,
  config: VoiceCallFreepbxConfig,
): void {
  const client = new AsteriskApiClient({
    baseUrl: config.asteriskApiUrl,
    apiKey: config.asteriskApiKey,
  });

  api.registerTool({
    name: "voice_call",
    label: "Voice Call",
    description:
      "Make and control voice calls via FreePBX/Asterisk",
    parameters: VoiceCallToolSchema,
    async execute(_toolCallId: string, params: Record<string, unknown>) {
      const json = (payload: unknown) => ({
        content: [
          { type: "text" as const, text: JSON.stringify(payload, null, 2) },
        ],
        details: payload,
      });

      try {
        const action = params?.action as string | undefined;

        switch (action) {
          case "initiate_call": {
            const message = String(params.message || "").trim();
            if (!message) throw new Error("message required");

            const endpoint =
              typeof params.to === "string" && params.to.trim()
                ? params.to.trim()
                : config.defaultEndpoint;

            const result = await client.originate(
              endpoint,
              config.fromNumber,
            );

            api.logger.info(
              `[voice-call-freepbx] Call initiated to ${endpoint}: ${result.callId}`,
            );

            return json({
              callId: result.callId,
              endpoint,
              initiated: true,
              message,
              mode: params.mode ?? "notify",
            });
          }

          case "continue_call": {
            const callId = String(params.callId || "").trim();
            const message = String(params.message || "").trim();
            if (!callId || !message) {
              throw new Error("callId and message required");
            }

            // Placeholder: play a sound; full TTS pipeline comes later
            await client.playMedia(callId, "sound:hello-world");

            return json({ callId, success: true, message });
          }

          case "speak_to_user": {
            const callId = String(params.callId || "").trim();
            const message = String(params.message || "").trim();
            if (!callId || !message) {
              throw new Error("callId and message required");
            }

            // Placeholder: play a sound; real TTS integration comes later
            await client.playMedia(callId, "sound:hello-world");

            return json({ callId, success: true });
          }

          case "end_call": {
            const callId = String(params.callId || "").trim();
            if (!callId) throw new Error("callId required");

            await client.hangup(callId);

            return json({ callId, success: true });
          }

          case "get_status": {
            const callId = String(params.callId || "").trim();
            if (!callId) throw new Error("callId required");

            const call = await client.getCall(callId);

            return json({ found: true, call });
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
