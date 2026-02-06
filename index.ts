// OpenClaw Voice Call Plugin for FreePBX/Asterisk
// This plugin connects OpenClaw to Asterisk via the asterisk-api bridge service.
//
// TODO: Implement following the openclaw-bitrix24 plugin patterns:
// - Plugin registration with configSchema
// - Voice call tool (initiate_call, continue_call, speak_to_user, end_call, get_status)
// - CLI commands (voicecall call, continue, speak, end, status, tail)
// - Gateway RPC methods (voicecall.initiate, voicecall.continue, etc.)
// - Webhook handler for asterisk-api callbacks
// - Call state tracking
// - TTS integration via api.runtime.tts.textToSpeechTelephony()

export default {
  id: "voice-call-freepbx",
  name: "Voice Call (FreePBX/Asterisk)",
  description: "Voice calling via Asterisk/FreePBX using ARI",
  configSchema: {},
  register(api: any) {
    console.log("[voice-call-freepbx] Plugin registered (stub)");
  },
};
