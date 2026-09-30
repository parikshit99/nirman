import { isNative } from './platform.ts';

export type SpeechLanguage = 'en-IN' | 'hi-IN';

export interface SpeechCallbacks {
  /** A finished phrase to append to the input. */
  onText(text: string): void;
  onEnd(): void;
  onError(message: string): void;
}

/** Start dictation; returns a function that stops it. */
export async function startDictation(language: SpeechLanguage, cb: SpeechCallbacks): Promise<() => void> {
  return isNative ? startNative(language, cb) : startWeb(language, cb);
}

async function startNative(language: SpeechLanguage, cb: SpeechCallbacks): Promise<() => void> {
  const { SpeechRecognition } = await import('@capacitor-community/speech-recognition');
  const { available } = await SpeechRecognition.available();
  if (!available) throw new Error('Speech recognition is not available on this phone.');
  const perm = await SpeechRecognition.requestPermissions();
  if (perm.speechRecognition !== 'granted') throw new Error('Microphone permission was denied.');

  let latest = '';
  let finished = false;
  const finish = async () => {
    if (finished) return;
    finished = true;
    if (latest.trim()) cb.onText(latest.trim());
    await SpeechRecognition.removeAllListeners();
    cb.onEnd();
  };
  await SpeechRecognition.addListener('partialResults', (data) => {
    if (data.matches?.[0]) latest = data.matches[0];
  });
  await SpeechRecognition.addListener('listeningState', (data) => {
    if (data.status === 'stopped') void finish();
  });
  SpeechRecognition.start({ language, partialResults: true, popup: false, maxResults: 1 }).catch((err: Error) => {
    cb.onError(err.message);
    void finish();
  });
  return () => {
    void SpeechRecognition.stop().finally(finish);
  };
}

function startWeb(language: SpeechLanguage, cb: SpeechCallbacks): () => void {
  const Ctor = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
  if (!Ctor) throw new Error('Speech recognition is not supported in this browser.');
  const recognition = new Ctor();
  recognition.continuous = true;
  recognition.interimResults = true;
  recognition.lang = language;
  recognition.onresult = (event: any) => {
    let text = '';
    for (let i = event.resultIndex; i < event.results.length; ++i) {
      if (event.results[i].isFinal) text += event.results[i][0].transcript;
    }
    if (text) cb.onText(text);
  };
  recognition.onerror = (event: any) => cb.onError(String(event.error));
  recognition.onend = () => cb.onEnd();
  recognition.start();
  return () => recognition.stop();
}
