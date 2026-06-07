import { spawn } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import { readFile, writeFile, unlink } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import ffmpegPath from 'ffmpeg-static';

// Converte áudio gravado pelo browser (webm/opus do Chrome) para ogg/opus, o
// único container de voz que o WhatsApp renderiza como nota de voz (os outros
// formatos aceitos — aac/amr/mp3/mp4 — viram anexo). MediaRecorder do Chrome
// produz audio/webm;codecs=opus, que o Twilio→WhatsApp rejeita com 63021.
//
// Estratégia: tentamos um remux lossless (-c:a copy) primeiro, já que o opus
// dentro do webm pode ser só re-empacotado em ogg sem re-encode (rápido, sem
// perda). Se o input não permitir copy (ex.: codec ≠ opus), reencodamos com
// libopus. Usamos arquivos temporários em /tmp (gravável na Vercel) porque o
// muxer ogg precisa de saída "seekable", o que pipes (pipe:1) não garantem.
//
// Roda apenas em Node runtime (server action / route com runtime nodejs).
// ffmpeg-static fornece um binário estático compatível com o runtime
// Node/Fluid da Vercel.

type TranscodeResult =
  | { ok: true; data: Buffer }
  | { ok: false; error: string };

function runFfmpeg(args: string[]): Promise<{ code: number; stderr: string }> {
  return new Promise((resolve, reject) => {
    if (!ffmpegPath) {
      reject(new Error('ffmpeg binary não encontrado (ffmpeg-static).'));
      return;
    }
    const proc = spawn(ffmpegPath, args, { stdio: ['ignore', 'ignore', 'pipe'] });
    let stderr = '';
    proc.stderr.on('data', (d) => {
      // Limita o buffer de stderr pra não crescer indefinidamente.
      if (stderr.length < 8192) stderr += d.toString();
    });
    proc.on('error', reject);
    proc.on('close', (code) => resolve({ code: code ?? 1, stderr }));
  });
}

/**
 * Transcoda bytes de áudio (qualquer container suportado, tipicamente
 * webm/opus) para ogg/opus. Tenta remux lossless e, em caso de falha,
 * reencoda com libopus. Nunca lança por falha de conversão — devolve
 * {ok:false,error} pra que o chamador trate como erro de negócio.
 */
export async function transcodeToOggOpus(input: Buffer): Promise<TranscodeResult> {
  const id = randomUUID();
  const inPath = join(tmpdir(), `voice-${id}.in`);
  const outPath = join(tmpdir(), `voice-${id}.ogg`);

  const cleanup = async () => {
    await Promise.allSettled([unlink(inPath), unlink(outPath)]);
  };

  try {
    await writeFile(inPath, input);

    // Re-encode com libopus → ogg/opus LIMPO (OpusHead/OpusTags corretos,
    // granule positions próprias). Não usamos remux (-c:a copy): ele é aceito
    // no envio (✓✓) mas o player do WhatsApp marca "no longer available" ao
    // tocar, porque o framing herdado do webm não é um ogg/opus canônico.
    // Voz: 48 kHz, mono, 32 kbps, perfil voip (padrão de nota de voz).
    const enc = await runFfmpeg([
      '-hide_banner', '-loglevel', 'error', '-y',
      '-i', inPath,
      '-vn', '-map', '0:a:0',
      '-c:a', 'libopus', '-b:a', '32k', '-ar', '48000', '-ac', '1', '-application', 'voip',
      '-f', 'ogg',
      outPath,
    ]);
    if (enc.code !== 0) {
      return { ok: false, error: `ffmpeg falhou ao re-encodar: ${enc.stderr.trim()}` };
    }

    const data = await readFile(outPath);
    if (data.length === 0) {
      return { ok: false, error: 'ffmpeg gerou áudio vazio.' };
    }
    return { ok: true, data };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : String(e) };
  } finally {
    await cleanup();
  }
}
