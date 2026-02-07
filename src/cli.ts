/**
 * Voice Call CLI Commands
 * Registers CLI commands under the `voicecall` namespace using Commander.js
 *
 * @module cli
 */

import { AsteriskApiClient } from "./client.js";
import type { VoiceCallFreepbxConfig } from "./config.js";

type Logger = {
  info: (message: string) => void;
  warn: (message: string) => void;
  error: (message: string) => void;
};

export function registerVoiceCallCli(params: {
  program: any; // eslint-disable-line @typescript-eslint/no-explicit-any
  config: VoiceCallFreepbxConfig;
  logger: Logger;
}): void {
  const { program, config, logger } = params;

  const createClient = () =>
    new AsteriskApiClient({
      baseUrl: config.asteriskApiUrl,
      apiKey: config.asteriskApiKey,
    });

  const root = program
    .command("voicecall")
    .description("Voice call utilities for FreePBX/Asterisk");

  // -------------------------------------------------------------------------
  // voicecall call
  // -------------------------------------------------------------------------
  root
    .command("call")
    .description("Originate an outbound voice call")
    .requiredOption(
      "-m, --message <text>",
      "Message to speak when call connects",
    )
    .option(
      "-t, --to <endpoint>",
      "SIP endpoint to call (e.g. PJSIP/102); defaults to config defaultEndpoint",
    )
    .option(
      "--caller-id <id>",
      "Caller ID override (E.164); defaults to config fromNumber",
    )
    .action(
      async (options: {
        message: string;
        to?: string;
        callerId?: string;
      }) => {
        try {
          const client = createClient();
          const endpoint = options.to ?? config.defaultEndpoint;
          const callerId = options.callerId ?? config.fromNumber;

          const result = await client.originate(endpoint, callerId);
          // eslint-disable-next-line no-console
          console.log(
            JSON.stringify(
              {
                callId: result.callId,
                endpoint,
                callerId,
                message: options.message,
                status: result.status,
              },
              null,
              2,
            ),
          );
        } catch (err) {
          logger.error(
            `[voicecall call] ${err instanceof Error ? err.message : String(err)}`,
          );
          process.exitCode = 1;
        }
      },
    );

  // -------------------------------------------------------------------------
  // voicecall status
  // -------------------------------------------------------------------------
  root
    .command("status")
    .description("Get call status")
    .requiredOption("--call-id <id>", "Call ID to query")
    .action(async (options: { callId: string }) => {
      try {
        const client = createClient();
        const call = await client.getCall(options.callId);
        // eslint-disable-next-line no-console
        console.log(JSON.stringify(call, null, 2));
      } catch (err) {
        logger.error(
          `[voicecall status] ${err instanceof Error ? err.message : String(err)}`,
        );
        process.exitCode = 1;
      }
    });

  // -------------------------------------------------------------------------
  // voicecall end
  // -------------------------------------------------------------------------
  root
    .command("end")
    .description("Hang up an active call")
    .requiredOption("--call-id <id>", "Call ID to hang up")
    .action(async (options: { callId: string }) => {
      try {
        const client = createClient();
        const result = await client.hangup(options.callId);
        // eslint-disable-next-line no-console
        console.log(JSON.stringify(result, null, 2));
      } catch (err) {
        logger.error(
          `[voicecall end] ${err instanceof Error ? err.message : String(err)}`,
        );
        process.exitCode = 1;
      }
    });

  // -------------------------------------------------------------------------
  // voicecall speak
  // -------------------------------------------------------------------------
  root
    .command("speak")
    .description("Speak text into an active call via server-side TTS")
    .requiredOption("--call-id <id>", "Call ID")
    .requiredOption("--message <msg>", "Text to speak")
    .option("--voice <voice>", "TTS voice (vivian, serena, dylan, etc.)")
    .option("--language <lang>", "TTS language (default: English)")
    .action(async (options: { callId: string; message: string; voice?: string; language?: string }) => {
      try {
        const client = createClient();
        const result = await client.speak(options.callId, options.message, {
          voice: options.voice,
          language: options.language,
        });
        // eslint-disable-next-line no-console
        console.log(JSON.stringify(result, null, 2));
      } catch (err) {
        logger.error(
          `[voicecall speak] ${err instanceof Error ? err.message : String(err)}`,
        );
        process.exitCode = 1;
      }
    });

  // -------------------------------------------------------------------------
  // voicecall list
  // -------------------------------------------------------------------------
  root
    .command("list")
    .description("List all active calls")
    .action(async () => {
      try {
        const client = createClient();
        const result = await client.listCalls();
        // eslint-disable-next-line no-console
        console.log(JSON.stringify(result, null, 2));
      } catch (err) {
        logger.error(
          `[voicecall list] ${err instanceof Error ? err.message : String(err)}`,
        );
        process.exitCode = 1;
      }
    });

  // -------------------------------------------------------------------------
  // voicecall health
  // -------------------------------------------------------------------------
  root
    .command("health")
    .description("Check asterisk-api and ARI health")
    .action(async () => {
      try {
        const client = createClient();
        const result = await client.health();
        // eslint-disable-next-line no-console
        console.log(JSON.stringify(result, null, 2));
      } catch (err) {
        logger.error(
          `[voicecall health] ${err instanceof Error ? err.message : String(err)}`,
        );
        process.exitCode = 1;
      }
    });
}
