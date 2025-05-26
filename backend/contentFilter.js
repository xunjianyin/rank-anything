// Content filtering module for detecting sensitive content
// Categories: pornography, religion, politics

class ContentFilter {
  constructor() {
    this.sensitiveWords = {
      pornography: [
        // Explicit content
        'porn', 'pornography', 'xxx', 'sex', 'sexual', 'nude', 'naked', 'strip', 'erotic',
        'adult', 'nsfw', 'explicit', 'intimate', 'seductive', 'sensual', 'provocative',
        'fetish', 'kinky', 'orgasm', 'masturbate', 'prostitute', 'escort', 'brothel',
        'webcam', 'camgirl', 'onlyfans', 'playboy', 'penthouse', 'hustler',
        // Anatomical terms (when used inappropriately)
        'penis', 'vagina', 'breast', 'nipple', 'genital', 'cock', 'dick', 'pussy',
        'boobs', 'tits', 'ass', 'butt', 'anal', 'oral', 'blowjob', 'handjob',
        // Related terms
        'horny', 'slutty', 'whore', 'bitch', 'slut', 'milf', 'dildo', 'vibrator',
        'condom', 'viagra', 'cialis', 'lubricant', 'threesome', 'gangbang',
        'bondage', 'bdsm', 'dominatrix', 'submissive', 'roleplay'
      ],
      
      religion: [
        // Major religions - avoiding legitimate discussion while catching inflammatory content
        'allah', 'jesus', 'christ', 'buddha', 'muhammad', 'prophet', 'god', 'lord',
        'bible', 'quran', 'koran', 'torah', 'gospel', 'scripture', 'holy',
        'church', 'mosque', 'temple', 'synagogue', 'cathedral', 'chapel',
        'christian', 'muslim', 'islamic', 'jewish', 'buddhist', 'hindu', 'sikh',
        'catholic', 'protestant', 'orthodox', 'evangelical', 'baptist', 'methodist',
        'presbyterian', 'lutheran', 'pentecostal', 'mormon', 'jehovah',
        // Religious practices and concepts
        'prayer', 'worship', 'faith', 'belief', 'salvation', 'heaven', 'hell',
        'sin', 'forgiveness', 'blessing', 'miracle', 'divine', 'sacred',
        'pilgrimage', 'crusade', 'jihad', 'baptism', 'communion', 'confession',
        'sermon', 'preacher', 'priest', 'pastor', 'imam', 'rabbi', 'monk',
        'nun', 'missionary', 'apostle', 'disciple', 'saint', 'angel', 'demon',
        'devil', 'satan', 'lucifer', 'antichrist', 'messiah', 'resurrection',
        'crucifixion', 'incarnation', 'trinity', 'virgin', 'mary', 'joseph',
        // Religious holidays and events
        'christmas', 'easter', 'ramadan', 'eid', 'hanukkah', 'diwali', 'vesak',
        'passover', 'yom kippur', 'rosh hashanah', 'good friday', 'palm sunday',
        // Religious texts and figures
        'genesis', 'exodus', 'leviticus', 'deuteronomy', 'psalms', 'proverbs',
        'revelation', 'matthew', 'mark', 'luke', 'john', 'acts', 'romans',
        'corinthians', 'galatians', 'ephesians', 'philippians', 'colossians',
        'thessalonians', 'timothy', 'titus', 'philemon', 'hebrews', 'james',
        'peter', 'jude', 'abraham', 'moses', 'david', 'solomon', 'noah',
        'adam', 'eve', 'cain', 'abel', 'isaac', 'jacob', 'joseph'
      ],
      
      politics: [
        // Political ideologies
        'liberal', 'conservative', 'progressive', 'libertarian', 'socialist',
        'communist', 'fascist', 'nazi', 'marxist', 'capitalist', 'anarchist',
        'nationalist', 'populist', 'centrist', 'moderate', 'radical', 'extremist',
        // Political parties (major ones)
        'democrat', 'republican', 'labour', 'conservative', 'liberal', 'green',
        'socialist', 'communist', 'libertarian', 'tea party', 'progressive',
        // Political figures (recent and controversial)
        'trump', 'biden', 'obama', 'clinton', 'bush', 'reagan', 'carter',
        'nixon', 'kennedy', 'roosevelt', 'lincoln', 'washington',
        'putin', 'xi jinping', 'merkel', 'macron', 'johnson', 'modi',
        'erdogan', 'bolsonaro', 'duterte', 'kim jong', 'assad', 'maduro',
        // Political concepts
        'election', 'vote', 'voting', 'ballot', 'campaign', 'candidate',
        'politician', 'president', 'prime minister', 'senator', 'congressman',
        'representative', 'governor', 'mayor', 'parliament', 'congress',
        'senate', 'house', 'cabinet', 'administration', 'government',
        'democracy', 'republic', 'monarchy', 'dictatorship', 'totalitarian',
        'authoritarian', 'regime', 'coup', 'revolution', 'protest', 'riot',
        'demonstration', 'rally', 'march', 'strike', 'boycott', 'sanctions',
        // Political issues
        'abortion', 'immigration', 'healthcare', 'taxes', 'welfare', 'medicare',
        'medicaid', 'social security', 'unemployment', 'minimum wage',
        'gun control', 'second amendment', 'first amendment', 'constitution',
        'supreme court', 'federal', 'state', 'local', 'municipal',
        'policy', 'legislation', 'bill', 'law', 'regulation', 'executive order',
        'veto', 'filibuster', 'impeachment', 'scandal', 'corruption',
        'lobbying', 'special interest', 'pac', 'super pac', 'donation',
        // International politics
        'nato', 'un', 'united nations', 'eu', 'european union', 'brexit',
        'trade war', 'tariff', 'embargo', 'diplomacy', 'treaty', 'alliance',
        'war', 'conflict', 'military', 'defense', 'security', 'terrorism',
        'isis', 'al qaeda', 'taliban', 'hamas', 'hezbollah', 'ira',
        // Controversial topics
        'climate change', 'global warming', 'vaccine', 'covid', 'pandemic',
        'lockdown', 'mask mandate', 'conspiracy', 'deep state', 'fake news',
        'mainstream media', 'propaganda', 'censorship', 'surveillance',
        'privacy', 'freedom', 'liberty', 'rights', 'civil rights',
        'human rights', 'discrimination', 'racism', 'sexism', 'homophobia',
        'transphobia', 'xenophobia', 'islamophobia', 'antisemitism'
      ]
    };
    
    // Compile regex patterns for better performance
    this.patterns = {};
    for (const category in this.sensitiveWords) {
      this.patterns[category] = new RegExp(
        '\\b(' + this.sensitiveWords[category].join('|') + ')\\b',
        'gi'
      );
    }
  }
  
  // Check if text contains sensitive content
  checkContent(text) {
    if (!text || typeof text !== 'string') {
      return { isClean: true, violations: [] };
    }
    
    const violations = [];
    const normalizedText = this.normalizeText(text);
    
    for (const category in this.patterns) {
      const matches = normalizedText.match(this.patterns[category]);
      if (matches) {
        violations.push({
          category,
          matches: [...new Set(matches)], // Remove duplicates
          count: matches.length
        });
      }
    }
    
    return {
      isClean: violations.length === 0,
      violations,
      text: normalizedText
    };
  }
  
  // Normalize text for better matching
  normalizeText(text) {
    return text
      .toLowerCase()
      .replace(/[^\w\s]/g, ' ') // Replace punctuation with spaces
      .replace(/\s+/g, ' ') // Normalize whitespace
      .trim();
  }
  
  // Get a sanitized version of the text (for logging/debugging)
  getSanitizedText(text) {
    if (!text || typeof text !== 'string') {
      return '';
    }
    
    let sanitized = text;
    for (const category in this.patterns) {
      sanitized = sanitized.replace(this.patterns[category], '[FILTERED]');
    }
    return sanitized;
  }
  
  // Add new sensitive words to a category
  addSensitiveWords(category, words) {
    if (!this.sensitiveWords[category]) {
      this.sensitiveWords[category] = [];
    }
    
    this.sensitiveWords[category].push(...words);
    
    // Recompile pattern for this category
    this.patterns[category] = new RegExp(
      '\\b(' + this.sensitiveWords[category].join('|') + ')\\b',
      'gi'
    );
  }
  
  // Remove words from a category
  removeSensitiveWords(category, words) {
    if (!this.sensitiveWords[category]) {
      return;
    }
    
    this.sensitiveWords[category] = this.sensitiveWords[category].filter(
      word => !words.includes(word)
    );
    
    // Recompile pattern for this category
    this.patterns[category] = new RegExp(
      '\\b(' + this.sensitiveWords[category].join('|') + ')\\b',
      'gi'
    );
  }
  
  // Get all sensitive words for a category
  getSensitiveWords(category) {
    return this.sensitiveWords[category] || [];
  }
  
  // Get all categories
  getCategories() {
    return Object.keys(this.sensitiveWords);
  }
  
  // Generate a user-friendly error message
  generateErrorMessage(violations) {
    if (violations.length === 0) {
      return null;
    }
    
    const categories = violations.map(v => v.category).join(', ');
    return `Content contains inappropriate material related to: ${categories}. Please revise your text and try again.`;
  }
}

module.exports = ContentFilter; 