/**
 * Asterisk-API REST Client
 * Wraps fetch calls to the asterisk-api bridge service endpoints
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
}
