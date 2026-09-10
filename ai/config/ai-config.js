/**
 * Bftero AI – configuration (no secrets)
 * Frontend-only. Real LLM/TTS keys must live on a secure backend.
 */
window.BFTERO_AI_CONFIG = {
  // Official three-vrm sample (VRM 1.0). Replace with your own licensed model later.
  characterUrl:
    'https://cdn.jsdelivr.net/gh/pixiv/three-vrm@3.3.2/packages/three-vrm/examples/models/VRM1_Constraint_Twist_Sample.vrm',

  // Preferred TTS voice name fragments (browser will pick best match)
  preferredVoiceNames: [
    'Nepali',
    'ne-NP',
    'Google नेपाली',
    'Microsoft Hemkala',
    'Google Hindi',
    'hi-IN'
  ],

  // Speech recognition language
  recognitionLang: 'ne-NP',

  // Fallback recognition language if ne-NP unavailable
  recognitionFallback: 'hi-IN',

  // Max conversation history turns kept in memory
  maxHistory: 12,

  // UI strings
  strings: {
    ready: 'नमस्ते! मलाई नेपालीमा जे पनि सोध्नुस् 😊',
    listening: 'सुन्दैछु... 👂',
    thinking: 'सोच्दैछु... 🤔',
    speaking: 'बोल्दैछु... 🗣️',
    micDenied: 'Microphone permission is required to talk with Bftero AI.',
    noSpeech: 'माफ गर्नुहोस्, मैले राम्रोसँग सुन्न सकिनँ। फेरि प्रयास गर्नुहोस्।',
    apiFail: 'अहिले AI सँग connection मा समस्या भयो। केही बेरपछि फेरि प्रयास गर्नुहोस्।',
    loading: 'Bftero AI is getting ready... 🤖',
    tapToTalk: '🎙️ Tap to Talk',
    clear: 'Clear Chat',
    muteOn: '🔇 Voice Off',
    muteOff: '🔊 Voice On'
  }
};
