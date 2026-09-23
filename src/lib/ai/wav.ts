/**
 * Wraps raw 16-bit PCM (what Gemini's TTS returns) in a minimal WAV header so
 * a browser `<audio>` element can play it directly. Pure and framework-free —
 * no `wav`/`node-wav` dependency needed for a 44-byte RIFF header.
 */
export function pcmToWav(pcm: Buffer, sampleRate: number, channels = 1, bitsPerSample = 16): Buffer {
  const blockAlign = channels * (bitsPerSample / 8);
  const byteRate = sampleRate * blockAlign;
  const header = Buffer.alloc(44);
  header.write("RIFF", 0, "ascii");
  header.writeUInt32LE(36 + pcm.length, 4);
  header.write("WAVE", 8, "ascii");
  header.write("fmt ", 12, "ascii");
  header.writeUInt32LE(16, 16); // PCM fmt chunk size
  header.writeUInt16LE(1, 20); // audio format: 1 = PCM
  header.writeUInt16LE(channels, 22);
  header.writeUInt32LE(sampleRate, 24);
  header.writeUInt32LE(byteRate, 28);
  header.writeUInt16LE(blockAlign, 32);
  header.writeUInt16LE(bitsPerSample, 34);
  header.write("data", 36, "ascii");
  header.writeUInt32LE(pcm.length, 40);
  return Buffer.concat([header, pcm]);
}

/**
 * Gemini's inline audio mime type looks like `audio/l16; rate=24000; channels=1`
 * (field order/casing/spacing has varied by model in practice — parse defensively).
 */
export function parsePcmMimeType(mimeType: string | undefined): { sampleRate: number; channels: number } {
  const rate = mimeType?.match(/rate=(\d+)/i)?.[1];
  const channels = mimeType?.match(/channels=(\d+)/i)?.[1];
  return {
    sampleRate: rate ? Number(rate) : 24000,
    channels: channels ? Number(channels) : 1,
  };
}
