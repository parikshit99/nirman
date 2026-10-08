import { ExpoSpeechRecognitionModule } from 'expo-speech-recognition';

export type SpeechLanguage = 'en-IN' | 'hi-IN';

export interface SpeechCallbacks {
  /** A finished phrase to append to the input. */
  onText(text: string): void;
  onEnd(): void;
  onError(message: string): void;
}

/** Start dictation with Android's speech recognition; returns a function that stops it. */
export async function startDictation(language: SpeechLanguage, cb: SpeechCallbacks): Promise<() => void> {
  if (!ExpoSpeechRecognitionModule.isRecognitionAvailable()) throw new Error('Speech recognition is not available on this phone.');
  const perm = await ExpoSpeechRecognitionModule.requestPermissionsAsync();
  if (!perm.granted) throw new Error('Microphone permission was denied.');

  let latest = '';
  let finished = false;
  const subs: { remove(): void }[] = [];
  const finish = () => {
    if (finished) return;
    finished = true;
    subs.forEach((s) => s.remove());
    if (latest.trim()) cb.onText(latest.trim());
    cb.onEnd();
  };
  subs.push(
    ExpoSpeechRecognitionModule.addListener('result', (e) => {
      if (e.results[0]) latest = e.results[0].transcript;
    }),
    ExpoSpeechRecognitionModule.addListener('error', (e) => {
      cb.onError(e.message || e.error);
      finish();
    }),
    ExpoSpeechRecognitionModule.addListener('end', finish),
  );
  ExpoSpeechRecognitionModule.start({ lang: language, interimResults: true, continuous: false });
  return () => ExpoSpeechRecognitionModule.stop();
}
