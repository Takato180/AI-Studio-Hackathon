// tts.js -- Google Cloud Text-to-Speech API with queue system

const TTS_API_KEY = import.meta.env.VITE_GOOGLE_TTS_API_KEY;
const TTS_ENDPOINT = 'https://texttospeech.googleapis.com/v1/text:synthesize';

let ttsEnabled = true;
let currentAudio = null;
let audioQueue = [];
let isPlaying = false;
let currentSpeakResolve = null; // For interrupting speakAndWait
let synthesisAborted = false; // Prevent playing audio after stop

/**
 * Add text to the TTS queue (does NOT interrupt current playback)
 */
export function speak(text) {
    if (!ttsEnabled || !TTS_API_KEY || !text) return;

    const clean = text
        .replace(/\[.*?\]/g, '')
        .replace(/\*\*/g, '')
        .replace(/<[^>]+>/g, '')
        .replace(/[>]/g, '')
        .trim();
    if (!clean || clean.length < 3) return;

    synthesisAborted = false; // Allow new speech
    audioQueue.push(clean);
    if (!isPlaying) processQueue();
}

/**
 * Speak text and return a Promise that resolves when done (for sequencing)
 * Can be interrupted by calling skipAndProceed()
 */
export function speakAndWait(text) {
    return new Promise((resolve) => {
        if (!ttsEnabled || !TTS_API_KEY || !text) {
            resolve();
            return;
        }

        const clean = text
            .replace(/\[.*?\]/g, '')
            .replace(/\*\*/g, '')
            .replace(/<[^>]+>/g, '')
            .replace(/[>]/g, '')
            .trim();
        if (!clean || clean.length < 3) {
            resolve();
            return;
        }

        // Store resolve for interruption
        currentSpeakResolve = resolve;

        // Clear queue and stop current -- this is a priority message
        stopSpeaking();
        synthesizeAndPlay(clean).then(() => {
            currentSpeakResolve = null;
            resolve();
        }).catch(() => {
            currentSpeakResolve = null;
            resolve();
        });
    });
}

/**
 * Skip current speech and proceed to next step immediately
 */
export function skipAndProceed() {
    stopSpeaking();
    if (currentSpeakResolve) {
        const resolve = currentSpeakResolve;
        currentSpeakResolve = null;
        resolve();
    }
}

/**
 * Process the audio queue sequentially
 */
async function processQueue() {
    if (isPlaying || audioQueue.length === 0) return;

    isPlaying = true;
    while (audioQueue.length > 0) {
        const text = audioQueue.shift();
        try {
            await synthesizeAndPlay(text);
        } catch (err) {
            console.warn('TTS playback error:', err);
        }
    }
    isPlaying = false;
}

/**
 * Synthesize and play a single text
 */
async function synthesizeAndPlay(text) {
    const indicator = document.getElementById('audio-indicator');
    synthesisAborted = false;

    try {
        const response = await fetch(`${TTS_ENDPOINT}?key=${TTS_API_KEY}`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                input: { text },
                voice: {
                    languageCode: 'ja-JP',
                    name: 'ja-JP-Neural2-D', // Male neural voice -- darker, escape-game tone
                    ssmlGender: 'MALE',
                },
                audioConfig: {
                    audioEncoding: 'MP3',
                    speakingRate: 1.5,
                    pitch: -3.0,  // Lower pitch for dramatic feel
                    volumeGainDb: 3.0,
                },
            }),
        });

        // Check if stopped during fetch
        if (synthesisAborted) return;

        if (!response.ok) {
            console.warn('Cloud TTS error:', response.status);
            return;
        }

        const data = await response.json();
        if (!data.audioContent || synthesisAborted) return;

        const audioBlob = base64ToBlob(data.audioContent, 'audio/mp3');
        const audioUrl = URL.createObjectURL(audioBlob);

        // Check again before playing
        if (synthesisAborted) {
            URL.revokeObjectURL(audioUrl);
            return;
        }

        return new Promise((resolve) => {
            currentAudio = new Audio(audioUrl);
            currentAudio.volume = 0.85;

            if (indicator) indicator.classList.add('speaking');

            currentAudio.onended = () => {
                if (indicator) indicator.classList.remove('speaking');
                URL.revokeObjectURL(audioUrl);
                currentAudio = null;
                resolve();
            };

            currentAudio.onerror = () => {
                if (indicator) indicator.classList.remove('speaking');
                URL.revokeObjectURL(audioUrl);
                currentAudio = null;
                resolve();
            };

            currentAudio.play().catch(() => {
                if (indicator) indicator.classList.remove('speaking');
                resolve();
            });
        });
    } catch (err) {
        console.warn('TTS fetch error:', err);
        if (indicator) indicator.classList.remove('speaking');
    }
}

/**
 * Stop all audio and clear queue
 */
export function stopSpeaking() {
    synthesisAborted = true; // Prevent pending fetches from playing
    audioQueue = [];
    isPlaying = false;
    if (currentAudio) {
        currentAudio.pause();
        currentAudio = null;
    }
    const indicator = document.getElementById('audio-indicator');
    if (indicator) indicator.classList.remove('speaking');
}

/**
 * Toggle TTS on/off
 */
export function toggleTTS() {
    ttsEnabled = !ttsEnabled;
    if (!ttsEnabled) stopSpeaking();
    return ttsEnabled;
}

export function isTTSEnabled() {
    return ttsEnabled;
}

function base64ToBlob(base64, contentType) {
    const byteChars = atob(base64);
    const byteNumbers = new Array(byteChars.length);
    for (let i = 0; i < byteChars.length; i++) {
        byteNumbers[i] = byteChars.charCodeAt(i);
    }
    return new Blob([new Uint8Array(byteNumbers)], { type: contentType });
}
