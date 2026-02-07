/**
 * Gateway RPC Methods
 * Registers voicecall.* RPC methods via api.registerGatewayMethod
 *
 * @module rpc
 */

import type { OpenClawPluginApi } from "openclaw/plugin-sdk";

import { AsteriskApiClient } from "./client.js";
import type { VoiceCallFreepbxConfig } from "./config.js";

export function registerVoiceCallRpc(
  api: OpenClawPluginApi,
  config: VoiceCallFreepbxConfig,
): void {
  const client = new AsteriskApiClient({
    baseUrl: config.asteriskApiUrl,
    apiKey: config.asteriskApiKey,
  });

  const sendError = (
    respond: (ok: boolean, payload?: unknown) => void,
    err: unknown,
  ) => {
    respond(false, { error: err instanceof Error ? err.message : String(err) });
  };

  // ---------------------------------------------------------------------------
  // voicecall.initiate
  // ---------------------------------------------------------------------------
  api.registerGatewayMethod(
    "voicecall.initiate",
    async ({ params, respond }) => {
      try {
        const message =
          typeof params?.message === "string" ? params.message.trim() : "";
        if (!message) {
          respond(false, { error: "message required" });
          return;
        }

        const endpoint =
          typeof params?.to === "string" && params.to.trim()
            ? params.to.trim()
            : config.defaultEndpoint;

        const mode =
          params?.mode === "notify" || params?.mode === "conversation"
            ? params.mode
            : "notify";

        const result = await client.originate(endpoint, config.fromNumber);

        api.logger.info(
          `[voice-call-freepbx] RPC voicecall.initiate — endpoint=${endpoint} callId=${result.callId}`,
        );

        respond(true, {
          callId: result.callId,
          endpoint,
          initiated: true,
          message,
          mode,
        });
      } catch (err) {
        sendError(respond, err);
      }
    },
  );

  // ---------------------------------------------------------------------------
  // voicecall.continue
  // ---------------------------------------------------------------------------
  api.registerGatewayMethod(
    "voicecall.continue",
    async ({ params, respond }) => {
      try {
        const callId =
          typeof params?.callId === "string" ? params.callId.trim() : "";
        const message =
          typeof params?.message === "string" ? params.message.trim() : "";

        if (!callId || !message) {
          respond(false, { error: "callId and message required" });
          return;
        }

        const voice =
          typeof params?.voice === "string" ? params.voice.trim() : undefined;

        const result = await client.speak(callId, message, { voice });

        respond(true, { callId, success: true, message, ...result });
      } catch (err) {
        sendError(respond, err);
      }
    },
  );

  // ---------------------------------------------------------------------------
  // voicecall.speak
  // ---------------------------------------------------------------------------
  api.registerGatewayMethod(
    "voicecall.speak",
    async ({ params, respond }) => {
      try {
        const callId =
          typeof params?.callId === "string" ? params.callId.trim() : "";
        const message =
          typeof params?.message === "string" ? params.message.trim() : "";

        if (!callId || !message) {
          respond(false, { error: "callId and message required" });
          return;
        }

        const voice =
          typeof params?.voice === "string" ? params.voice.trim() : undefined;

        const result = await client.speak(callId, message, { voice });

        respond(true, { callId, success: true, ...result });
      } catch (err) {
        sendError(respond, err);
      }
    },
  );

  // ---------------------------------------------------------------------------
  // voicecall.end
  // ---------------------------------------------------------------------------
  api.registerGatewayMethod(
    "voicecall.end",
    async ({ params, respond }) => {
      try {
        const callId =
          typeof params?.callId === "string" ? params.callId.trim() : "";

        if (!callId) {
          respond(false, { error: "callId required" });
          return;
        }

        await client.hangup(callId);

        respond(true, { callId, success: true });
      } catch (err) {
        sendError(respond, err);
      }
    },
  );

  // ---------------------------------------------------------------------------
  // voicecall.status
  // ---------------------------------------------------------------------------
  api.registerGatewayMethod(
    "voicecall.status",
    async ({ params, respond }) => {
      try {
        const callId =
          typeof params?.callId === "string" ? params.callId.trim() : "";

        if (!callId) {
          respond(false, { error: "callId required" });
          return;
        }

        const call = await client.getCall(callId);

        respond(true, { found: true, call });
      } catch (err) {
        sendError(respond, err);
      }
    },
  );
}
