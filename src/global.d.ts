// global types

// SpeechRecognition Web API types (not yet in standard lib)
declare interface SpeechRecognitionEvent extends Event {
  results: SpeechRecognitionResultList;
  resultIndex: number;
}
declare interface SpeechRecognitionErrorEvent extends Event {
  error: string;
  message: string;
}
declare interface ISpeechRecognition extends EventTarget {
  lang: string;
  continuous: boolean;
  interimResults: boolean;
  maxAlternatives: number;
  onresult: ((e: SpeechRecognitionEvent) => void) | null;
  onerror: ((e: SpeechRecognitionErrorEvent) => void) | null;
  onend: (() => void) | null;
  onstart: (() => void) | null;
  start(): void;
  stop(): void;
  abort(): void;
}
declare var SpeechRecognition: { new(): ISpeechRecognition } | undefined;
declare var webkitSpeechRecognition: { new(): ISpeechRecognition } | undefined;
