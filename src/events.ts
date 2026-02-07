/**
 * Voice Call Event Manager
 * Manages WebSocket connection to asterisk-api and dispatches events
 *
 * @module events
 */

import { AsteriskApiClient } from "./client.js";
import type {
  AsteriskEvent,
  SnapshotEvent,
  CallStatusResponse,
  TranscriptionEvent,
  ConversationContext,
  ConversationState,
} from "./types.js";
import type { VoiceCallFreepbxConfig } from "./config.js";

export interface EventManagerOptions {
  config: VoiceCallFreepbxConfig;
  logger: {
    info: (msg: string) => void;
    warn: (msg: string) => void;
    error: (msg: string) => void;
    debug?: (msg: string) => void;
  };
  onCallEvent?: (event: AsteriskEvent) => void;
  onTranscriptionFinal?: (callId: string, text: string, context: ConversationContext) => Promise<void>;
}

export class VoiceCallEventManager {
  private client: AsteriskApiClient;
  private config: VoiceCallFreepbxConfig;
  private logger: EventManagerOptions["logger"];
  private onCallEvent?: (event: AsteriskEvent) => void;
  private onTranscriptionFinal?: (callId: string, text: string, context: ConversationContext) => Promise<void>;
  private activeCalls: Map<string, CallStatusResponse> = new Map();
  private conversationContexts: Map<string, ConversationContext> = new Map();
  private isRunning = false;

  constructor(options: EventManagerOptions) {
    this.config = options.config;
    this.logger = options.logger;
    this.onCallEvent = options.onCallEvent;
    this.onTranscriptionFinal = options.onTranscriptionFinal;

    this.client = new AsteriskApiClient({
      baseUrl: options.config.asteriskApiUrl,
      apiKey: options.config.asteriskApiKey,
    });
  }

  /**
   * Start the event manager — connects to WebSocket
   */
  start(): void {
    if (this.isRunning) {
      this.logger.warn("[EventManager] Already running");
      return;
    }

    this.isRunning = true;
    this.logger.info(
      `[EventManager] Starting — connecting to ${this.config.asteriskApiUrl}`
    );

    this.client.connectEvents({
      autoReconnect: true,
      reconnectDelay: 3000,

      onConnect: () => {
        this.logger.info("[EventManager] Connected to asterisk-api events");
      },

      onDisconnect: (code, reason) => {
        this.logger.warn(
          `[EventManager] Disconnected: ${code} ${reason}`
        );
      },

      onError: (error) => {
        this.logger.error(`[EventManager] Error: ${error.message}`);
      },

      onSnapshot: (snapshot: SnapshotEvent) => {
        this.handleSnapshot(snapshot);
      },

      onEvent: (event: AsteriskEvent) => {
        this.handleEvent(event);
      },
    });
  }

  /**
   * Stop the event manager — disconnects WebSocket
   */
  stop(): void {
    if (!this.isRunning) return;

    this.logger.info("[EventManager] Stopping");
    this.client.disconnectEvents();
    this.isRunning = false;
    this.activeCalls.clear();
  }

  /**
   * Check if connected
   */
  isConnected(): boolean {
    return this.client.isEventsConnected();
  }

  /**
   * Get list of active calls
   */
  getActiveCalls(): CallStatusResponse[] {
    return Array.from(this.activeCalls.values());
  }

  /**
   * Get a specific call by ID
   */
  getCall(callId: string): CallStatusResponse | undefined {
    return this.activeCalls.get(callId);
  }

  /**
   * Get the underlying client for making API calls
   */
  getClient(): AsteriskApiClient {
    return this.client;
  }

  // -------------------------------------------------------------------------
  // Conversation state management
  // -------------------------------------------------------------------------

  /**
   * Get conversation context for a call (creates if not exists)
   */
  getConversationContext(callId: string): ConversationContext {
    let context = this.conversationContexts.get(callId);
    if (!context) {
      context = {
        state: "IDLE",
        partialText: "",
        history: [],
        lastStateChange: new Date().toISOString(),
        conversationMode: false,
      };
      this.conversationContexts.set(callId, context);
    }
    return context;
  }

  /**
   * Update conversation state
   */
  setConversationState(callId: string, state: ConversationState): void {
    const context = this.getConversationContext(callId);
    context.state = state;
    context.lastStateChange = new Date().toISOString();
    this.conversationContexts.set(callId, context);
    this.logger.debug?.(`[EventManager] Call ${callId} state: ${state}`);
  }

  /**
   * Enable conversation mode for a call
   */
  enableConversationMode(callId: string): void {
    const context = this.getConversationContext(callId);
    context.conversationMode = true;
    this.conversationContexts.set(callId, context);
    this.logger.info(`[EventManager] Conversation mode enabled for ${callId}`);
  }

  /**
   * Clean up conversation context when call ends
   */
  private cleanupConversation(callId: string): void {
    const context = this.conversationContexts.get(callId);
    if (context) {
      this.clearUtteranceTimer(context);
    }
    this.conversationContexts.delete(callId);
    this.logger.debug?.(`[EventManager] Cleaned up conversation context for ${callId}`);
  }

  // -------------------------------------------------------------------------
  // Event handlers
  // -------------------------------------------------------------------------

  private handleSnapshot(snapshot: SnapshotEvent): void {
    this.logger.info(
      `[EventManager] Snapshot received: ${snapshot.calls?.length ?? 0} active calls`
    );

    this.activeCalls.clear();
    for (const call of snapshot.calls ?? []) {
      if (call.callId) {
        this.activeCalls.set(call.callId, call);
      }
    }
  }

  private handleEvent(event: AsteriskEvent): void {
    const callId = event.callId;

    // Skip debug log for high-frequency audio frame events
    if (event.type !== "call.audio_frame") {
      this.logger.debug?.(
        `[EventManager] Event: ${event.type}${callId ? ` (${callId})` : ""}`
      );
    }

    switch (event.type) {
      case "call.created":
      case "call.ready":
      case "call.inbound":
        if (callId) {
          this.activeCalls.set(callId, {
            callId,
            status: event.state as string ?? "active",
            channel: event.channelId as string,
            caller: event.callerNumber as string,
            callee: event.calleeNumber as string,
          });
        }
        break;

      case "call.state_changed":
      case "call.answered":
        if (callId) {
          const existing = this.activeCalls.get(callId);
          if (existing) {
            existing.status = event.state as string ?? existing.status;
            this.activeCalls.set(callId, existing);
          }
        }
        break;

      case "call.ended":
        if (callId) {
          this.activeCalls.delete(callId);
          this.cleanupConversation(callId);
        }
        break;

      case "call.transcription":
        if (callId) {
          void this.handleTranscription(event as TranscriptionEvent);
        }
        break;

      case "call.dtmf":
        this.logger.info(
          `[EventManager] DTMF: ${event.digit} on ${callId}`
        );
        break;

      case "call.speak_started":
        if (callId) {
          this.setConversationState(callId, "SPEAKING");
          this.logger.info(`[EventManager] TTS started on ${callId}`);
        }
        break;

      case "call.speak_finished":
        if (callId) {
          const ctx = this.getConversationContext(callId);
          this.setConversationState(callId, ctx.conversationMode ? "LISTENING" : "IDLE");
          this.logger.info(
            `[EventManager] TTS finished on ${callId} (${(event.durationSeconds as number)?.toFixed(1) ?? "?"}s)`
          );
        }
        break;

      case "call.speak_error":
        if (callId) {
          this.logger.error(`[EventManager] TTS error on ${callId}: ${event.error}`);
          const ctx = this.getConversationContext(callId);
          this.setConversationState(callId, ctx.conversationMode ? "LISTENING" : "IDLE");
        }
        break;

      case "call.playback_stream_started":
        this.logger.debug?.(
          `[EventManager] Audio stream started on ${callId}`
        );
        break;

      case "call.playback_stream_finished":
        this.logger.debug?.(
          `[EventManager] Audio stream finished on ${callId}`
        );
        break;

      case "call.playback_stream_error":
        if (callId) {
          this.logger.error(`[EventManager] Audio stream error on ${callId}: ${event.error}`);
        }
        break;

      case "call.playback_finished":
        this.logger.debug?.(
          `[EventManager] Playback finished on ${callId}`
        );
        break;

      case "call.recording_finished":
        this.logger.debug?.(
          `[EventManager] Recording finished on ${callId}`
        );
        break;

      case "call.audio_capture_started":
        this.logger.info(`[EventManager] Audio capture started on ${callId}`);
        break;

      case "call.audio_capture_stopped":
        this.logger.info(`[EventManager] Audio capture stopped on ${callId}`);
        break;

      case "call.audio_capture_error":
        if (callId) {
          this.logger.error(`[EventManager] Audio capture error on ${callId}: ${event.error}`);
        }
        break;

      case "call.audio_frame":
        // Silently ignore high-frequency audio frames to avoid log spam
        break;
    }

    // Dispatch to external handler
    this.onCallEvent?.(event);
  }

  /** Silence duration (ms) after last partial before treating as complete utterance */
  private static readonly UTTERANCE_SILENCE_MS = 1500;

  /**
   * Handle transcription events with debounce-based utterance detection.
   *
   * asterisk-api contract:
   * - is_partial: true → real-time speech segments during the call
   * - is_final: true   → flush at call end only (not after each utterance)
   *
   * Since is_final never fires mid-conversation, we detect end-of-utterance
   * by debouncing: when no new non-empty partials arrive for UTTERANCE_SILENCE_MS,
   * treat the buffered text as a complete utterance.
   */
  private async handleTranscription(event: TranscriptionEvent): Promise<void> {
    const { callId } = event;
    // asterisk-api nests transcription fields inside event.data
    const data = (event as unknown as { data?: { text?: string; is_final?: boolean; is_partial?: boolean } }).data;
    const text = data?.text ?? event.text ?? "";
    const is_final = data?.is_final ?? event.is_final ?? false;

    const context = this.getConversationContext(callId);

    // Don't process transcriptions while speaking
    if (context.state === "SPEAKING") {
      this.logger.debug?.(`[EventManager] Ignoring transcription during SPEAKING state for ${callId}`);
      return;
    }

    if (is_final) {
      // is_final fires only at call end (flush). Process any remaining buffer.
      this.clearUtteranceTimer(context);
      const finalText = text || context.partialText;
      context.partialText = "";
      if (finalText.trim()) {
        this.logger.info(`[EventManager] End-of-call transcription for ${callId}: ${finalText}`);
        await this.processUtterance(callId, finalText, context);
      }
      return;
    }

    // Partial transcription — buffer non-empty text and reset debounce timer
    if (text.trim()) {
      context.partialText = text;
      this.logger.debug?.(`[EventManager] Partial: ${callId}: ${text.substring(0, 80)}`);

      // Reset the utterance debounce timer
      this.clearUtteranceTimer(context);
      context.utteranceTimer = setTimeout(() => {
        const utterance = context.partialText;
        context.partialText = "";
        context.utteranceTimer = undefined;
        if (utterance.trim()) {
          this.logger.info(`[EventManager] Utterance complete for ${callId}: ${utterance}`);
          void this.processUtterance(callId, utterance, context);
        }
      }, VoiceCallEventManager.UTTERANCE_SILENCE_MS);
    }
  }

  /**
   * Process a complete utterance — add to history and trigger agent callback
   */
  private async processUtterance(callId: string, text: string, context: ConversationContext): Promise<void> {
    // Add to conversation history
    context.history.push({
      role: "user",
      content: text,
      timestamp: new Date().toISOString(),
    });

    // Transition to PROCESSING state
    this.setConversationState(callId, "PROCESSING");

    // Trigger agent processing callback
    if (this.onTranscriptionFinal) {
      try {
        await this.onTranscriptionFinal(callId, text, context);
      } catch (error) {
        this.logger.error(
          `[EventManager] Error processing transcription for ${callId}: ${error instanceof Error ? error.message : String(error)}`
        );
        // Reset to LISTENING on error
        this.setConversationState(callId, "LISTENING");
      }
    }
  }

  /**
   * Clear the utterance debounce timer
   */
  private clearUtteranceTimer(context: ConversationContext): void {
    if (context.utteranceTimer) {
      clearTimeout(context.utteranceTimer);
      context.utteranceTimer = undefined;
    }
  }
}

// ---------------------------------------------------------------------------
// Singleton instance for plugin-wide use
// ---------------------------------------------------------------------------

let eventManagerInstance: VoiceCallEventManager | null = null;

export function initEventManager(options: EventManagerOptions): VoiceCallEventManager {
  if (eventManagerInstance) {
    eventManagerInstance.stop();
  }
  eventManagerInstance = new VoiceCallEventManager(options);
  return eventManagerInstance;
}

export function getEventManager(): VoiceCallEventManager | null {
  return eventManagerInstance;
}

export function stopEventManager(): void {
  eventManagerInstance?.stop();
  eventManagerInstance = null;
}
