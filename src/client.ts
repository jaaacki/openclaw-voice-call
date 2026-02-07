/**
 * Asterisk-API REST Client
 * Wraps fetch calls to the asterisk-api bridge service endpoints
 * Also provides WebSocket connection to /events for real-time updates
 *
 * @module client
 */

import type {
  HealthResponse,
  OriginateResponse,
  CallStatusResponse,
  ListCallsResponse,
  PlayMediaResponse,
  RecordingResponse,
  HangupResponse,
  DtmfResponse,
  AsteriskEvent,
  SnapshotEvent,
  EventConnectionOptions,
} from "./types.js";

export interface AsteriskApiClientOptions {
  /** Base URL of the asterisk-api service (e.g. "http://localhost:3456") */
  baseUrl: string;

  /** Optional API key for authentication */
  apiKey?: string;
}

export class AsteriskApiClient {
  private baseUrl: string;
  private apiKey?: string;
  private ws: WebSocket | null = null;
  private wsOptions: EventConnectionOptions | null = null;
  private reconnectTimer: ReturnType<typeof setTimeout> | null = null;
  private isClosing = false;

  constructor({ baseUrl, apiKey }: AsteriskApiClientOptions) {
    // Strip trailing slash
    this.baseUrl = baseUrl.replace(/\/+$/, "");
    this.apiKey = apiKey;
  }

  // -------------------------------------------------------------------------
  // Private helpers
  // -------------------------------------------------------------------------

  private headers(): Record<string, string> {
    const h: Record<string, string> = {
      "Content-Type": "application/json",
      Accept: "application/json",
    };
    if (this.apiKey) {
      h["Authorization"] = `Bearer ${this.apiKey}`;
    }
    return h;
  }

  private async request<T>(
    method: string,
    path: string,
    body?: unknown,
  ): Promise<T> {
    const url = `${this.baseUrl}${path}`;
    const init: RequestInit = {
      method,
      headers: this.headers(),
    };
    if (body !== undefined) {
      init.body = JSON.stringify(body);
    }

    const response = await fetch(url, init);

    if (!response.ok) {
      const text = await response.text().catch(() => "");
      throw new Error(
        `asterisk-api ${method} ${path} failed: ${response.status} ${response.statusText}${text ? ` — ${text}` : ""}`,
      );
    }

    return (await response.json()) as T;
  }

  // -------------------------------------------------------------------------
  // Public API methods
  // -------------------------------------------------------------------------

  /** GET /health — check asterisk-api and ARI connectivity */
  async health(): Promise<HealthResponse> {
    return this.request<HealthResponse>("GET", "/health");
  }

  /** POST /calls — originate a new call */
  async originate(
    endpoint: string,
    callerId: string,
    timeout?: number,
  ): Promise<OriginateResponse> {
    return this.request<OriginateResponse>("POST", "/calls", {
      endpoint,
      callerId,
      ...(timeout != null ? { timeout } : {}),
    });
  }

  /** GET /calls/:id — get current call status */
  async getCall(callId: string): Promise<CallStatusResponse> {
    return this.request<CallStatusResponse>(
      "GET",
      `/calls/${encodeURIComponent(callId)}`,
    );
  }

  /** GET /calls — list all active calls */
  async listCalls(): Promise<ListCallsResponse> {
    return this.request<ListCallsResponse>("GET", "/calls");
  }

  /** POST /calls/:id/play — play media into a call */
  async playMedia(
    callId: string,
    media: string,
  ): Promise<PlayMediaResponse> {
    return this.request<PlayMediaResponse>(
      "POST",
      `/calls/${encodeURIComponent(callId)}/play`,
      { media },
    );
  }

  /** POST /calls/:id/record — start recording a call */
  async startRecording(
    callId: string,
    opts?: { format?: string; maxDuration?: number; beep?: boolean },
  ): Promise<RecordingResponse> {
    return this.request<RecordingResponse>(
      "POST",
      `/calls/${encodeURIComponent(callId)}/record`,
      opts ?? {},
    );
  }

  /** POST /calls/:id/audio/start — start live audio capture + ASR pipeline */
  async startAudioCapture(callId: string): Promise<unknown> {
    return this.request<unknown>(
      "POST",
      `/calls/${encodeURIComponent(callId)}/audio/start`,
    );
  }

  /** POST /calls/:id/audio/stop — stop audio capture + ASR session */
  async stopAudioCapture(callId: string): Promise<void> {
    await this.request<unknown>(
      "POST",
      `/calls/${encodeURIComponent(callId)}/audio/stop`,
    );
  }

  /** DELETE /calls/:id — hang up a call */
  async hangup(callId: string): Promise<HangupResponse> {
    return this.request<HangupResponse>(
      "DELETE",
      `/calls/${encodeURIComponent(callId)}`,
    );
  }

  /** POST /calls/:id/dtmf — send DTMF tones */
  async sendDtmf(callId: string, dtmf: string): Promise<DtmfResponse> {
    return this.request<DtmfResponse>(
      "POST",
      `/calls/${encodeURIComponent(callId)}/dtmf`,
      { dtmf },
    );
  }

  // -------------------------------------------------------------------------
  // WebSocket event connection
  // -------------------------------------------------------------------------

  /**
   * Get the WebSocket URL for events
   */
  private getWsUrl(): string {
    // Convert http(s) to ws(s)
    const wsUrl = this.baseUrl.replace(/^http/, "ws");
    return `${wsUrl}/events`;
  }

  /**
   * Connect to the asterisk-api WebSocket event stream
   * Receives real-time call events and an initial snapshot of active calls
   */
  connectEvents(options: EventConnectionOptions = {}): void {
    if (this.ws) {
      console.warn("[AsteriskApiClient] Already connected to events, disconnecting first");
      this.disconnectEvents();
    }

    this.wsOptions = options;
    this.isClosing = false;

    const wsUrl = this.getWsUrl();
    console.log(`[AsteriskApiClient] Connecting to ${wsUrl}`);

    this.ws = new WebSocket(wsUrl);

    this.ws.onopen = () => {
      console.log("[AsteriskApiClient] WebSocket connected");
      options.onConnect?.();
    };

    this.ws.onmessage = (event) => {
      try {
        const data = JSON.parse(event.data as string);

        if (data.type === "snapshot") {
          options.onSnapshot?.(data as SnapshotEvent);
        } else {
          options.onEvent?.(data as AsteriskEvent);
        }
      } catch (err) {
        console.error("[AsteriskApiClient] Failed to parse event:", err);
      }
    };

    this.ws.onerror = (event) => {
      console.error("[AsteriskApiClient] WebSocket error:", event);
      options.onError?.(new Error("WebSocket error"));
    };

    this.ws.onclose = (event) => {
      console.log(
        `[AsteriskApiClient] WebSocket closed: ${event.code} ${event.reason}`
      );
      options.onDisconnect?.(event.code, event.reason);

      this.ws = null;

      // Auto-reconnect unless intentionally closed
      if (!this.isClosing && (options.autoReconnect ?? true)) {
        const delay = options.reconnectDelay ?? 3000;
        console.log(`[AsteriskApiClient] Reconnecting in ${delay}ms...`);
        this.reconnectTimer = setTimeout(() => {
          this.connectEvents(options);
        }, delay);
      }
    };
  }

  /**
   * Disconnect from the WebSocket event stream
   */
  disconnectEvents(): void {
    this.isClosing = true;

    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
    }

    if (this.ws) {
      this.ws.close(1000, "Client disconnect");
      this.ws = null;
    }

    this.wsOptions = null;
  }

  /**
   * Check if WebSocket is connected
   */
  isEventsConnected(): boolean {
    return this.ws?.readyState === WebSocket.OPEN;
  }
}
