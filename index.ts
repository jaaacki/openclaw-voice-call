/**
 * Voice Call FreePBX/Asterisk Plugin - Entry Point
 * Registers the plugin with OpenClaw
 *
 * @module openclaw-voice-call
 */

import type { OpenClawPluginApi } from "openclaw/plugin-sdk";

import {
  VoiceCallFreepbxConfigSchema,
  type VoiceCallFreepbxConfig,
} from "./src/config.js";
import { setVoiceCallRuntime } from "./src/runtime.js";
import { registerVoiceCallTool } from "./src/tool.js";
import { registerVoiceCallCli } from "./src/cli.js";
import { registerVoiceCallRpc } from "./src/rpc.js";
import { initEventManager, stopEventManager } from "./src/events.js";

const voiceCallConfigSchema = {
  parse(value: unknown): VoiceCallFreepbxConfig {
    const raw =
      value && typeof value === "object" && !Array.isArray(value)
        ? (value as Record<string, unknown>)
        : {};
    return VoiceCallFreepbxConfigSchema.parse(raw);
  },
};

const plugin = {
  id: "voice-call-freepbx",
  name: "Voice Call (FreePBX/Asterisk)",
  description:
    "Voice calling via Asterisk/FreePBX using ARI and the asterisk-api bridge",
  configSchema: voiceCallConfigSchema,
  register(api: OpenClawPluginApi) {
    setVoiceCallRuntime(api.runtime);

    const config = voiceCallConfigSchema.parse(api.pluginConfig);

    // Initialize event manager for real-time call events
    const eventManager = initEventManager({
      config,
      logger: api.logger,
      onCallEvent: (event) => {
        // Log significant events
        if (event.type === "call.created" || event.type === "call.ended") {
          api.logger.info(
            `[voice-call-freepbx] ${event.type}: ${event.callId ?? "unknown"}`
          );
        }
      },
      onCallEnded: (callId, context) => {
        const turns = context.history.length;
        api.logger.info(
          `[voice-call-freepbx] Call ended: ${callId} — ${turns} conversation turns, last state: ${context.state}`,
        );
        if (turns > 0) {
          api.logger.info(
            `[voice-call-freepbx] Conversation history for ${callId}: ${JSON.stringify(context.history)}`,
          );
        }
      },
      onTranscriptionFinal: async (callId, text, context) => {
        // Handle final transcription - invoke agent to get response
        api.logger.info(
          `[voice-call-freepbx] Processing transcription for ${callId}: ${text}`
        );

        try {
          // TODO: Invoke OpenClaw agent to get response
          // For now, use a simple echo response for testing
          const agentResponse = `I heard you say: ${text}`;

          // Add assistant message to history
          context.history.push({
            role: "assistant",
            content: agentResponse,
            timestamp: new Date().toISOString(),
          });

          // Server-side TTS — speak() blocks until playback finishes
          // State transitions handled by call.speak_started/finished events
          const client = eventManager.getClient();
          await client.speak(callId, agentResponse);

          api.logger.info(
            `[voice-call-freepbx] Spoke response to ${callId}: ${agentResponse.substring(0, 50)}...`
          );
        } catch (error) {
          api.logger.error(
            `[voice-call-freepbx] Failed to process transcription for ${callId}: ${error instanceof Error ? error.message : String(error)}`
          );
          // Reset to LISTENING on error
          eventManager.setConversationState(callId, "LISTENING");
        }
      },
    });

    // Start WebSocket connection to asterisk-api
    eventManager.start();

    // Register voice_call tool for LLM agent use
    registerVoiceCallTool(api, config);

    // Register CLI commands under `voicecall` namespace
    api.registerCli(
      // @ts-ignore - commander version mismatch between plugin and openclaw peer dependency
      ({ program }) =>
        registerVoiceCallCli({ program, config, logger: api.logger }),
      { commands: ["voicecall"] },
    );

    // Register Gateway RPC methods (voicecall.*)
    registerVoiceCallRpc(api, config);

    api.logger.info(
      `[voice-call-freepbx] Plugin registered — asterisk-api at ${config.asteriskApiUrl} (WebSocket connected)`,
    );
  },
};

export default plugin;
