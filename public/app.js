// ELEMEN NAVIGASI & CHAT
const navBtns = document.querySelectorAll('.nav-btn');
const tabSections = document.querySelectorAll('.tab-section');

const chatForm = document.getElementById('chatForm');
const userInput = document.getElementById('userInput');
const fileInput = document.getElementById('fileInput');
const chatMessages = document.getElementById('chatMessages');
const filePreviewBar = document.getElementById('filePreviewBar');
const fileNameDisplay = document.getElementById('fileNameDisplay');
const removeFileBtn = document.getElementById('removeFileBtn');

const newChatBtn = document.getElementById('newChatBtn');
const chatHistoryList = document.getElementById('chatHistoryList');

// ELEMEN FOTO PROFIL CUSTOM AURELIA
const avatarBadgeContainer = document.getElementById('avatarBadgeContainer');
const aureliaAvatarInput = document.getElementById('aureliaAvatarInput');

// ELEMEN CANVAS WHITEBOARD
const paintCanvas = document.getElementById('paintCanvas');
const ctx = paintCanvas ? paintCanvas.getContext('2d') : null;
const penColor = document.getElementById('penColor');
const clearCanvasBtn = document.getElementById('clearCanvasBtn');
const aiSummaryCard = document.getElementById('aiSummaryCard');

// ELEMEN AURELIA LIVE VOICE
const startLiveVoiceBtn = document.getElementById('startLiveVoiceBtn');
const headerLiveBtn = document.getElementById('headerLiveBtn');
const liveVoiceOverlay = document.getElementById('liveVoiceOverlay');
const closeLiveBtn = document.getElementById('closeLiveBtn');
const endCallBtn = document.getElementById('endCallBtn');
const liveStatusText = document.getElementById('liveStatusText');
const liveSubtitleBox = document.getElementById('liveSubtitleBox');

// ELEMEN HANDLER RESPONSIF SMARTPHONE / HP
const mobileMenuBtn = document.getElementById('mobileMenuBtn');
const closeSidebarBtn = document.getElementById('closeSidebarBtn');
const sidebar = document.getElementById('sidebar');
const mobileSidebarOverlay = document.getElementById('mobileSidebarOverlay');
const mobileWhiteboardToggle = document.getElementById('mobileWhiteboardToggle');
const canvasWrapper = document.getElementById('canvasWrapper');

let chats = JSON.parse(localStorage.getItem('edra_chats')) || [];
let activeChatId = localStorage.getItem('edra_active_chat_id') || null;
let selectedFile = null;
let isLiveActive = false;
let recognition = null;
let fullTranscript = '';
let speechSilenceTimer = null;

// 1. HANDLER NAVIGASI RESPONSIF LAYAR HP
if (mobileMenuBtn && sidebar && mobileSidebarOverlay) {
  mobileMenuBtn.addEventListener('click', () => {
    sidebar.classList.add('mobile-open');
    mobileSidebarOverlay.classList.add('active');
  });

  const closeMenu = () => {
    sidebar.classList.remove('mobile-open');
    mobileSidebarOverlay.classList.remove('active');
  };

  if (closeSidebarBtn) closeSidebarBtn.addEventListener('click', closeMenu);
  mobileSidebarOverlay.addEventListener('click', closeMenu);
}

if (mobileWhiteboardToggle && canvasWrapper) {
  mobileWhiteboardToggle.addEventListener('click', () => {
    canvasWrapper.classList.toggle('mobile-show');
  });
}

// 2. PENGATURAN FOTO PROFIL CUSTOM AURELIA (MANUAL UPLOAD)
const customAvatar = localStorage.getItem('edra_aurelia_avatar');
if (customAvatar) {
  updateAvatarImages(customAvatar);
}

if (avatarBadgeContainer && aureliaAvatarInput) {
  avatarBadgeContainer.addEventListener('click', () => aureliaAvatarInput.click());
  aureliaAvatarInput.addEventListener('change', (e) => {
    if (e.target.files.length > 0) {
      const reader = new FileReader();
      reader.onload = (evt) => {
        const dataUrl = evt.target.result;
        localStorage.setItem('edra_aurelia_avatar', dataUrl);
        updateAvatarImages(dataUrl);
      };
      reader.readAsDataURL(e.target.files[0]);
    }
  });
}

function updateAvatarImages(url) {
  document.querySelectorAll('.aurelia-dynamic-img, #aureliaAvatarImg').forEach(img => {
    img.src = url;
  });
}

// 3. NAVIGASI TAB MENU (CHAT, MODUL, PROFIL EDRA)
navBtns.forEach(btn => {
  btn.addEventListener('click', () => {
    const targetTab = btn.getAttribute('data-tab');
    navBtns.forEach(b => b.classList.remove('active'));
    tabSections.forEach(s => s.classList.remove('active'));
    btn.classList.add('active');
    const activeSection = document.getElementById(`${targetTab}Tab`);
    if (activeSection) activeSection.classList.add('active');

    // Tutup sidebar di HP saat tab dipilih
    if (sidebar && sidebar.classList.contains('mobile-open')) {
      sidebar.classList.remove('mobile-open');
      if (mobileSidebarOverlay) mobileSidebarOverlay.classList.remove('active');
    }
  });
});

// 4. FITUR HENTIKAN/POTONG PEMBICARAAN AI (BARGE-IN)
function stopAureliaSpeaking() {
  if ('speechSynthesis' in window) {
    window.speechSynthesis.cancel();
  }
}

function speakAurelia(text, onCompleteCallback) {
  if ('speechSynthesis' in window) {
    stopAureliaSpeaking();

    let cleanText = text.replace(/\[CANVAS:[\s\S]*?\]/g, '')
                        .replace(/!\[.*?\]\(.*?\)/g, '')
                        .replace(/[*#_`$~\\]/g, '')
                        .trim();

    const utterance = new SpeechSynthesisUtterance(cleanText);
    utterance.lang = 'id-ID';
    utterance.pitch = 1.6;
    utterance.rate = 1.1;

    utterance.onend = () => { if (onCompleteCallback) onCompleteCallback(); };
    utterance.onerror = () => { if (onCompleteCallback) onCompleteCallback(); };

    window.speechSynthesis.speak(utterance);
  } else {
    if (onCompleteCallback) onCompleteCallback();
  }
}

// 5. LOGIKA SPEECH RECOGNITION (UCAPAN PANJANG & INTERRUPT BARGE-IN)
function initLiveSpeech() {
  if (!('webkitSpeechRecognition' in window || 'SpeechRecognition' in window)) {
    alert('Browser Anda belum mendukung Speech Recognition. Gunakan Google Chrome atau Microsoft Edge.');
    return;
  }

  const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
  recognition = new SpeechRecognition();
  recognition.lang = 'id-ID';
  recognition.continuous = true;
  recognition.interimResults = true;

  recognition.onspeechstart = () => {
    stopAureliaSpeaking();
    if (isLiveActive) {
      liveStatusText.textContent = "Aurelia sedang mendengarkan suaramu... ✨";
    }
  };

  recognition.onresult = (event) => {
    if (!isLiveActive) return;

    stopAureliaSpeaking();

    let interimTranscript = '';
    let finalTranscriptChunk = '';

    for (let i = event.resultIndex; i < event.results.length; ++i) {
      if (event.results[i].isFinal) {
        finalTranscriptChunk += event.results[i][0].transcript + ' ';
      } else {
        interimTranscript += event.results[i][0].transcript;
      }
    }

    if (finalTranscriptChunk) {
      fullTranscript += finalTranscriptChunk;
    }

    const currentDisplay = (fullTranscript + ' ' + interimTranscript).trim();
    if (currentDisplay) {
      liveSubtitleBox.innerHTML = `<b>Anda:</b> "${currentDisplay}"`;
    }

    clearTimeout(speechSilenceTimer);
    speechSilenceTimer = setTimeout(() => {
      const textToSend = (fullTranscript + ' ' + interimTranscript).trim();
      if (textToSend && isLiveActive) {
        fullTranscript = '';
        processLiveVoiceInput(textToSend);
      }
    }, 1800);
  };

  recognition.onerror = () => {
    if (isLiveActive && !window.speechSynthesis.speaking) {
      setTimeout(() => { try { recognition.start(); } catch (e) {} }, 1000);
    }
  };

  recognition.onend = () => {
    if (isLiveActive && !window.speechSynthesis.speaking) {
      try { recognition.start(); } catch (e) {}
    }
  };
}

async function processLiveVoiceInput(userVoiceText) {
  try { recognition.stop(); } catch (e) {}

  liveStatusText.textContent = "Aurelia sedang memikirkan jawaban... 🤔";

  try {
    const response = await fetch('/api/chat', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ message: userVoiceText })
    });

    const data = await response.json();

    if (data.reply) {
      liveSubtitleBox.innerHTML = `<b>Aurelia:</b> "${data.reply}"`;
      liveStatusText.textContent = "Aurelia sedang berbicara... 💖 (Bisa kamu potong kapan saja!)";

      const currentChat = chats.find(c => c.id === activeChatId);
      if (currentChat) {
        currentChat.messages.push({ sender: 'user', text: userVoiceText });
        currentChat.messages.push({ sender: 'ai', text: data.reply });
        saveChatsToStorage();
        loadActiveChatMessages();
      }

      speakAurelia(data.reply, () => {
        if (isLiveActive) {
          liveStatusText.textContent = "Aurelia siap mendengarkan lagi... ✨";
          fullTranscript = '';
          try { recognition.start(); } catch (e) {}
        }
      });

    } else {
      liveSubtitleBox.innerHTML = `<i>Maaf, terjadi kendala respon.</i>`;
      if (isLiveActive) setTimeout(() => { try { recognition.start(); } catch (e) {} }, 2000);
    }
  } catch (err) {
    liveSubtitleBox.innerHTML = `<i>Gagal terhubung ke server.</i>`;
    if (isLiveActive) setTimeout(() => { try { recognition.start(); } catch (e) {} }, 2000);
  }
}

function startLiveVoiceMode() {
  stopAureliaSpeaking();
  isLiveActive = true;
  fullTranscript = '';
  liveVoiceOverlay.classList.add('active');
  liveSubtitleBox.innerHTML = `<i>"Halo Kak! Silakan bicarakan apa saja denganku..."</i>`;
  liveStatusText.textContent = "Aurelia siap mendengarkan... Bicara saja!";

  if (!recognition) initLiveSpeech();

  speakAurelia("Halo Kak! Aurelia siap mengobrol denganmu secara live!", () => {
    if (isLiveActive && recognition) {
      try { recognition.start(); } catch (e) {}
    }
  });
}

function stopLiveVoiceMode() {
  isLiveActive = false;
  liveVoiceOverlay.classList.remove('active');
  stopAureliaSpeaking();
  if (recognition) { try { recognition.stop(); } catch (e) {} }
}

if (startLiveVoiceBtn) startLiveVoiceBtn.addEventListener('click', startLiveVoiceMode);
if (headerLiveBtn) headerLiveBtn.addEventListener('click', startLiveVoiceMode);
if (closeLiveBtn) closeLiveBtn.addEventListener('click', stopLiveVoiceMode);
if (endCallBtn) endCallBtn.addEventListener('click', stopLiveVoiceMode);

// 6. MANAJEMEN RIWAYAT CHAT (LOCAL STORAGE)
function saveChatsToStorage() {
  localStorage.setItem('edra_chats', JSON.stringify(chats));
  localStorage.setItem('edra_active_chat_id', activeChatId);
}

function createNewChat() {
  stopAureliaSpeaking();
  const newId = 'chat_' + Date.now();
  const newChat = {
    id: newId,
    title: 'Obrolan Baru',
    messages: [
      {
        sender: 'ai',
        text: 'Halo Kak! ✨ Aku **Aurelia**, Asisten Belajar ciptaannya **Master Edra** yang paling jenius! 💖\n\nAda soal pelajaran, pembuatan gambar AI, atau materi yang ingin dipelajari secara mendalam? Kirimkan ke Aurelia ya!⚡'
      }
    ]
  };
  chats.unshift(newChat);
  activeChatId = newId;
  saveChatsToStorage();
  renderChatHistoryList();
  loadActiveChatMessages();
}

function renderChatHistoryList() {
  if (!chatHistoryList) return;
  chatHistoryList.innerHTML = '';

  chats.forEach(chat => {
    const item = document.createElement('div');
    item.classList.add('history-item');
    if (chat.id === activeChatId) item.classList.add('active');

    const titleSpan = document.createElement('span');
    titleSpan.style.flex = '1';
    titleSpan.style.overflow = 'hidden';
    titleSpan.style.textOverflow = 'ellipsis';
    titleSpan.textContent = chat.title;
    titleSpan.onclick = () => {
      stopAureliaSpeaking();
      activeChatId = chat.id;
      saveChatsToStorage();
      renderChatHistoryList();
      loadActiveChatMessages();
    };

    const deleteBtn = document.createElement('button');
    deleteBtn.classList.add('delete-chat-btn');
    deleteBtn.innerHTML = '<i class="fa-solid fa-trash-can"></i>';
    deleteBtn.onclick = (e) => {
      e.stopPropagation();
      stopAureliaSpeaking();
      chats = chats.filter(c => c.id !== chat.id);
      if (activeChatId === chat.id) {
        activeChatId = chats.length > 0 ? chats[0].id : null;
      }
      if (chats.length === 0) createNewChat();
      else {
        saveChatsToStorage();
        renderChatHistoryList();
        loadActiveChatMessages();
      }
    };

    item.appendChild(titleSpan);
    item.appendChild(deleteBtn);
    chatHistoryList.appendChild(item);
  });
}

function loadActiveChatMessages() {
  chatMessages.innerHTML = '';
  if (!activeChatId && chats.length === 0) {
    createNewChat();
    return;
  }

  const currentChat = chats.find(c => c.id === activeChatId);
  if (currentChat) {
    currentChat.messages.forEach(msg => {
      renderMessageBubble(msg.sender, msg.text);
    });
  }
}

if (newChatBtn) newChatBtn.addEventListener('click', createNewChat);

// 7. CHAT BUBBLE, RENDER GAMBAR AI & KATEX MATH
function renderMessageBubble(sender, text) {
  const msgDiv = document.createElement('div');
  msgDiv.classList.add('message', sender);

  const currentAvatar = localStorage.getItem('edra_aurelia_avatar') || 'https://images.unsplash.com/photo-1578632767115-351597cf2477?w=150&auto=format&fit=crop&q=80';

  if (sender === 'ai') {
    const avatarDiv = document.createElement('div');
    avatarDiv.classList.add('avatar-small');
    avatarDiv.innerHTML = `<img src="${currentAvatar}" alt="Aurelia" class="aurelia-dynamic-img" />`;
    msgDiv.appendChild(avatarDiv);
  }

  const bubbleDiv = document.createElement('div');
  bubbleDiv.classList.add('bubble');

  let cleanText = text.replace(/\[CANVAS:[\s\S]*?\]/g, '').trim();

  if (window.marked) {
    bubbleDiv.innerHTML = marked.parse(cleanText);
  } else {
    bubbleDiv.innerHTML = cleanText.replace(/\n/g, '<br>');
  }

  msgDiv.appendChild(bubbleDiv);
  chatMessages.appendChild(msgDiv);
  chatMessages.scrollTop = chatMessages.scrollHeight;

  if (window.renderMathInElement) {
    renderMathInElement(bubbleDiv, {
      delimiters: [
        {left: '$$', right: '$$', display: true},
        {left: '$', right: '$', display: false},
        {left: '\\(', right: '\\)', display: false},
        {left: '[', right: ']', display: true}
      ],
      throwOnError: false
    });
  }
}

function updateCanvas(text) {
  const canvasMatch = text.match(/\[CANVAS:([\s\S]*?)\]/);
  if (canvasMatch && canvasMatch[1] && aiSummaryCard) {
    const content = canvasMatch[1].trim();
    aiSummaryCard.innerHTML = `<b>📌 Ringkasan Visual Aurelia:</b><br>${window.marked ? marked.parse(content) : content}`;
    aiSummaryCard.style.display = 'block';

    if (window.renderMathInElement) {
      renderMathInElement(aiSummaryCard, {
        delimiters: [
          {left: '$$', right: '$$', display: true},
          {left: '$', right: '$', display: false},
          {left: '\\(', right: '\\)', display: false},
          {left: '[', right: ']', display: true}
        ],
        throwOnError: false
      });
    }
  }
}

// 8. SUBMIT CHAT TEKS
if (chatForm) {
  chatForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    stopAureliaSpeaking();

    const text = userInput.value.trim();
    if (!text && !selectedFile) return;

    let displayMsg = text;
    if (selectedFile) displayMsg += `\n[📎 File: ${selectedFile.name}]`;

    const currentChat = chats.find(c => c.id === activeChatId);
    if (currentChat) {
      if (currentChat.messages.length === 1 && text) {
        currentChat.title = text.substring(0, 22) + '...';
      }
      currentChat.messages.push({ sender: 'user', text: displayMsg });
      saveChatsToStorage();
      renderChatHistoryList();
    }

    renderMessageBubble('user', displayMsg);

    const formData = new FormData();
    if (text) formData.append('message', text);
    if (selectedFile) formData.append('file', selectedFile);

    userInput.value = '';
    selectedFile = null;
    if (fileInput) fileInput.value = '';
    if (filePreviewBar) filePreviewBar.style.display = 'none';

    const loadingDiv = document.createElement('div');
    loadingDiv.classList.add('message', 'ai');
    loadingDiv.innerHTML = `<div class="bubble"><i>Aurelia sedang memproses jawaban... ✨</i></div>`;
    chatMessages.appendChild(loadingDiv);
    chatMessages.scrollTop = chatMessages.scrollHeight;

    try {
      const response = await fetch('/api/chat', { method: 'POST', body: formData });
      const data = await response.json();
      chatMessages.removeChild(loadingDiv);

      if (data.reply) {
        renderMessageBubble('ai', data.reply);
        updateCanvas(data.reply);

        if (currentChat) {
          currentChat.messages.push({ sender: 'ai', text: data.reply });
          saveChatsToStorage();
        }
      } else {
        renderMessageBubble('ai', 'Maaf Kak, terjadi kendala saat merespons.');
      }
    } catch (err) {
      if (chatMessages.contains(loadingDiv)) chatMessages.removeChild(loadingDiv);
      renderMessageBubble('ai', 'Gagal terhubung ke Aurelia AI.');
    }
  });
}

// 9. DRAWING CANVAS WHITEBOARD
if (paintCanvas) {
  function resizeCanvas() {
    paintCanvas.width = paintCanvas.parentElement.clientWidth;
    paintCanvas.height = paintCanvas.parentElement.clientHeight;
  }
  window.addEventListener('resize', resizeCanvas);
  setTimeout(resizeCanvas, 100);

  let drawing = false;

  paintCanvas.addEventListener('mousedown', (e) => { drawing = true; draw(e); });
  paintCanvas.addEventListener('mouseup', () => { drawing = false; ctx.beginPath(); });
  paintCanvas.addEventListener('mousemove', draw);

  paintCanvas.addEventListener('touchstart', (e) => { drawing = true; draw(e.touches[0]); });
  paintCanvas.addEventListener('touchend', () => { drawing = false; ctx.beginPath(); });
  paintCanvas.addEventListener('touchmove', (e) => { draw(e.touches[0]); });

  function draw(e) {
    if (!drawing) return;
    const rect = paintCanvas.getBoundingClientRect();
    ctx.lineWidth = 3;
    ctx.lineCap = 'round';
    ctx.strokeStyle = penColor ? penColor.value : '#f59e0b';

    ctx.lineTo(e.clientX - rect.left, e.clientY - rect.top);
    ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(e.clientX - rect.left, e.clientY - rect.top);
  }

  if (clearCanvasBtn) {
    clearCanvasBtn.addEventListener('click', () => {
      ctx.clearRect(0, 0, paintCanvas.width, paintCanvas.height);
      if (aiSummaryCard) aiSummaryCard.style.display = 'none';
    });
  }
}

// FILE PREVIEW
if (fileInput) {
  fileInput.addEventListener('change', (e) => {
    if (e.target.files.length > 0) {
      selectedFile = e.target.files[0];
      fileNameDisplay.innerHTML = `<i class="fa-solid fa-file"></i> ${selectedFile.name}`;
      filePreviewBar.style.display = 'flex';
    }
  });
}

if (removeFileBtn) {
  removeFileBtn.addEventListener('click', () => {
    selectedFile = null;
    fileInput.value = '';
    filePreviewBar.style.display = 'none';
  });
}

// INISIALISASI AWAL
if (chats.length === 0) {
  createNewChat();
} else {
  if (!activeChatId) activeChatId = chats[0].id;
  renderChatHistoryList();
  loadActiveChatMessages();
}

window.askModul = function(materi) {
  stopAureliaSpeaking();
  const chatTabBtn = document.querySelector('[data-tab="chat"]');
  if (chatTabBtn) chatTabBtn.click();
  userInput.value = `Aurelia, tolong jelaskan modul ini secara mendalam: ${materi}`;
  chatForm.dispatchEvent(new Event('submit'));
};
