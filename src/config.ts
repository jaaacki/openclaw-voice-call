/**
 * Voice Call FreePBX plugin configuration schema and types
 *
 * @module config
 */

import { z } from "zod";

export const VoiceCallFreepbxConfigSchema = z.object({
  /** Base URL of the asterisk-api bridge service */
  asteriskApiUrl: z.string().url().default("http://localhost:3456"),

  /** Optional API key for authenticating with asterisk-api */
  asteriskApiKey: z.string().optional(),

  /** Outbound caller ID in E.164 format */
  fromNumber: z.string().regex(/^\+[1-9]\d{1,14}$/, "Must be E.164 format"),

  /** Default destination number in E.164 format */
  toNumber: z
    .string()
    .regex(/^\+[1-9]\d{1,14}$/, "Must be E.164 format")
    .optional(),

  /** Default SIP endpoint for originating calls (e.g. "PJSIP/101") */
  defaultEndpoint: z.string().default("PJSIP/101"),

  /**
   * Outbound trunk pattern for external calls.
   * Use {number} as placeholder for the phone number.
   * Examples:
   *   - "PJSIP/{number}@trunk-name" (most common)
   *   - "PJSIP/trunk-name/{number}"
   *   - "SIP/{number}@provider"
   */
  outboundTrunk: z.string().optional(),

  /** Inbound call policy */
  inboundPolicy: z.enum(["disabled", "allowlist"]).default("disabled"),

  /** List of allowed inbound caller IDs (used when inboundPolicy is "allowlist") */
  allowFrom: z.array(z.string()).default([]),

  /** Webhook server configuration for receiving asterisk-api callbacks */
  serve: z
    .object({
      port: z.number().int().min(1).max(65535).default(3457),
      path: z.string().default("/voice/webhook"),
    })
    .default({}),

  /** Public URL for webhook callbacks (if behind NAT/tunnel) */
  publicUrl: z.string().url().optional(),
});

export type VoiceCallFreepbxConfig = z.infer<
  typeof VoiceCallFreepbxConfigSchema
>;
