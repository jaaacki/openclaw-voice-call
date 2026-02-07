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
}

export class VoiceCallEventManager {
  private client: AsteriskApiClient;
  private config: VoiceCallFreepbxConfig;
  private logger: EventManagerOptions["logger"];
  private onCallEvent?: (event: AsteriskEvent) => void;
  private activeCalls: Map<string, CallStatusResponse> = new Map();
  private isRunning = false;

  constructor(options: EventManagerOptions) {
    this.config = options.config;
    this.logger = options.logger;
    this.onCallEvent = options.onCallEvent;

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

    this.logger.debug?.(
      `[EventManager] Event: ${event.type}${callId ? ` (${callId})` : ""}`
    );

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
        }
        break;

      case "call.dtmf":
        this.logger.info(
          `[EventManager] DTMF: ${event.digit} on ${callId}`
        );
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
    }

    // Dispatch to external handler
    this.onCallEvent?.(event);
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
