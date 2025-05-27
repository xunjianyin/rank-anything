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
      ],
      
      chinese_sensitive: [
        // Political sensitive words in Chinese
        '习近平', '毛泽东', '邓小平', '江泽民', '胡锦涛', '温家宝', '李克强', '李鹏',
        '朱镕基', '周恩来', '刘少奇', '林彪', '四人帮', '文化大革命', '文革',
        '六四', '天安门', '八九民运', '学生运动', '民主运动', '反革命',
        '法轮功', '李洪志', '轮子', '大法', '真善忍', '九评', '退党',
        '共产党', '中共', '党委', '政治局', '中央委员会', '人大', '政协',
        '台独', '藏独', '疆独', '港独', '分裂', '独立', '自治', '达赖',
        '班禅', '喇嘛', '西藏', '新疆', '维吾尔', '香港', '澳门', '台湾',
        '一国两制', '九二共识', '统一', '解放', '武统', '和统',
        '民主', '自由', '人权', '言论自由', '新闻自由', '集会自由',
        '游行', '示威', '抗议', '罢工', '维权', '上访', '请愿',
        '异议', '异见', '反对派', '民运', '民主派', '自由派',
        '敏感', '封锁', '屏蔽', '删除', '河蟹', '和谐', '404',
        '翻墙', 'VPN', '代理', '梯子', '防火墙', 'GFW',
        '五毛', '自干五', '小粉红', '战狼', '爱国贼', '汉奸', '卖国贼',
        '反华', '辱华', '精日', '精美', '公知', '带路党',
        '计划生育', '一胎化', '强制堕胎', '强制绝育', '超生',
        '腐败', '贪污', '受贿', '行贿', '洗钱', '官商勾结',
        '暴动', '骚乱', '动乱', '叛乱', '起义', '革命', '推翻',
        '颠覆', '政变', '兵变', '造反', '反叛', '叛国',
        // Religious sensitive words in Chinese
        '基督教', '天主教', '伊斯兰教', '佛教', '道教', '儒教',
        '耶稣', '上帝', '真主', '阿拉', '佛祖', '观音', '弥勒',
        '教会', '教堂', '寺庙', '清真寺', '道观', '修道院',
        '牧师', '神父', '修女', '阿訇', '和尚', '尼姑', '道士',
        '传教', '布道', '福音', '圣经', '古兰经', '佛经', '道德经',
        '祈祷', '礼拜', '朝拜', '念经', '诵经', '打坐', '修行',
        '圣诞节', '复活节', '开斋节', '古尔邦节', '佛诞节',
        '邪教', '异端', '迷信', '封建迷信', '巫术', '占卜',
        // Pornographic content in Chinese
        '色情', '淫秽', '黄色', '成人', '性爱', '做爱', '性交',
        '自慰', '手淫', '撸管', '打飞机', '口交', '肛交',
        '妓女', '嫖娼', '卖淫', '援交', '包养', '小三', '情妇',
        '性器官', '阴茎', '阴道', '乳房', '胸部', '屁股', '臀部',
        '裸体', '裸照', '艳照', '春宫', '激情', '床戏', '性感',
        '诱惑', '勾引', '调情', '暧昧', '偷情', '出轨', '劈腿',
        '一夜情', '约炮', '开房', '酒店', '宾馆', '情趣',
        '避孕套', '安全套', '伟哥', '春药', '催情', '壮阳',
        '性虐', '捆绑', '调教', 'SM', '变态', '恋足', '恋物',
        // Vulgar and offensive terms in Chinese
        '操', '草', '日', '干', '艹', '靠', '妈的', '他妈的',
        '傻逼', '煞笔', '沙比', '白痴', '智障', '脑残', '弱智',
        '贱人', '婊子', '妓女', '骚货', '荡妇', '淫妇', '破鞋',
        '王八蛋', '混蛋', '杂种', '野种', '私生子', '狗娘养的',
        '滚', '滚蛋', '去死', '死去', '找死', '该死', '活该',
        '垃圾', '废物', '人渣', '败类', '畜生', '禽兽', '狗东西',
        // Discriminatory terms in Chinese
        '歧视', '种族歧视', '性别歧视', '地域歧视', '职业歧视',
        '黑鬼', '白鬼', '鬼子', '小日本', '棒子', '阿三', '老毛子',
        '乡巴佬', '土包子', '农民工', '打工仔', '民工', '外地人',
        '残疾', '瘸子', '瞎子', '聋子', '哑巴', '智障', '精神病',
        '同性恋', '基佬', '拉拉', '变性人', '人妖', '娘炮', '娘娘腔'
      ]
    };
    
    // Compile regex patterns for better performance
    this.patterns = {};
    for (const category in this.sensitiveWords) {
      // For Chinese characters, we don't use word boundaries as they don't work with Chinese
      if (category === 'chinese_sensitive') {
        this.patterns[category] = new RegExp(
          '(' + this.sensitiveWords[category].join('|') + ')',
          'gi'
        );
      } else {
        this.patterns[category] = new RegExp(
          '\\b(' + this.sensitiveWords[category].join('|') + ')\\b',
          'gi'
        );
      }
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
      // Keep Chinese characters, letters, numbers, and spaces
      .replace(/[^\w\s\u4e00-\u9fff\u3400-\u4dbf\u20000-\u2a6df\u2a700-\u2b73f\u2b740-\u2b81f\u2b820-\u2ceaf\uf900-\ufaff\u3300-\u33ff\ufe30-\ufe4f\u2f800-\u2fa1f]/g, ' ')
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
    if (category === 'chinese_sensitive') {
      this.patterns[category] = new RegExp(
        '(' + this.sensitiveWords[category].join('|') + ')',
        'gi'
      );
    } else {
      this.patterns[category] = new RegExp(
        '\\b(' + this.sensitiveWords[category].join('|') + ')\\b',
        'gi'
      );
    }
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
    if (category === 'chinese_sensitive') {
      this.patterns[category] = new RegExp(
        '(' + this.sensitiveWords[category].join('|') + ')',
        'gi'
      );
    } else {
      this.patterns[category] = new RegExp(
        '\\b(' + this.sensitiveWords[category].join('|') + ')\\b',
        'gi'
      );
    }
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