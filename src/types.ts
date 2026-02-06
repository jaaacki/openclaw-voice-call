/**
 * Voice Call FreePBX Plugin Types
 * Type definitions for call records, events, and API responses
 *
 * @module types
 */

// ---------------------------------------------------------------------------
// Call state
// ---------------------------------------------------------------------------

export type CallStatus =
  | "initiated"
  | "ringing"
  | "answered"
  | "busy"
  | "no-answer"
  | "failed"
  | "hangup";

export type CallDirection = "outbound" | "inbound";

export interface CallRecord {
  /** Unique call identifier returned by asterisk-api */
  callId: string;

  /** SIP endpoint (e.g. "PJSIP/101") */
  endpoint: string;

  /** Caller ID sent with the call */
  callerId: string;

  /** Current call status */
  status: CallStatus;

  /** Call direction */
  direction: CallDirection;

  /** ISO-8601 timestamp when the call was created */
  createdAt: string;

  /** ISO-8601 timestamp of the last status update */
  updatedAt: string;

  /** Asterisk channel identifier (if available) */
  channelId?: string;
}

// ---------------------------------------------------------------------------
// Asterisk-API REST responses
// ---------------------------------------------------------------------------

export interface HealthResponse {
  status: string;
  uptime?: number;
  ari?: { connected: boolean };
}

export interface OriginateResponse {
  callId: string;
  channel: string;
  status: string;
}

export interface CallStatusResponse {
  callId: string;
  status: string;
  channel?: string;
  duration?: number;
  caller?: string;
  callee?: string;
}

export interface PlayMediaResponse {
  playbackId: string;
  status: string;
}

export interface RecordingResponse {
  recordingId: string;
  status: string;
  format?: string;
}

export interface HangupResponse {
  callId: string;
  status: string;
}

export interface DtmfResponse {
  callId: string;
  digits: string;
  status: string;
}

export interface ListCallsResponse {
  calls: CallStatusResponse[];
}

// ---------------------------------------------------------------------------
// WebSocket events from asterisk-api /events
// ---------------------------------------------------------------------------

export type AsteriskEventType =
  | "call.started"
  | "call.ringing"
  | "call.answered"
  | "call.ended"
  | "call.dtmf"
  | "playback.started"
  | "playback.finished"
  | "recording.started"
  | "recording.finished";

export interface AsteriskEvent {
  type: AsteriskEventType;
  callId: string;
  timestamp: string;
  data?: Record<string, unknown>;
}
