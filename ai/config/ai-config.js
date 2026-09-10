/**
 * Bftero AI – configuration (no secrets)
 */
window.BFTERO_AI_CONFIG = {
  characterUrl:
    'https://cdn.jsdelivr.net/gh/pixiv/three-vrm@3.3.2/packages/three-vrm/examples/models/VRM1_Constraint_Twist_Sample.vrm',

  // Your Cloudflare Worker (already set)
  apiEndpoint: 'https://bftero-ai.samarpan7129.workers.dev',

  preferredVoiceNames: [
    'Nepali', 'ne-NP', 'Google नेपाली', 'Microsoft Hemkala', 'Google Hindi', 'hi-IN'
  ],

  recognitionLang: 'ne-NP',
  recognitionFallback: 'hi-IN',
  maxHistory: 16,

  strings: {
    ready: 'नमस्ते! म MAYA हुँ — मलाई जे पनि सोध 😊',
    listening: 'सुन्दैछु... 👂',
    thinking: 'सोच्दैछु... 🤔',
    speaking: 'बोल्दैछु... 🗣️',
    micDenied: 'Microphone permission is required to talk with Bftero AI.',
    noSpeech: 'माफ गर्नुहोस्, मैले राम्रोसँग सुन्न सकिनँ। फेरि प्रयास गर्नुहोस्।',
    apiFail: 'अहिले AI सँग connection मा समस्या भयो। केही बेरपछि फेरि प्रयास गर्नुहोस्।',
    loading: 'MAYA is getting ready... ✨',
    tapToTalk: '🎙️ Tap to Talk',
    clear: 'Clear Chat',
    muteOn: '🔇 Voice Off',
    muteOff: '🔊 Voice On'
  }
};
