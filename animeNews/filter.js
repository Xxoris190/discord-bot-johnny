const CATEGORY_RULES = [
    {
        key: 'teaser',
        label: 'Teaser',
        emoji: '👀',
        color: 0x9B59B6,
        patterns: [
            /\bteaser(?:\s+trailer|\s+visual)?\b/i,
            /\bmini[- ]?teaser\b/i,
            /ティザー(?:pv|映像|ビジュアル)?/i,
        ],
    },
    {
        key: 'trailer',
        label: 'Trailer / PV',
        emoji: '🎬',
        color: 0xE74C3C,
        patterns: [
            /\btrailer\b/i,
            /\bbande[- ]annonce\b/i,
            /\b(?:first|second|third|fourth|1st|2nd|3rd|4th|main|new)?\s*(?:promo|promotional video|pv)\b/i,
            /(?:本|新|第[一二三四五六七八九\d]+弾)?pv(?:第[一二三四五六七八九\d]+弾)?/i,
            /予告編/i,
        ],
    },
    {
        key: 'new_season',
        label: 'Nouvelle saison / suite',
        emoji: '🔥',
        color: 0xF39C12,
        patterns: [
            /\bnew season\b/i,
            /\bseason\s*(?:2|3|4|5|6|7|8|9|ii|iii|iv|two|three|four|five)\b/i,
            /\b(?:2nd|3rd|4th|5th|6th|second|third|fourth|fifth) season\b/i,
            /\bnouvelle saison\b/i,
            /\bsaison\s*(?:2|3|4|5|6|7|8|9)\b/i,
            /\bsequel\b/i,
            /\b(?:part|cour)\s*(?:2|3|4|ii|iii|two|three)\b/i,
            /\b续(?:集|篇)\b/i,
            /第[二三四五六七八九\d]+期/i,
            /続編(?:制作)?決定/i,
            /分割2クール/i,
        ],
    },
    {
        key: 'final_season',
        label: 'Saison finale',
        emoji: '🏁',
        color: 0xC0392B,
        patterns: [
            /\bfinal season\b/i,
            /\b(?:final|last) (?:cour|part)\b/i,
            /\bsaison finale\b/i,
            /(?:最終章|最終期|ファイナルシーズン|完結編)/i,
        ],
    },
    {
        key: 'movie',
        label: 'Film anime',
        emoji: '🍿',
        color: 0x3498DB,
        patterns: [
            /\banime\s+(?:movie|film)\b/i,
            /\b(?:movie|film)\s+(?:anime|adaptation|announced)\b/i,
            /\bfilm d['’ ]animation\b/i,
            /\bfilm anime\b/i,
            /劇場版/i,
            /アニメ映画/i,
            /映画化決定/i,
        ],
    },
    {
        key: 'new_anime',
        label: 'Nouvel anime',
        emoji: '✨',
        color: 0x2ECC71,
        patterns: [
            /\banime adaptation\b/i,
            /\b(?:gets|receives|inspires) (?:a )?(?:tv )?anime\b/i,
            /\b(?:tv )?anime (?:adaptation )?(?:announced|greenlit)\b/i,
            /\bnew anime (?:project|series|announced)\b/i,
            /\badapt(?:e|é)e? en anime\b/i,
            /\badaptation (?:en )?anime\b/i,
            /tvアニメ化/i,
            /アニメ化(?:決定)?/i,
            /新作アニメ/i,
        ],
    },
    {
        key: 'release_date',
        label: 'Date de sortie',
        emoji: '📅',
        color: 0x1ABC9C,
        patterns: [
            /\b(?:release|premiere|airing|debut) date\b/i,
            /\b(?:premieres?|airs?|debut(?:s|ing)?|releases?) (?:on|in|this|next)\b/i,
            /\bdate de (?:sortie|diffusion)\b/i,
            /\b(?:diffusion|sortie) (?:le|en|prévue|prevue)\b/i,
            /放送(?:開始|決定)/i,
            /配信(?:開始|決定)/i,
            /公開日(?:決定)?/i,
        ],
    },
    {
        key: 'key_visual',
        label: 'Nouveau visuel',
        emoji: '🖼️',
        color: 0xE91E63,
        patterns: [
            /\b(?:key|main|new|teaser) visual\b/i,
            /\bvisuel (?:clé|cle|principal|inédit|inedit|teaser)\b/i,
            /(?:キー|メイン|ティザー)ビジュアル/i,
        ],
    },
    {
        key: 'ova_special',
        label: 'OVA / Épisode spécial',
        emoji: '💫',
        color: 0x8E44AD,
        patterns: [
            /\b(?:ova|oad|ona)\b/i,
            /\b(?:tv )?special (?:episode|anime|announced)\b/i,
            /\bépisode spécial\b/i,
            /(?:特別編|特別アニメ|スペシャルアニメ)/i,
        ],
    },
    {
        key: 'schedule_change',
        label: 'Report / Changement de date',
        emoji: '⏳',
        color: 0x95A5A6,
        patterns: [
            /\b(?:delay(?:ed|s)?|postponed?|pushed back|on hiatus)\b/i,
            /\b(?:reporté|repoussé|décalé|ajourné)e?s?\b/i,
            /(?:延期|放送延期|公開延期)/i,
        ],
    },
];

const HARD_EXCLUSIONS = [
    {
        reason: 'rumeur ou fuite',
        scope: 'combined',
        patterns: [/\b(?:rumou?r|leak|unconfirmed)\b/i, /(?:噂|リーク)/i],
    },
    {
        reason: 'contenu éditorial secondaire',
        patterns: [
            /\b(?:review|recap|interview|quiz|ranking|breakdown|explained)\b/i,
            /\b(?:critique|récap|recapitulatif|interview|classement|analyse)\b/i,
            /(?:レビュー|インタビュー|ランキング)/i,
        ],
    },
    {
        reason: 'produit dérivé ou collaboration',
        patterns: [
            /\b(?:merchandise|figure|figurine|collaboration|pop-up|café|cafe|campaign)\b/i,
            /(?:グッズ|フィギュア|コラボ|キャンペーン|カフェ)/i,
        ],
    },
    {
        reason: 'simple extrait ou vidéo de personnage',
        patterns: [
            /\b(?:creditless|non-credit|character video|character trailer|character pv|clip|shorts?)\b/i,
            /\bcharacter (?:introduction|profile) (?:trailer|pv|video)\b/i,
            /(?:ノンクレジット|キャラクター(?:紹介)?(?:pv|映像)|本編映像)/i,
        ],
    },
    {
        reason: 'jeu vidéo',
        scope: 'combined',
        patterns: [
            /\b(?:video game|mobile game|gameplay|rpg|nintendo switch|switch(?: 2)?|playstation|xbox|steam)\b/i,
            /(?:ゲーム版|スマホゲーム|ゲームプレイ)/i,
        ],
    },
    {
        reason: 'adaptation live ou spectacle',
        patterns: [/\b(?:live-action|stage play|musical adaptation)\b/i, /(?:実写化|舞台化)/i],
    },
    {
        reason: 'DVD, émission ou contenu déjà en cours',
        patterns: [
            /\b(?:blu-?ray|dvd|podcast|radio show|live ?stream)\b/i,
            /\b(?:now|currently) (?:airing|streaming|available)\b/i,
            /(?:ラジオ|生配信|座談会|好評(?:放送|配信|公開)中)/i,
        ],
    },
    {
        reason: 'information secondaire sur les épisodes',
        patterns: [
            /\b(?:listed with|episode count)\s*\d*\s*episodes?\b/i,
            /\b\d+ episodes? (?:listed|confirmed)\b/i,
        ],
    },
];

const EPISODE_PREVIEW_PATTERNS = [
    /\bepisode\s*\d+\b/i,
    /第\d+話/i,
];

const MUSIC_ONLY_PATTERNS = [
    /\b(?:opening|ending|theme song|music video|soundtrack|ost|single|album|song)\b/i,
    /\bmv\b/i,
    /(?:オープニング|エンディング|主題歌|楽曲|音楽配信|シングル|アルバム|配信リリース)/i,
];

function foldText(value) {
    return String(value || '')
        .normalize('NFKD')
        // Retire les accents latins sans supprimer les dakuten japonais (゙/゚).
        .replace(/[\u0300-\u036f]/g, '')
        .normalize('NFC')
        .toLowerCase();
}

function firstMatchingPattern(text, patterns) {
    return patterns.find(pattern => pattern.test(text));
}

function includesKeyword(text, keyword) {
    return foldText(text).includes(foldText(keyword));
}

function classifyAnimeAnnouncement(item, filterConfig = {}) {
    const title = String(item.title || '').trim();
    const summary = String(item.summary || '').trim();
    const titleFolded = foldText(title);
    const summaryFolded = foldText(summary);
    const combined = `${titleFolded}\n${summaryFolded}`;
    const enabled = new Set(filterConfig.enabledCategories || CATEGORY_RULES.map(rule => rule.key));
    const threshold = Number(filterConfig.threshold) || 5;

    const customExclusion = (filterConfig.extraExcludeKeywords || [])
        .find(keyword => includesKeyword(combined, keyword));
    if (customExclusion) {
        return { accepted: false, score: 0, categories: [], reason: `mot exclu: ${customExclusion}` };
    }

    if (EPISODE_PREVIEW_PATTERNS.some(pattern => pattern.test(titleFolded))) {
        return { accepted: false, score: 0, categories: [], reason: 'preview d’un épisode précis' };
    }

    for (const exclusion of HARD_EXCLUSIONS) {
        const textToCheck = exclusion.scope === 'combined' ? combined : titleFolded;
        if (exclusion.patterns.some(pattern => pattern.test(textToCheck))) {
            return { accepted: false, score: 0, categories: [], reason: exclusion.reason };
        }
    }

    const matches = [];
    for (const rule of CATEGORY_RULES) {
        if (!enabled.has(rule.key)) continue;

        const titlePattern = firstMatchingPattern(titleFolded, rule.patterns);
        const summaryPattern = firstMatchingPattern(summaryFolded, rule.patterns);
        if (!titlePattern && !summaryPattern) continue;

        matches.push({
            ...rule,
            score: titlePattern ? 6 : 3,
            location: titlePattern ? 'titre' : 'résumé',
        });
    }

    const customInclusion = (filterConfig.extraIncludeKeywords || [])
        .find(keyword => includesKeyword(titleFolded, keyword));
    if (customInclusion && matches.length === 0) {
        matches.push({
            key: 'custom',
            label: 'Annonce suivie',
            emoji: '📣',
            color: 0x5865F2,
            score: 6,
            location: 'titre',
        });
    }

    if (matches.length === 0) {
        return { accepted: false, score: 0, categories: [], reason: 'aucun type d’annonce recherché' };
    }

    const hasTrailerOrTeaser = matches.some(match => ['trailer', 'teaser'].includes(match.key));
    if (!hasTrailerOrTeaser && MUSIC_ONLY_PATTERNS.some(pattern => pattern.test(titleFolded))) {
        return { accepted: false, score: 0, categories: [], reason: 'sortie musicale sans trailer anime' };
    }

    let score = Math.max(...matches.map(match => match.score));
    if (item.source && item.source.trust === 'official') score += 1;

    const primary = [...matches].sort((left, right) => right.score - left.score)[0];
    return {
        accepted: score >= threshold,
        score,
        primary: {
            key: primary.key,
            label: primary.label,
            emoji: primary.emoji,
            color: primary.color,
        },
        categories: matches.map(match => match.key),
        reason: matches.map(match => `${match.label} (${match.location})`).join(', '),
    };
}

module.exports = {
    CATEGORY_RULES,
    classifyAnimeAnnouncement,
    foldText,
};
