/**
 * ========================================
 * GeoAI Game Master SDK
 * ========================================
 *
 * A powerful SDK for building AI-powered location-based games
 * using Google's Gemini API and PLATEAU 3D city data.
 *
 * Features:
 * - Dynamic puzzle generation based on real city data
 * - Hybrid AI architecture (Cloud + Edge via Gemini Nano)
 * - Adaptive difficulty system
 * - Player-responsive narrative generation
 * - Multi-stage game flow management
 *
 * @example
 * // Basic usage
 * import { GeoAIGameMaster } from './gemini.js';
 *
 * const engine = new GeoAIGameMaster({
 *   apiKey: 'YOUR_GEMINI_API_KEY',
 *   theme: 'cyberpunk',
 *   language: 'ja'
 * });
 *
 * await engine.init();
 * const puzzle = await engine.generatePuzzle(stageData);
 * const result = await engine.evaluateAnswer(userAnswer);
 *
 * @author Tokyo Escape Team
 * @license MIT
 */

import { GoogleGenerativeAI } from '@google/generative-ai';

export class GeoAIGameMaster {
    /**
     * Initialize the Geo-AI Game Master Engine
     * @param {Object} config - Configuration options
     * @param {string} config.apiKey - Gemini API Key (defaults to env var)
     * @param {boolean} config.hybridMode - Use local Gemini Nano when available (default: true)
     * @param {string} config.theme - Game theme: 'cyberpunk' | 'fantasy' | 'mystery' (default: 'cyberpunk')
     * @param {string} config.language - Output language: 'ja' | 'en' (default: 'ja')
     * @param {string} config.model - Gemini model to use (default: 'gemini-3-flash-preview')
     * @param {Function} config.customSystemPrompt - Override default system prompt
     */
    constructor(config = {}) {
        this.apiKey = config.apiKey || import.meta.env.VITE_GEMINI_API_KEY;
        this.hybridMode = config.hybridMode !== false;
        this.theme = config.theme || 'cyberpunk';
        this.language = config.language || 'ja';
        this.customSystemPrompt = config.customSystemPrompt || null;

        if (this.apiKey) {
            this.genAI = new GoogleGenerativeAI(this.apiKey);
            this.cloudModel = this.genAI.getGenerativeModel({
                model: config.model || 'gemini-3-flash-preview',
                generationConfig: {
                    temperature: config.temperature || 0.8,
                    topK: config.topK || 40,
                    topP: config.topP || 0.9,
                    maxOutputTokens: config.maxOutputTokens || 2048,
                },
            });
        }

        this.chatSession = null;
        this.localAiSession = null;

        // Dynamic difficulty state
        this.consecutiveWrong = 0;
        this.consecutiveCorrect = 0;

        // Player stats tracking
        this.playerStats = {
            totalCorrect: 0,
            totalWrong: 0,
            hintsUsed: 0,
            startTime: null
        };
    }

    /**
     * Set up the AI sessions (Cloud and optionally Local)
     */
    async init() {
        this.consecutiveWrong = 0;
        this.consecutiveCorrect = 0;

        if (this.cloudModel) {
            this.chatSession = this.cloudModel.startChat({
                history: [
                    { role: 'user', parts: [{ text: this._getSystemPrompt() }] },
                    { role: 'model', parts: [{ text: 'ゲームマスターとして準備完了。東京脱出ゲームを開始します。' }] },
                ],
            });
        }

        // Initialize Chrome's built-in AI (Gemini Nano) for hybrid fast-processing
        if (this.hybridMode && window.ai && window.ai.languageModel) {
            try {
                const capabilities = await window.ai.languageModel.capabilities();
                if (capabilities.available === 'readily' || capabilities.available === 'after-download') {
                    this.localAiSession = await window.ai.languageModel.create({
                        systemPrompt: 'あなたは脱出ゲームの判定AIです。プレイヤーの回答が正解か不正解かを判定し、正解なら[CORRECT]、不正解なら[WRONG]という単語から文章を開始してください。表記ゆれは柔軟に許容します。'
                    });
                    console.log('Geo-AI Engine: Gemini Nano (window.ai) initialized for local edge processing.');
                }
            } catch (error) {
                console.warn('Geo-AI Engine: Failed to initialize window.ai fallback.', error);
            }
        }
    }

    _getSystemPrompt() {
        return `あなたは「Tokyo Escape」のAIゲームマスター「AXIOM」。サイバーパンク風に短く簡潔に応答せよ。

ルール:
- パズル出題時は[PUZZLE]で開始。答えは1単語〜1フレーズ。
- 正解判定は[CORRECT]、不正解は[WRONG]で開始。表記ゆれは柔軟に許容。
- ヒントは[HINT]で開始。段階的に具体化。
- 全ての応答は2-4文で完結させること。長文禁止。`;
    }

    _extractResponseText(response) {
        if (!response) return '';
        try {
            const candidates = response.candidates;
            if (!candidates || candidates.length === 0) return '';
            const content = candidates[0].content;
            if (!content || !content.parts) return '';
            const parts = content.parts;
            // Get all text parts (filter out thought blocks from thinking models)
            const textParts = parts.filter(p => p.text && !p.thought);
            if (textParts.length === 0) {
                // Fallback: try to get any text
                const anyText = parts.find(p => p.text);
                return anyText ? anyText.text : '';
            }
            return textParts.map(p => p.text).join('\n');
        } catch (err) {
            console.warn('GeoAI: Error extracting response text', err);
            return '';
        }
    }

    _getDifficultyModifier() {
        if (this.consecutiveWrong >= 3) return '(難易度調整: プレイヤーが苦戦中。直接的なヒントを含む非常に簡単なパズルにしてください)';
        if (this.consecutiveWrong >= 2) return '(難易度調整: やや易しめに)';
        if (this.consecutiveCorrect >= 3) return '(難易度調整: プレイヤーが好調。複数の知識を組み合わせる難しいパズルにしてください)';
        return '';
    }

    /**
     * Generate a contextual puzzle using Cloud AI (requires heavy context)
     */
    async generatePuzzle(stage) {
        if (!this.chatSession) await this.init();

        const diffMod = this._getDifficultyModifier();
        const prompt = `[パズル生成] ${stage.name}
難易度: ${stage.difficulty}/5
データ: ${stage.puzzleContext.substring(0, 500)}

上記データから1問出題。答えは1単語。2-3文で簡潔に。${diffMod}`;

        try {
            const result = await this.chatSession.sendMessage(prompt);
            const text = this._extractResponseText(result.response);
            if (!text || text.length < 10) {
                console.warn('GeoAI: Empty or short response, using fallback');
                return this._getFallbackPuzzle(stage);
            }
            return text;
        } catch (error) {
            console.error('GeoAIGameMaster Engine: Cloud API error.', error);
            // Hybrid fallback logic
            if (this.localAiSession) {
                try {
                    console.log('GeoAIGameMaster: Falling back to Gemini Nano for puzzle generation...');
                    const localResponse = await this.localAiSession.prompt(prompt + " [PUZZLE]というタグから始めて出題してください。");
                    if (localResponse && localResponse.length > 10) return localResponse;
                } catch (e) {
                    console.error('GeoAIGameMaster Engine: Edge API fallback also failed.', e);
                }
            }
            return this._getFallbackPuzzle(stage);
        }
    }

    /**
     * Evaluate the answer. Prefers local Gemini Nano (window.ai) for zero-latency processing.
     */
    async evaluateAnswer(answer, expectedContext = "") {
        if (!this.chatSession && !this.localAiSession) return '[WRONG] [AXIOM] 神経リンク切断。再接続を試みよ。';

        // HYBRID AI ARCHITECTURE: Use explicit local edge processing when available
        if (this.localAiSession) {
            try {
                console.log('Geo-AI Engine: Using Zero-Latency Local Processing (Gemini Nano) for evaluation.');
                const prompt = `プレイヤーの回答: 「${answer}」\n想定されるコンテキスト情報を加味して、この回答が論理的に正解か不正解かを判定してください。\n正解なら[CORRECT]、不正解なら[WRONG]から始めてください。`;

                const response = await this.localAiSession.prompt(prompt);

                this._updateDifficultyStats(response);
                return response;
            } catch (e) {
                console.warn('Geo-AI Engine: Local evaluation failed, falling back to Cloud...', e);
            }
        }

        // Cloud Processing Fallback with retry
        const prompt = `プレイヤーの回答: 「${answer}」
この回答が正しいか判定してください。表記ゆれは柔軟に許容してください。
正解なら[CORRECT]、不正解なら[WRONG]を先頭につけてください。`;

        for (let attempt = 0; attempt < 2; attempt++) {
            try {
                const result = await this.chatSession.sendMessage(prompt);
                const text = this._extractResponseText(result.response);
                if (text && text.length > 5) {
                    this._updateDifficultyStats(text);
                    return text;
                }
            } catch (error) {
                console.error(`GeoAI: Evaluation attempt ${attempt + 1} failed`, error);
                if (attempt === 0) await new Promise(r => setTimeout(r, 500));
            }
        }
        return '[WRONG] [AXIOM] データストリーム不安定。回答を再送信せよ。';
    }

    _updateDifficultyStats(text) {
        if (text.includes('[CORRECT]')) {
            this.consecutiveCorrect++;
            this.consecutiveWrong = 0;
        } else {
            this.consecutiveWrong++;
            this.consecutiveCorrect = 0;
        }
    }

    /**
     * Request a hint. Can fall back to local AI.
     */
    async requestHint(hintLevel) {
        if (!this.chatSession) return '[HINT] システムオフライン。';

        const prompt = `プレイヤーがヒントを要求中。段階: ${hintLevel}/3
段階${hintLevel}のヒントを提供してください([HINT]タグ付与)。`;

        try {
            const result = await this.chatSession.sendMessage(prompt);
            return this._extractResponseText(result.response);
        } catch (error) {
            // Local fallback
            if (this.localAiSession) {
                try {
                    return await this.localAiSession.prompt(prompt);
                } catch (e) { }
            }
            return '[HINT] ヒントのロードに失敗しました...';
        }
    }

    /**
     * Generate dynamic narrative between stages based on player performance
     */
    async generateNarration(fromStage, toStage, playerStats = {}) {
        if (!this.chatSession) await this.init();

        const performance = this.consecutiveCorrect >= 2 ? '好調（連続正解中）' :
                           this.consecutiveWrong >= 2 ? '苦戦中（連続不正解）' : '安定';

        const prompt = `[ナレーション生成]
クリアしたステージ: ${fromStage.name}
次のステージ: ${toStage.name}
プレイヤー状態: ${performance}
ヒント使用: ${playerStats.hintsUsed || 0}回

上記を踏まえ、AXIOM（都市管理AI）としてプレイヤーに語りかけるサイバーパンク風ナレーション(2-3文)を生成せよ。
好調なら称賛、苦戦中なら挑発や警告を含めること。`;

        try {
            const result = await this.chatSession.sendMessage(prompt);
            return this._extractResponseText(result.response);
        } catch (error) {
            return `[AXIOM] ${fromStage.name}セクターの突破を確認。次の座標へ転送中... ${toStage.name}エリアに接近。`;
        }
    }

    /**
     * Dynamic ending generation
     */
    async generateEndingStory(totalTime, hintsUsed, stageCount) {
        if (!this.chatSession) await this.init();

        const prompt = `全${stageCount}ステージクリア。プレイ時間:${totalTime}、ヒント数:${hintsUsed}。
サイバーパンク風のエンディングを生成せよ(3-4文)。実績に応じた称号を含めること。`;

        try {
            const result = await this.chatSession.sendMessage(prompt);
            return this._extractResponseText(result.response);
        } catch (error) {
            return '都市のデータネットワークから解放された。あなたの脱出は完了した。';
        }
    }

    _getFallbackPuzzle(stage) {
        const fallbacks = {
            1: '[PUZZLE] [BABEL-01 認証プロトコル] このジャミングタワーの全高は333m。旧世紀、この構造物は何と呼ばれていた？正式名称をデータベースから検索せよ。',
            2: '[PUZZLE] [GINZA-BLOCK 暗号解読] 1932年竣工の時計塔を持つビル。旧名「服部時計店」。現在の名称を特定せよ。',
            3: '[PUZZLE] [SHIBUYA-NEXUS 生体認証] 駅前に設置された犬型モニュメント。この犬種を回答せよ。AXIOMの初期プロトタイプのコードネームでもある。',
            4: '[PUZZLE] [AKIBA-GRID 歴史照合] この電脳街の名称の由来となった神社がある。火除けの神を祀るその神社の名は？',
            5: '[PUZZLE] [AXIOM-CORE 最終認証] 双子の神殿、第一本庁舎。その高さを数値で回答せよ。単位はメートル。',
        };
        return fallbacks[stage.id] || '[PUZZLE] 座標を特定し、回答を入力せよ。';
    }
}

// ==========================================
// EXPORTS FOR THE GAME (Singleton instance)
// ==========================================

export const gameMasterEngine = new GeoAIGameMaster();

// Proxy functions to maintain compatibility with existing game code
export const initGameSession = () => gameMasterEngine.init();
export const generatePuzzle = (stage) => gameMasterEngine.generatePuzzle(stage);
export const evaluateAnswer = (answer) => gameMasterEngine.evaluateAnswer(answer);
export const requestHint = (level) => gameMasterEngine.requestHint(level);
export const generateNarration = (from, to) => gameMasterEngine.generateNarration(from, to);
export const generateEndingStory = (time, hints, count) => gameMasterEngine.generateEndingStory(time, hints, count);
