// ===== DeepSeek API Configuration =====
const DeepSeekAPI = {
    endpoint: 'https://api.deepseek.com/v1/chat/completions',
    model: 'deepseek-chat',
    
    pricing: {
        input: 0.14,
        output: 0.28
    },
    
    estimateTokens(text) {
        return Math.ceil(text.length / 3);
    },
    
    async request(messages, temperature = 0.3) {
        const response = await fetch(this.endpoint, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${AppState.apiKey}`
            },
            body: JSON.stringify({
                model: this.model,
                messages: messages,
                temperature: temperature,
                max_tokens: 4000,
                stream: false
            })
        });
        
        if (!response.ok) {
            const error = await response.json().catch(() => ({}));
            throw new Error(error.error?.message || `API Error: ${response.status}`);
        }
        
        const data = await response.json();
        
        if (data.usage) {
            const inputCost = (data.usage.prompt_tokens / 1000000) * this.pricing.input;
            const outputCost = (data.usage.completion_tokens / 1000000) * this.pricing.output;
            AppState.stats.estimatedCost += inputCost + outputCost;
        }
        
        return data;
    }
};

// ===== Text Extractor =====
const TextExtractor = {
    controlCodes: /\\[VNGPCI]\[\d+\]|\\[.!><^$]|\\[CFHK]/g,
    
    // ===== SMART PLUGIN TAG PROTECTION =====
    isSafeToTranslateNote(note, config) {
        if (!note || typeof note !== 'string') return false;
        
        // If strict safe mode, never translate notes
        if (config.safeMode === 'strict') {
            return false;
        }
        
        // Common plugin tag patterns that should NEVER be translated
        const dangerousPatterns = [
            // Yanfly Engine Plugins
            /<[^>]*>/g,                          // Any XML-like tags
            /\[[^\]]*\]/g,                       // Square bracket tags
            /\{[^}]*\}/g,                        // Curly bracket tags
            
            // Specific plugin patterns
            /<(?:PassiveSkill|ActiveSkill|Skill|State|Item|Weapon|Armor|Enemy|Class):[^>]*>/gi,
            /<(?:Custom|Script|Formula|Eval|Code):[^>]*>/gi,
            /<(?:Damage|Effect|Cost|Requirement|Condition):[^>]*>/gi,
            /<(?:Animation|Sound|Visual|Popup|Message):[^>]*>/gi,
            
            // MogHunter plugins
            /<(?:Mog|MOG)[^>]*>/gi,
            
            // SumRndmDde plugins
            /<(?:SRD|sumrndmdde)[^>]*>/gi,
            
            // Galv plugins
            /<(?:Galv|GALV)[^>]*>/gi,
            
            // Hime plugins
            /<(?:Hime|HIME)[^>]*>/gi,
            
            // Common script calls
            /\$[a-zA-Z_][a-zA-Z0-9_.]*/g,        // Game variables/switches
            /this\.[a-zA-Z_][a-zA-Z0-9_.]*/g,   // Object methods
            /function\s*\([^)]*\)/g,             // Function definitions
            /if\s*\([^)]*\)/g,                   // Conditional statements
            /for\s*\([^)]*\)/g,                  // Loop statements
            /while\s*\([^)]*\)/g,                // While loops
            /switch\s*\([^)]*\)/g,               // Switch statements
            
            // JavaScript keywords and operators
            /(?:var|let|const|return|break|continue|case|default)\s/g,
            /(?:===|!==|==|!=|<=|>=|&&|\|\||<<|>>)/g,
            
            // Plugin-specific notetags
            /<(?:notetag|tag|param|parameter|arg|argument):[^>]*>/gi,
            /<(?:learn|forget|gain|lose|add|remove):[^>]*>/gi,
            /<(?:enable|disable|show|hide|lock|unlock):[^>]*>/gi,
            
            // Database references
            /(?:actor|class|skill|item|weapon|armor|enemy|troop|state|animation|tileset|common_event)\s*\[\s*\d+\s*\]/gi,
            
            // Plugin command patterns
            /plugin\s+command/gi,
            /script\s+call/gi,
            /eval\s*\(/gi,
            
            // File paths and URLs
            /(?:img|audio|data|js|plugins)\/[^\s]*/gi,
            /https?:\/\/[^\s]*/gi,
            
            // Version numbers and IDs
            /v\d+\.\d+/gi,
            /id\s*:\s*\d+/gi,
            
            // Mathematical expressions that might be formulas
            /\b(?:Math|parseInt|parseFloat|Number|String|Boolean|Array|Object)\./g,
            /\b(?:min|max|floor|ceil|round|abs|sqrt|pow|random)\s*\(/g
        ];
        
        // Check if note contains any dangerous patterns
        for (const pattern of dangerousPatterns) {
            if (pattern.test(note)) {
                return false;
            }
        }
        
        // Additional safety checks
        
        // Check for code-like structures
        if (this.looksLikeCode(note)) {
            return false;
        }
        
        // Check for plugin-specific keywords
        if (this.containsPluginKeywords(note)) {
            return false;
        }
        
        // If it passes all checks and is actual translatable text
        return this.shouldTranslate(note, config) && this.isActualText(note);
    },
    
    looksLikeCode(text) {
        // Check for code-like patterns
        const codePatterns = [
            /[{}();]/g,                          // Code punctuation
            /\b(?:if|else|for|while|function|var|let|const|return)\b/g,
            /[=!<>]=?/g,                         // Comparison operators
            /\+\+|--|&&|\|\|/g,                  // Increment/logical operators
            /\/\*[\s\S]*?\*\//g,                 // Block comments
            /\/\/.*$/gm,                         // Line comments
        ];
        
        let codeScore = 0;
        for (const pattern of codePatterns) {
            const matches = text.match(pattern);
            if (matches) {
                codeScore += matches.length;
            }
        }
        
        // If more than 20% of the text looks like code, skip it
        return codeScore > text.length * 0.2;
    },
    
    containsPluginKeywords(text) {
        const pluginKeywords = [
            'yanfly', 'mog', 'galv', 'hime', 'sumrndmdde', 'srd',
            'plugin', 'notetag', 'script', 'eval', 'formula',
            'passive', 'active', 'trigger', 'condition', 'requirement',
            'damage', 'effect', 'animation', 'sound', 'visual',
            'custom', 'override', 'extend', 'modify', 'enhance'
        ];
        
        const lowerText = text.toLowerCase();
        return pluginKeywords.some(keyword => lowerText.includes(keyword));
    },
    
    isActualText(text) {
        // Check if it's actual human-readable text worth translating
        
        // Must have some letters
        if (!/[a-zA-Z\u3040-\u309f\u30a0-\u30ff\u4e00-\u9fff\uac00-\ud7af]/.test(text)) {
            return false;
        }
        
        // Must not be mostly numbers/symbols
        const letterCount = (text.match(/[a-zA-Z\u3040-\u309f\u30a0-\u30ff\u4e00-\u9fff\uac00-\ud7af]/g) || []).length;
        const totalLength = text.length;
        
        return letterCount / totalLength > 0.3; // At least 30% letters
    },
    
    shouldTranslate(text, config) {
        if (!text || typeof text !== 'string') return false;
        if (text.trim() === '') return false;
        
        // Skip already translated text
        if (config.skipTranslated && this.hasTargetLanguage(text, config.targetLanguage)) {
            return false;
        }
        
        // Skip pure numbers, symbols, whitespace
        if (/^[\d\s\W]*$/.test(text)) return false;
        
        // SMART FILTERING - Only apply if enabled
        if (config.smartFiltering) {
            const skipPatterns = [
                // Plugin names and technical terms
                /^[A-Z][a-zA-Z]*Plugin$/i,
                /^[A-Z][a-zA-Z]*Manager$/i,
                /^[A-Z][a-zA-Z]*System$/i,
                
                // Music/Sound file names
                /\.(ogg|mp3|wav|m4a)$/i,
                /^BGM_/i,
                /^BGS_/i,
                /^ME_/i,
                /^SE_/i,
                
                // Image file names
                /\.(png|jpg|jpeg|gif|webp)$/i,
                /^img\//i,
                /^pictures\//i,
                /^faces\//i,
                /^characters\//i,
                
                // Technical identifiers
                /^[a-zA-Z_][a-zA-Z0-9_]*$/,  // Variable names
                /^[A-Z_][A-Z0-9_]*$/,        // Constants
                /^\$[a-zA-Z]/,               // Game variables
                
                // URLs and paths
                /^https?:\/\//i,
                /^[a-zA-Z]:\\/,              // Windows paths
                /^\/[a-zA-Z]/,               // Unix paths
                
                // Version numbers and IDs
                /^v?\d+\.\d+/i,              // Version numbers
                /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i, // UUIDs
                
                // Common untranslatable game terms
                /^(HP|MP|ATK|DEF|MAT|MDF|AGI|LUK)$/i,
                /^(STR|INT|VIT|DEX|WIS|CHA)$/i,
                /^(EXP|SP|TP|CP|AP)$/i,
                
                // Single characters or very short technical strings
                /^[a-zA-Z]$/,
                /^[!@#$%^&*()_+\-=\[\]{}|;':",./<>?`~]$/,
            ];
            
            // Check if text matches any skip pattern
            for (const pattern of skipPatterns) {
                if (pattern.test(text.trim())) {
                    return false;
                }
            }
            
            // Skip if text is mostly English technical terms (for non-English sources)
            if (config.sourceLanguage !== 'en') {
                const englishTechPattern = /^[a-zA-Z0-9\s_\-\.]+$/;
                if (englishTechPattern.test(text) && text.length < 30) {
                    // Check if it contains common English words that shouldn't be translated
                    const commonTechWords = [
                        'plugin', 'system', 'manager', 'engine', 'script', 'data',
                        'config', 'settings', 'options', 'menu', 'window', 'scene',
                        'sprite', 'bitmap', 'sound', 'music', 'image', 'file',
                        'save', 'load', 'new', 'game', 'title', 'battle', 'map',
                        'event', 'switch', 'variable', 'common', 'parallel', 'auto'
                    ];
                    
                    const lowerText = text.toLowerCase();
                    if (commonTechWords.some(word => lowerText.includes(word))) {
                        return false;
                    }
                }
            }
        }
        
        return true;
    },
    
    hasTargetLanguage(text, targetLang) {
        const patterns = {
            vi: /[àáảãạăằắẳẵặâầấẩẫậèéẻẽẹêềếểễệìíỉĩịòóỏõọôồốổỗộơờớởỡợùúủũụưừứửữựỳýỷỹỵđ]/i,
            zh: /[\u4e00-\u9fff]/,
            ja: /[\u3040-\u309f\u30a0-\u30ff]/,
            ko: /[\uac00-\ud7af]/,
            en: /^[a-zA-Z0-9\s\.,!?'"()-]+$/
        };
        return patterns[targetLang]?.test(text) || false;
    },
    
    extractFromMap(data, config) {
        const texts = [];
        
        if (!data.events) return texts;
        
        data.events.forEach((event, eventIndex) => {
            if (!event?.pages) return;
            
            event.pages.forEach((page, pageIndex) => {
                if (!page.list) return;
                
                page.list.forEach((command, commandIndex) => {
                    // Show Text (401) & Show Scrolling Text (405)
                    if (config.translateDialogue && [401, 405].includes(command.code)) {
                        if (command.parameters?.[0]) {
                            const text = command.parameters[0];
                            if (this.shouldTranslate(text, config)) {
                                texts.push({
                                    type: 'dialogue',
                                    path: `events[${eventIndex}].pages[${pageIndex}].list[${commandIndex}].parameters[0]`,
                                    original: text
                                });
                            }
                        }
                    }
                    
                    // Show Choices (102)
                    if (config.translateDialogue && command.code === 102) {
                        if (command.parameters?.[0]) {
                            command.parameters[0].forEach((choice, choiceIndex) => {
                                if (this.shouldTranslate(choice, config)) {
                                    texts.push({
                                        type: 'choice',
                                        path: `events[${eventIndex}].pages[${pageIndex}].list[${commandIndex}].parameters[0][${choiceIndex}]`,
                                        original: choice
                                    });
                                }
                            });
                        }
                    }
                    
                    // Input Number (103) - message
                    if (config.translateDialogue && command.code === 103) {
                        // Variable ID, Digits count are in params but no text to translate
                    }
                    
                    // Button Input Processing (117)
                    // No text to translate
                    
                    // Control Variables (122) - operand might have text
                    if (command.code === 122 && command.parameters?.[4] === 4) {
                        // Script command - skip
                    }
                });
            });
        });
        
        // Map display name
        if (config.translateNames && data.displayName) {
            if (this.shouldTranslate(data.displayName, config)) {
                texts.push({
                    type: 'name',
                    path: 'displayName',
                    original: data.displayName
                });
            }
        }
        
        return texts;
    },
    
    extractFromDatabase(data, config) {
        const texts = [];
        
        if (!Array.isArray(data)) return texts;
        
        data.forEach((item, index) => {
            if (!item) return;
            
            // Name
            if (config.translateNames && item.name) {
                if (this.shouldTranslate(item.name, config)) {
                    texts.push({
                        type: 'name',
                        path: `[${index}].name`,
                        original: item.name
                    });
                }
            }
            
            // Nickname (Actors)
            if (config.translateNames && item.nickname) {
                if (this.shouldTranslate(item.nickname, config)) {
                    texts.push({
                        type: 'nickname',
                        path: `[${index}].nickname`,
                        original: item.nickname
                    });
                }
            }
            
            // Profile (Actors)
            if (config.translateDescriptions && item.profile) {
                if (this.shouldTranslate(item.profile, config)) {
                    texts.push({
                        type: 'profile',
                        path: `[${index}].profile`,
                        original: item.profile
                    });
                }
            }
            
            // Description
            if (config.translateDescriptions && item.description) {
                if (this.shouldTranslate(item.description, config)) {
                    texts.push({
                        type: 'description',
                        path: `[${index}].description`,
                        original: item.description
                    });
                }
            }
            
            // Note - SMART PLUGIN TAG PROTECTION
            if (config.translateDescriptions && item.note && config.safeMode !== 'strict') {
                // Advanced plugin tag detection and protection
                if (this.isSafeToTranslateNote(item.note, config)) {
                    texts.push({
                        type: 'note',
                        path: `[${index}].note`,
                        original: item.note
                    });
                } else {
                    // Log skipped note for transparency
                    if (typeof Logger !== 'undefined') {
                        Logger.warning(`⚠️ Skipped note in ${item.name || `item ${index}`}: Contains plugin tags`);
                    }
                }
            }
            
            // Messages (Skills/Items)
            for (let i = 1; i <= 4; i++) {
                const msgKey = `message${i}`;
                if (config.translateDescriptions && item[msgKey]) {
                    if (this.shouldTranslate(item[msgKey], config)) {
                        texts.push({
                            type: 'message',
                            path: `[${index}].${msgKey}`,
                            original: item[msgKey]
                        });
                    }
                }
            }
        });
        
        return texts;
    },
    
    extractFromCommonEvents(data, config) {
        const texts = [];
        
        if (!Array.isArray(data)) return texts;
        
        data.forEach((event, eventIndex) => {
            if (!event) return;
            
            // Event name
            if (config.translateNames && event.name) {
                if (this.shouldTranslate(event.name, config)) {
                    texts.push({
                        type: 'name',
                        path: `[${eventIndex}].name`,
                        original: event.name
                    });
                }
            }
            
            // Event commands
            if (event.list) {
                event.list.forEach((command, commandIndex) => {
                    if (config.translateDialogue && command.code === 401 && command.parameters?.[0]) {
                        const text = command.parameters[0];
                        if (this.shouldTranslate(text, config)) {
                            texts.push({
                                type: 'dialogue',
                                path: `[${eventIndex}].list[${commandIndex}].parameters[0]`,
                                original: text
                            });
                        }
                    }
                    
                    // Choices in common events
                    if (config.translateDialogue && command.code === 102 && command.parameters?.[0]) {
                        command.parameters[0].forEach((choice, choiceIndex) => {
                            if (this.shouldTranslate(choice, config)) {
                                texts.push({
                                    type: 'choice',
                                    path: `[${eventIndex}].list[${commandIndex}].parameters[0][${choiceIndex}]`,
                                    original: choice
                                });
                            }
                        });
                    }
                });
            }
        });
        
        return texts;
    },
    
    extractControlCodes(text) {
        const codes = [];
        let match;
        const regex = new RegExp(this.controlCodes);
        while ((match = regex.exec(text)) !== null) {
            codes.push({
                code: match[0],
                index: match.index
            });
        }
        return codes;
// ===== SAFETY FALLBACKS =====
window.ProgressManager = window.ProgressManager || {
    updateStats() {},
    updateFileProgress() {}
};

// ===== DeepSeek API Configuration =====
const DeepSeekAPI = {
    endpoint: 'https://api.deepseek.com/v1/chat/completions',
    model: 'deepseek-chat',
    
    pricing: {
        input: 0.14,
        output: 0.28
    },
    
    estimateTokens(text) {
        return Math.ceil(text.length / 3);
    },
    
    async request(messages, temperature = 0.3) {
        const response = await fetch(this.endpoint, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${AppState.apiKey}`
            },
            body: JSON.stringify({
                model: this.model,
                messages: messages,
                temperature: temperature,
                max_tokens: 4000,
                stream: false
            })
        });
        
        if (!response.ok) {
            const error = await response.json().catch(() => ({}));
            throw new Error(error.error?.message || `API Error: ${response.status}`);
        }
        
        const data = await response.json();
        
        if (data.usage) {
            const inputCost = (data.usage.prompt_tokens / 1000000) * this.pricing.input;
            const outputCost = (data.usage.completion_tokens / 1000000) * this.pricing.output;
            AppState.stats.estimatedCost += inputCost + outputCost;
        }
        
        return data;
    }
};

// ===== Text Extractor =====
const TextExtractor = {
    controlCodes: /\\[VNGPCI]\[\d+\]|\\[.!><^$]|\\[CFHK]/g,

    isSafeToTranslateNote(note, config) {
        if (!note || typeof note !== 'string') return false;
        if (config.safeMode === 'strict') return false;

        const dangerousPatterns = [
            /<[^>]*>/g,
            /\[[^\]]*\]/g,
            /\{[^}]*\}/g,
            /<(?:PassiveSkill|ActiveSkill|Skill|State|Item|Weapon|Armor|Enemy|Class):[^>]*>/gi,
            /<(?:Custom|Script|Formula|Eval|Code):[^>]*>/gi,
            /<(?:Damage|Effect|Cost|Requirement|Condition):[^>]*>/gi,
            /<(?:Animation|Sound|Visual|Popup|Message):[^>]*>/gi,
            /<(?:Mog|MOG)[^>]*>/gi,
            /<(?:SRD|sumrndmdde)[^>]*>/gi,
            /<(?:Galv|GALV)[^>]*>/gi,
            /<(?:Hime|HIME)[^>]*>/gi,
            /\$[a-zA-Z_][a-zA-Z0-9_.]*/g,
            /this\.[a-zA-Z_][a-zA-Z0-9_.]*/g,
            /function\s*\([^)]*\)/g,
            /if\s*\([^)]*\)/g,
            /for\s*\([^)]*\)/g,
            /while\s*\([^)]*\)/g,
            /switch\s*\([^)]*\)/g,
            /(?:var|let|const|return|break|continue|case|default)\s/g,
            /(?:===|!==|==|!=|<=|>=|&&|\|\||<<|>>)/g,
            /plugin\s+command/gi,
            /script\s+call/gi,
            /eval\s*\(/gi,
            /(?:img|audio|data|js|plugins)\/[^\s]*/gi,
            /https?:\/\/[^\s]*/gi
        ];

        for (const pattern of dangerousPatterns) {
            if (pattern.test(note)) return false;
        }

        return this.shouldTranslate(note, config) && this.isActualText(note);
    },

    looksLikeCode(text) {
        const codePatterns = [
            /[{}();]/g,
            /\b(?:if|else|for|while|function|var|let|const|return)\b/g,
            /[=!<>]=?/g,
            /\+\+|--|&&|\|\|/g
        ];

        let score = 0;
        for (const p of codePatterns) {
            const m = text.match(p);
            if (m) score += m.length;
        }
        return score > text.length * 0.2;
    },

    isActualText(text) {
        if (!/[a-zA-Z\u3040-\u30ff\u4e00-\u9fff\uac00-\ud7af]/.test(text)) return false;
        const letters = (text.match(/[a-zA-Z\u3040-\u30ff\u4e00-\u9fff\uac00-\ud7af]/g) || []).length;
        return letters / text.length > 0.3;
    },

    shouldTranslate(text, config) {
        if (!text || !text.trim()) return false;
        if (/^[\d\s\W]*$/.test(text)) return false;
        return true;
    },

    extractFromMap(data, config) {
        const texts = [];
        if (!data.events) return texts;

        data.events.forEach((event, ei) => {
            if (!event?.pages) return;
            event.pages.forEach((page, pi) => {
                page.list?.forEach((cmd, ci) => {
                    if ([401, 405].includes(cmd.code) && cmd.parameters?.[0]) {
                        const t = cmd.parameters[0];
                        if (this.shouldTranslate(t, config)) {
                            texts.push({
                                type: 'dialogue',
                                path: `events[${ei}].pages[${pi}].list[${ci}].parameters[0]`,
                                original: t
                            });
                        }
                    }
                });
            });
        });
        return texts;
    }
};

// ===== Translation Engine =====
const TranslationEngine = {
    async translateBatch(texts, sourceLang, targetLang, config) {
        if (!texts.length) return [];
        const list = texts.map((t, i) => `${i + 1}. ${t.original}`).join('\n');

        const response = await DeepSeekAPI.request([
            { role: 'system', content: `Translate from ${sourceLang} to ${targetLang}. Return numbered lines only.` },
            { role: 'user', content: list }
        ]);

        const lines = response.choices[0].message.content.split('\n');
        return texts.map((t, i) => ({
            ...t,
            translated: lines[i]?.replace(/^\d+[\.\)\-]\s*/, '') || t.original
        }));
    }
};

// ===== Auto Translation Engine =====
const AutoTransEngine = {
    async translateFile(jsonData, filename, config) {
        const cfg = {
            translateDialogue: true,
            translateNames: true,
            translateDescriptions: true,
            smartFiltering: true,
            skipTranslated: false,
            contextAware: true,
            qualityCheck: false,
            ...config
        };

        let texts = TextExtractor.extractFromMap(jsonData, cfg);
        if (!texts.length) return jsonData;

        const batches = [];
        for (let i = 0; i < texts.length; i += cfg.batchSize) {
            batches.push(texts.slice(i, i + cfg.batchSize));
        }

        let translated = [];
        for (let i = 0; i < batches.length; i++) {
            if (AppState.isPaused) break;
            const result = await TranslationEngine.translateBatch(
                batches[i],
                cfg.sourceLanguage,
                cfg.targetLanguage,
                cfg
            );

            result.forEach(r => {
                if (window.LivePreview) {
                    LivePreview.addTranslation(
                        filename,
                        r.original,
                        r.translated,
                        'safe'
                    );
                }
            });

            translated.push(...result);
            AppState.stats.textsTranslated += result.length;
            ProgressManager.updateStats();
        }

        const out = JSON.parse(JSON.stringify(jsonData));
        translated.forEach(t => {
            const parts = t.path.split(/[\.\[\]]/).filter(Boolean);
            let cur = out;
            for (let i = 0; i < parts.length - 1; i++) {
                cur = cur[isNaN(parts[i]) ? parts[i] : +parts[i]];
            }
            cur[isNaN(parts.at(-1)) ? parts.at(-1) : +parts.at(-1)] = t.translated;
        });

        Logger.info(`✅ Hoàn thành: ${filename}`);
        return out;
    }
};

// ===== EXPORT =====
window.AutoTransEngine = AutoTransEngine;

Logger.info('⚡ Translation Engine loaded!');