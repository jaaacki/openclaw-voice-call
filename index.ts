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

    // Register voice_call tool for LLM agent use
    registerVoiceCallTool(api, config);

    api.logger.info(
      `[voice-call-freepbx] Plugin registered — asterisk-api at ${config.asteriskApiUrl}`,
    );
  },
};

export default plugin;
