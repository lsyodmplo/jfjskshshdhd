/* =========================================================
 * AUTOTRANS.JS – ORIGINAL FULL VERSION (FIXED)
 * Policy: FIX ONLY – NO FEATURE REMOVED
 * ========================================================= */

/* ================= Logger Fallback (FIX) ================= */
const SafeLogger = {
    info: msg => console.log(msg),
    warning: msg => console.warn(msg),
    error: msg => console.error(msg),
    success: msg => console.log(msg)
};

const Log = (typeof Logger !== 'undefined') ? Logger : SafeLogger;

/* ================= DeepSeek API ================= */
const DeepSeekAPI = {
    endpoint: 'https://api.deepseek.com/v1/chat/completions',
    model: 'deepseek-chat',

    pricing: { input: 0.14, output: 0.28 },

    estimateTokens(text) {
        return Math.ceil(text.length / 3);
    },

    async request(messages, temperature = 0.3) {
        if (!AppState?.apiKey) {
            throw new Error('Missing API Key');
        }

        const response = await fetch(this.endpoint, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${AppState.apiKey}`
            },
            body: JSON.stringify({
                model: this.model,
                messages,
                temperature,
                max_tokens: 4000,
                stream: false
            })
        });

        if (!response.ok) {
            let err = {};
            try { err = await response.json(); } catch {}
            throw new Error(err?.error?.message || `API Error ${response.status}`);
        }

        const data = await response.json();

        // FIX: guard usage & stats
        if (data?.usage && AppState?.stats) {
            const inputCost = (data.usage.prompt_tokens / 1e6) * this.pricing.input;
            const outputCost = (data.usage.completion_tokens / 1e6) * this.pricing.output;
            AppState.stats.estimatedCost =
                (AppState.stats.estimatedCost || 0) + inputCost + outputCost;
        }

        // FIX: protect empty response
        if (!data?.choices?.[0]?.message?.content) {
            throw new Error('Empty translation response');
        }

        return data;
    }
};

/* ================= Text Extractor ================= */
const TextExtractor = {
    controlCodes: /\\[VNGPCI]\[\d+\]|\\[.!><^$]|\\[CFHK]/g,

    /* ---------- Safety ---------- */
    isSafeToTranslateNote(note, config) {
        if (!note || typeof note !== 'string') return false;
        if (config.safeMode === 'strict') return false;

        const dangerousPatterns = [
            /<[^>]*>/g,
            /\[[^\]]*\]/g,
            /\{[^}]*\}/g,
            /\$[a-zA-Z_][a-zA-Z0-9_.]*/g,
            /function\s*\(/g,
            /eval\s*\(/gi,
            /https?:\/\/[^\s]*/gi,
            /(?:img|audio|data|js|plugins)\//gi
        ];

        for (const p of dangerousPatterns) {
            const rx = new RegExp(p.source, p.flags); // FIX: clone regex
            if (rx.test(note)) return false;
        }

        if (this.looksLikeCode(note)) return false;
        if (this.containsPluginKeywords(note)) return false;

        return this.shouldTranslate(note, config) && this.isActualText(note);
    },

    looksLikeCode(text) {
        const patterns = [
            /[{}();]/g,
            /\b(if|else|for|while|function|var|let|const|return)\b/g
        ];
        let score = 0;
        for (const p of patterns) {
            const m = text.match(p);
            if (m) score += m.length;
        }
        return score > text.length * 0.2;
    },

    containsPluginKeywords(text) {
        const keys = [
            'plugin','script','eval','yanfly','mog',
            'galv','hime','srd','sumrndmdde'
        ];
        const l = text.toLowerCase();
        return keys.some(k => l.includes(k));
    },

    isActualText(text) {
        if (!/[a-zA-Z\u3040-\u30ff\u4e00-\u9fff\uac00-\ud7af]/.test(text)) return false;
        const letters = (text.match(/[a-zA-Z\u3040-\u30ff\u4e00-\u9fff\uac00-\ud7af]/g) || []).length;
        return letters / text.length > 0.3;
    },

    shouldTranslate(text, config) {
        if (!text || !text.trim()) return false;
        if (config.skipTranslated && this.hasTargetLanguage(text, config.targetLanguage)) return false;
        if (/^[\d\s\W]*$/.test(text)) return false;
        return true;
    },

    hasTargetLanguage(text, lang) {
        const map = {
            vi: /[àáạảãâăđêôơư]/i,
            ja: /[\u3040-\u30ff]/,
            zh: /[\u4e00-\u9fff]/,
            ko: /[\uac00-\ud7af]/
        };
        return map[lang]?.test(text) || false;
    },

    /* ---------- Control Codes ---------- */
    extractControlCodes(text) {
        const codes = [];
        let m;
        const rx = new RegExp(this.controlCodes);
        while ((m = rx.exec(text)) !== null) {
            codes.push({ code: m[0], index: m.index });
        }
        return codes;
    },

    removeControlCodes(text) {
        return text.replace(this.controlCodes, '{{CODE}}');
    },

    restoreControlCodes(text, codes) {
        let out = text;
        codes.forEach(c => {
            out = out.replace('{{CODE}}', c.code);
        });
        return out;
    },

    /* ---------- Extractors ---------- */
    extractFromMap(data, config) {
        const texts = [];
        if (!data?.events) return texts;

        data.events.forEach((ev, ei) => {
            ev?.pages?.forEach((p, pi) => {
                p?.list?.forEach((cmd, ci) => {
                    if (config.translateDialogue && [401,405].includes(cmd.code)) {
                        const t = cmd.parameters?.[0];
                        if (this.shouldTranslate(t, config)) {
                            texts.push({
                                type: 'dialogue',
                                path: `events[${ei}].pages[${pi}].list[${ci}].parameters[0]`,
                                original: t
                            });
                        }
                    }

                    if (config.translateDialogue && cmd.code === 102) {
                        cmd.parameters?.[0]?.forEach((c, i) => {
                            if (this.shouldTranslate(c, config)) {
                                texts.push({
                                    type: 'choice',
                                    path: `events[${ei}].pages[${pi}].list[${ci}].parameters[0][${i}]`,
                                    original: c
                                });
                            }
                        });
                    }
                });
            });
        });

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

        data.forEach((it, i) => {
            if (!it) return;

            const push = (k, type) => {
                if (it[k] && this.shouldTranslate(it[k], config)) {
                    texts.push({ type, path: `[${i}].${k}`, original: it[k] });
                }
            };

            if (config.translateNames) {
                push('name','name');
                push('nickname','nickname');
            }

            if (config.translateDescriptions) {
                push('profile','profile');
                push('description','description');
            }

            if (config.translateDescriptions && it.note && config.safeMode !== 'strict') {
                if (this.isSafeToTranslateNote(it.note, config)) {
                    texts.push({ type:'note', path:`[${i}].note`, original: it.note });
                }
            }

            for (let n=1;n<=4;n++) push(`message${n}`,'message');
        });

        return texts;
    },

    extractFromCommonEvents(data, config) {
        const texts = [];
        if (!Array.isArray(data)) return texts;

        data.forEach((ev, ei) => {
            if (config.translateNames && ev?.name) {
                if (this.shouldTranslate(ev.name, config)) {
                    texts.push({ type:'name', path:`[${ei}].name`, original: ev.name });
                }
            }

            ev?.list?.forEach((cmd, ci) => {
                if (config.translateDialogue && cmd.code === 401) {
                    const t = cmd.parameters?.[0];
                    if (this.shouldTranslate(t, config)) {
                        texts.push({
                            type:'dialogue',
                            path:`[${ei}].list[${ci}].parameters[0]`,
                            original:t
                        });
                    }
                }

                if (config.translateDialogue && cmd.code === 102) {
                    cmd.parameters?.[0]?.forEach((c,i)=>{
                        if (this.shouldTranslate(c, config)) {
                            texts.push({
                                type:'choice',
                                path:`[${ei}].list[${ci}].parameters[0][${i}]`,
                                original:c
                            });
                        }
                    });
                }
            });
        });

        return texts;
    }
};

/* ================= Translation Engine ================= */
const TranslationEngine = {
    async translateBatch(texts, src, tgt, config) {
        if (!texts.length) return [];

        const processed = texts.map(t => {
            const codes = config.preserveFormatting
                ? TextExtractor.extractControlCodes(t.original)
                : [];
            const clean = config.preserveFormatting
                ? TextExtractor.removeControlCodes(t.original)
                : t.original;
            return { ...t, clean, codes };
        });

        const payload = processed.map((t,i)=>`${i+1}. ${t.clean}`).join('\n');

        const res = await DeepSeekAPI.request([
            { role:'system', content:'You are an RPG Maker translator. Preserve {{CODE}}.' },
            { role:'user', content:`Translate ${src} → ${tgt}:\n${payload}` }
        ]);

        const lines = res.choices[0].message.content.split('\n');
        const out = [];

        processed.forEach((p,i)=>{
            let tr = lines[i]?.replace(/^\d+[\.\):\-]?\s*/,'') || p.original;

            if (config.preserveFormatting && p.codes.length) {
                tr = TextExtractor.restoreControlCodes(tr, p.codes);
            }

            out.push({ ...p, translated: tr });
        });

        return out;
    }
};

/* ================= AutoTrans Engine ================= */
const AutoTransEngine = {
    async translateFile(json, filename, config) {
        let texts = [];
        const f = filename.toLowerCase();

        if (f.startsWith('map')) texts = TextExtractor.extractFromMap(json, config);
        else if (f === 'commonevents.json') texts = TextExtractor.extractFromCommonEvents(json, config);
        else texts = TextExtractor.extractFromDatabase(json, config);

        if (!texts.length) return json;

        const batches = [];
        for (let i=0;i<texts.length;i+=config.batchSize) {
            batches.push(texts.slice(i,i+config.batchSize));
        }

        let all = [];
        for (const b of batches) {
            if (AppState?.isPaused) break;
            try {
                const r = await TranslationEngine.translateBatch(
                    b, config.sourceLanguage, config.targetLanguage, config
                );
                all.push(...r);

                if (typeof LivePreview !== 'undefined') {
                    r.forEach(t=>{
                        LivePreview.addTranslation(t.original,t.translated,filename,'SAFE');
                    });
                }
            } catch (e) {
                Log.error(e.message);
                all.push(...b.map(t=>({...t, translated:t.original})));
            }
        }

        const clone = JSON.parse(JSON.stringify(json));
        all.forEach(t=>{
            const parts = t.path.split(/[\.\[\]]/).filter(Boolean);
            let cur = clone;
            for (let i=0;i<parts.length-1;i++) {
                cur = cur[isNaN(parts[i])?parts[i]:Number(parts[i])];
                if (!cur) return;
            }
            cur[isNaN(parts.at(-1))?parts.at(-1):Number(parts.at(-1))] = t.translated;
        });

        return clone;
    }
};

Log.success('⚡ AutoTrans Engine loaded (FULL + FIXED)');