/**
 * TTS (Text-to-Speech) Integration
 * Handles conversion of text to speech audio files via TTS API
 *
 * @module tts
 */

export interface TTSOptions {
  /** TTS API base URL */
  baseUrl: string;

  /** Text to convert to speech */
  text: string;

  /** Voice to use (alloy, echo, fable, onyx, nova, shimmer, vivian, serena, etc.) */
  voice?: string;

  /** Response format (wav, mp3, etc.) */
  format?: string;
}

export interface TTSResult {
  /** Path to the generated audio file */
  audioPath: string;

  /** Size of the audio file in bytes */
  size: number;

  /** Duration estimate (if available) */
  duration?: number;
}

/**
 * Generate speech from text using TTS API
 */
export async function generateSpeech(options: TTSOptions): Promise<TTSResult> {
  const { baseUrl, text, voice = "alloy", format = "wav" } = options;

  const url = `${baseUrl}/v1/audio/speech`;

  const response = await fetch(url, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      input: text,
      voice,
      response_format: format,
    }),
  });

  if (!response.ok) {
    const errorText = await response.text().catch(() => "");
    throw new Error(
      `TTS API failed: ${response.status} ${response.statusText}${errorText ? ` — ${errorText}` : ""}`
    );
  }

  // Get audio bytes
  const audioBuffer = await response.arrayBuffer();
  const audioBytes = new Uint8Array(audioBuffer);

  // Generate temporary file path
  const timestamp = Date.now();
  const randomId = Math.random().toString(36).substring(2, 8);
  const audioPath = `/tmp/tts-${timestamp}-${randomId}.${format}`;

  // Write to file (Node.js environment)
  const fs = await import("fs/promises");
  await fs.writeFile(audioPath, audioBytes);

  return {
    audioPath,
    size: audioBytes.length,
  };
}

/**
 * Clean up temporary audio file
 */
export async function cleanupAudioFile(audioPath: string): Promise<void> {
  try {
    const fs = await import("fs/promises");
    await fs.unlink(audioPath);
  } catch (error) {
    // Ignore errors (file might already be deleted)
    console.warn(`Failed to cleanup audio file ${audioPath}:`, error);
  }
}
