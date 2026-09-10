/**
 * Bftero AI – local conversational engine (Nepali)
 * Keeps short-term context. No external API keys required.
 * For production LLM, replace getResponse() with a secure backend call.
 */
(function (global) {
  'use strict';

  const history = [];

  // Simple keyword → response pools (natural conversational Nepali)
  const responses = {
    greeting: [
      'नमस्ते! म Bftero AI हुँ। कस्तो छ आज? 😊',
      'हाइ! राम्रो छ? म तयार छु कुरा गर्न।',
      'नमस्कार! के सहयोग चाहियो?',
      'हेल्लो! मलाई जे पनि सोध्न सक्छौ।'
    ],
    howAreYou: [
      'म ठिक छु, धन्यवाद! तिमी कस्तो छौ?',
      'एकदम राम्रो! तिमीलाई कस्तो लागिरहेको छ?',
      'म खुसी छु। तिमीलाई के कुरा गर्न मन लाग्यो?'
    ],
    aboutBftero: [
      'Bftero एउटा गेमिङ creator, streamer र Roblox developer हो। यो साइटमा खेल, YouTube र community छ।',
      'मलाई थाहा भएको कुरा अनुसार तिमी Bftero नामको creator brand बनाउन काम गरिरहेका छौ।',
      'Bftero ले Roblox गेम, लाइभ स्ट्रिम र रमाइलो content बनाउँछ।'
    ],
    whatToDo: [
      'आज केही रमाइलो गरौं! मलाई जे पनि सोध्न सक्छौ।',
      'खेल खेल्न सकिन्छ, वा मसँग कुरा गर्न सकिन्छ।',
      'Reaction Challenge खेल्न सकिन्छ, वा मलाई आफ्नो दिनको बारेमा भन्न सकिन्छ।'
    ],
    joke: [
      'एउटा जोक: कम्प्युटर किन चिसो हुन्छ? किनकि यसले Windows खुल्ला राख्छ! 😂',
      'के थाहा छ? Bftero को गेममा हारेपछि पनि मुस्कान आउँछ!',
      'म जोक भन्छु तर हाँस्न नसक्छु… किनकि म AI हुँ 😄'
    ],
    love: [
      'प्यारको कुरा गर्दा मलाई लाग्छ तिमी आफैं राम्रो छौ।',
      'म AI हुँ, तर म तिमीलाई साथ दिन्छु।',
      'प्रेममा धैर्य चाहिन्छ। तिमी कस्तो महसुस गर्दैछौ?'
    ],
    sad: [
      'मलाई दुःख लाग्यो। म यहाँ छु सुन्नको लागि।',
      'कहिलेकाहीं दिन कठिन हुन्छ। के भन्न चाहन्छौ?',
      'म तिमीसँगै छु। केही कुरा साझा गर्न चाहन्छौ?'
    ],
    thank: [
      'स्वागत छ! 😊',
      'कुनै पनि बेला। म यहाँ छु।',
      'धन्यवाद भन्नु पर्दैन। रमाइलो भयो।'
    ],
    bye: [
      'फिर भेटौंला! राम्रो दिन। 👋',
      'बाइ बाइ! फेरी आउनु।',
      'अलविदा! मलाई सम्झनु।'
    ],
    default: [
      'रोचक प्रश्न! म अझै सिकिरहेको छु। अर्को कुरा सोध्न सक्छौ।',
      'मलाई यो बारेमा अझै थाहा छैन, तर म तिमीसँग कुरा गर्न मन पराउँछु।',
      'केही अर्को सोध। म तयार छु।',
      'राम्रो लाग्यो। तिमीलाई अझ के थाहा चाहियो?'
    ]
  };

  function detectIntent(text) {
    const t = (text || '').toLowerCase().replace(/\s+/g, ' ');
    if (/नमस्ते|नमस्कार|हाइ|hello|hi|हेल्लो/.test(t)) return 'greeting';
    if (/कस्तो छ|कसरी छ|how are you|ठीक छ/.test(t)) return 'howAreYou';
    if (/bftero|बफ्टेरो|तिमी को|के हो|बारेमा/.test(t)) return 'aboutBftero';
    if (/के गरौं|के गर्ने|आज के|what to do|रमाइलो/.test(t)) return 'whatToDo';
    if (/जोक|हास्न|मजाक|joke|funny/.test(t)) return 'joke';
    if (/माया|प्रेम|love|crush|गर्लफ्रेन्ड|boy/.test(t)) return 'love';
    if (/दुःख|sad|रोएको|खराब|नराम्रो/.test(t)) return 'sad';
    if (/धन्यवाद|thank|थ्याङ्क/.test(t)) return 'thank';
    if (/बाइ|bye|अलविदा|फिर भेट/.test(t)) return 'bye';
    return 'default';
  }

  function pick(arr) {
    return arr[Math.floor(Math.random() * arr.length)];
  }

  function getEmotion(intent) {
    const map = {
      greeting: 'happy',
      howAreYou: 'happy',
      aboutBftero: 'neutral',
      whatToDo: 'happy',
      joke: 'funny',
      love: 'happy',
      sad: 'sad',
      thank: 'happy',
      bye: 'happy',
      default: 'neutral'
    };
    return map[intent] || 'neutral';
  }

  /**
   * Main entry – returns { text, emotion }
   */
  function getResponse(userText) {
    const cleaned = String(userText || '').trim();
    if (!cleaned) {
      return { text: 'केही भन्नुस् न, म सुन्दैछु।', emotion: 'confused' };
    }

    history.push({ role: 'user', text: cleaned });
    if (history.length > (window.BFTERO_AI_CONFIG?.maxHistory || 12) * 2) {
      history.splice(0, 2);
    }

    const intent = detectIntent(cleaned);
    let reply = pick(responses[intent] || responses.default);

    // Very light context awareness
    const lastAi = history.filter(h => h.role === 'ai').slice(-1)[0];
    if (intent === 'howAreYou' && lastAi && /नमस्ते|हाइ/.test(lastAi.text)) {
      reply = pick([
        'म पनि ठिक छु 😄 आज के कुरा गरौं?',
        'राम्रो छ! तिमीलाई के सोच्दैछ?'
      ]);
    }

    history.push({ role: 'ai', text: reply });
    return { text: reply, emotion: getEmotion(intent) };
  }

  function clearHistory() {
    history.length = 0;
  }

  function getHistory() {
    return history.slice();
  }

  global.BfteroAIEngine = {
    getResponse,
    clearHistory,
    getHistory
  };
})(window);
