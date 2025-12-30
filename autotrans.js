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
    },
    
    removeControlCodes(text) {
        return text.replace(this.controlCodes, '{{CODE}}');
    },
    
    restoreControlCodes(translatedText, originalCodes) {
        let result = translatedText;
        originalCodes.forEach(codeObj => {
            result = result.replace('{{CODE}}', codeObj.code);
        });
        return result;
    }
};

// ===== Translation Engine =====
const TranslationEngine = {
    languageNames: {
        ja: 'Japanese',
        en: 'English',
        vi: 'Vietnamese',
        zh: 'Chinese',
        ko: 'Korean'
    },
    
    async translateBatch(texts, sourceLang, targetLang, config) {
        if (texts.length === 0) return [];
        
        const sourceName = this.languageNames[sourceLang] || sourceLang;
        const targetName = this.languageNames[targetLang] || targetLang;
        
        // Process texts
        const processedTexts = texts.map(item => {
            if (config.preserveFormatting) {
                const codes = TextExtractor.extractControlCodes(item.original);
                const cleaned = TextExtractor.removeControlCodes(item.original);
                return { ...item, cleaned, codes };
            }
            return { ...item, cleaned: item.original, codes: [] };
        });
        
        // Create prompt
        const textList = processedTexts.map((item, i) => 
            `${i + 1}. ${item.cleaned}`
        ).join('\n');
        
        // Enhanced system prompt with context-aware features
        let systemPrompt = `You are a professional translator specializing in video game localization for RPG Maker games.

CRITICAL TRANSLATION RULES:
1. Translate from ${sourceName} to ${targetName} naturally and accurately
2. Preserve the original meaning, tone, and character personality
3. Use appropriate gaming terminology in ${targetName}
4. Keep game-specific terms consistent (HP, MP, stats names)
5. Maintain the emotional tone (serious, humorous, dramatic)
6. For character dialogue, use natural conversational ${targetName}
7. For item/skill names, keep them concise and impactful
8. Preserve ALL {{CODE}} placeholders exactly as they appear
9. Do NOT add any explanations, notes, or comments
10. Return ONLY the numbered translations, one per line`;

        // Add context-aware enhancements
        if (config.contextAware) {
            systemPrompt += `

CONTEXT-AWARE ENHANCEMENTS:
- Recognize RPG game context (fantasy, modern, sci-fi themes)
- Adapt translation style based on content type (dialogue vs descriptions vs UI)
- Use genre-appropriate vocabulary and expressions
- Consider character relationships and social context in dialogue
- Maintain consistency with RPG naming conventions`;
        }

        // Add quality check instructions
        if (config.qualityCheck) {
            systemPrompt += `

QUALITY ASSURANCE:
- Double-check translation accuracy and naturalness
- Ensure no meaning is lost or added
- Verify proper grammar and spelling
- Maintain appropriate formality level
- Check for cultural appropriateness`;
        }

        systemPrompt += `

Context: These texts are from an RPG Maker game. Consider gaming conventions and player expectations when translating.`;

        const userPrompt = `Translate these ${sourceName} texts to ${targetName}:

${textList}

Return the translations in the exact same numbered format (1., 2., 3...), one translation per line. No extra text.`;

        try {
            const response = await DeepSeekAPI.request([
                { role: 'system', content: systemPrompt },
                { role: 'user', content: userPrompt }
            ]);
            
            const translatedText = response.choices[0].message.content.trim();
            const translations = this.parseTranslations(translatedText, processedTexts.length);
            
            // Restore control codes
            return processedTexts.map((item, i) => {
                let translation = translations[i] || item.original;
                
                if (config.preserveFormatting && item.codes.length > 0) {
                    translation = TextExtractor.restoreControlCodes(translation, item.codes);
                }
                
                return {
                    ...item,
                    translated: translation
                };
            });
            
        } catch (error) {
            Logger.error(`❌ Translation error: ${error.message}`);
            throw error;
        }
    },
    
    parseTranslations(text, expectedCount) {
        const lines = text.split('\n').filter(line => line.trim());
        const translations = [];
        
        for (const line of lines) {
            // Match "1. Text" or "1) Text" or "1 - Text" etc
            const match = line.match(/^\d+[\.\)\-\:]\s*(.+)$/);
            if (match) {
                translations.push(match[1].trim());
            } else if (line.trim() && !/^\d+$/.test(line.trim())) {
                translations.push(line.trim());
            }
        }
        
        // Ensure correct count
        while (translations.length < expectedCount) {
            translations.push('');
        }
        
        return translations.slice(0, expectedCount);
    }
};

// ===== Auto Translation Engine =====
const AutoTransEngine = {
    async translateFile(jsonData, filename, config) {
        Logger.info(`📋 Phân tích: ${filename}`);
        
        // Detect file type
        const fileType = this.detectFileType(filename);
        let texts = [];
        
        switch (fileType) {
            case 'map':
                texts = TextExtractor.extractFromMap(jsonData, config);
                break;
            case 'commonEvents':
                texts = TextExtractor.extractFromCommonEvents(jsonData, config);
                break;
            case 'database':
                texts = TextExtractor.extractFromDatabase(jsonData, config);
                break;
            default:
                Logger.warning(`⚠ Không xác định: ${filename}`);
                return jsonData;
        }
        
        if (texts.length === 0) {
            Logger.info('ℹ️ Không có văn bản cần dịch');
            return jsonData;
        }
        
        Logger.info(`📝 Tìm thấy ${texts.length} đoạn văn bản`);
        
        // Translate in batches
        const batchSize = config.batchSize || 10;
        const batches = this.createBatches(texts, batchSize);
        let translatedTexts = [];
        
        for (let i = 0; i < batches.length; i++) {
            if (AppState.isPaused) break;
            
            const batch = batches[i];
            Logger.info(`🔄 Batch ${i + 1}/${batches.length} (${batch.length} câu)`);
            
            try {
                const translated = await TranslationEngine.translateBatch(
                    batch,
                    config.sourceLanguage,
                    config.targetLanguage,
                    config
                );
                
                // Show live preview for each translation
                if (typeof LivePreview !== 'undefined') {
                    translated.forEach(item => {
                        LivePreview.addTranslation(
                            item.original,
                            item.translated,
                            filename,
                            'translation'
                        );
                    });
                    
                    // Show batch progress
                    LivePreview.showBatchProgress(i, batches.length, filename);
                }
                
                translatedTexts.push(...translated);
                AppState.stats.textsTranslated += batch.length;
                ProgressManager.updateStats();
                
                // Update file progress
                const fileProgress = ((i + 1) / batches.length) * 100;
                ProgressManager.updateFileProgress(fileProgress);
                
                // Delay between batches
                if (i < batches.length - 1) {
                    await this.delay(500);
                }
                
            } catch (error) {
                Logger.error(`❌ Batch ${i + 1} lỗi: ${error.message}`);
                
                // Show error in live preview
                if (typeof LivePreview !== 'undefined') {
                    LivePreview.addTranslation(
                        `Batch ${i + 1} error`,
                        `Lỗi batch ${i + 1}: ${error.message}`,
                        filename,
                        'error'
                    );
                }
                
                // Keep originals on error
                translatedTexts.push(...batch.map(t => ({ ...t, translated: t.original })));
            }
        }
        
        // Apply translations
        const translatedData = this.applyTranslations(jsonData, translatedTexts);
        
        Logger.success(`✅ Hoàn thành: ${texts.length} đoạn`);
        
        return translatedData;
    },
    
    detectFileType(filename) {
        const lower = filename.toLowerCase();
        
        if (lower.startsWith('map')) return 'map';
        if (lower === 'commonevents.json') return 'commonEvents';
        
        const dbFiles = [
            'actors', 'classes', 'skills', 'items', 'weapons', 
            'armors', 'enemies', 'troops', 'states', 'animations',
            'tilesets', 'system'
        ];
        
        if (dbFiles.some(db => lower.startsWith(db))) {
            return 'database';
        }
        
        return 'unknown';
    },
    
    createBatches(texts, batchSize) {
        const batches = [];
        for (let i = 0; i < texts.length; i += batchSize) {
            batches.push(texts.slice(i, i + batchSize));
        }
        return batches;
    },
    
    applyTranslations(data, translatedTexts) {
        const result = JSON.parse(JSON.stringify(data));
        
        translatedTexts.forEach(item => {
            try {
                this.setValueByPath(result, item.path, item.translated);
            } catch (error) {
                Logger.warning(`⚠ Không thể áp dụng: ${item.path}`);
            }
        });
        
        return result;
    },
    
    setValueByPath(obj, path, value) {
        // Parse path like "events[0].pages[1].list[2].parameters[0]"
        const parts = path.split(/[\.\[\]]/).filter(Boolean);
        
        let current = obj;
        for (let i = 0; i < parts.length - 1; i++) {
            const key = isNaN(parts[i]) ? parts[i] : parseInt(parts[i]);
            current = current[key];
        }
        
        const lastKey = isNaN(parts[parts.length - 1]) ? 
            parts[parts.length - 1] : 
            parseInt(parts[parts.length - 1]);
        
        current[lastKey] = value;
    },
    
    delay(ms) {
        return new Promise(resolve => setTimeout(resolve, ms));
    }
};

// ===== Export =====
if (typeof module !== 'undefined' && module.exports) {
    module.exports = {
        DeepSeekAPI,
        TextExtractor,
        TranslationEngine,
        AutoTransEngine
    };
}

Logger.info('⚡ Translation Engine loaded!');