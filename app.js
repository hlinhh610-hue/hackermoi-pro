// =========================================================
// VocabHacker PRO - Smart TOEIC Vocabulary Learning System
// =========================================================

class VocabHackerApp {
  constructor() {
    this.currentView = 'dashboard';
    this.currentDay = 'all';
    this.currentCategory = 'all';
    this.viewMode = 'grid';
    this.vocabRenderLimit = 60;
    this.theme = localStorage.getItem('vh-theme') || 'dark';
    this.accent = localStorage.getItem('vh-accent') || 'en-US'; // en-US or en-GB

    // Flashcard state
    this.flashcardIndex = 0;
    this.flashcardList = [];
    this.isFlipped = false;
    this.fcAutoPlayTimer = null;

    // Quiz state
    this.quizQuestions = [];
    this.quizIndex = 0;
    this.quizScore = 0;
    this.quizAnswered = false;
    this.quizMistakes = [];

    // Vocab Drill state
    this.drillWords = [];
    this.drillIndex = 0;
    this.drillCorrect = 0;
    this.drillWrong = 0;
    this.drillAnswered = false;
    this.drillSelectedDays = ['all'];
    this.drillMode = 'en-to-vi';

    // Match Game state
    this.matchCards = [];
    this.matchSelected = null;
    this.matchPairsLeft = 0;
    this.matchStartTime = 0;
    this.matchTimerInterval = null;
    this.matchBestTime = parseFloat(localStorage.getItem('vh-match-best') || '0');

    // User progress (persisted)
    this.learned = JSON.parse(localStorage.getItem('vh-learned') || '{}');
    this.starred = JSON.parse(localStorage.getItem('vh-starred') || '{}');
    this.notes = JSON.parse(localStorage.getItem('vh-notes') || '{}');
    this.mistakes = JSON.parse(localStorage.getItem('vh-mistakes') || '{}'); // wordId -> count
    this.activity = JSON.parse(localStorage.getItem('vh-activity') || '[]');
    this.streakData = JSON.parse(localStorage.getItem('vh-streak') || '{"lastDate":"","count":0}');
    this.dailyGoal = JSON.parse(localStorage.getItem('vh-daily-goal') || '{"date":"","count":0,"target":20}');

    this.allWords = [];
    this.wotdWord = null;

    this.init();
  }

  init() {
    this._srsLoad();
    this.buildAllWords();
    this.applyTheme();
    this.updateAccentUI();
    this.checkDailyGoalReset();
    this.populateDaysList();
    this.populateDayFilters();
    this.updateStreak();
    this.pickWordOfTheDay();
    this.updateDashboard();
    this.setupEventListeners();
    this.renderVocabGrid(true);
    this.loadFlashcards();

    const navTotal = document.getElementById('navTotalBadge');
    if (navTotal) navTotal.textContent = this.allWords.length;

    document.getElementById('app')?.classList.add('loaded');
  }

  // ==========================================
  // Data & Smart Helpers
  // ==========================================

  buildAllWords() {
    this.allWords = [];
    const data = window.vocabData;
    if (!data) return;

    Object.keys(data).forEach(day => {
      const dayData = data[day];
      const categories = ['mainWords', 'basicWords', 'level800Words', 'level900Words'];
      categories.forEach(cat => {
        if (dayData[cat]) {
          dayData[cat].forEach((w, idx) => {
            this.allWords.push({
              _id: `${day}-${cat}-${idx}`,
              _day: day,
              _category: cat,
              english: (w.english || w.word || '').trim(),
              vietnamese: (w.vietnamese || w.meaning || '').trim(),
              antonym: (w.antonym || '').trim(),
              exampleEn: (w.exampleEn || '').trim(),
              exampleVi: (w.exampleVi || '').trim(),
              part: (w.part || '').trim(),
            });
          });
        }
      });
    });
  }

  getFilteredWords(day = 'all', category = 'all', status = 'all', searchQuery = '') {
    let words = this.allWords;
    if (day !== 'all') words = words.filter(w => w._day === day);
    if (category !== 'all') words = words.filter(w => w._category === category);
    if (status === 'learned') words = words.filter(w => this.learned[w._id]);
    else if (status === 'starred') words = words.filter(w => this.starred[w._id]);
    else if (status === 'unlearned') words = words.filter(w => !this.learned[w._id]);
    else if (status === 'hasnote') words = words.filter(w => this.notes[w._id] && this.notes[w._id].trim().length > 0);

    if (searchQuery && searchQuery.trim().length > 0) {
      const q = searchQuery.toLowerCase().trim();
      words = words.filter(w =>
        w.english.toLowerCase().includes(q) ||
        w.vietnamese.toLowerCase().includes(q) ||
        (w.exampleEn && w.exampleEn.toLowerCase().includes(q)) ||
        (this.notes[w._id] && this.notes[w._id].toLowerCase().includes(q))
      );
    }
    return words;
  }

  getCategoryLabel(cat) {
    const labels = {
      mainWords: 'Main 600+',
      basicWords: 'Basic LC/RC',
      level800Words: 'Level 800+',
      level900Words: 'Level 900+'
    };
    return labels[cat] || cat;
  }

  getCategoryColor(cat) {
    const colors = {
      mainWords: '#818cf8',
      basicWords: '#34d399',
      level800Words: '#fbbf24',
      level900Words: '#f472b6'
    };
    return colors[cat] || '#818cf8';
  }

  highlightWordInSentence(sentence, targetWord) {
    if (!sentence || !targetWord) return sentence || '';
    const cleanTarget = targetWord.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    // Match the stem or exact word
    const stem = cleanTarget.length > 4 ? cleanTarget.slice(0, -1) : cleanTarget;
    const regex = new RegExp(`(\\b${stem}\\w*\\b)`, 'gi');
    if (regex.test(sentence)) {
      return sentence.replace(regex, '<mark class="word-hl">$1</mark>');
    }
    return sentence;
  }

  maskWordInSentence(sentence, targetWord) {
    if (!sentence || !targetWord) return `______ (${targetWord.length} chữ cái)`;
    const cleanTarget = targetWord.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const stem = cleanTarget.length > 4 ? cleanTarget.slice(0, -1) : cleanTarget;
    const regex = new RegExp(`\\b${stem}\\w*\\b`, 'gi');
    if (regex.test(sentence)) {
      return sentence.replace(regex, '<span class="cloze-blank">________</span>');
    }
    // Fallback if morphological variation didn't match
    return `${sentence} <br><small style="color:var(--text-muted)">(Chọn từ phù hợp nhất)</small>`;
  }

  recordMistake(wordId) {
    this.mistakes[wordId] = (this.mistakes[wordId] || 0) + 1;
    localStorage.setItem('vh-mistakes', JSON.stringify(this.mistakes));
  }

  // ==========================================
  // Daily Goal & Streak
  // ==========================================

  getLocalDateStr(d = new Date()) {
    const year = d.getFullYear();
    const month = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
  }

  checkDailyGoalReset() {
    const today = this.getLocalDateStr();
    if (this.dailyGoal.date !== today) {
      this.dailyGoal.date = today;
      this.dailyGoal.count = 0;
      if (!this.dailyGoal.target) this.dailyGoal.target = 20;
      localStorage.setItem('vh-daily-goal', JSON.stringify(this.dailyGoal));
    }
    this.updateDailyGoalUI();
  }

  incrementDailyGoal(amount = 1) {
    this.checkDailyGoalReset();
    const prevCount = this.dailyGoal.count;
    this.dailyGoal.count += amount;
    localStorage.setItem('vh-daily-goal', JSON.stringify(this.dailyGoal));
    this.updateDailyGoalUI();

    if (prevCount < this.dailyGoal.target && this.dailyGoal.count >= this.dailyGoal.target) {
      this._showToast(`🎉 Xuất sắc! Bạn đã hoàn thành mục tiêu ${this.dailyGoal.target} từ hôm nay!`);
      this.launchConfetti();
    }
  }

  updateDailyGoalUI() {
    const count = this.dailyGoal.count || 0;
    const target = this.dailyGoal.target || 20;
    const pct = Math.min(Math.round((count / target) * 100), 100);
    const textEl = document.getElementById('topGoalText');
    const ringEl = document.getElementById('topGoalRing');
    if (textEl) textEl.textContent = `${count}/${target} từ`;
    if (ringEl) ringEl.setAttribute('stroke-dasharray', `${pct}, 100`);
  }

  openGoalModal() {
    document.getElementById('goalModal')?.classList.remove('hidden');
  }

  closeGoalModal() {
    document.getElementById('goalModal')?.classList.add('hidden');
  }

  setDailyGoalTarget(target) {
    this.dailyGoal.target = target;
    localStorage.setItem('vh-daily-goal', JSON.stringify(this.dailyGoal));
    this.updateDailyGoalUI();
    this.closeGoalModal();
    this._showToast(`🎯 Đã đặt mục tiêu mới: ${target} từ / ngày!`);
  }

  // ==========================================
  // Theme & Accent
  // ==========================================

  applyTheme() {
    document.documentElement.setAttribute('data-theme', this.theme);
    const sunIcon = document.querySelector('.sun-icon');
    const moonIcon = document.querySelector('.moon-icon');
    if (sunIcon && moonIcon) {
      sunIcon.style.display = this.theme === 'dark' ? 'block' : 'none';
      moonIcon.style.display = this.theme === 'dark' ? 'none' : 'block';
    }
  }

  toggleTheme() {
    this.theme = this.theme === 'dark' ? 'light' : 'dark';
    localStorage.setItem('vh-theme', this.theme);
    this.applyTheme();
  }

  toggleAccent() {
    this.accent = this.accent === 'en-US' ? 'en-GB' : 'en-US';
    localStorage.setItem('vh-accent', this.accent);
    this.updateAccentUI();
    this._showToast(`🔊 Đã chuyển giọng phát âm sang ${this.accent === 'en-US' ? 'Anh - Mỹ (US) 🇺🇸' : 'Anh - Anh (UK) 🇬🇧'}`);
  }

  updateAccentUI() {
    const flag = document.getElementById('accentFlag');
    const label = document.getElementById('accentLabel');
    if (flag) flag.textContent = this.accent === 'en-US' ? '🇺🇸' : '🇬🇧';
    if (label) label.textContent = this.accent === 'en-US' ? 'US' : 'UK';
  }

  // ==========================================
  // Navigation
  // ==========================================

  navigateTo(view, day = null) {
    this.stopAutoPlayFlashcards();
    if (this.matchTimerInterval && view !== 'matchgame') {
      clearInterval(this.matchTimerInterval);
    }

    this.currentView = view;

    document.querySelectorAll('.nav-item').forEach(n => n.classList.remove('active'));
    const navBtn = document.querySelector(`[data-view="${view}"]`);
    if (navBtn) navBtn.classList.add('active');

    document.querySelectorAll('.view').forEach(v => v.classList.remove('active'));
    const viewEl = document.getElementById(`${view}View`);
    if (viewEl) {
      viewEl.classList.add('active');
      viewEl.style.animation = 'fadeIn 0.35s ease';
    }

    const titles = {
      dashboard: ['Tổng quan & Phân tích', 'Theo dõi tiến độ và đề xuất học tập thông minh'],
      vocabulary: ['Kho Từ Vựng Hackers TOEIC', 'Tra cứu, lọc theo cấp độ và ghi chú cá nhân'],
      flashcards: ['Flashcards 3D Thông Minh', 'Lật thẻ, nghe phát âm tự động và đánh dấu nhanh'],
      quiz: ['Trắc Nghiệm & Luyện Part 5', 'Kiểm tra từ vựng và điền từ vào ngữ cảnh TOEIC'],
      vocabdrill: ['Luyện Gõ Từ & Nghe Chính Tả', 'Rèn luyện trí nhớ chủ động và kỹ năng nghe'],
      matchgame: ['Phản Xạ Ghép Thẻ Tốc Độ', 'Tăng tốc độ nhận diện từ vựng Anh - Việt'],
      srs: ['Ôn Tập Ngắt Quãng (SM-2)', 'Ghi nhớ từ vựng dài hạn theo đường cong lãng quên']
    };
    const [title, subtitle] = titles[view] || titles.dashboard;
    document.getElementById('topbarTitle').textContent = title;
    const subEl = document.getElementById('topbarSubtitle');
    if (subEl) subEl.textContent = subtitle;

    if (day) {
      this.currentDay = day;
      const df = document.getElementById('dayFilter');
      const fdf = document.getElementById('flashcardDayFilter');
      if (df) df.value = day;
      if (fdf) fdf.value = day;
    }

    this.closeSidebar();

    if (view === 'vocabulary') this.renderVocabGrid(true);
    if (view === 'flashcards') this.loadFlashcards();
    if (view === 'dashboard') this.updateDashboard();
    if (view === 'srs') this.updateSRSDashboard();
    if (view === 'matchgame') this.startMatchGame();
  }

  filterByStatusAndGo(status) {
    const statusEl = document.getElementById('statusFilter');
    const dayEl = document.getElementById('dayFilter');
    if (statusEl) statusEl.value = status;
    if (dayEl) dayEl.value = 'all';
    this.navigateTo('vocabulary');
  }

  // ==========================================
  // Sidebar
  // ==========================================

  populateDaysList() {
    const container = document.getElementById('daysList');
    if (!window.vocabData || !container) return;
    const days = Object.keys(window.vocabData);
    container.innerHTML = days.map(day => {
      const dayNum = day.replace('Day ', '');
      const words = this.getFilteredWords(day);
      const wordCount = words.length;
      const learnedCount = words.filter(w => this.learned[w._id]).length;
      const percent = wordCount > 0 ? Math.round((learnedCount / wordCount) * 100) : 0;
      const isComplete = percent === 100 && wordCount > 0;
      return `
        <button class="day-btn ${this.currentDay === day ? 'active' : ''}" data-day="${dayNum}" onclick="app.selectDay('${day}')">
          <div class="day-btn-info">
            <span class="day-btn-label">${isComplete ? '✅ ' : ''}Day ${dayNum}</span>
            <span class="day-btn-count mono-text">${learnedCount}/${wordCount}</span>
          </div>
          <div class="day-btn-progress">
            <div class="day-btn-progress-fill" style="width:${percent}%"></div>
          </div>
        </button>
      `;
    }).join('');
  }

  selectDay(day) {
    this.currentDay = day;
    document.querySelectorAll('.day-btn').forEach(b => b.classList.remove('active'));
    const dayNum = day.replace('Day ', '');
    const btn = document.querySelector(`.day-btn[data-day="${dayNum}"]`);
    if (btn) btn.classList.add('active');

    this.navigateTo('vocabulary', day);
  }

  populateDayFilters() {
    if (!window.vocabData) return;
    const days = Object.keys(window.vocabData);
    const selects = ['dayFilter', 'flashcardDayFilter', 'quizDayFilter', 'srsDayFilter', 'matchDayFilter'];
    selects.forEach(id => {
      const sel = document.getElementById(id);
      if (!sel) return;
      sel.innerHTML = '<option value="all">Tất cả Days</option>' +
        days.map(d => `<option value="${d}">${d}</option>`).join('');
    });

    const drillPicker = document.getElementById('drillDayPicker');
    if (drillPicker) {
      const chips = days.map(d => {
        const num = d.replace('Day ', '');
        return `<button class="drill-day-chip" data-day="${d}" onclick="app.toggleDrillDay('${d}', this)">Day ${num}</button>`;
      }).join('');
      drillPicker.innerHTML = `<button class="drill-day-chip active" data-day="all" onclick="app.toggleDrillDay('all', this)">Tất cả</button>${chips}`;
    }
  }

  closeSidebar() {
    document.getElementById('sidebar')?.classList.remove('active');
    document.getElementById('sidebarOverlay')?.classList.remove('active');
    document.body.classList.remove('sidebar-open');
  }

  openSidebar() {
    document.getElementById('sidebar')?.classList.add('active');
    document.getElementById('sidebarOverlay')?.classList.add('active');
    document.body.classList.add('sidebar-open');
  }

  // ==========================================
  // Dashboard & Smart Recommendations
  // ==========================================

  pickWordOfTheDay(forceRandom = false) {
    if (this.allWords.length === 0) return;
    const unlearned = this.allWords.filter(w => !this.learned[w._id] && w.exampleEn);
    const pool = unlearned.length > 0 ? unlearned : this.allWords;

    if (forceRandom) {
      this.wotdWord = pool[Math.floor(Math.random() * pool.length)];
    } else {
      // Deterministic daily index unless refreshed
      const todayStr = this.getLocalDateStr();
      let hash = 0;
      for (let i = 0; i < todayStr.length; i++) hash = (hash * 31 + todayStr.charCodeAt(i)) % pool.length;
      this.wotdWord = pool[hash];
    }
    this.renderWotd();
  }

  renderWotd() {
    if (!this.wotdWord) return;
    const w = this.wotdWord;
    const wordEl = document.getElementById('wotdWord');
    const dayEl = document.getElementById('wotdDay');
    const meanEl = document.getElementById('wotdMeaning');
    const exEl = document.getElementById('wotdExample');
    const btnEl = document.getElementById('wotdDetailBtn');

    if (wordEl) wordEl.textContent = w.english;
    if (dayEl) dayEl.textContent = `${w._day} • ${this.getCategoryLabel(w._category)}`;
    if (meanEl) meanEl.textContent = w.vietnamese;
    if (exEl) exEl.innerHTML = w.exampleEn ? `"${this.highlightWordInSentence(w.exampleEn, w.english)}"` : '';
    if (btnEl) btnEl.onclick = () => this.openWordModal(w._id);
  }

  refreshWotd() {
    this.pickWordOfTheDay(true);
  }

  speakWotd() {
    if (this.wotdWord) this.speak(this.wotdWord.english);
  }

  startSmartStudy() {
    // Check if there are due SRS cards first
    const now = Date.now();
    const dueWords = this.allWords.filter(w => this.srsData?.[w._id]?.nextReview <= now);
    if (dueWords.length >= 5) {
      this.navigateTo('srs');
      this.startSRSReviewDue();
      return;
    }
    // Otherwise find the first Day that is not 100% learned and launch flashcards for unlearned words
    const days = Object.keys(window.vocabData || {});
    let targetDay = 'Day 01';
    for (const d of days) {
      const unlearnedInDay = this.getFilteredWords(d, 'all', 'unlearned');
      if (unlearnedInDay.length > 0) {
        targetDay = d;
        break;
      }
    }
    this.navigateTo('flashcards', targetDay);
    const statusSel = document.getElementById('flashcardStatusFilter');
    if (statusSel) statusSel.value = 'unlearned';
    this.loadFlashcards();
    this._showToast(`⚡ Bắt đầu học các từ chưa thuộc của ${targetDay}!`);
  }

  startSmartQuiz(type) {
    this.navigateTo('quiz');
    const qt = document.getElementById('quizType');
    if (qt) qt.value = type;
    this.startQuiz();
  }

  startSmartDrill(mode) {
    this.navigateTo('vocabdrill');
    const dm = document.getElementById('drillModeFilter');
    if (dm) dm.value = mode;
    this.startVocabDrill();
  }

  updateDashboard() {
    const total = this.allWords.length;
    const learned = Object.keys(this.learned).filter(k => this.learned[k]).length;
    const starred = Object.keys(this.starred).filter(k => this.starred[k]).length;

    // Greeting based on hour
    const hr = new Date().getHours();
    const greetEl = document.getElementById('heroGreetingBadge');
    if (greetEl) {
      if (hr < 12) greetEl.textContent = '🌅 Chào buổi sáng! Khởi động ngày mới với 20 từ TOEIC nhé';
      else if (hr < 18) greetEl.textContent = '☀️ Chào buổi chiều! Duy trì chuỗi streak học tập nào';
      else greetEl.textContent = '🌙 Chào buổi tối! Ôn tập nhẹ nhàng trước khi nghỉ ngơi nhé';
    }

    this.animateCounter('totalWords', total);
    this.animateCounter('learnedWords', learned);
    this.animateCounter('starredWords', starred);
    this.animateCounter('streakDays', this.streakData.count);

    // SRS due badge
    const now = Date.now();
    const dueCount = this.allWords.filter(w => this.srsData?.[w._id]?.nextReview <= now).length;
    const dueLabel = document.getElementById('dashDueLabel');
    if (dueLabel) dueLabel.textContent = dueCount > 0 ? `🔔 ${dueCount} từ đến hạn ôn SRS` : '✅ Đã hoàn thành SRS hôm nay';
    const navSrsBadge = document.getElementById('navSrsDueBadge');
    if (navSrsBadge) {
      navSrsBadge.textContent = dueCount;
      navSrsBadge.classList.toggle('hidden', dueCount === 0);
    }

    // Overall progress
    const percent = total > 0 ? Math.round((learned / total) * 100) : 0;
    document.getElementById('overallPercent').textContent = percent + '%';
    document.getElementById('overallProgressBar').style.width = percent + '%';

    // Estimated TOEIC Score based on learned words
    const estScore = Math.min(990, Math.round(350 + (learned / Math.max(total, 1)) * 640));
    const scoreEl = document.getElementById('estimatedToeicScore');
    if (scoreEl) scoreEl.textContent = `${estScore}+ điểm`;

    this.renderCategoryMastery();
    this.renderDailyProgress();
    this.renderWeakWords();
    this.renderRecentActivity();
    this.updateDailyGoalUI();
  }

  renderCategoryMastery() {
    const container = document.getElementById('categoryMasteryList');
    if (!container) return;
    const cats = [
      { key: 'basicWords', name: 'Basic Words (Nền tảng 450-600)', color: '#34d399' },
      { key: 'mainWords', name: 'Main Words (Trọng tâm 650-750)', color: '#818cf8' },
      { key: 'level800Words', name: 'Level 800 (Bứt phá 800+)', color: '#fbbf24' },
      { key: 'level900Words', name: 'Level 900+ (Chinh phục 900-990)', color: '#f472b6' }
    ];

    container.innerHTML = cats.map(c => {
      const words = this.allWords.filter(w => w._category === c.key);
      const learnedCount = words.filter(w => this.learned[w._id]).length;
      const pct = words.length > 0 ? Math.round((learnedCount / words.length) * 100) : 0;
      return `
        <div class="cm-item" onclick="document.getElementById('categoryFilter').value='${c.key}'; app.navigateTo('vocabulary');" style="cursor:pointer">
          <div class="cm-top">
            <span class="cm-name"><span class="cm-dot" style="background:${c.color}"></span>${c.name}</span>
            <span class="cm-stats mono-text">${learnedCount} / ${words.length} (${pct}%)</span>
          </div>
          <div class="cm-bar">
            <div class="cm-fill" style="width:${pct}%; background:${c.color}"></div>
          </div>
        </div>
      `;
    }).join('');
  }

  renderWeakWords() {
    const container = document.getElementById('weakWordsContainer');
    if (!container) return;

    // Combine words with mistakes, "again" SRS rating, or starred
    const weakPool = this.allWords.filter(w => {
      const mCount = this.mistakes[w._id] || 0;
      const isAgain = this.srsData?.[w._id]?.lastRating === 'again';
      const isStar = this.starred[w._id];
      return mCount > 0 || isAgain || isStar;
    }).sort((a, b) => (this.mistakes[b._id] || 0) - (this.mistakes[a._id] || 0)).slice(0, 6);

    if (weakPool.length === 0) {
      container.innerHTML = `
        <div class="empty-state" style="padding:1.25rem 0.5rem">
          <p style="font-size:0.875rem">Chưa có từ khó hay làm sai. Hãy gắn ⭐ hoặc làm Quiz để hệ thống tự động phát hiện từ yếu!</p>
        </div>
      `;
      return;
    }

    container.innerHTML = `<div class="weak-words-list">${weakPool.map(w => `
      <div class="weak-word-chip" onclick="app.openWordModal('${w._id}')">
        <div class="ww-left">
          <strong class="ww-en">${w.english}</strong>
          <span class="ww-vi">${w.vietnamese}</span>
        </div>
        <div class="ww-right">
          ${this.mistakes[w._id] ? `<span class="ww-badge-err">Sai ${this.mistakes[w._id]}×</span>` : '<span class="ww-badge-star">⭐</span>'}
        </div>
      </div>
    `).join('')}</div>`;
  }

  reviewWeakWords() {
    const weakPool = this.allWords.filter(w =>
      (this.mistakes[w._id] || 0) > 0 ||
      this.srsData?.[w._id]?.lastRating === 'again' ||
      this.starred[w._id]
    );
    if (weakPool.length === 0) {
      this._showToast('🎉 Bạn chưa có từ yếu nào trong danh sách! Hãy gắn sao các từ khó trước nhé.');
      return;
    }
    this.navigateTo('flashcards');
    this.flashcardList = weakPool;
    this.flashcardIndex = 0;
    this.isFlipped = false;
    this.updateFlashcardSearchList();
    this.showFlashcard();
    this._showToast(`🎯 Đang ôn tập ${weakPool.length} từ vựng khó / hay nhầm lẫn!`);
  }

  animateCounter(id, target) {
    const el = document.getElementById(id);
    if (!el) return;
    const start = parseInt(el.textContent) || 0;
    if (start === target) { el.textContent = target; return; }
    const duration = 600;
    const startTime = performance.now();

    const animate = (now) => {
      const elapsed = now - startTime;
      const progress = Math.min(elapsed / duration, 1);
      const eased = 1 - Math.pow(1 - progress, 3);
      el.textContent = Math.round(start + (target - start) * eased);
      if (progress < 1) requestAnimationFrame(animate);
    };
    requestAnimationFrame(animate);
  }

  renderDailyProgress() {
    const container = document.getElementById('dailyProgressGrid');
    if (!window.vocabData || !container) return;

    const days = Object.keys(window.vocabData);
    container.innerHTML = `<div class="daily-progress-grid">${days.map(day => {
      const words = this.getFilteredWords(day);
      const learnedCount = words.filter(w => this.learned[w._id]).length;
      const total = words.length;
      const percent = total > 0 ? Math.round((learnedCount / total) * 100) : 0;
      const dayNum = day.replace('Day ', '');
      const doneClass = percent === 100 ? 'dp-done' : '';

      return `
        <div class="daily-progress-item ${doneClass}" onclick="app.selectDay('${day}')">
          <div class="dp-circle" style="--percent: ${percent}">
            <svg viewBox="0 0 36 36">
              <path class="dp-bg" d="M18 2.0845a15.9155 15.9155 0 0 1 0 31.831 15.9155 15.9155 0 0 1 0-31.831"/>
              <path class="dp-fill" d="M18 2.0845a15.9155 15.9155 0 0 1 0 31.831 15.9155 15.9155 0 0 1 0-31.831"
                stroke-dasharray="${percent}, 100"/>
            </svg>
            <span class="dp-percent mono-text">${percent}%</span>
          </div>
          <span class="dp-label">Day ${dayNum}</span>
          <span class="dp-count mono-text">${learnedCount}/${total}</span>
        </div>
      `;
    }).join('')}</div>`;
  }

  renderRecentActivity() {
    const container = document.getElementById('recentActivity');
    if (!container) return;

    if (this.activity.length === 0) {
      container.innerHTML = '<div class="empty-state" style="padding:1.5rem"><p>Hãy bắt đầu học để xem lịch sử hoạt động!</p></div>';
      return;
    }

    const recent = this.activity.slice(-7).reverse();
    container.innerHTML = recent.map(a => `
      <div class="recent-activity-item">
        <span class="activity-icon">${a.type === 'learned' ? '✅' : a.type === 'starred' ? '⭐' : a.type === 'quiz' ? '🎯' : '📖'}</span>
        <span class="activity-text">${a.text}</span>
        <span class="activity-time mono-text">${this.timeAgo(a.time)}</span>
      </div>
    `).join('');
  }

  timeAgo(timestamp) {
    const seconds = Math.floor((Date.now() - timestamp) / 1000);
    if (seconds < 60) return 'Vừa xong';
    if (seconds < 3600) return Math.floor(seconds / 60) + ' phút';
    if (seconds < 86400) return Math.floor(seconds / 3600) + ' giờ';
    return Math.floor(seconds / 86400) + ' ngày';
  }

  updateStreak() {
    const today = this.getLocalDateStr(new Date());
    if (this.streakData.lastDate === today) return;

    const yesterdayDate = new Date();
    yesterdayDate.setDate(yesterdayDate.getDate() - 1);
    const yesterday = this.getLocalDateStr(yesterdayDate);

    if (this.streakData.lastDate === yesterday) {
      this.streakData.count++;
    } else {
      this.streakData.count = 1;
    }
    this.streakData.lastDate = today;
    localStorage.setItem('vh-streak', JSON.stringify(this.streakData));
  }

  // ==========================================
  // Vocabulary Browser (with Smart Pagination)
  // ==========================================

  renderVocabGrid(resetLimit = false) {
    if (resetLimit) this.vocabRenderLimit = 60;

    const day = document.getElementById('dayFilter')?.value || 'all';
    const category = document.getElementById('categoryFilter')?.value || 'all';
    const status = document.getElementById('statusFilter')?.value || 'all';
    const localSearch = document.getElementById('vocabLocalSearch')?.value || '';

    const words = this.getFilteredWords(day, category, status, localSearch);
    document.getElementById('filteredCount').textContent = words.length;

    const container = document.getElementById('vocabGrid');
    const loadMoreWrap = document.getElementById('vocabLoadMoreWrap');
    if (!container) return;

    container.className = this.viewMode === 'list' ? 'vocab-grid list-view' : 'vocab-grid';

    if (words.length === 0) {
      container.innerHTML = '<div class="empty-state" style="grid-column:1/-1"><p>Không tìm thấy từ vựng nào khớp với bộ lọc hiện tại.</p></div>';
      loadMoreWrap?.classList.add('hidden');
      return;
    }

    const visibleWords = words.slice(0, this.vocabRenderLimit);
    if (loadMoreWrap) {
      if (words.length > this.vocabRenderLimit) {
        loadMoreWrap.classList.remove('hidden');
        document.getElementById('vocabLoadMoreBtn').textContent = `Hiển thị thêm (${words.length - this.vocabRenderLimit} từ còn lại) ↓`;
      } else {
        loadMoreWrap.classList.add('hidden');
      }
    }

    container.innerHTML = visibleWords.map((w, i) => {
      const isLearned = this.learned[w._id];
      const isStarred = this.starred[w._id];
      const hasNote = this.notes[w._id] && this.notes[w._id].trim().length > 0;
      const catColor = this.getCategoryColor(w._category);

      return `
        <div class="word-card glass-card ${isLearned ? 'learned' : ''} ${isStarred ? 'starred' : ''}"
             style="animation-delay: ${Math.min((i % 20) * 0.015, 0.3)}s"
             onclick="app.openWordModal('${w._id}')">
          <div class="word-card-header">
            <div style="display:flex; gap:0.4rem; align-items:center;">
              <span class="badge" style="background: ${catColor}18; color: ${catColor}; border-color:${catColor}35">${this.getCategoryLabel(w._category)}</span>
              ${w.part ? `<span class="badge">${w.part}</span>` : ''}
            </div>
            <div class="word-card-actions" onclick="event.stopPropagation()">
              <button class="wc-action" onclick="app.speak('${w.english.replace(/'/g, "\\'")}')" title="Nghe phát âm">
                🔊
              </button>
              <button class="wc-action ${isLearned ? 'active' : ''}" onclick="app.toggleLearnedById('${w._id}')" title="Đánh dấu Đã thuộc">
                <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><polyline points="20 6 9 17 4 12"/></svg>
              </button>
              <button class="wc-action star ${isStarred ? 'active' : ''}" onclick="app.toggleStarById('${w._id}')" title="Gắn sao">
                <svg width="15" height="15" viewBox="0 0 24 24" fill="${isStarred ? 'currentColor' : 'none'}" stroke="currentColor" stroke-width="2"><polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"/></svg>
              </button>
            </div>
          </div>
          <div class="word-en">${w.english}</div>
          <div class="word-vi">${w.vietnamese}</div>
          ${w.exampleEn ? `<div class="word-example-snippet">"${this.highlightWordInSentence(w.exampleEn, w.english)}"</div>` : ''}
          ${hasNote ? `<div class="word-note-pill">📝 ${this.notes[w._id]}</div>` : ''}
          <div class="word-card-footer">
            <span class="word-day-label mono-text">${w._day}</span>
            ${w.antonym ? `<span class="word-antonym">↔ ${w.antonym}</span>` : ''}
          </div>
        </div>
      `;
    }).join('');
  }

  loadMoreVocab() {
    this.vocabRenderLimit += 60;
    this.renderVocabGrid(false);
  }

  setViewMode(mode) {
    this.viewMode = mode;
    document.querySelectorAll('.view-mode').forEach(b => b.classList.remove('active'));
    document.querySelector(`[data-mode="${mode}"]`)?.classList.add('active');
    this.renderVocabGrid(false);
  }

  flashcardFilteredWords() {
    const day = document.getElementById('dayFilter')?.value || 'all';
    const category = document.getElementById('categoryFilter')?.value || 'all';
    const status = document.getElementById('statusFilter')?.value || 'all';
    const localSearch = document.getElementById('vocabLocalSearch')?.value || '';
    const pool = this.getFilteredWords(day, category, status, localSearch);

    if (pool.length === 0) {
      this._showToast('⚠️ Không có từ nào trong bộ lọc hiện tại!');
      return;
    }
    this.navigateTo('flashcards');
    this.flashcardList = [...pool];
    this.flashcardIndex = 0;
    this.isFlipped = false;
    this.updateFlashcardSearchList();
    this.showFlashcard();
  }

  testFilteredWords() {
    const day = document.getElementById('dayFilter')?.value || 'all';
    const category = document.getElementById('categoryFilter')?.value || 'all';
    const status = document.getElementById('statusFilter')?.value || 'all';
    const localSearch = document.getElementById('vocabLocalSearch')?.value || '';

    let pool = this.getFilteredWords(day, category, status, localSearch);
    if (pool.length === 0) {
      this._showToast('⚠️ Không có từ nào phù hợp với bộ lọc hiện tại để kiểm tra!');
      return;
    }

    this.navigateTo('vocabdrill');
    pool = [...pool].sort(() => Math.random() - 0.5);
    this.drillWords = pool;
    this.drillIndex = 0;
    this.drillCorrect = 0;
    this.drillWrong = 0;
    this.drillAnswered = false;
    this.drillMode = 'en-to-vi';

    document.getElementById('drillSetup').classList.add('hidden');
    document.getElementById('drillResult').classList.add('hidden');
    document.getElementById('drillActive').classList.remove('hidden');

    this.showDrillWord();
  }

  // ==========================================
  // Word Detail Modal & Personal Notes
  // ==========================================

  openWordModal(wordId) {
    const word = this.allWords.find(w => w._id === wordId);
    if (!word) return;

    this._modalWordId = wordId;

    document.getElementById('modalWord').textContent = word.english;
    document.getElementById('modalMeaning').textContent = word.vietnamese;
    document.getElementById('modalCategoryBadge').textContent = this.getCategoryLabel(word._category);
    document.getElementById('modalDayBadge').textContent = word._day;

    const partBadge = document.getElementById('modalPartBadge');
    if (partBadge) {
      partBadge.textContent = word.part || 'TOEIC Core';
    }

    document.getElementById('modalExampleEn').innerHTML = this.highlightWordInSentence(word.exampleEn, word.english);
    document.getElementById('modalExampleVi').textContent = word.exampleVi;

    const antonymSection = document.getElementById('modalAntonymSection');
    if (word.antonym) {
      antonymSection.style.display = 'inline-block';
      document.getElementById('modalAntonym').textContent = word.antonym;
    } else {
      antonymSection.style.display = 'none';
    }

    const noteInput = document.getElementById('modalNoteInput');
    if (noteInput) {
      noteInput.value = this.notes[wordId] || '';
    }

    this.updateModalButtons(wordId);

    document.getElementById('wordModal').classList.remove('hidden');
    document.body.style.overflow = 'hidden';
  }

  saveModalNote(val) {
    if (!this._modalWordId) return;
    if (val && val.trim()) {
      this.notes[this._modalWordId] = val.trim();
    } else {
      delete this.notes[this._modalWordId];
    }
    localStorage.setItem('vh-notes', JSON.stringify(this.notes));
    if (this.currentView === 'vocabulary') this.renderVocabGrid(false);
    if (this.currentView === 'flashcards') this.showFlashcard();
  }

  closeModal() {
    document.getElementById('wordModal')?.classList.add('hidden');
    document.body.style.overflow = '';
  }

  updateModalButtons(wordId) {
    const learnedBtn = document.getElementById('modalLearnedBtn');
    const starBtn = document.getElementById('modalStarBtn');
    if (!learnedBtn || !starBtn) return;

    if (this.learned[wordId]) {
      learnedBtn.classList.add('active');
      learnedBtn.innerHTML = '✅ Đã thuộc';
    } else {
      learnedBtn.classList.remove('active');
      learnedBtn.innerHTML = '📖 Đánh dấu Đã thuộc';
    }

    if (this.starred[wordId]) {
      starBtn.classList.add('active');
      starBtn.innerHTML = '⭐ Đã gắn sao';
    } else {
      starBtn.classList.remove('active');
      starBtn.innerHTML = '☆ Gắn sao từ khó';
    }
  }

  toggleModalLearned() {
    if (this._modalWordId) {
      this.toggleLearnedById(this._modalWordId);
      this.updateModalButtons(this._modalWordId);
    }
  }

  toggleModalStar() {
    if (this._modalWordId) {
      this.toggleStarById(this._modalWordId);
      this.updateModalButtons(this._modalWordId);
    }
  }

  speakModalWord() {
    const word = document.getElementById('modalWord')?.textContent;
    if (word) this.speak(word);
  }

  // ==========================================
  // Learn / Star Actions
  // ==========================================

  toggleLearnedById(wordId) {
    const wasLearned = !!this.learned[wordId];
    this.learned[wordId] = !wasLearned;
    if (!this.learned[wordId]) delete this.learned[wordId];
    localStorage.setItem('vh-learned', JSON.stringify(this.learned));

    const word = this.allWords.find(w => w._id === wordId);
    if (word && !wasLearned) {
      this.addActivity('learned', `Đã thuộc từ "${word.english}"`);
      this.incrementDailyGoal(1);
    }

    if (this.currentView === 'vocabulary') this.renderVocabGrid(false);
    this.populateDaysList();
    if (this.currentView === 'dashboard') this.updateDashboard();
  }

  toggleStarById(wordId) {
    this.starred[wordId] = !this.starred[wordId];
    if (!this.starred[wordId]) delete this.starred[wordId];
    localStorage.setItem('vh-starred', JSON.stringify(this.starred));

    const word = this.allWords.find(w => w._id === wordId);
    if (word && this.starred[wordId]) {
      this.addActivity('starred', `Gắn sao từ "${word.english}"`);
    }

    if (this.currentView === 'vocabulary') this.renderVocabGrid(false);
    if (this.currentView === 'dashboard') this.updateDashboard();
  }

  addActivity(type, text) {
    this.activity.push({ type, text, time: Date.now() });
    if (this.activity.length > 50) this.activity = this.activity.slice(-50);
    localStorage.setItem('vh-activity', JSON.stringify(this.activity));
  }

  // ==========================================
  // Flashcards 3D & Auto-Play
  // ==========================================

  loadFlashcards() {
    this.stopAutoPlayFlashcards();
    const day = document.getElementById('flashcardDayFilter')?.value || 'all';
    const category = document.getElementById('flashcardCategoryFilter')?.value || 'all';
    const status = document.getElementById('flashcardStatusFilter')?.value || 'all';
    this.flashcardList = this.getFilteredWords(day, category, status);
    this.flashcardIndex = 0;
    this.isFlipped = false;
    this.updateFlashcardSearchList();
    this.showFlashcard();
  }

  updateFlashcardSearchList() {
    const dataList = document.getElementById('fcSearchList');
    if (!dataList) return;
    dataList.innerHTML = this.flashcardList.slice(0, 300).map(w => `<option value="${w.english}">${w.vietnamese}</option>`).join('');
  }

  searchAndJumpFlashcard(value) {
    if (!value || !this.flashcardList || this.flashcardList.length === 0) return;
    const trimmed = value.trim();

    // If user typed a number, jump directly to that card number
    if (/^\d+$/.test(trimmed)) {
      this.jumpToFlashcardNumber(trimmed);
      const input = document.getElementById('fcSearchInput');
      if (input) { input.value = ''; input.blur(); }
      return;
    }

    const lowerVal = trimmed.toLowerCase();
    const index = this.flashcardList.findIndex(w => w.english.toLowerCase() === lowerVal);
    if (index !== -1) {
      this.flashcardIndex = index;
      this.isFlipped = false;
      this.showFlashcard();
      const input = document.getElementById('fcSearchInput');
      if (input) { input.value = ''; input.blur(); }
    }
  }

  jumpToFlashcardNumber(val) {
    if (!this.flashcardList || this.flashcardList.length === 0) return;
    let num = parseInt(val, 10);
    if (isNaN(num)) {
      this.showFlashcard();
      return;
    }
    const total = this.flashcardList.length;
    if (num < 1) num = 1;
    if (num > total) num = total;

    this.flashcardIndex = num - 1;
    this.isFlipped = false;
    this.showFlashcard();
  }

  showFlashcard() {
    const jumpInput = document.getElementById('fcJumpNumberInput');
    const totalEl = document.getElementById('fcTotalCount');

    if (this.flashcardList.length === 0) {
      document.getElementById('fcWord').textContent = 'Không có từ nào';
      document.getElementById('fcVietnamese').textContent = 'Hãy đổi bộ lọc ở trên';
      if (jumpInput) { jumpInput.value = 0; jumpInput.max = 0; }
      if (totalEl) totalEl.textContent = '0';
      document.getElementById('fcProgressFill').style.width = '0%';
      return;
    }

    const word = this.flashcardList[this.flashcardIndex];
    document.getElementById('fcWord').textContent = word.english;
    document.getElementById('fcWordBack').textContent = word.english;
    document.getElementById('fcCategory').textContent = this.getCategoryLabel(word._category);
    document.getElementById('fcDayTag').textContent = word._day;
    document.getElementById('fcDayTagBack').textContent = word._day;
    document.getElementById('fcPartTag').textContent = word.part ? `📌 ${word.part}` : '';
    document.getElementById('fcVietnamese').textContent = word.vietnamese;

    const antonymEl = document.getElementById('fcAntonym');
    if (word.antonym) {
      antonymEl.textContent = `↔ Trái nghĩa: ${word.antonym}`;
      antonymEl.style.display = 'block';
    } else {
      antonymEl.style.display = 'none';
    }

    document.getElementById('fcExampleEn').innerHTML = this.highlightWordInSentence(word.exampleEn, word.english);
    document.getElementById('fcExampleVi').textContent = word.exampleVi;

    const notePreview = document.getElementById('fcNotePreview');
    if (notePreview) {
      const note = this.notes[word._id];
      if (note) {
        notePreview.textContent = `📝 Ghi chú: ${note}`;
        notePreview.classList.remove('hidden');
      } else {
        notePreview.classList.add('hidden');
      }
    }

    const total = this.flashcardList.length;
    const current = this.flashcardIndex + 1;
    if (jumpInput) {
      jumpInput.value = current;
      jumpInput.max = total;
    }
    if (totalEl) {
      totalEl.textContent = total;
    }
    const fillEl = document.getElementById('fcProgressFill');
    if (fillEl) fillEl.style.width = `${(current / total) * 100}%`;

    this.isFlipped = false;
    document.getElementById('flashcard')?.classList.remove('flipped');
    this.updateFlashcardActions();
  }

  updateFlashcardActions() {
    if (this.flashcardList.length === 0) return;
    const word = this.flashcardList[this.flashcardIndex];

    const learnedBtn = document.querySelector('.fc-action-btn.learned-btn');
    const starBtn = document.querySelector('.fc-action-btn.star-btn');

    if (learnedBtn) learnedBtn.classList.toggle('active', !!this.learned[word._id]);
    if (starBtn) starBtn.classList.toggle('active', !!this.starred[word._id]);
  }

  flipCard() {
    this.isFlipped = !this.isFlipped;
    document.getElementById('flashcard')?.classList.toggle('flipped', this.isFlipped);
  }

  nextFlashcard() {
    if (this.flashcardList.length === 0) return;
    this.flashcardIndex = (this.flashcardIndex + 1) % this.flashcardList.length;
    this.showFlashcard();
  }

  prevFlashcard() {
    if (this.flashcardList.length === 0) return;
    this.flashcardIndex = (this.flashcardIndex - 1 + this.flashcardList.length) % this.flashcardList.length;
    this.showFlashcard();
  }

  shuffleFlashcards() {
    for (let i = this.flashcardList.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [this.flashcardList[i], this.flashcardList[j]] = [this.flashcardList[j], this.flashcardList[i]];
    }
    this.flashcardIndex = 0;
    this.updateFlashcardSearchList();
    this.showFlashcard();
    this._showToast('🔀 Đã trộn ngẫu nhiên bộ thẻ Flashcards!');
  }

  toggleAutoPlayFlashcards() {
    if (this.fcAutoPlayTimer) {
      this.stopAutoPlayFlashcards();
      this._showToast('⏸️ Đã dừng chế độ tự động phát');
    } else {
      if (this.flashcardList.length === 0) return;
      const btn = document.getElementById('fcAutoPlayBtn');
      if (btn) {
        btn.innerHTML = '⏸️ Dừng Auto';
        btn.classList.add('btn-warning');
      }
      this._showToast('▶️ Đang chạy Flashcards tự động (Phát âm ➔ Lật nghĩa ➔ Qua thẻ)');
      this.runAutoPlayStep();
    }
  }

  runAutoPlayStep() {
    if (this.currentView !== 'flashcards' || this.flashcardList.length === 0) {
      this.stopAutoPlayFlashcards();
      return;
    }
    this.isFlipped = false;
    document.getElementById('flashcard')?.classList.remove('flipped');
    this.speakWord();

    this.fcAutoPlayTimer = setTimeout(() => {
      this.flipCard();
      this.fcAutoPlayTimer = setTimeout(() => {
        this.nextFlashcard();
        this.runAutoPlayStep();
      }, 2600);
    }, 2000);
  }

  stopAutoPlayFlashcards() {
    if (this.fcAutoPlayTimer) {
      clearTimeout(this.fcAutoPlayTimer);
      this.fcAutoPlayTimer = null;
    }
    const btn = document.getElementById('fcAutoPlayBtn');
    if (btn) {
      btn.innerHTML = '▶️ Tự động chạy';
      btn.classList.remove('btn-warning');
    }
  }

  openCurrentFlashcardModal() {
    if (this.flashcardList.length === 0) return;
    const word = this.flashcardList[this.flashcardIndex];
    this.openWordModal(word._id);
  }

  markLearned() {
    if (this.flashcardList.length === 0) return;
    const word = this.flashcardList[this.flashcardIndex];
    this.toggleLearnedById(word._id);
    this.updateFlashcardActions();
  }

  toggleStar() {
    if (this.flashcardList.length === 0) return;
    const word = this.flashcardList[this.flashcardIndex];
    this.toggleStarById(word._id);
    this.updateFlashcardActions();
  }

  speakWord() {
    if (this.flashcardList.length === 0) return;
    const word = this.flashcardList[this.flashcardIndex];
    this.speak(word.english);
  }

  speak(text) {
    if ('speechSynthesis' in window && text) {
      window.speechSynthesis.cancel();
      const utterance = new SpeechSynthesisUtterance(text);
      utterance.lang = this.accent || 'en-US';
      utterance.rate = 0.88;
      utterance.pitch = 1;
      window.speechSynthesis.speak(utterance);
    }
  }

  reviewStarred() {
    const starredList = this.allWords.filter(w => this.starred[w._id]);
    if (starredList.length === 0) {
      this._showToast('⭐ Bạn chưa gắn sao từ nào!');
      return;
    }
    this.navigateTo('flashcards');
    this.flashcardList = starredList;
    this.flashcardIndex = 0;
    this.isFlipped = false;
    this.updateFlashcardSearchList();
    this.showFlashcard();
  }

  // ==========================================
  // Quiz & TOEIC Part 5 Cloze Simulator
  // ==========================================

  showQuizSetup() {
    document.getElementById('quizActive')?.classList.add('hidden');
    document.getElementById('quizResult')?.classList.add('hidden');
    document.getElementById('quizSetup')?.classList.remove('hidden');
  }

  quitQuiz() {
    this.showQuizSetup();
  }

  startQuiz() {
    const day = document.getElementById('quizDayFilter')?.value || 'all';
    const category = document.getElementById('quizCategoryFilter')?.value || 'all';
    const type = document.getElementById('quizType')?.value || 'cloze';
    const limitCount = parseInt(document.getElementById('quizCountFilter')?.value || '20');

    let pool = this.getFilteredWords(day, category);
    if (pool.length < 4) {
      this._showToast('⚠️ Cần ít nhất 4 từ vựng để tạo bài trắc nghiệm!');
      return;
    }

    pool = [...pool].sort(() => Math.random() - 0.5);
    const selected = pool.slice(0, Math.min(limitCount, pool.length));

    const modeNames = {
      'cloze': 'TOEIC Part 5 Cloze',
      'en-vi': 'Anh ➔ Việt',
      'vi-en': 'Việt ➔ Anh',
      'audio-vi': 'Nghe ➔ Chọn Nghĩa'
    };

    this.quizQuestions = selected.map(word => {
      let qType = type;
      if (type === 'mixed') {
        const types = word.exampleEn ? ['cloze', 'en-vi', 'vi-en', 'audio-vi'] : ['en-vi', 'vi-en', 'audio-vi'];
        qType = types[Math.floor(Math.random() * types.length)];
      } else if (type === 'cloze' && !word.exampleEn) {
        qType = 'vi-en';
      }

      const otherWords = pool.filter(w => w._id !== word._id).sort(() => Math.random() - 0.5).slice(0, 3);
      const askVietOptions = (qType === 'en-vi' || qType === 'audio-vi');
      const correctAnswer = askVietOptions ? word.vietnamese : word.english;
      const wrongAnswers = otherWords.map(w => askVietOptions ? w.vietnamese : w.english);
      const options = [correctAnswer, ...wrongAnswers].sort(() => Math.random() - 0.5);

      return {
        qType,
        modeLabel: modeNames[qType] || 'Quiz',
        correctAnswer,
        options,
        word
      };
    });

    this.quizIndex = 0;
    this.quizScore = 0;
    this.quizAnswered = false;
    this.quizMistakes = [];

    document.getElementById('quizSetup').classList.add('hidden');
    document.getElementById('quizResult').classList.add('hidden');
    document.getElementById('quizActive').classList.remove('hidden');

    this.showQuizQuestion();
  }

  showQuizQuestion() {
    const q = this.quizQuestions[this.quizIndex];
    if (!q) return;

    document.getElementById('quizQuestionNum').textContent = `Câu ${this.quizIndex + 1} / ${this.quizQuestions.length}`;
    document.getElementById('quizModeBadge').textContent = q.modeLabel;
    document.getElementById('quizScore').textContent = this.quizScore;

    const progress = ((this.quizIndex + 1) / this.quizQuestions.length) * 100;
    document.getElementById('quizProgressFill').style.width = progress + '%';

    const qEl = document.getElementById('quizQuestion');
    if (q.qType === 'cloze') {
      const masked = this.maskWordInSentence(q.word.exampleEn, q.word.english);
      qEl.innerHTML = `
        <div class="quiz-question-label">Chọn từ đúng điền vào chỗ trống (Part 5):</div>
        <div class="quiz-cloze-sentence">${masked}</div>
        <div class="quiz-cloze-vi-hint">💡 Nghĩa câu: "${q.word.exampleVi || q.word.vietnamese}"</div>
      `;
    } else if (q.qType === 'audio-vi') {
      qEl.innerHTML = `
        <div class="quiz-question-label">Nghe phát âm và chọn nghĩa đúng:</div>
        <button class="quiz-audio-btn" onclick="app.speak('${q.word.english.replace(/'/g, "\\'")}')">
          🔊 Bấm để nghe lại
        </button>
      `;
      setTimeout(() => this.speak(q.word.english), 150);
    } else if (q.qType === 'vi-en') {
      qEl.innerHTML = `
        <div class="quiz-question-label">Từ tiếng Anh nào mang nghĩa:</div>
        <div class="quiz-question-word">${q.word.vietnamese}</div>
      `;
    } else {
      qEl.innerHTML = `
        <div class="quiz-question-label">Nghĩa tiếng Việt của từ này là gì?</div>
        <div class="quiz-question-word">
          ${q.word.english}
          <button class="speak-btn-inline" onclick="app.speak('${q.word.english.replace(/'/g, "\\'")}')">🔊</button>
        </div>
      `;
    }

    document.getElementById('quizAnswers').innerHTML = q.options.map((opt, i) => `
      <button class="quiz-answer-btn" data-index="${i}" onclick="app.answerQuiz(${i})">
        <span class="quiz-answer-letter mono-text">${String.fromCharCode(65 + i)}</span>
        <span class="quiz-answer-text">${opt}</span>
      </button>
    `).join('');

    document.getElementById('quizExplanation')?.classList.add('hidden');
    document.getElementById('quizNextBtn')?.classList.add('hidden');
    this.quizAnswered = false;
  }

  answerQuiz(index) {
    if (this.quizAnswered) return;
    this.quizAnswered = true;

    const q = this.quizQuestions[this.quizIndex];
    const selectedAnswer = q.options[index];
    const isCorrect = selectedAnswer === q.correctAnswer;

    if (isCorrect) {
      this.quizScore++;
      this.incrementDailyGoal(1);
    } else {
      this.quizMistakes.push(q.word);
      this.recordMistake(q.word._id);
    }

    const buttons = document.querySelectorAll('.quiz-answer-btn');
    buttons.forEach((btn, i) => {
      btn.classList.add('disabled');
      if (q.options[i] === q.correctAnswer) {
        btn.classList.add('correct');
      } else if (i === index && !isCorrect) {
        btn.classList.add('wrong');
      }
    });

    document.getElementById('quizScore').textContent = this.quizScore;
    this.speak(q.word.english);

    // Show explanation box
    const expEl = document.getElementById('quizExplanation');
    if (expEl) {
      expEl.classList.remove('hidden');
      expEl.innerHTML = `
        <div class="q-exp-head">
          <strong>${q.word.english}</strong> <span>(${q.word._day} • ${this.getCategoryLabel(q.word._category)})</span>:
          <span style="color:var(--accent-primary); font-weight:700">${q.word.vietnamese}</span>
        </div>
        ${q.word.exampleEn ? `<div class="q-exp-ex">"${this.highlightWordInSentence(q.word.exampleEn, q.word.english)}" — ${q.word.exampleVi}</div>` : ''}
      `;
    }

    document.getElementById('quizNextBtn')?.classList.remove('hidden');
  }

  nextQuizQuestion() {
    if (!this.quizAnswered) return;
    this.quizIndex++;
    if (this.quizIndex < this.quizQuestions.length) {
      this.showQuizQuestion();
    } else {
      this.showQuizResult();
    }
  }

  showQuizResult() {
    document.getElementById('quizActive').classList.add('hidden');
    document.getElementById('quizResult').classList.remove('hidden');

    const total = this.quizQuestions.length;
    const score = this.quizScore;
    const percent = Math.round((score / total) * 100);

    document.getElementById('resultScore').textContent = score;
    document.getElementById('resultTotal').textContent = total;
    document.getElementById('resultPercent').textContent = percent + '%';

    let icon, title, message;
    if (percent >= 90) {
      icon = '🏆'; title = 'Đỉnh cao TOEIC!'; message = 'Bạn nắm cực kỳ chắc chắn bộ từ vựng này!';
      this.launchConfetti();
    } else if (percent >= 70) {
      icon = '🎉'; title = 'Làm rất tốt!'; message = 'Chỉ còn vài từ cần lưu ý thêm để đạt điểm tuyệt đối.';
    } else if (percent >= 50) {
      icon = '💪'; title = 'Khá lắm!'; message = 'Hãy xem kỹ danh sách các từ bị nhầm ở bên dưới nhé.';
    } else {
      icon = '📚'; title = 'Cần ôn thêm!'; message = 'Đừng nản chí! Hãy học qua Flashcards trước rồi thử sức lại.';
    }

    document.getElementById('resultIcon').textContent = icon;
    document.getElementById('resultTitle').textContent = title;
    document.getElementById('resultMessage').textContent = message;

    const mistakesWrap = document.getElementById('quizMistakesWrap');
    const mistakesList = document.getElementById('quizMistakesList');
    if (mistakesWrap && mistakesList) {
      if (this.quizMistakes.length > 0) {
        mistakesWrap.classList.remove('hidden');
        mistakesList.innerHTML = this.quizMistakes.map(w => `
          <div class="qm-item" onclick="app.openWordModal('${w._id}')">
            <strong>${w.english}</strong>
            <span>${w.vietnamese}</span>
          </div>
        `).join('');
      } else {
        mistakesWrap.classList.add('hidden');
      }
    }

    this.addActivity('quiz', `Hoàn thành Trắc nghiệm: ${score}/${total} (${percent}%)`);
  }

  // ==========================================
  // Speed Match Game
  // ==========================================

  startMatchGame() {
    if (this.matchTimerInterval) clearInterval(this.matchTimerInterval);

    const day = document.getElementById('matchDayFilter')?.value || 'all';
    let pool = this.getFilteredWords(day, 'all');
    if (pool.length < 6) pool = this.allWords;

    const selected = [...pool].sort(() => Math.random() - 0.5).slice(0, 6);
    const cards = [];
    selected.forEach(w => {
      cards.push({ id: `${w._id}-en`, wordId: w._id, text: w.english, type: 'en', matched: false });
      cards.push({ id: `${w._id}-vi`, wordId: w._id, text: w.vietnamese, type: 'vi', matched: false });
    });

    this.matchCards = cards.sort(() => Math.random() - 0.5);
    this.matchSelected = null;
    this.matchPairsLeft = selected.length;
    this.matchStartTime = performance.now();

    const bestEl = document.getElementById('matchBestTime');
    if (bestEl) bestEl.textContent = this.matchBestTime > 0 ? `${this.matchBestTime.toFixed(1)}s` : '—';

    this.renderMatchBoard();

    this.matchTimerInterval = setInterval(() => {
      const elapsed = (performance.now() - this.matchStartTime) / 1000;
      const timerEl = document.getElementById('matchTimer');
      if (timerEl) timerEl.textContent = `${elapsed.toFixed(1)}s`;
    }, 100);
  }

  renderMatchBoard() {
    const board = document.getElementById('matchBoard');
    if (!board) return;

    board.innerHTML = this.matchCards.map((c, idx) => `
      <button class="match-tile glass-card ${c.type === 'en' ? 'tile-en' : 'tile-vi'} ${c.matched ? 'matched' : ''}"
              id="mtile-${idx}"
              onclick="app.selectMatchTile(${idx})">
        <span class="mtile-badge">${c.type === 'en' ? 'EN' : 'VI'}</span>
        <span class="mtile-text">${c.text}</span>
      </button>
    `).join('');
  }

  selectMatchTile(idx) {
    const card = this.matchCards[idx];
    if (!card || card.matched) return;

    const tileEl = document.getElementById(`mtile-${idx}`);
    if (this.matchSelected === null) {
      this.matchSelected = idx;
      tileEl?.classList.add('selected');
      if (card.type === 'en') this.speak(card.text);
      return;
    }

    if (this.matchSelected === idx) {
      tileEl?.classList.remove('selected');
      this.matchSelected = null;
      return;
    }

    const firstIdx = this.matchSelected;
    const firstCard = this.matchCards[firstIdx];
    const firstEl = document.getElementById(`mtile-${firstIdx}`);
    this.matchSelected = null;

    if (firstCard.wordId === card.wordId && firstCard.type !== card.type) {
      // Match!
      firstCard.matched = true;
      card.matched = true;
      firstEl?.classList.remove('selected');
      firstEl?.classList.add('matched');
      tileEl?.classList.add('matched');
      this.matchPairsLeft--;

      if (this.matchPairsLeft === 0) {
        clearInterval(this.matchTimerInterval);
        const finalTime = (performance.now() - this.matchStartTime) / 1000;
        if (this.matchBestTime === 0 || finalTime < this.matchBestTime) {
          this.matchBestTime = finalTime;
          localStorage.setItem('vh-match-best', String(finalTime));
          document.getElementById('matchBestTime').textContent = `${finalTime.toFixed(1)}s`;
        }
        this.incrementDailyGoal(2);
        this.launchConfetti();
        this._showToast(`⚡ Hoàn thành trong ${finalTime.toFixed(1)} giây!`);
      }
    } else {
      // Mismatch penalty animation
      firstEl?.classList.remove('selected');
      firstEl?.classList.add('wrong');
      tileEl?.classList.add('wrong');
      setTimeout(() => {
        firstEl?.classList.remove('wrong');
        tileEl?.classList.remove('wrong');
      }, 450);
    }
  }

  // ==========================================
  // Search & Confetti
  // ==========================================

  handleSearch(query) {
    const resultsEl = document.getElementById('searchResults');
    if (!query || query.length < 2) {
      resultsEl?.classList.add('hidden');
      return;
    }

    const q = query.toLowerCase().trim();
    const results = this.allWords
      .filter(w => w.english.toLowerCase().includes(q) || w.vietnamese.toLowerCase().includes(q))
      .slice(0, 10);

    if (results.length === 0) {
      resultsEl.innerHTML = `<div class="search-result-item"><span class="sr-meaning">Không tìm thấy từ "${query}"</span></div>`;
      resultsEl.classList.remove('hidden');
      return;
    }

    resultsEl.innerHTML = results.map(w => `
      <div class="search-result-item" onclick="app.openWordModal('${w._id}'); document.getElementById('searchResults').classList.add('hidden');">
        <div style="display:flex; justify-content:space-between; align-items:center;">
          <span class="sr-word">${w.english}</span>
          <span class="badge" style="font-size:0.65rem">${w._day}</span>
        </div>
        <span class="sr-meaning">${w.vietnamese}</span>
      </div>
    `).join('');
    resultsEl.classList.remove('hidden');
  }

  launchConfetti() {
    const container = document.createElement('div');
    container.className = 'confetti-container';
    document.body.appendChild(container);
    const colors = ['#818cf8', '#34d399', '#fbbf24', '#f472b6', '#38bdf8'];
    for (let i = 0; i < 36; i++) {
      const piece = document.createElement('div');
      piece.className = 'confetti-piece';
      piece.style.left = Math.random() * 100 + 'vw';
      piece.style.backgroundColor = colors[i % colors.length];
      piece.style.animationDuration = (1.5 + Math.random() * 1.5) + 's';
      piece.style.animationDelay = (Math.random() * 0.3) + 's';
      container.appendChild(piece);
    }
    setTimeout(() => container.remove(), 3500);
  }

  // ==========================================
  // Event Listeners & Shortcuts
  // ==========================================

  setupEventListeners() {
    document.getElementById('themeToggle')?.addEventListener('click', () => this.toggleTheme());
    document.getElementById('mobileSidebarToggle')?.addEventListener('click', () => this.openSidebar());
    document.getElementById('sidebarToggle')?.addEventListener('click', () => {
      const sb = document.getElementById('sidebar');
      if (window.innerWidth <= 768) this.closeSidebar();
      else sb?.classList.toggle('collapsed');
    });

    document.querySelectorAll('.nav-item').forEach(item => {
      item.addEventListener('click', () => {
        const view = item.getAttribute('data-view');
        if (view) this.navigateTo(view);
      });
    });

    document.getElementById('gridViewBtn')?.addEventListener('click', () => this.setViewMode('grid'));
    document.getElementById('listViewBtn')?.addEventListener('click', () => this.setViewMode('list'));

    document.getElementById('dayFilter')?.addEventListener('change', () => this.renderVocabGrid(true));
    document.getElementById('categoryFilter')?.addEventListener('change', () => this.renderVocabGrid(true));
    document.getElementById('statusFilter')?.addEventListener('change', () => this.renderVocabGrid(true));

    document.getElementById('flashcardDayFilter')?.addEventListener('change', () => this.loadFlashcards());
    document.getElementById('flashcardCategoryFilter')?.addEventListener('change', () => this.loadFlashcards());
    document.getElementById('matchDayFilter')?.addEventListener('change', () => this.startMatchGame());

    document.getElementById('searchInput')?.addEventListener('input', (e) => this.handleSearch(e.target.value));
    document.getElementById('searchInput')?.addEventListener('focus', (e) => {
      if (e.target.value.length >= 2) this.handleSearch(e.target.value);
    });

    document.addEventListener('click', (e) => {
      if (!e.target.closest('.search-box')) {
        document.getElementById('searchResults')?.classList.add('hidden');
      }
    });

    document.addEventListener('keydown', (e) => {
      // Ctrl+K or Cmd+K for quick search
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault();
        document.getElementById('searchInput')?.focus();
        return;
      }

      if (e.key === 'Escape') {
        this.closeModal();
        this.closeGoalModal();
        document.getElementById('searchResults')?.classList.add('hidden');
        return;
      }

      // Ignore shortcuts when typing inside inputs/textareas
      const tag = document.activeElement?.tagName;
      if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') {
        if (this.currentView === 'vocabdrill' && e.key === 'Enter') {
          e.preventDefault();
          if (!this.drillAnswered) this.submitDrillAnswer();
          else this.nextDrillWord();
        }
        return;
      }

      // Flashcard shortcuts
      if (this.currentView === 'flashcards') {
        if (e.key === ' ') { e.preventDefault(); this.flipCard(); }
        else if (e.key === 'ArrowRight') { e.preventDefault(); this.nextFlashcard(); }
        else if (e.key === 'ArrowLeft') { e.preventDefault(); this.prevFlashcard(); }
        else if (e.key.toLowerCase() === 'l') { e.preventDefault(); this.markLearned(); }
        else if (e.key.toLowerCase() === 's') { e.preventDefault(); this.toggleStar(); }
        else if (e.key.toLowerCase() === 'v') { e.preventDefault(); this.speakWord(); }
      }

      // Quiz shortcuts
      if (this.currentView === 'quiz' && !document.getElementById('quizActive')?.classList.contains('hidden')) {
        if (this.quizAnswered && e.key === 'Enter') {
          e.preventDefault();
          this.nextQuizQuestion();
        } else if (!this.quizAnswered) {
          if (['1', 'a', 'A'].includes(e.key)) this.answerQuiz(0);
          if (['2', 'b', 'B'].includes(e.key)) this.answerQuiz(1);
          if (['3', 'c', 'C'].includes(e.key)) this.answerQuiz(2);
          if (['4', 'd', 'D'].includes(e.key)) this.answerQuiz(3);
        }
      }

      // Drill advance when input is disabled
      if (this.currentView === 'vocabdrill' && this.drillAnswered && e.key === 'Enter') {
        e.preventDefault();
        this.nextDrillWord();
      }

      // SRS shortcuts
      if (this.currentView === 'srs' && !document.getElementById('srsActive')?.classList.contains('hidden')) {
        if (e.key === ' ' || e.key === 'Enter') { e.preventDefault(); this.flipSRSCard(); }
        if (e.key === '1') { e.preventDefault(); this.rateSRS(1); }
        if (e.key === '2') { e.preventDefault(); this.rateSRS(2); }
        if (e.key === '3') { e.preventDefault(); this.rateSRS(3); }
        if (e.key === '4') { e.preventDefault(); this.rateSRS(4); }
      }
    });
  }
}

// ==========================================
// Vocab Drill & Audio Dictation Methods
// ==========================================

VocabHackerApp.prototype.toggleDrillDay = function(day, btn) {
  const picker = document.getElementById('drillDayPicker');
  const chips = picker.querySelectorAll('.drill-day-chip');

  if (day === 'all') {
    this.drillSelectedDays = ['all'];
    chips.forEach(c => c.classList.remove('active'));
    btn.classList.add('active');
  } else {
    const allChip = picker.querySelector('[data-day="all"]');
    if (this.drillSelectedDays.includes('all')) {
      this.drillSelectedDays = [];
      allChip.classList.remove('active');
    }
    if (this.drillSelectedDays.includes(day)) {
      this.drillSelectedDays = this.drillSelectedDays.filter(d => d !== day);
      btn.classList.remove('active');
    } else {
      this.drillSelectedDays.push(day);
      btn.classList.add('active');
    }
    if (this.drillSelectedDays.length === 0) {
      this.drillSelectedDays = ['all'];
      allChip.classList.add('active');
    }
  }
};

VocabHackerApp.prototype.startVocabDrill = function() {
  const category = document.getElementById('drillCategoryFilter')?.value || 'all';
  const countVal = parseInt(document.getElementById('drillCount')?.value || '20');
  this.drillMode = document.getElementById('drillModeFilter')?.value || 'en-to-vi';

  let pool = [];
  if (this.drillSelectedDays.includes('all')) {
    pool = this.getFilteredWords('all', category);
  } else {
    this.drillSelectedDays.forEach(day => {
      pool = pool.concat(this.getFilteredWords(day, category));
    });
  }

  const status = document.getElementById('drillStatusFilter')?.value || 'all';
  if (status === 'learned') pool = pool.filter(w => this.learned[w._id]);
  else if (status === 'starred') pool = pool.filter(w => this.starred[w._id]);
  else if (status === 'unlearned') pool = pool.filter(w => !this.learned[w._id]);

  if (pool.length === 0) {
    this._showToast('⚠️ Không có từ nào phù hợp với bộ lọc đã chọn!');
    return;
  }

  pool = [...pool].sort(() => Math.random() - 0.5);
  this.drillWords = pool.slice(0, Math.min(countVal, pool.length));
  this.drillIndex = 0;
  this.drillCorrect = 0;
  this.drillWrong = 0;
  this.drillAnswered = false;

  document.getElementById('drillSetup').classList.add('hidden');
  document.getElementById('drillResult').classList.add('hidden');
  document.getElementById('drillActive').classList.remove('hidden');

  this.showDrillWord();
};

VocabHackerApp.prototype.showDrillWord = function() {
  const word = this.drillWords[this.drillIndex];
  if (!word) return;

  const total = this.drillWords.length;
  const current = this.drillIndex + 1;
  document.getElementById('drillProgressText').textContent = `${current} / ${total}`;
  document.getElementById('drillProgressFill').style.width = `${(current / total) * 100}%`;
  document.getElementById('drillCorrectCount').textContent = this.drillCorrect;
  document.getElementById('drillWrongCount').textContent = this.drillWrong;

  document.getElementById('drillCategoryBadge').textContent = this.getCategoryLabel(word._category);
  document.getElementById('drillDayBadge').textContent = word._day;

  const promptWordEl = document.getElementById('drillEnglishWord');
  const audioBtn = document.getElementById('drillAudioBigBtn');
  const subPhonetic = document.getElementById('drillPhonetic');
  const inputLabel = document.getElementById('drillInputLabel');
  const input = document.getElementById('drillInput');

  if (this.drillMode === 'dictation') {
    promptWordEl.textContent = '🎧 ???';
    audioBtn?.classList.remove('hidden');
    subPhonetic.textContent = `Gợi ý nghĩa: ${word.vietnamese}`;
    inputLabel.textContent = 'Nghe và gõ lại từ Tiếng Anh:';
    input.placeholder = 'Gõ từ tiếng Anh bạn nghe được...';
    setTimeout(() => this.speak(word.english), 200);
  } else if (this.drillMode === 'vi-to-en') {
    promptWordEl.textContent = word.vietnamese;
    audioBtn?.classList.add('hidden');
    subPhonetic.textContent = word.part ? `Từ loại / Phần thi: ${word.part}` : '';
    inputLabel.textContent = 'Gõ từ Tiếng Anh tương ứng:';
    input.placeholder = 'Gõ từ tiếng Anh chính xác...';
  } else {
    promptWordEl.textContent = word.english;
    audioBtn?.classList.remove('hidden');
    subPhonetic.textContent = word.part ? `(${word.part})` : '';
    inputLabel.textContent = 'Nhập nghĩa Tiếng Việt:';
    input.placeholder = 'Gõ nghĩa tiếng Việt tại đây...';
  }

  input.value = '';
  input.className = 'drill-input';
  input.disabled = false;
  input.focus();

  const feedback = document.getElementById('drillFeedback');
  feedback.classList.add('hidden');
  feedback.className = 'drill-feedback hidden';

  document.getElementById('drillNextBtn').classList.add('hidden');
  document.getElementById('drillCard').classList.remove('correct-anim', 'wrong-anim');

  this.drillAnswered = false;
};

VocabHackerApp.prototype.speakCurrentDrillWord = function() {
  const word = this.drillWords[this.drillIndex];
  if (word) this.speak(word.english);
};

VocabHackerApp.prototype.giveDrillHint = function() {
  if (this.drillAnswered) return;
  const word = this.drillWords[this.drillIndex];
  if (!word) return;
  const input = document.getElementById('drillInput');
  const target = (this.drillMode === 'en-to-vi') ? word.vietnamese.split(',')[0].trim() : word.english;
  const revealLen = Math.min(2, Math.ceil(target.length / 3));
  input.value = target.slice(0, revealLen);
  input.focus();
};

VocabHackerApp.prototype.submitDrillAnswer = function() {
  if (this.drillAnswered) { this.nextDrillWord(); return; }

  const input = document.getElementById('drillInput');
  const userAnswer = input.value.trim();
  if (!userAnswer) { input.focus(); return; }

  const word = this.drillWords[this.drillIndex];
  let isCorrect = false;

  if (this.drillMode === 'vi-to-en' || this.drillMode === 'dictation') {
    isCorrect = userAnswer.toLowerCase() === word.english.toLowerCase();
  } else {
    const normalize = str => str.toLowerCase().replace(/[,;()]/g, ' ').replace(/\s+/g, ' ').trim();
    const userNorm = normalize(userAnswer);
    const correctNorm = normalize(word.vietnamese);
    const correctKeywords = correctNorm.split(/[,;]/).map(s => s.trim()).filter(Boolean);

    for (const kw of correctKeywords) {
      const kwWords = kw.split(' ').filter(w => w.length > 2);
      if (kwWords.length === 0) {
        if (userNorm.includes(kw)) { isCorrect = true; break; }
      } else {
        const matchCount = kwWords.filter(w => userNorm.includes(w)).length;
        if (matchCount >= Math.ceil(kwWords.length * 0.5)) { isCorrect = true; break; }
      }
    }
  }

  this.drillAnswered = true;
  const card = document.getElementById('drillCard');
  const feedback = document.getElementById('drillFeedback');
  const nextBtn = document.getElementById('drillNextBtn');

  this.speak(word.english);
  document.getElementById('drillEnglishWord').textContent = word.english;

  if (isCorrect) {
    this.drillCorrect++;
    this.incrementDailyGoal(1);
    input.className = 'drill-input correct';
    card.classList.add('correct-anim');
    feedback.className = 'drill-feedback correct-feedback';
    document.getElementById('drillFeedbackIcon').textContent = '✅';
    document.getElementById('drillFeedbackStatus').textContent = 'Chính xác! 🎉';
    document.getElementById('drillFeedbackCorrect').textContent = `${word.english} = ${word.vietnamese}`;
    document.getElementById('drillFeedbackExample').textContent = word.exampleEn ? `“${word.exampleEn}”` : '';
  } else {
    this.drillWrong++;
    this.recordMistake(word._id);
    input.className = 'drill-input wrong';
    card.classList.add('wrong-anim');
    feedback.className = 'drill-feedback wrong-feedback';
    document.getElementById('drillFeedbackIcon').textContent = '❌';
    document.getElementById('drillFeedbackStatus').textContent = 'Chưa chính xác!';
    document.getElementById('drillFeedbackCorrect').textContent = `Đáp án: ${word.english} — ${word.vietnamese}`;
    document.getElementById('drillFeedbackExample').textContent = word.exampleEn ? `“${word.exampleEn}”` : '';
  }

  document.getElementById('drillCorrectCount').textContent = this.drillCorrect;
  document.getElementById('drillWrongCount').textContent = this.drillWrong;
  feedback.classList.remove('hidden');
  nextBtn.classList.remove('hidden');
  input.disabled = true;
};

VocabHackerApp.prototype.nextDrillWord = function() {
  this.drillIndex++;
  if (this.drillIndex >= this.drillWords.length) {
    this.showDrillResult();
  } else {
    this.showDrillWord();
  }
};

VocabHackerApp.prototype.showDrillResult = function() {
  document.getElementById('drillActive').classList.add('hidden');
  document.getElementById('drillResult').classList.remove('hidden');

  const total = this.drillWords.length;
  const correct = this.drillCorrect;
  const wrong = this.drillWrong;
  const percent = total > 0 ? Math.round((correct / total) * 100) : 0;

  document.getElementById('drillResultCorrect').textContent = correct;
  document.getElementById('drillResultWrong').textContent = wrong;
  document.getElementById('drillResultPercent').textContent = percent + '%';

  let emoji, title, msg;
  if (percent >= 90) {
    emoji = '🏆'; title = 'Xuất sắc!'; msg = 'Bạn thực sự là bậc thầy từ vựng TOEIC!';
    this.launchConfetti();
  } else if (percent >= 70) {
    emoji = '🎉'; title = 'Rất tốt!'; msg = 'Hãy tiếp tục luyện tập để đạt được kết quả cao hơn nữa!';
  } else if (percent >= 50) {
    emoji = '💪'; title = 'Cố gắng tốt!'; msg = 'Hãy xem lại các từ bạn sai và thử lại nhé!';
  } else {
    emoji = '📚'; title = 'Hãy cố gắng hơn!'; msg = 'Thực hành đều đặn sẽ giúp bạn ghi nhớ từ vựng sâu hơn.';
  }

  document.getElementById('drillResultEmoji').textContent = emoji;
  document.getElementById('drillResultTitle').textContent = title;
  document.getElementById('drillResultMsg').textContent = msg;

  this.addActivity('quiz', `Luyện gõ từ: ${correct}/${total} đúng (${percent}%)`);
};

VocabHackerApp.prototype.showDrillSetup = function() {
  document.getElementById('drillActive').classList.add('hidden');
  document.getElementById('drillResult').classList.add('hidden');
  document.getElementById('drillSetup').classList.remove('hidden');
};

VocabHackerApp.prototype.quitDrill = function() {
  this.showDrillSetup();
};

// ==========================================
// Spaced Repetition System (SM-2 Algorithm)
// ==========================================

VocabHackerApp.prototype._srsLoad = function() {
  this.srsData = JSON.parse(localStorage.getItem('vh-srs') || '{}');
  let needsSave = false;
  for (const id in this.srsData) {
    const card = this.srsData[id];
    if (card.lastRating === 'good' && card.interval === 1 && card.repetitions === 1) {
      card.interval = 2;
      card.nextReview += 86400000;
      needsSave = true;
    }
  }
  if (needsSave) this._srsSave();
};

VocabHackerApp.prototype._srsSave = function() {
  localStorage.setItem('vh-srs', JSON.stringify(this.srsData));
};

VocabHackerApp.prototype._srsSchedule = function(card, rating) {
  let { easeFactor = 2.5, interval = 0, repetitions = 0 } = card;

  if (rating === 1) {
    repetitions = 0;
    interval = 0;
  } else if (rating === 2) {
    if (repetitions === 0) interval = 1;
    else {
      repetitions = Math.max(repetitions - 1, 0);
      interval = Math.max(Math.round(interval * 1.2), 1);
    }
    easeFactor = Math.max(easeFactor - 0.15, 1.3);
  } else if (rating === 3) {
    if (repetitions === 0) interval = 2;
    else if (repetitions === 1) interval = 6;
    else interval = Math.round(interval * easeFactor);
    repetitions++;
    easeFactor = Math.max(easeFactor + 0.1, 1.3);
  } else if (rating === 4) {
    if (repetitions === 0) interval = 4;
    else if (repetitions === 1) interval = 10;
    else interval = Math.round(interval * easeFactor * 1.3);
    repetitions++;
    easeFactor = Math.min(easeFactor + 0.15, 3.0);
  }

  const nextReview = Date.now() + interval * 86400000;
  const lastRating = ['', 'again', 'hard', 'good', 'easy'][rating];
  return { easeFactor, interval, repetitions, nextReview, lastRated: Date.now(), lastRating };
};

VocabHackerApp.prototype._srsFormatInterval = function(days) {
  if (days < 1) return '< 1 ngày';
  if (days === 1) return '1 ngày';
  if (days < 30) return `${days} ngày`;
  if (days < 365) return `${Math.round(days / 30)} tháng`;
  return `${(days / 365).toFixed(1)} năm`;
};

VocabHackerApp.prototype.updateSRSDashboard = function() {
  if (!this.srsData) this._srsLoad();
  const now = Date.now();

  let due = 0, fresh = 0, mastered = 0;
  let buckets = { again: 0, hard: 0, good: 0, easy: 0 };

  this.allWords.forEach(w => {
    const c = this.srsData[w._id];
    if (!c) { fresh++; }
    else {
      if (c.interval >= 21) mastered++;
      if (c.nextReview <= now) due++;
      if (c.lastRating) buckets[c.lastRating]++;
    }
  });

  document.getElementById('srsDueCount').textContent = due;
  document.getElementById('srsNewCount').textContent = fresh;
  document.getElementById('srsMasteredCount').textContent = mastered;

  document.getElementById('bucketCountAgain').textContent = buckets.again + ' từ';
  document.getElementById('bucketCountHard').textContent  = buckets.hard  + ' từ';
  document.getElementById('bucketCountGood').textContent  = buckets.good  + ' từ';
  document.getElementById('bucketCountEasy').textContent  = buckets.easy  + ' từ';

  const navSrsBadge = document.getElementById('navSrsDueBadge');
  if (navSrsBadge) {
    navSrsBadge.textContent = due;
    navSrsBadge.classList.toggle('hidden', due === 0);
  }

  const ctaEl = document.getElementById('srsReviewCTA');
  const totalLearned = this.allWords.filter(w => this.srsData[w._id]).length;
  if (ctaEl) {
    const ctaTitle = document.getElementById('srsCtaTitle');
    const ctaDesc = document.getElementById('srsCtaDesc');
    const ctaIcon = document.getElementById('srsCtaIcon');
    const ctaDueBtn = document.getElementById('srsCtaDueBtn');
    const ctaAllBtn = document.getElementById('srsCtaAllBtn');

    if (due > 0) {
      ctaIcon.textContent = '🔔';
      ctaTitle.innerHTML = `Bạn có <span>${due}</span> từ cần ôn lại hôm nay!`;
      ctaDesc.textContent = 'Những từ này đang ở ngưỡng sắp quên. Hãy ôn ngay để củng cố trí nhớ dài hạn.';
      ctaDueBtn.style.display = 'inline-flex';
      ctaDueBtn.textContent = `Ôn ${due} từ đến hạn 🚀`;
      ctaAllBtn.style.display = 'inline-flex';
      ctaAllBtn.textContent = `Ôn tất cả ${totalLearned} từ đã học`;
      ctaEl.classList.add('srs-cta-pulse');
    } else if (totalLearned > 0) {
      ctaIcon.textContent = '✅';
      ctaTitle.innerHTML = 'Tuyệt vời! Không có từ nào trễ hạn ôn tập';
      ctaDesc.textContent = `Bạn đang duy trì ${totalLearned} từ trong bộ nhớ SRS. Có thể học thêm từ mới bên dưới!`;
      ctaDueBtn.style.display = 'none';
      ctaAllBtn.style.display = 'inline-flex';
      ctaAllBtn.textContent = `Ôn tự do ${totalLearned} từ đã học`;
      ctaEl.classList.remove('srs-cta-pulse');
    } else {
      ctaIcon.textContent = '✨';
      ctaTitle.innerHTML = 'Bắt đầu hành trình ghi nhớ ngắt quãng SM-2!';
      ctaDesc.textContent = 'Chọn Day ở khung bên dưới và bấm "Bắt đầu phiên SRS" để nạp những từ vựng đầu tiên.';
      ctaDueBtn.style.display = 'none';
      ctaAllBtn.style.display = 'none';
      ctaEl.classList.remove('srs-cta-pulse');
    }
  }
};

VocabHackerApp.prototype.startSRSReviewDue = function() {
  if (!this.srsData) this._srsLoad();
  const now = Date.now();
  const dueWords = this.allWords.filter(w => {
    const c = this.srsData[w._id];
    return c && c.nextReview <= now;
  }).sort(() => Math.random() - 0.5);

  if (dueWords.length === 0) {
    this._showToast('🎉 Tuyệt vời! Không có từ nào cần ôn lại lúc này.');
    return;
  }
  this._launchSRSSession(dueWords);
};

VocabHackerApp.prototype.startSRSReviewAll = function() {
  if (!this.srsData) this._srsLoad();
  const learnedWords = this.allWords.filter(w => this.srsData[w._id]).sort(() => Math.random() - 0.5);
  if (learnedWords.length === 0) {
    this._showToast('⚠️ Chưa có từ nào trong bộ nhớ SRS!');
    return;
  }
  this._launchSRSSession(learnedWords);
};

VocabHackerApp.prototype._launchSRSSession = function(words) {
  this.srsSession = words;
  this.srsSessionIndex = 0;
  this.srsCounters = { again: 0, hard: 0, good: 0, easy: 0 };
  this.srsFlipped = false;

  document.getElementById('srsDashboard').classList.add('hidden');
  document.getElementById('srsWordListPanel')?.classList.add('hidden');
  document.getElementById('srsResult').classList.add('hidden');
  document.getElementById('srsActive').classList.remove('hidden');

  this.showSRSCard();
};

VocabHackerApp.prototype.startSRSSession = function() {
  if (!this.srsData) this._srsLoad();
  const day = document.getElementById('srsDayFilter')?.value || 'all';
  const category = document.getElementById('srsCategoryFilter')?.value || 'all';
  const size = parseInt(document.getElementById('srsSessionSize')?.value || '20');
  const now = Date.now();

  let pool = this.getFilteredWords(day, category);
  const due = pool.filter(w => this.srsData[w._id] && this.srsData[w._id].nextReview <= now);
  const fresh = pool.filter(w => !this.srsData[w._id]);

  let session = [...due.sort(() => Math.random() - 0.5)];
  if (session.length < size) {
    const needed = size - session.length;
    session = session.concat(fresh.sort(() => Math.random() - 0.5).slice(0, needed));
  }
  session = session.slice(0, size);

  if (session.length === 0) {
    this._showToast('🎉 Đã học hết từ mới và từ đến hạn trong mục này!');
    return;
  }

  this._launchSRSSession(session);
};

VocabHackerApp.prototype.showSRSCard = function() {
  if (!this.srsData) this._srsLoad();
  const word = this.srsSession[this.srsSessionIndex];
  if (!word) return;

  const total = this.srsSession.length;
  const current = this.srsSessionIndex + 1;

  document.getElementById('srsSessionProgress').textContent = `${current} / ${total}`;
  document.getElementById('srsProgressFill').style.width = `${((current - 1) / total) * 100}%`;
  document.getElementById('srsCountAgain').textContent = `${this.srsCounters.again} lại`;
  document.getElementById('srsCountHard').textContent = `${this.srsCounters.hard} khó`;
  document.getElementById('srsCountGood').textContent = `${this.srsCounters.good} tốt`;
  document.getElementById('srsCountEasy').textContent = `${this.srsCounters.easy} dễ`;

  document.getElementById('srsCategoryBadge').textContent = `${word._day} • ${this.getCategoryLabel(word._category)}`;

  const card = this.srsData[word._id];
  const isNew = !card;
  document.getElementById('srsTagDue').classList.toggle('hidden', isNew);
  document.getElementById('srsTagNew').classList.toggle('hidden', !isNew);

  const intervalDays = card?.interval || 0;
  document.getElementById('srsIntervalBadge').textContent = isNew ? 'Thẻ mới' : `Chu kỳ: ${intervalDays} ngày`;

  document.getElementById('srsCardWord').textContent = word.english;
  document.getElementById('srsCardWordBack').textContent = word.english;
  document.getElementById('srsCardMeaning').textContent = word.vietnamese;

  const antonymEl = document.getElementById('srsCardAntonym');
  if (word.antonym && word.antonym !== '-') {
    antonymEl.textContent = `⇔ Trái nghĩa: ${word.antonym}`;
    antonymEl.style.display = 'block';
  } else {
    antonymEl.style.display = 'none';
  }

  const exEl = document.getElementById('srsCardExample');
  if (word.exampleEn) {
    exEl.innerHTML = `<em>“${this.highlightWordInSentence(word.exampleEn, word.english)}”</em><span>${word.exampleVi || ''}</span>`;
    exEl.style.display = 'block';
  } else {
    exEl.style.display = 'none';
  }

  const previewCard = card || { easeFactor: 2.5, interval: 0, repetitions: 0 };
  document.getElementById('srsIntervalHard').textContent = this._srsFormatInterval(this._srsSchedule({ ...previewCard }, 2).interval);
  document.getElementById('srsIntervalGood').textContent = this._srsFormatInterval(this._srsSchedule({ ...previewCard }, 3).interval);
  document.getElementById('srsIntervalEasy').textContent = this._srsFormatInterval(this._srsSchedule({ ...previewCard }, 4).interval);

  document.getElementById('srsCardFront').classList.remove('hidden');
  document.getElementById('srsCardBack').classList.add('hidden');
  this.srsFlipped = false;

  document.getElementById('srsCard').onclick = () => this.flipSRSCard();
};

VocabHackerApp.prototype.flipSRSCard = function() {
  this.srsFlipped = !this.srsFlipped;
  document.getElementById('srsCardFront').classList.toggle('hidden', this.srsFlipped);
  document.getElementById('srsCardBack').classList.toggle('hidden', !this.srsFlipped);
  if (this.srsFlipped) {
    const word = this.srsSession[this.srsSessionIndex];
    if (word) this.speak(word.english);
  }
};

VocabHackerApp.prototype.rateSRS = function(rating) {
  if (!this.srsFlipped) { this.flipSRSCard(); return; }
  if (!this.srsData) this._srsLoad();

  const word = this.srsSession[this.srsSessionIndex];
  const existing = this.srsData[word._id] || { easeFactor: 2.5, interval: 0, repetitions: 0 };
  this.srsData[word._id] = this._srsSchedule(existing, rating);
  this._srsSave();

  if (rating >= 3 && !this.learned[word._id]) {
    this.learned[word._id] = true;
    localStorage.setItem('vh-learned', JSON.stringify(this.learned));
    this.populateDaysList();
  }
  this.incrementDailyGoal(1);

  if (rating === 1) {
    this.srsCounters.again++;
    this.recordMistake(word._id);
    this.srsSession.push(word);
  } else if (rating === 2) this.srsCounters.hard++;
  else if (rating === 3) this.srsCounters.good++;
  else if (rating === 4) this.srsCounters.easy++;

  this.srsSessionIndex++;
  if (this.srsSessionIndex >= this.srsSession.length) {
    this.showSRSResult();
  } else {
    this.showSRSCard();
  }
};

VocabHackerApp.prototype.showSRSResult = function() {
  document.getElementById('srsActive').classList.add('hidden');
  document.getElementById('srsResult').classList.remove('hidden');

  const { again, hard, good, easy } = this.srsCounters;
  const total = again + hard + good + easy;
  const goodRate = total > 0 ? Math.round(((good + easy) / total) * 100) : 0;

  document.getElementById('srbAgain').textContent = again;
  document.getElementById('srbHard').textContent = hard;
  document.getElementById('srbGood').textContent = good;
  document.getElementById('srbEasy').textContent = easy;

  let emoji, title;
  if (goodRate >= 80) { emoji = '🏆'; title = 'Trí nhớ siêu đẳng!'; this.launchConfetti(); }
  else if (goodRate >= 60) { emoji = '🎉'; title = 'Phiên ôn tập hiệu quả!'; }
  else { emoji = '💪'; title = 'Đã lên lịch ôn lại các từ khó!'; }

  document.getElementById('srsResultEmoji').textContent = emoji;
  document.getElementById('srsResultTitle').textContent = title;

  const now = Date.now();
  const nextDue = Object.values(this.srsData)
    .filter(c => c.nextReview > now)
    .map(c => c.nextReview)
    .sort()[0];

  if (nextDue) {
    const hoursLeft = Math.ceil((nextDue - now) / 3600000);
    document.getElementById('srsResultNext').textContent =
      hoursLeft < 24
        ? `⏱️ Từ tiếp theo sẽ đến hạn ôn sau khoảng ${hoursLeft} giờ.`
        : `⏱️ Từ tiếp theo sẽ đến hạn ôn sau ${Math.ceil(hoursLeft / 24)} ngày.`;
  } else {
    document.getElementById('srsResultNext').textContent = '✅ Đã hoàn thành tất cả lịch ôn tập hôm nay!';
  }

  this.addActivity('quiz', `Hoàn thành phiên SRS: ${good + easy}/${total} nhớ tốt (${goodRate}%)`);
  this.updateSRSDashboard();
};

VocabHackerApp.prototype.showSRSDashboard = function() {
  document.getElementById('srsActive').classList.add('hidden');
  document.getElementById('srsResult').classList.add('hidden');
  document.getElementById('srsWordListPanel')?.classList.add('hidden');
  document.getElementById('srsDashboard').classList.remove('hidden');
  this.updateSRSDashboard();
};

VocabHackerApp.prototype.quitSRS = function() {
  this.showSRSDashboard();
};

VocabHackerApp.prototype.showSRSWordList = function(bucket) {
  if (!this.srsData) this._srsLoad();
  const bucketWords = this.allWords.filter(w => {
    const c = this.srsData[w._id];
    return c && c.lastRating === bucket;
  });

  this._srsCurrentBucket = bucket;
  this._srsCurrentBucketWords = bucketWords;

  const config = {
    again: { label: 'Lại', title: 'Danh sách từ nhóm "Quên / Lại"', cls: 'wl-badge-again' },
    hard:  { label: 'Khó', title: 'Danh sách từ nhóm "Khó nhớ"', cls: 'wl-badge-hard'  },
    good:  { label: 'Tốt', title: 'Danh sách từ nhóm "Nhớ tốt"', cls: 'wl-badge-good'  },
    easy:  { label: 'Dễ',  title: 'Danh sách từ nhóm "Rất dễ"',  cls: 'wl-badge-easy'  },
  }[bucket];

  document.getElementById('srsWlBadge').textContent = config.label;
  document.getElementById('srsWlBadge').className = `srs-wl-badge ${config.cls}`;
  document.getElementById('srsWlTitle').textContent = config.title;
  document.getElementById('srsWlCount').textContent = `${bucketWords.length} từ`;
  document.getElementById('srsWlSearch').value = '';

  document.getElementById('srsDashboard').classList.add('hidden');
  const panel = document.getElementById('srsWordListPanel');
  panel.classList.remove('hidden');

  this._renderSRSWordList(bucketWords);
  panel.scrollIntoView({ behavior: 'smooth', block: 'start' });
};

VocabHackerApp.prototype._renderSRSWordList = function(words) {
  const grid = document.getElementById('srsWlGrid');
  if (words.length === 0) {
    grid.innerHTML = `<div class="srs-wl-empty glass-card">
      <div class="srs-wl-empty-icon">🔍</div>
      <p>Chưa có từ nào trong nhóm này.<br>Hãy thực hiện các phiên ôn tập SRS để phân loại từ!</p>
    </div>`;
    return;
  }

  const now = Date.now();
  grid.innerHTML = words.map(w => {
    const c = this.srsData[w._id];
    const isDue = c && c.nextReview <= now;
    const nextStr = c ? this._srsFormatInterval(c.interval) : '—';
    return `
      <div class="srs-wl-card glass-card" onclick="app.openWordModal('${w._id}')" style="cursor:pointer">
        <div class="srs-wl-card-top">
          <span class="srs-wl-card-day mono-text">${w._day}</span>
          ${isDue ? '<span class="srs-wl-due-badge">Đến hạn</span>' : ''}
        </div>
        <div class="srs-wl-card-en">${w.english}</div>
        <div class="srs-wl-card-vi">${w.vietnamese}</div>
        <div class="srs-wl-card-footer mono-text">
          <span class="srs-wl-interval">⏱ Chu kỳ: ${nextStr}</span>
          <span class="srs-wl-reps">×${c?.repetitions || 0}</span>
        </div>
      </div>
    `;
  }).join('');
};

VocabHackerApp.prototype.filterSRSWordList = function(query) {
  const q = query.toLowerCase().trim();
  const words = q
    ? this._srsCurrentBucketWords.filter(w =>
        w.english.toLowerCase().includes(q) || w.vietnamese.toLowerCase().includes(q))
    : this._srsCurrentBucketWords;

  document.getElementById('srsWlCount').textContent = `${words.length} từ`;
  this._renderSRSWordList(words);
};

VocabHackerApp.prototype.closeSRSWordList = function() {
  document.getElementById('srsWordListPanel').classList.add('hidden');
  document.getElementById('srsDashboard').classList.remove('hidden');
};

// ==========================================
// Data Backup & Restore + IndexedDB Sync
// ==========================================

VocabHackerApp.prototype.exportData = function() {
  const data = {
    version: 3,
    exportDate: new Date().toISOString(),
    learned: this.learned,
    starred: this.starred,
    notes: this.notes,
    mistakes: this.mistakes,
    activity: this.activity,
    streak: this.streakData,
    dailyGoal: this.dailyGoal,
    srs: this.srsData || {},
    theme: this.theme
  };

  const json = JSON.stringify(data, null, 2);
  const blob = new Blob([json], { type: 'application/json' });
  const url = URL.createObjectURL(blob);

  const a = document.createElement('a');
  a.href = url;
  const date = new Date().toISOString().slice(0, 10);
  a.download = `vocabhacker-pro-backup-${date}.json`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);

  this._showToast('✅ Đã tải xuống file sao lưu dữ liệu học tập!');
};

VocabHackerApp.prototype.importData = function(event) {
  const file = event.target.files[0];
  if (!file) return;

  const reader = new FileReader();
  reader.onload = (e) => {
    try {
      const data = JSON.parse(e.target.result);
      if (!data.learned && !data.starred && !data.srs) {
        alert('❌ File backup không hợp lệ!');
        return;
      }

      const learnedCount = Object.keys(data.learned || {}).length;
      const srsCount = Object.keys(data.srs || {}).length;
      if (!confirm(`🔄 Khôi phục ${learnedCount} từ đã thuộc và ${srsCount} dữ liệu SRS từ bản sao lưu?`)) return;

      if (data.learned) localStorage.setItem('vh-learned', JSON.stringify(data.learned));
      if (data.starred) localStorage.setItem('vh-starred', JSON.stringify(data.starred));
      if (data.notes) localStorage.setItem('vh-notes', JSON.stringify(data.notes));
      if (data.mistakes) localStorage.setItem('vh-mistakes', JSON.stringify(data.mistakes));
      if (data.activity) localStorage.setItem('vh-activity', JSON.stringify(data.activity));
      if (data.streak) localStorage.setItem('vh-streak', JSON.stringify(data.streak));
      if (data.srs) localStorage.setItem('vh-srs', JSON.stringify(data.srs));
      if (data.theme) localStorage.setItem('vh-theme', data.theme);

      this._showToast('✅ Khôi phục thành công! Đang làm mới...');
      setTimeout(() => location.reload(), 1000);
    } catch (err) {
      alert('❌ Lỗi đọc file backup: ' + err.message);
    }
  };
  reader.readAsText(file);
  event.target.value = '';
};

VocabHackerApp.prototype._showToast = function(message) {
  const existing = document.querySelector('.vh-toast');
  if (existing) existing.remove();

  const toast = document.createElement('div');
  toast.className = 'vh-toast';
  toast.textContent = message;
  document.body.appendChild(toast);

  requestAnimationFrame(() => toast.classList.add('vh-toast-show'));
  setTimeout(() => {
    toast.classList.remove('vh-toast-show');
    setTimeout(() => toast.remove(), 400);
  }, 3200);
};

// Initialize App & IndexedDB Mirror
let app;
document.addEventListener('DOMContentLoaded', () => {
  app = new VocabHackerApp();

  if (navigator.storage && navigator.storage.persist) {
    navigator.storage.persist().catch(() => {});
  }

  VH_DB.init().then(() => {
    VH_DB.restoreIfNeeded(app);
  });
});

const VH_DB = {
  db: null,
  DB_NAME: 'VocabHackerDB',
  STORE: 'appdata',
  KEY: 'all',

  init() {
    return new Promise((resolve) => {
      const req = indexedDB.open(this.DB_NAME, 1);
      req.onupgradeneeded = (e) => e.target.result.createObjectStore(this.STORE);
      req.onsuccess = (e) => { this.db = e.target.result; resolve(); };
      req.onerror = () => resolve();
    });
  },

  save(data) {
    if (!this.db) return;
    try {
      const tx = this.db.transaction(this.STORE, 'readwrite');
      tx.objectStore(this.STORE).put(data, this.KEY);
    } catch (e) {}
  },

  load() {
    if (!this.db) return Promise.resolve(null);
    return new Promise((resolve) => {
      try {
        const tx = this.db.transaction(this.STORE, 'readonly');
        const req = tx.objectStore(this.STORE).get(this.KEY);
        req.onsuccess = () => resolve(req.result || null);
        req.onerror = () => resolve(null);
      } catch (e) { resolve(null); }
    });
  },

  async restoreIfNeeded(app) {
    const hasLocal = Object.keys(app.learned).length > 0 ||
                     Object.keys(app.starred).length > 0 ||
                     Object.keys(app.srsData || {}).length > 0;

    if (hasLocal) {
      this.save({
        learned: app.learned,
        starred: app.starred,
        notes: app.notes,
        mistakes: app.mistakes,
        activity: app.activity,
        streak: app.streakData,
        srs: app.srsData || {},
        theme: app.theme,
        savedAt: Date.now()
      });
      return;
    }

    const backup = await this.load();
    if (!backup || (!backup.learned && !backup.srs)) return;
    if (Object.keys(backup.learned || {}).length === 0 && Object.keys(backup.srs || {}).length === 0) return;

    if (backup.learned) { app.learned = backup.learned; localStorage.setItem('vh-learned', JSON.stringify(backup.learned)); }
    if (backup.starred) { app.starred = backup.starred; localStorage.setItem('vh-starred', JSON.stringify(backup.starred)); }
    if (backup.notes) { app.notes = backup.notes; localStorage.setItem('vh-notes', JSON.stringify(backup.notes)); }
    if (backup.mistakes) { app.mistakes = backup.mistakes; localStorage.setItem('vh-mistakes', JSON.stringify(backup.mistakes)); }
    if (backup.activity) { app.activity = backup.activity; localStorage.setItem('vh-activity', JSON.stringify(backup.activity)); }
    if (backup.streak) { app.streakData = backup.streak; localStorage.setItem('vh-streak', JSON.stringify(backup.streak)); }
    if (backup.srs) { app.srsData = backup.srs; localStorage.setItem('vh-srs', JSON.stringify(backup.srs)); }

    app.renderVocabGrid(true);
    app.populateDaysList();
    app.updateDashboard();
    app._showToast('🔄 Đã tự động đồng bộ lại tiến độ học của bạn!');
  }
};

(function() {
  const origSetItem = localStorage.setItem.bind(localStorage);
  let pendingSync = false;
  localStorage.setItem = function(key, value) {
    origSetItem(key, value);
    if (key.startsWith('vh-') && app && VH_DB.db && !pendingSync) {
      pendingSync = true;
      setTimeout(() => {
        pendingSync = false;
        VH_DB.save({
          learned: app.learned,
          starred: app.starred,
          notes: app.notes,
          mistakes: app.mistakes,
          activity: app.activity,
          streak: app.streakData,
          srs: app.srsData || {},
          theme: app.theme,
          savedAt: Date.now()
        });
      }, 500);
    }
  };
})();
