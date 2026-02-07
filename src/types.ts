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
  | "snapshot"
  | "call.created"
  | "call.state_changed"
  | "call.ready"
  | "call.dtmf"
  | "call.playback_finished"
  | "call.recording_finished"
  | "call.ended"
  | "call.inbound"
  | "call.answered"
  | "call.transcription"
  | "bridge.created"
  | "bridge.destroyed";

export interface AsteriskEvent {
  type: AsteriskEventType;
  callId?: string;
  timestamp: string;
  [key: string]: unknown;
}

export interface SnapshotEvent {
  type: "snapshot";
  calls: CallStatusResponse[];
  timestamp: string;
}

export interface TranscriptionEvent extends AsteriskEvent {
  type: "call.transcription";
  callId: string;
  text: string;
  is_final: boolean;
  confidence?: number;
  timestamp: string;
}

// ---------------------------------------------------------------------------
// Conversation state management
// ---------------------------------------------------------------------------

export type ConversationState = "IDLE" | "LISTENING" | "PROCESSING" | "SPEAKING";

export interface ConversationContext {
  /** Current conversation state */
  state: ConversationState;

  /** Buffered partial transcription */
  partialText: string;

  /** Full conversation history */
  history: Array<{ role: "user" | "assistant"; content: string; timestamp: string }>;

  /** Timestamp of last state change */
  lastStateChange: string;

  /** Whether we're in conversation mode (vs one-shot notify) */
  conversationMode: boolean;
}

// ---------------------------------------------------------------------------
// WebSocket connection options
// ---------------------------------------------------------------------------

export interface EventConnectionOptions {
  /** Called when connection is established */
  onConnect?: () => void;

  /** Called when connection is closed */
  onDisconnect?: (code: number, reason: string) => void;

  /** Called on connection error */
  onError?: (error: Error) => void;

  /** Called when an event is received */
  onEvent?: (event: AsteriskEvent) => void;

  /** Called on initial snapshot */
  onSnapshot?: (snapshot: SnapshotEvent) => void;

  /** Auto-reconnect on disconnect (default: true) */
  autoReconnect?: boolean;

  /** Reconnect delay in ms (default: 3000) */
  reconnectDelay?: number;
}
