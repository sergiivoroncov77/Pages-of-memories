import { useCallback, useEffect, useRef, useState } from 'react';
import { baseMimeType } from '../../lib/mediaStore';

export type RecorderStatus = 'idle' | 'requesting' | 'recording' | 'paused' | 'stopping' | 'denied' | 'unsupported' | 'error';

export interface Recording {
  blob: Blob;
  mimeType: string;
  durationSeconds: number;
}

const LEVEL_HISTORY = 24;
const PREFERRED_TYPES = ['audio/webm;codecs=opus', 'audio/webm', 'audio/mp4', 'audio/ogg;codecs=opus'];

export function pickRecordingMimeType(isTypeSupported: (type: string) => boolean): string {
  return PREFERRED_TYPES.find((type) => {
    try { return isTypeSupported(type); } catch { return false; }
  }) ?? '';
}

export function recorderErrorStatus(error: unknown): { status: RecorderStatus; message: string } {
  const name = error instanceof Error || error instanceof DOMException ? error.name : '';
  if (name === 'NotAllowedError' || name === 'SecurityError' || name === 'PermissionDeniedError') {
    return { status: 'denied', message: 'Доступ к микрофону запрещён. Разрешите его в настройках браузера для этого сайта и попробуйте снова.' };
  }
  if (name === 'NotFoundError' || name === 'OverconstrainedError' || name === 'DevicesNotFoundError') {
    return { status: 'error', message: 'Микрофон не найден. Подключите микрофон или гарнитуру и попробуйте снова.' };
  }
  if (name === 'NotReadableError' || name === 'TrackStartError') {
    return { status: 'error', message: 'Микрофон занят другим приложением. Закройте его и попробуйте снова.' };
  }
  return { status: 'error', message: 'Не удалось начать запись. Попробуйте ещё раз или напишите ответ текстом.' };
}

function recordingSupported(): boolean {
  return typeof window !== 'undefined' && typeof window.MediaRecorder === 'function'
    && typeof navigator !== 'undefined' && typeof navigator.mediaDevices?.getUserMedia === 'function';
}

/** Microphone capture with real pause/resume and a live input level for the meter. */
export function useAudioRecorder() {
  const [status, setStatus] = useState<RecorderStatus>('idle');
  const [message, setMessage] = useState('');
  const [elapsed, setElapsed] = useState(0);
  const [levels, setLevels] = useState<number[]>(() => Array(LEVEL_HISTORY).fill(0));
  const recorderRef = useRef<MediaRecorder | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const audioContextRef = useRef<AudioContext | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const frameRef = useRef<number | undefined>(undefined);
  const activeSinceRef = useRef<number | null>(null);
  const accumulatedRef = useRef(0);

  const activeMs = useCallback(
    () => accumulatedRef.current + (activeSinceRef.current === null ? 0 : performance.now() - activeSinceRef.current),
    []
  );

  const release = useCallback(() => {
    if (frameRef.current !== undefined) cancelAnimationFrame(frameRef.current);
    frameRef.current = undefined;
    streamRef.current?.getTracks().forEach((track) => track.stop());
    streamRef.current = null;
    void audioContextRef.current?.close().catch(() => undefined);
    audioContextRef.current = null;
  }, []);

  useEffect(() => () => {
    const recorder = recorderRef.current;
    if (recorder && recorder.state !== 'inactive') {
      recorder.ondataavailable = null;
      recorder.onstop = null;
      recorder.stop();
    }
    release();
  }, [release]);

  useEffect(() => {
    if (status !== 'recording') return;
    const timer = window.setInterval(() => setElapsed(Math.floor(activeMs() / 1000)), 250);
    return () => window.clearInterval(timer);
  }, [activeMs, status]);

  const startMeter = (stream: MediaStream) => {
    const AudioContextClass = window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!AudioContextClass) return;
    try {
      const context = new AudioContextClass();
      const analyser = context.createAnalyser();
      analyser.fftSize = 1024;
      context.createMediaStreamSource(stream).connect(analyser);
      audioContextRef.current = context;
      // Some browsers create the context suspended once the click's activation has passed.
      void context.resume().catch(() => undefined);
      const samples = new Uint8Array(analyser.fftSize);
      let lastPush = 0;
      const tick = (time: number) => {
        frameRef.current = requestAnimationFrame(tick);
        if (time - lastPush < 80) return;
        lastPush = time;
        if (recorderRef.current?.state !== 'recording') return;
        analyser.getByteTimeDomainData(samples);
        let sum = 0;
        for (const sample of samples) sum += ((sample - 128) / 128) ** 2;
        // Speech RMS rarely exceeds ~0.3; scale so normal voice fills the meter.
        const level = Math.min(1, Math.sqrt(sum / samples.length) * 3.5);
        setLevels((current) => [...current.slice(1), level]);
      };
      frameRef.current = requestAnimationFrame(tick);
    } catch {
      // The meter is optional; recording continues without it.
    }
  };

  const start = useCallback(async () => {
    if (!recordingSupported()) {
      setStatus('unsupported');
      setMessage(window.isSecureContext === false
        ? 'Запись доступна только по защищённому соединению (HTTPS). Откройте приложение по https-адресу или напишите ответ текстом.'
        : 'Этот браузер не умеет записывать звук. Откройте приложение в свежей версии Chrome, Safari или Firefox либо напишите ответ текстом.');
      return;
    }
    setStatus('requesting');
    setMessage('');
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: true, noiseSuppression: true } });
      const mimeType = pickRecordingMimeType((type) => MediaRecorder.isTypeSupported(type));
      const recorder = new MediaRecorder(stream, mimeType ? { mimeType } : undefined);
      chunksRef.current = [];
      recorder.ondataavailable = (event) => { if (event.data.size) chunksRef.current.push(event.data); };
      streamRef.current = stream;
      recorderRef.current = recorder;
      accumulatedRef.current = 0;
      activeSinceRef.current = performance.now();
      setElapsed(0);
      setLevels(Array(LEVEL_HISTORY).fill(0));
      recorder.start(1000);
      startMeter(stream);
      setStatus('recording');
    } catch (error) {
      release();
      const failure = recorderErrorStatus(error);
      setStatus(failure.status);
      setMessage(failure.message);
    }
  }, [release]);

  const pause = useCallback(() => {
    const recorder = recorderRef.current;
    if (recorder?.state !== 'recording') return;
    recorder.pause();
    accumulatedRef.current = activeMs();
    activeSinceRef.current = null;
    setElapsed(Math.floor(accumulatedRef.current / 1000));
    setStatus('paused');
  }, [activeMs]);

  const resume = useCallback(() => {
    const recorder = recorderRef.current;
    if (recorder?.state !== 'paused') return;
    recorder.resume();
    activeSinceRef.current = performance.now();
    setStatus('recording');
  }, []);

  const stop = useCallback((): Promise<Recording | null> => {
    const recorder = recorderRef.current;
    if (!recorder || recorder.state === 'inactive') return Promise.resolve(null);
    const durationSeconds = Math.max(1, Math.round(activeMs() / 1000));
    activeSinceRef.current = null;
    setStatus('stopping');
    return new Promise((resolve) => {
      recorder.onstop = () => {
        release();
        recorderRef.current = null;
        const mimeType = baseMimeType(recorder.mimeType || chunksRef.current[0]?.type || 'audio/webm');
        const blob = new Blob(chunksRef.current, { type: mimeType });
        chunksRef.current = [];
        setStatus('idle');
        resolve(blob.size ? { blob, mimeType, durationSeconds } : null);
      };
      recorder.stop();
    });
  }, [activeMs, release]);

  /** Stop and throw the take away (e.g. leaving the screen). */
  const cancel = useCallback(() => {
    const recorder = recorderRef.current;
    if (recorder && recorder.state !== 'inactive') {
      recorder.ondataavailable = null;
      recorder.onstop = null;
      recorder.stop();
    }
    recorderRef.current = null;
    chunksRef.current = [];
    release();
    setStatus('idle');
  }, [release]);

  return { status, message, elapsed, levels, start, pause, resume, stop, cancel };
}
