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
    });

    // Start WebSocket connection to asterisk-api
    eventManager.start();

    // Register voice_call tool for LLM agent use
    registerVoiceCallTool(api, config);

    // Register CLI commands under `voicecall` namespace
    api.registerCli(
      ({ program }) =>
        registerVoiceCallCli({ program, config, logger: api.logger }),
      { commands: ["voicecall"] },
    );

    // Register Gateway RPC methods (voicecall.*)
    registerVoiceCallRpc(api, config);

    // Handle plugin unload (cleanup)
    api.onUnload?.(() => {
      api.logger.info("[voice-call-freepbx] Unloading — stopping event manager");
      stopEventManager();
    });

    api.logger.info(
      `[voice-call-freepbx] Plugin registered — asterisk-api at ${config.asteriskApiUrl} (WebSocket connected)`,
    );
  },
};

export default plugin;
