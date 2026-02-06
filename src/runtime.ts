/**
 * Runtime dependency injection for Voice Call FreePBX plugin
 * Allows the plugin to access OpenClaw runtime services
 *
 * @module runtime
 */

import type { PluginRuntime } from "openclaw/plugin-sdk";

let runtime: PluginRuntime | null = null;

export function setVoiceCallRuntime(rt: PluginRuntime): void {
  runtime = rt;
}

export function getVoiceCallRuntime(): PluginRuntime {
  if (!runtime) {
    throw new Error(
      "VoiceCall runtime not initialized. Did you call register()?",
    );
  }
  return runtime;
}
