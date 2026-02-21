(function() {

  // ========== STATE ==========
  var state = {
    currentScene: 1,
    totalScenes: 0,
    choices: [],
    counters: {},
    scenes: {},
    results: {},
    sumData: null,
    config: null,
    achievementDefs: null,
    bgMusic: null,
    sceneMusic: null,
    achievements: {},
    soundMuted: false,
    playerName: ''
  };

  // ========== DETECT MOBILE ==========
  function isMobile() {
    return /Android|iPhone|iPad|iPod|webOS|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent)
      || window.innerWidth < 769;
  }

  // ========== SHUFFLE ARRAY ==========
  function shuffleArray(arr) {
    var a = arr.slice();
    for (var i = a.length - 1; i > 0; i--) {
      var j = Math.floor(Math.random() * (i + 1));
      var tmp = a[i];
      a[i] = a[j];
      a[j] = tmp;
    }
    return a;
  }

  // ========== LOCALSTORAGE ==========
  function loadAchievements() {
    try {
      var saved = localStorage.getItem('ushakov_achievements');
      if (saved) state.achievements = JSON.parse(saved);
    } catch(e) {}
  }

  function saveAchievements() {
    try {
      localStorage.setItem('ushakov_achievements', JSON.stringify(state.achievements));
    } catch(e) {}
  }

  function grantAchievement(id) {
    if (!state.achievements[id]) {
      state.achievements[id] = true;
      saveAchievements();
    }
  }

  // ========== LOAD JSON (с fallback для file://) ==========
  function loadJSON(path, cb) {
    // Проверяем, запущено ли через file://
    var isFileProtocol = window.location.protocol === 'file:';

    if (isFileProtocol) {
      // Через file:// XHR не работает — используем <script> трюк
      // или пробуем fetch (некоторые браузеры разрешают)
      try {
        var xhr = new XMLHttpRequest();
        xhr.open('GET', path, true);
        xhr.onload = function() {
          if (xhr.status === 0 || (xhr.status >= 200 && xhr.status < 300)) {
            try {
              cb(null, JSON.parse(xhr.responseText));
            } catch(e) {
              console.warn('[Движок] Ошибка парсинга: ' + path);
              cb('parse_error', null);
            }
          } else {
            cb('not_found', null);
          }
        };
        xhr.onerror = function() {
          console.warn('[Движок] file:// CORS блокировка для: ' + path);
          console.warn('[Движок] Запустите через локальный сервер:');
          console.warn('  python -m http.server 8000');
          console.warn('  или: npx serve .');
          console.warn('  затем откройте http://localhost:8000');
          cb('cors_blocked', null);
        };
        xhr.send();
      } catch(e) {
        console.warn('[Движок] XHR невозможен для file://, путь: ' + path);
        cb('cors_blocked', null);
      }
      return;
    }

    // Нормальная загрузка через HTTP
    var xhr = new XMLHttpRequest();
    xhr.open('GET', path, true);
    xhr.onload = function() {
      if (xhr.status >= 200 && xhr.status < 300) {
        try {
          cb(null, JSON.parse(xhr.responseText));
        } catch(e) {
          console.warn('[Движок] Ошибка парсинга JSON: ' + path);
          cb('parse_error', null);
        }
      } else {
        cb('not_found', null);
      }
    };
    xhr.onerror = function() {
      cb('network_error', null);
    };
    xhr.send();
  }

  // ========== ВСТРОЕННЫЕ ДАННЫЕ (fallback для file://) ==========
  var FALLBACK_ACTIVE = false;

  function loadAll(cb) {
    var filesLoaded = 0;
    var totalFiles = 5;
    var errors = 0;

    function checkDone() {
      filesLoaded++;
      if (filesLoaded >= totalFiles) {
        if (errors > 0 && window.location.protocol === 'file:') {
          console.warn('');
          console.warn('==========================================');
          console.warn('  ВНИМАНИЕ: Запуск через file:// протокол');
          console.warn('  JSON-файлы не могут быть загружены.');
          console.warn('');
          console.warn('  Для корректной работы запустите через');
          console.warn('  локальный веб-сервер:');
          console.warn('');
          console.warn('  Вариант 1 (Python):');
          console.warn('    cd папка_с_игрой');
          console.warn('    python -m http.server 8000');
          console.warn('');
          console.warn('  Вариант 2 (Node.js):');
          console.warn('    npx serve .');
          console.warn('');
          console.warn('  Вариант 3 (VS Code):');
          console.warn('    Установите расширение "Live Server"');
          console.warn('    и нажмите "Go Live"');
          console.warn('');
          console.warn('  Затем откройте:');
          console.warn('    http://localhost:8000');
          console.warn('==========================================');
          console.warn('');
        }
        cb();
      }
    }

    loadJSON('data/config.json', function(err, data) {
      if (!err && data) {
        state.config = data;
      } else {
        errors++;
        state.config = { totalScenes: 7, title: 'Путь Ушакова', startbg: 'files/images/start_bg.jpg', finalbg: 'files/images/final_bg.jpg' };
      }
      state.totalScenes = state.config.totalScenes || 7;
      var titleEl = document.querySelector('.game-title');
      if (titleEl && state.config.title) titleEl.textContent = state.config.title;
      checkDone();
    });

    loadJSON('data/scenes.json', function(err, data) {
      if (!err && data) {
        state.scenes = data;
      } else {
        errors++;
        console.error('[Движок] scenes.json не загружен! Игра может работать некорректно.');
        state.scenes = {};
      }
      checkDone();
    });

    loadJSON('data/results.json', function(err, data) {
      if (!err && data) {
        state.results = data;
      } else {
        errors++;
        state.results = {};
      }
      checkDone();
    });

    loadJSON('data/sum.json', function(err, data) {
      if (!err && data) {
        state.sumData = data;
      } else {
        errors++;
        state.sumData = [];
      }
      checkDone();
    });

    loadJSON('data/achievements.json', function(err, data) {
      if (!err && data) {
        state.achievementDefs = data;
      } else {
        errors++;
        state.achievementDefs = {};
      }
      checkDone();
    });
  }

  // ========== MUSIC (полностью переработанная) ==========
  
  // Уникальный ID для предотвращения гонки аудио
  var musicRequestId = 0;

  function startBgMusic() {
    try {
      if (state.bgMusic) {
        state.bgMusic.pause();
        state.bgMusic.src = '';
        state.bgMusic = null;
      }
      var audio = new Audio();
      audio.preload = 'auto';
      audio.loop = true;
      audio.volume = 0.3;
      
      // Пробуем загрузить
      audio.onerror = function() {
        console.warn('[Музыка] Фоновая музыка не найдена');
        state.bgMusic = null;
      };
      
      audio.src = 'files/music/background_30.mp3?v=' + Date.now();
      state.bgMusic = audio;
      
      if (!state.soundMuted) {
        var playPromise = audio.play();
        if (playPromise !== undefined) {
          playPromise.catch(function(e) {
            console.warn('[Музыка] Автовоспроизведение заблокировано');
          });
        }
      }
    } catch(e) {
      console.warn('[Музыка] Ошибка инициализации фоновой музыки');
    }
  }

  function playSceneMusic(sceneNum) {
    // Увеличиваем ID чтобы отменить предыдущие попытки загрузки
    musicRequestId++;
    var currentRequestId = musicRequestId;
    
    // Полностью останавливаем и уничтожаем предыдущий аудио
    if (state.sceneMusic) {
      try {
        state.sceneMusic.pause();
        state.sceneMusic.removeAttribute('src');
        state.sceneMusic.load(); // сбрасываем
      } catch(e) {}
      state.sceneMusic = null;
    }
    
    try {
      var audio = new Audio();
      audio.preload = 'auto';
      audio.volume = 0.6;
      audio.loop = false;
      
      audio.onerror = function() {
        console.warn('[Музыка] Музыка сцены ' + sceneNum + ' не найдена');
        if (currentRequestId === musicRequestId) {
          state.sceneMusic = null;
        }
      };
      
      // Добавляем cache-buster чтобы не грузился старый кешированный файл
      audio.src = 'files/music/scene' + sceneNum + '_50.mp3?v=' + Date.now();
      
      // Проверяем что этот запрос ещё актуален
      if (currentRequestId !== musicRequestId) return;
      
      state.sceneMusic = audio;
      
      if (!state.soundMuted) {
        // Ждём загрузки перед воспроизведением
        audio.addEventListener('canplaythrough', function onReady() {
          audio.removeEventListener('canplaythrough', onReady);
          // Ещё раз проверяем актуальность
          if (currentRequestId !== musicRequestId) {
            audio.pause();
            return;
          }
          var playPromise = audio.play();
          if (playPromise !== undefined) {
            playPromise.catch(function(e) {
              console.warn('[Музыка] Не удалось воспроизвести сцену ' + sceneNum);
            });
          }
        });
      }
    } catch(e) {
      console.warn('[Музыка] Ошибка инициализации музыки сцены ' + sceneNum);
    }
  }

  function stopSceneMusic() {
    musicRequestId++; // отменяем все pending запросы
    if (state.sceneMusic) {
      try {
        state.sceneMusic.pause();
        state.sceneMusic.removeAttribute('src');
        state.sceneMusic.load();
      } catch(e) {}
      state.sceneMusic = null;
    }
  }

  function toggleSound() {
    state.soundMuted = !state.soundMuted;

    var btns = document.querySelectorAll('.sound-toggle');
    for (var i = 0; i < btns.length; i++) {
      btns[i].textContent = state.soundMuted ? '🔇' : '🔊';
      if (state.soundMuted) {
        btns[i].classList.add('muted');
      } else {
        btns[i].classList.remove('muted');
      }
    }

    if (state.soundMuted) {
      if (state.bgMusic) {
        try { state.bgMusic.pause(); } catch(e) {}
      }
      if (state.sceneMusic) {
        try { state.sceneMusic.pause(); } catch(e) {}
      }
    } else {
      if (state.bgMusic) {
        try { state.bgMusic.play().catch(function(){}); } catch(e) {}
      }
      if (state.sceneMusic) {
        try { state.sceneMusic.play().catch(function(){}); } catch(e) {}
      }
    }
  }

  // ========== SCREENS ==========
  function showScreen(id) {
    var screens = document.querySelectorAll('.screen');
    for (var i = 0; i < screens.length; i++) {
      screens[i].classList.remove('active');
    }
    var target = document.getElementById(id);
    target.classList.add('active', 'fade-in');
    setTimeout(function() { target.classList.remove('fade-in'); }, 800);
  }
  // ========== УСТАНОВКА ФОНА (с принудительным обновлением) ==========
  var imageCache = {};
  
  function setBg(screenId, imagePath) {
    var screen = document.getElementById(screenId);
    if (!screen) return;
    
    if (!imagePath) {
      screen.style.backgroundImage = 'none';
      return;
    }
    
    // Немедленно убираем старый фон чтобы не было "залипания"
    screen.style.backgroundImage = 'none';
    
    // Проверяем кеш
    if (imageCache[imagePath]) {
      screen.style.backgroundImage = 'url(' + imagePath + ')';
      return;
    }
    
    var img = new Image();
    
    img.onload = function() {
      imageCache[imagePath] = true;
      // Проверяем что экран ещё активен (не переключились уже)
      screen.style.backgroundImage = 'url(' + imagePath + ')';
    };
    
    img.onerror = function() {
      console.warn('[Изображение] Не найдено: ' + imagePath);
      screen.style.backgroundImage = 'none';
    };
    
    img.src = imagePath;
  }

  // Предзагрузка изображений следующей сцены
  function preloadNextScene(currentNum) {
    var nextNum = currentNum + 1;
    var nextScene = state.scenes[String(nextNum)];
    if (!nextScene) return;
    
    // Предзагружаем фон следующей сцены
    if (nextScene.fon) {
      var img = new Image();
      img.onload = function() { imageCache[nextScene.fon] = true; };
      img.src = nextScene.fon;
    }
    
    // Предзагружаем фоны результатов текущей сцены
    var currentScene = state.scenes[String(currentNum)];
    if (currentScene && currentScene.variants) {
      for (var i = 0; i < currentScene.variants.length; i++) {
        var resultId = currentScene.variants[i].result;
        var resultData = state.results[resultId];
        if (resultData && resultData.fon) {
          var rImg = new Image();
          rImg.onload = (function(path) {
            return function() { imageCache[path] = true; };
          })(resultData.fon);
          rImg.src = resultData.fon;
        }
      }
    }
  }

  // ========== SHOW RESULT ==========
  function showResultScreen(resultId) {
    var data = state.results[resultId];
    if (!data) {
      data = { title: 'Последствия', text: 'Ваш выбор сделан.', fon: '', effects: [], correct: false };
    }

    // Очищаем старый фон
    var resultScreen = document.getElementById('screen-result');
    resultScreen.style.backgroundImage = 'none';

    document.getElementById('result-title').textContent = data.title;
    document.getElementById('result-text').textContent = data.text;
    
    // Новый фон
    setBg('screen-result', data.fon);

    // Apply effects
    if (data.effects) {
      for (var i = 0; i < data.effects.length; i++) {
        var eff = data.effects[i];
        if (!state.counters[eff.name]) state.counters[eff.name] = 0;
        state.counters[eff.name] += eff.value;
      }
    }

    if (data.correct) {
      var last = state.choices[state.choices.length - 1];
      if (last) last.correct = true;
    }

    showScreen('screen-result');
  }
  
  // ========== SHOW SCENE ==========
  function showScene(num) {
    var scene = state.scenes[String(num)];
    if (!scene) {
      showFinal();
      return;
    }

    // Сначала очищаем фон
    var sceneScreen = document.getElementById('screen-scene');
    sceneScreen.style.backgroundImage = 'none';

    document.getElementById('scene-title').textContent = scene.title;
    document.getElementById('scene-text').textContent = scene.text;
    
    // Устанавливаем фон
    setBg('screen-scene', scene.fon);
    
    // Музыка
    playSceneMusic(num);
    
    // Предзагрузка следующих ресурсов
    preloadNextScene(num);

    // Show text block, hide choices
    var textBlock = document.getElementById('scene-text-block');
    var choicesDiv = document.getElementById('scene-choices');
    var choicesButtonsDiv = document.getElementById('scene-choices-buttons');
    
    textBlock.style.display = 'flex';
    choicesDiv.style.display = 'none';
    if (choicesButtonsDiv) choicesButtonsDiv.innerHTML = '';

    // Prepare choices (shuffled)
    var variants = shuffleArray(scene.variants);

    // "Далее" button
    var showBtn = document.getElementById('btn-show-choices');
    showBtn.onclick = function(e) {
      e.preventDefault();
      textBlock.style.display = 'none';
      choicesDiv.style.display = 'flex';

      var targetDiv = choicesButtonsDiv || choicesDiv;
      targetDiv.innerHTML = '';

      for (var i = 0; i < variants.length; i++) {
        (function(variant, idx) {
          var btn = document.createElement('button');
          btn.className = 'choice-btn';
          btn.textContent = variant.text;
          btn.addEventListener('click', function(e) {
            e.preventDefault();
            state.choices.push({
              scene: num,
              choice: idx,
              resultId: variant.result,
              correct: variant.correct || false
            });
            showResultScreen(variant.result);
          });
          targetDiv.appendChild(btn);
        })(variants[i], i);
      }
    };

    // "Назад" button
    var backBtn = document.getElementById('btn-back-to-text');
    if (backBtn) {
      backBtn.onclick = function(e) {
        e.preventDefault();
        choicesDiv.style.display = 'none';
        textBlock.style.display = 'flex';
      };
    }

    showScreen('screen-scene');
  }

  // ========== ПЕРЕКЛЮЧЕНИЕ ЭКРАНОВ (с очисткой) ==========
  function showScreen(id) {
    var screens = document.querySelectorAll('.screen');
    for (var i = 0; i < screens.length; i++) {
      screens[i].classList.remove('active', 'fade-in');
    }
    
    var target = document.getElementById(id);
    if (!target) return;
    
    // Прокручиваем контент наверх
    var scrollable = target.querySelector('.scene-content, .result-content, .final-content, .start-content');
    if (scrollable) {
      scrollable.scrollTop = 0;
    }
    
    target.classList.add('active', 'fade-in');
    setTimeout(function() { 
      target.classList.remove('fade-in'); 
    }, 800);
  }

  // ========== CHECK ACHIEVEMENTS (from external definitions) ==========
  function checkAchievements(percent) {
    if (!state.achievementDefs) return;

    var ids = Object.keys(state.achievementDefs);
    for (var i = 0; i < ids.length; i++) {
      var id = ids[i];
      var def = state.achievementDefs[id];
      if (!def.conditions) continue;

      var allMet = true;
      for (var j = 0; j < def.conditions.length; j++) {
        var cond = def.conditions[j];

        if (cond.type === 'percent') {
          if (!evalOp(percent, cond.op, cond.value)) allMet = false;
        }
        else if (cond.type === 'counter') {
          var val = state.counters[cond.name] || 0;
          if (!evalOp(val, cond.op, cond.value)) allMet = false;
        }
        else if (cond.type === 'choice') {
          var found = false;
          for (var k = 0; k < state.choices.length; k++) {
            if (state.choices[k].scene === cond.scene && state.choices[k].resultId === cond.result) {
              found = true;
              break;
            }
          }
          if (!found) allMet = false;
        }
      }

      if (allMet) {
        grantAchievement(id);
      }
    }
  }

  function evalOp(actual, op, expected) {
    if (op === '>=') return actual >= expected;
    if (op === '<=') return actual <= expected;
    if (op === '=') return actual === expected;
    if (op === '>') return actual > expected;
    if (op === '<') return actual < expected;
    return false;
  }

  // ========== FINAL SCREEN ==========
  function showFinal() {
    stopSceneMusic();

    var totalQ = state.choices.length;
    var correctCount = 0;
    for (var i = 0; i < state.choices.length; i++) {
      if (state.choices[i].correct) correctCount++;
    }
    var percent = totalQ > 0 ? Math.round((correctCount / totalQ) * 100) : 0;

    checkAchievements(percent);

    // Player name in card
    document.getElementById('stat-name').textContent = state.playerName || 'Неизвестный';
    document.getElementById('stat-percent').textContent = percent + '%';
    document.getElementById('stat-correct').textContent = correctCount + ' / ' + totalQ;

    // Title tag
    document.title = 'Путь Ушакова — ' + (state.playerName || 'Капитан');

    // Counters
    var countersDiv = document.getElementById('card-counters');
    countersDiv.innerHTML = '';
    var COUNTER_NAMES = {
      courage: 'Отвага', faith: 'Вера', wisdom: 'Мудрость',
      crew_care: 'Забота', mercy: 'Милосердие', honor: 'Честь',
      tactics: 'Тактика', cannon: 'Канонада', caution: 'Осторожность',
      land: 'Суша', court: 'Двор', cowardice: 'Малодушие',
      cruelty: 'Жестокость', loss: 'Потери', obedience: 'Послушание',
      diplomacy: 'Дипломатия', naivety: 'Наивность', patience: 'Терпение',
      stubbornness: 'Упрямство'
    };
    var counterKeys = Object.keys(state.counters);
    for (var j = 0; j < counterKeys.length; j++) {
      var key = counterKeys[j];
      if (state.counters[key] > 0) {
        var tag = document.createElement('span');
        tag.className = 'counter-tag';
        tag.textContent = (COUNTER_NAMES[key] || key) + ': ' + state.counters[key];
        countersDiv.appendChild(tag);
      }
    }

    // Summary
    var summaryText = getSummary(percent);
    document.getElementById('final-summary').textContent = summaryText;

    renderAchievements();

    setBg('screen-final', state.config.finalbg);
    showScreen('screen-final');
  }

  // ========== RENDER ACHIEVEMENTS ==========
  function renderAchievements() {
    var container = document.getElementById('achievements-grid');
    if (!container) return;
    container.innerHTML = '';

    if (!state.achievementDefs) return;

    var allIds = Object.keys(state.achievementDefs);
    var mobile = isMobile();

    for (var i = 0; i < allIds.length; i++) {
      var id = allIds[i];
      var ach = state.achievementDefs[id];
      var unlocked = state.achievements[id];

      var cell = document.createElement('div');
      cell.className = 'achievement-cell' + (unlocked ? ' unlocked' : ' locked');

      var icon = document.createElement('div');
      icon.className = 'achievement-icon';
      icon.textContent = unlocked ? '\u2693' : '?';

      var tooltip = document.createElement('div');
      tooltip.className = 'achievement-tooltip';
      tooltip.textContent = unlocked ? (ach.name + ': ' + ach.desc) : 'Неизвестное достижение';

      cell.appendChild(icon);
      cell.appendChild(tooltip);

      // Mobile: click to toggle tooltip
      if (mobile) {
        (function(cellEl) {
          cellEl.addEventListener('click', function(e) {
            e.stopPropagation();
            // Close all others
            var allCells = container.querySelectorAll('.achievement-cell');
            for (var x = 0; x < allCells.length; x++) {
              if (allCells[x] !== cellEl) {
                allCells[x].classList.remove('tooltip-visible');
              }
            }
            cellEl.classList.toggle('tooltip-visible');
          });
        })(cell);
      }

      container.appendChild(cell);
    }

    // Close tooltips on outside click (mobile)
    if (mobile) {
      document.addEventListener('click', function() {
        var allCells = document.querySelectorAll('.achievement-cell.tooltip-visible');
        for (var x = 0; x < allCells.length; x++) {
          allCells[x].classList.remove('tooltip-visible');
        }
      });
    }
  }

  // ========== GET SUMMARY (with variation) ==========
  function getSummary(percent) {
    if (!state.sumData || !state.sumData.length) return 'Ваше плавание завершено.';

    var counterMatches = [];
    var percentMatch = null;

    for (var i = 0; i < state.sumData.length; i++) {
      var rule = state.sumData[i];
      var match = true;
      var hasPercent = false;
      var hasCounter = false;

      for (var j = 0; j < rule.conditions.length; j++) {
        var cond = rule.conditions[j];
        if (cond.type === 'percent') {
          hasPercent = true;
          if (percent < cond.min || percent > cond.max) match = false;
        }
        if (cond.type === 'counter') {
          hasCounter = true;
          var val = state.counters[cond.name] || 0;
          if (cond.op === '>=' && !(val >= cond.value)) match = false;
          if (cond.op === '<=' && !(val <= cond.value)) match = false;
          if (cond.op === '=' && val !== cond.value) match = false;
          if (cond.op === '>' && !(val > cond.value)) match = false;
          if (cond.op === '<' && !(val < cond.value)) match = false;
        }
      }

      if (match) {
        // Pick random text from texts array
        var textOptions = rule.texts || [rule.text || ''];
        var randomText = textOptions[Math.floor(Math.random() * textOptions.length)];

        if (hasCounter && !hasPercent) {
          counterMatches.push(randomText);
        }
        if (hasPercent && !percentMatch) {
          percentMatch = randomText;
        }
      }
    }

    // Priority: specific counter matches, then percent
    if (counterMatches.length > 0) {
      return counterMatches[0];
    }
    if (percentMatch) {
      return percentMatch;
    }

    return 'Ваше плавание завершено. Вы прошли свой путь.';
  }

  // ========== SHARE (исправленная версия) ==========
  function shareResult() {
    var card = document.getElementById('final-card');
    var shareBtn = document.getElementById('btn-share');
    
    // Блокируем кнопку на время обработки
    shareBtn.disabled = true;
    shareBtn.textContent = 'Создание...';
    
    if (typeof html2canvas === 'undefined') {
      alert('Функция "Поделиться" временно недоступна. Попробуйте сделать скриншот.');
      shareBtn.disabled = false;
      shareBtn.textContent = 'Поделиться';
      return;
    }
    
    html2canvas(card, {
      backgroundColor: '#0a0a1e',
      scale: 2,
      useCORS: true
    }).then(function(canvas) {
      canvas.toBlob(function(blob) {
        if (!blob) {
          alert('Не удалось создать изображение');
          shareBtn.disabled = false;
          shareBtn.textContent = 'Поделиться';
          return;
        }
        
        var file = new File([blob], 'ushakov_result.png', { type: 'image/png' });
        
        // Проверяем поддержку Web Share API с файлами
        if (navigator.share && navigator.canShare) {
          var shareData = {
            files: [file],
            title: 'Путь Ушакова',
            text: 'Мой результат: ' + (document.getElementById('stat-percent').textContent || '') + ' совпадения с Ушаковым!'
          };
          
          // Проверяем, можно ли поделиться этими данными
          if (navigator.canShare(shareData)) {
            navigator.share(shareData)
              .then(function() {
                console.log('Успешно поделились');
              })
              .catch(function(err) {
                // Пользователь отменил или ошибка
                if (err.name !== 'AbortError') {
                  console.log('Ошибка шаринга, скачиваем файл');
                  downloadImage(canvas);
                }
              })
              .finally(function() {
                shareBtn.disabled = false;
                shareBtn.textContent = 'Поделиться';
              });
            return;
          }
        }
        
        // Web Share API не поддерживается или не может поделиться файлами
        // Пробуем поделиться только текстом (для десктопа)
        if (navigator.share) {
          var textShareData = {
            title: 'Путь Ушакова',
            text: 'Я прошёл игру «Путь Ушакова» и набрал ' + (document.getElementById('stat-percent').textContent || '0%') + ' совпадения с великим адмиралом!',
            url: window.location.href
          };
          
          navigator.share(textShareData)
            .then(function() {
              // После шаринга текста предлагаем скачать картинку
              if (confirm('Хотите также сохранить картинку с результатом?')) {
                downloadImage(canvas);
              }
            })
            .catch(function(err) {
              if (err.name !== 'AbortError') {
                downloadImage(canvas);
              }
            })
            .finally(function() {
              shareBtn.disabled = false;
              shareBtn.textContent = 'Поделиться';
            });
          return;
        }
        
        // Fallback - просто скачиваем
        downloadImage(canvas);
        shareBtn.disabled = false;
        shareBtn.textContent = 'Поделиться';
        
      }, 'image/png');
    }).catch(function(err) {
      console.error('Ошибка html2canvas:', err);
      alert('Не удалось создать изображение. Попробуйте сделать скриншот.');
      shareBtn.disabled = false;
      shareBtn.textContent = 'Поделиться';
    });
  }

  function downloadImage(canvas) {
    var link = document.createElement('a');
    link.download = 'ushakov_result_' + (state.playerName || 'captain').replace(/[^a-zA-Zа-яА-Я0-9]/g, '_') + '.png';
    link.href = canvas.toDataURL('image/png');
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  }

  // ========== INIT ==========
  function init() {
    loadAchievements();

    loadAll(function() {
      if (state.config && state.config.startbg) {
        setBg('screen-start', state.config.startbg);
      }

      var nameInput = document.getElementById('player-name-input');
      var startBtn = document.getElementById('btn-start');

      // Убираем disabled на всякий случай
      startBtn.disabled = false;
      startBtn.removeAttribute('disabled');

      startBtn.addEventListener('click', function(e) {
        e.preventDefault();
        e.stopPropagation();
        
        var val = '';
        if (nameInput) {
          val = nameInput.value.trim();
        }
        state.playerName = val.length > 0 ? val : 'Адмирал';
        document.title = 'Путь Ушакова — ' + state.playerName;
        startBgMusic();
        showScene(1);
      });

      // Также разрешаем старт по Enter в поле ввода
      if (nameInput) {
        nameInput.addEventListener('keydown', function(e) {
          if (e.key === 'Enter' || e.keyCode === 13) {
            e.preventDefault();
            startBtn.click();
          }
        });
      }

      document.getElementById('btn-next').addEventListener('click', function(e) {
        e.preventDefault();
        state.currentScene++;
        if (state.currentScene > state.totalScenes) {
          showFinal();
        } else {
          showScene(state.currentScene);
        }
      });

      document.getElementById('btn-share').addEventListener('click', function(e) {
        e.preventDefault();
        e.stopPropagation();
        shareResult();
      });

      document.getElementById('btn-restart').addEventListener('click', function(e) {
        e.preventDefault();
        state.currentScene = 1;
        state.choices = [];
        state.counters = {};
        if (state.bgMusic) {
          try { state.bgMusic.pause(); } catch(ex) {}
          state.bgMusic = null;
        }
        stopSceneMusic();
        document.title = 'Путь Ушакова';
        showScreen('screen-start');
      });

      // Sound toggle buttons
      var soundBtns = document.querySelectorAll('.sound-toggle');
      for (var i = 0; i < soundBtns.length; i++) {
        soundBtns[i].addEventListener('click', function(e) {
          e.preventDefault();
          e.stopPropagation();
          toggleSound();
        });
      }
    });
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }

})();