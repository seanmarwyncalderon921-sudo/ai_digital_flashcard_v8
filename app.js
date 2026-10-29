// --- HARDCODED DEVELOPER CONFIGURATION FOR GRADE SECTIONS AND STRANDS ---
const grade11Sections = ["Excellence", "Resilience", "Discipline", "Accountability", "Stewardship"];
const grade12Strands = ["STEM", "ABM", "HUMSS", "TVL-ICT", "TVL-HE"];

function getElement(id) {
  return document.getElementById(id);
}

let cards = [];
let i = 0;
let typingTimeout = null;
let choiceFlipTimeout = null;
let selectedImages = [];

let selectedGrade = "Grade 11";
let selectedStrand = grade11Sections[0];
let selectedSubjectMode = "general";
let editingIndex = null;

// --- SCORE COUNTER & ANSWER TRACKING STATE ---
let answeredState = {}; 

function resetQuizScore() {
  answeredState = {};
  updateScoreUI();
}

function getCorrectCount() {
  return Object.values(answeredState).filter(st => st.isCorrect).length;
}

function updateScoreUI() {
  const liveScorePill = getElement("live-score-pill");
  if (liveScorePill) {
    liveScorePill.textContent = `Score: ${getCorrectCount()} / ${cards.length}`;
  }
}

// --- CONFETTI & WRONG FEEDBACK EFFECTS ---
function triggerConfetti() {
  if (typeof confetti === "function") {
    confetti({
      particleCount: 75,
      spread: 70,
      origin: { y: 0.6 },
      colors: ['#7a1c1c', '#d4af37', '#ffffff', '#e5b842']
    });
  }
}

function triggerWrongXEffect(parentContainer) {
  if (!parentContainer) parentContainer = getElement("card");
  
  const existingX = parentContainer.querySelector(".wrong-x-overlay");
  if (existingX) existingX.remove();

  const xBadge = document.createElement("div");
  xBadge.className = "wrong-x-overlay";
  xBadge.textContent = "❌";
  parentContainer.appendChild(xBadge);

  setTimeout(() => {
    xBadge.remove();
  }, 750);
}

// --- SUMMARY END-OF-DECK SCREEN ---
function showDeckSummary() {
  stopSpeech(true);
  getElement("card").classList.add("hidden");
  getElement("typed-answer-entry").classList.add("hidden");
  getElement("hint-text").classList.add("hidden");
  getElement("study-controls").classList.add("hidden");

  const quizSummary = getElement("quiz-summary");
  const summaryPercentage = getElement("summary-percentage");
  const summaryScoreText = getElement("summary-score-text");
  const summaryMessage = getElement("summary-message");

  const totalCards = cards.length;
  const correctCount = getCorrectCount();
  const percentage = totalCards > 0 ? Math.round((correctCount / totalCards) * 100) : 0;

  summaryPercentage.textContent = `${percentage}%`;
  summaryScoreText.textContent = `${correctCount} of ${totalCards} Correct`;

  if (percentage >= 90) {
    summaryMessage.textContent = "🌟 Outstanding! You have thoroughly mastered this study material!";
    triggerConfetti();
  } else if (percentage >= 75) {
    summaryMessage.textContent = "👏 Great job! You have a solid grasp of most concepts.";
  } else if (percentage >= 50) {
    summaryMessage.textContent = "👍 Good effort! Review the missed cards again to build full recall.";
  } else {
    summaryMessage.textContent = "💪 Keep practicing! Go over the lesson notes and try the deck again.";
  }

  quizSummary.classList.remove("hidden");
}

const restartDeckBtn = getElement("restart-deck-btn");
if (restartDeckBtn) {
  restartDeckBtn.addEventListener("click", () => {
    getElement("quiz-summary").classList.add("hidden");
    getElement("card").classList.remove("hidden");
    getElement("hint-text").classList.remove("hidden");
    getElement("study-controls").classList.remove("hidden");
    resetQuizScore();
    i = 0;
    show(true);
  });
}

// --- Browser Speech API TTS & Auto-Narration System ---
let selectedVoiceURI = localStorage.getItem("sapc_selected_voice") || "";
let currentSpeakingBtn = null;
let currentUtterance = null;
let isPaused = false;
let isAutoNarrating = false;
let autoNarrateTimeout = null;

function populateVoiceList() {
  if (!('speechSynthesis' in window)) return;
  const voiceSelect = getElement("voice-select");
  if (!voiceSelect) return;

  const voices = window.speechSynthesis.getVoices();
  voiceSelect.replaceChildren();

  const defaultOpt = document.createElement("option");
  defaultOpt.value = "";
  defaultOpt.textContent = "Auto / System Default";
  voiceSelect.append(defaultOpt);

  voices.forEach(voice => {
    const option = document.createElement("option");
    option.value = voice.voiceURI;
    option.textContent = `${voice.name} (${voice.lang})`;
    if (voice.voiceURI === selectedVoiceURI) {
      option.selected = true;
    }
    voiceSelect.append(option);
  });
}

if ('speechSynthesis' in window) {
  window.speechSynthesis.onvoiceschanged = populateVoiceList;
  populateVoiceList();
}

function resetSpeakingState() {
  if (currentSpeakingBtn) {
    currentSpeakingBtn.classList.remove("active");
    currentSpeakingBtn.innerHTML = "🔊";
    currentSpeakingBtn.setAttribute("title", "Listen to narration");
    currentSpeakingBtn = null;
  }
  isPaused = false;
  currentUtterance = null;
}

function stopSpeech(clearAuto = true) {
  if (autoNarrateTimeout) {
    clearTimeout(autoNarrateTimeout);
    autoNarrateTimeout = null;
  }
  if (clearAuto) {
    isAutoNarrating = false;
  }
  if ('speechSynthesis' in window) {
    if (window.speechSynthesis.paused) {
      window.speechSynthesis.resume();
    }
    window.speechSynthesis.cancel();
  }
  resetSpeakingState();
}

function handleAutoNarrateNext() {
  if (!isAutoNarrating || cards.length === 0) return;

  const isFlipped = getElement("card").classList.contains("flipped");

  if (!isFlipped) {
    autoNarrateTimeout = setTimeout(() => {
      if (!isAutoNarrating) return;
      getElement("card").classList.add("flipped");

      autoNarrateTimeout = setTimeout(() => {
        if (!isAutoNarrating) return;
        let fullAnswer = cards[i].answer;
        if (cards[i].explanation) {
          fullAnswer += ". Explanation: " + cards[i].explanation;
        }
        const backPlayBtn = getElement("back").querySelector(".play-pause-btn");
        speakText(fullAnswer, backPlayBtn);
      }, 600);
    }, 1200);
  } else {
    autoNarrateTimeout = setTimeout(() => {
      if (!isAutoNarrating) return;
      if (i >= cards.length - 1) {
        showDeckSummary();
        return;
      }
      i++;
      show(false);

      autoNarrateTimeout = setTimeout(() => {
        if (!isAutoNarrating) return;
        const frontPlayBtn = getElement("front").querySelector(".play-pause-btn");
        if (frontPlayBtn) {
          speakText(cleanQuestionDisplay(cards[i].question), frontPlayBtn);
        }
      }, 600);
    }, 1500);
  }
}

function speakText(text, btnElement) {
  stopSpeech(false);
  if (!text) return;

  setTimeout(() => {
    const utterance = new SpeechSynthesisUtterance(text);
    utterance.rate = 0.95;

    const voices = window.speechSynthesis.getVoices();
    if (selectedVoiceURI) {
      const matchedVoice = voices.find(v => v.voiceURI === selectedVoiceURI);
      if (matchedVoice) utterance.voice = matchedVoice;
    } else {
      utterance.lang = 'en-US';
    }

    currentSpeakingBtn = btnElement;
    currentUtterance = utterance;
    isPaused = false;

    if (btnElement) {
      btnElement.classList.add("active");
      btnElement.innerHTML = "⏸️";
      btnElement.setAttribute("title", "Stop narration");
    }

    utterance.onend = () => {
      if (currentUtterance === utterance) {
        resetSpeakingState();
      }
    };

    utterance.onerror = () => {
      if (currentUtterance === utterance) {
        resetSpeakingState();
      }
    };

    window.speechSynthesis.speak(utterance);
  }, 50);
}

function toggleSpeech(text, btnElement) {
  if (!('speechSynthesis' in window)) {
    alert("Text-to-speech is not supported in this browser.");
    return;
  }

  if (window.speechSynthesis.speaking || isPaused) {
    stopSpeech(true);
    return;
  }

  speakText(text, btnElement);
}

function createAudioControlsGroup(getTextToSpeak) {
  const container = document.createElement("div");
  container.className = "card-audio-controls";

  const rewindBtn = document.createElement("button");
  rewindBtn.type = "button";
  rewindBtn.className = "narrate-btn rewind-btn";
  rewindBtn.title = "Rewind to beginning";
  rewindBtn.setAttribute("aria-label", "Rewind narration to beginning");
  rewindBtn.innerHTML = "⏪";
  rewindBtn.addEventListener("click", (e) => {
    e.stopPropagation();
    stopSpeech(false);
    const playBtn = container.querySelector(".play-pause-btn");
    setTimeout(() => {
      speakText(getTextToSpeak(), playBtn);
    }, 60);
  });

  const playPauseBtn = document.createElement("button");
  playPauseBtn.type = "button";
  playPauseBtn.className = "narrate-btn play-pause-btn";
  playPauseBtn.title = "Listen to narration";
  playPauseBtn.setAttribute("aria-label", "Listen to narration");
  playPauseBtn.innerHTML = "🔊";
  playPauseBtn.addEventListener("click", (e) => {
    e.stopPropagation();
    toggleSpeech(getTextToSpeak(), playPauseBtn);
  });

  container.append(rewindBtn, playPauseBtn);
  return container;
}

const voiceSelectElem = getElement("voice-select");
if (voiceSelectElem) {
  voiceSelectElem.addEventListener("change", (e) => {
    selectedVoiceURI = e.target.value;
    localStorage.setItem("sapc_selected_voice", selectedVoiceURI);
  });
}

// --- Persistence Helpers ---
function saveCardsToStorage() {
  localStorage.setItem("sapc_flashcards", JSON.stringify(cards));
}

function loadCardsFromStorage() {
  const saved = localStorage.getItem("sapc_flashcards");
  if (saved) {
    try {
      const parsed = JSON.parse(saved);
      if (Array.isArray(parsed) && parsed.length > 0) {
        cards = parsed;
        i = 0;
        resetQuizScore();
        getElement("study").classList.remove("hidden");
        show();
      }
    } catch (e) {
      console.error("Failed to load saved cards", e);
    }
  }
}

// --- Landing Page Handler ---
const landingView = getElement("landing-view");
const appView = getElement("app-view");
const studyPanel = getElement("study");
const fullscreenToggle = getElement("fullscreen-toggle");

function showAppWorkspace() {
  if (landingView) landingView.classList.add("hidden");
  if (appView) appView.classList.remove("hidden");
  window.scrollTo({ top: 0, behavior: "smooth" });
}

function showLandingPage() {
  if (appView) appView.classList.add("hidden");
  if (landingView) landingView.classList.remove("hidden");
  window.scrollTo({ top: 0, behavior: "smooth" });
}

if (getElement("hero-start-btn")) getElement("hero-start-btn").addEventListener("click", showAppWorkspace);
if (getElement("nav-launch-btn")) getElement("nav-launch-btn").addEventListener("click", showAppWorkspace);
if (getElement("nav-brand-btn")) getElement("nav-brand-btn").addEventListener("click", showLandingPage);

function syncFullscreenToggle() {
  const isFullscreen = document.fullscreenElement === studyPanel || studyPanel.classList.contains("study-fullscreen");
  fullscreenToggle.textContent = isFullscreen ? "Exit fullscreen" : "Fullscreen";
  fullscreenToggle.setAttribute("aria-pressed", String(isFullscreen));
}

if (fullscreenToggle) {
  fullscreenToggle.addEventListener("click", async () => {
    if (document.fullscreenElement === studyPanel) {
      await document.exitFullscreen();
    } else if (studyPanel.classList.contains("study-fullscreen")) {
      studyPanel.classList.remove("study-fullscreen");
    } else if (document.fullscreenEnabled && studyPanel.requestFullscreen) {
      try {
        await studyPanel.requestFullscreen();
      } catch {
        studyPanel.classList.add("study-fullscreen");
      }
    } else {
      studyPanel.classList.add("study-fullscreen");
    }
    syncFullscreenToggle();
  });
}

document.addEventListener("fullscreenchange", syncFullscreenToggle);
document.addEventListener("keydown", event => {
  if (event.key === "Escape" && studyPanel.classList.contains("study-fullscreen")) {
    studyPanel.classList.remove("study-fullscreen");
    syncFullscreenToggle();
  }
});

// --- Theme Toggle ---
const themeToggle = getElement("theme-toggle");
if (themeToggle) {
  themeToggle.addEventListener("click", () => {
    document.body.classList.toggle("dark-theme");
    const isDark = document.body.classList.contains("dark-theme");
    const themeLabel = getElement("theme-label");
    if (themeLabel) themeLabel.textContent = isDark ? "Light" : "Dark";
  });
}

// --- Authentication & User Session Management ---
let isRegisterMode = false;
const authScreen = getElement("auth-screen");
const authForm = getElement("auth-form");
const authTitle = getElement("auth-title");
const authSubmitBtn = getElement("auth-submit-btn");
const authSwitchBtn = getElement("auth-switch-btn");
const authError = getElement("auth-error");
const authPassword = getElement("auth-password");
const togglePasswordBtn = getElement("toggle-password-btn");
const authPasswordHint = getElement("auth-password-hint");

if (togglePasswordBtn && authPassword) {
  togglePasswordBtn.addEventListener("click", () => {
    const isPassword = authPassword.type === "password";
    authPassword.type = isPassword ? "text" : "password";
    togglePasswordBtn.textContent = isPassword ? "🙈" : "👁️";
    togglePasswordBtn.setAttribute("title", isPassword ? "Hide password" : "Show password");
  });
}

function validatePasswordComplexity(password) {
  const hasMinLength = password.length >= 8;
  const hasUpper = /[A-Z]/.test(password);
  const hasLower = /[a-z]/.test(password);
  const hasNumber = /[0-9]/.test(password);
  const hasSpecial = /[^A-Za-z0-9]/.test(password);

  return hasMinLength && hasUpper && hasLower && hasNumber && hasSpecial;
}

function updateProfileUI(username, picture) {
  const userProfile = getElement("user-profile");
  const userNameDisplay = getElement("user-name-display");
  const userAvatar = getElement("user-avatar");
  const userAvatarImg = getElement("user-avatar-img");

  if (!userProfile) return;

  if (username) {
    if (userNameDisplay) userNameDisplay.textContent = username;

    if (picture && userAvatarImg) {
      userAvatarImg.src = picture;
      userAvatarImg.classList.remove("hidden");
      if (userAvatar) userAvatar.classList.add("hidden");
    } else if (userAvatar) {
      if (userAvatarImg) userAvatarImg.classList.add("hidden");
      userAvatar.textContent = username.charAt(0).toUpperCase();
      userAvatar.classList.remove("hidden");
    }

    userProfile.classList.remove("hidden");
  } else {
    userProfile.classList.add("hidden");
  }
}

function checkAuthSession() {
  const savedToken = localStorage.getItem("sapc_auth_token");
  const savedUsername = localStorage.getItem("sapc_username");
  const savedPicture = localStorage.getItem("sapc_user_picture");

  if (savedToken) {
    if (authScreen) authScreen.classList.add("hidden");
    document.body.classList.remove("auth-active");
    updateProfileUI(savedUsername || "Paduan", savedPicture);
  } else {
    if (authScreen) authScreen.classList.remove("hidden");
    document.body.classList.add("auth-active");
    updateProfileUI(null, null);
  }
}

checkAuthSession();

const logoutBtn = getElement("logout-btn");
if (logoutBtn) {
  logoutBtn.addEventListener("click", () => {
    localStorage.removeItem("sapc_auth_token");
    localStorage.removeItem("sapc_username");
    localStorage.removeItem("sapc_user_picture");
    checkAuthSession();
    showLandingPage();
  });
}

if (authSwitchBtn) {
  authSwitchBtn.addEventListener("click", () => {
    isRegisterMode = !isRegisterMode;
    authTitle.textContent = isRegisterMode ? "Create Account" : "Welcome Paduan";
    authSubmitBtn.textContent = isRegisterMode ? "Sign Up" : "Log In";
    authSwitchBtn.textContent = isRegisterMode ? "Switch to Login" : "Register";
    authError.classList.add("hidden");

    authPassword.setAttribute("autocomplete", isRegisterMode ? "new-password" : "current-password");
    if (authPasswordHint) {
      authPasswordHint.classList.toggle("hidden", !isRegisterMode);
    }
  });
}

if (authForm) {
  authForm.addEventListener("submit", async (e) => {
    e.preventDefault();
    authError.classList.add("hidden");

    const username = getElement("auth-username").value.trim();
    const password = authPassword.value;

    if (isRegisterMode && !validatePasswordComplexity(password)) {
      authError.textContent = "Password must be at least 8 characters long and contain at least 1 uppercase letter, 1 lowercase letter, 1 number, and 1 special character.";
      authError.classList.remove("hidden");
      return;
    }

    const endpoint = isRegisterMode ? "/api/auth/register" : "/api/auth/login";

    try {
      const res = await fetch(endpoint, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ username, password })
      });

      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Authentication failed");

      if (isRegisterMode) {
        alert("Registration successful! You can now log in.");
        isRegisterMode = false;
        authTitle.textContent = "Welcome Paduan";
        authSubmitBtn.textContent = "Log In";
        authSwitchBtn.textContent = "Register";
        authPassword.setAttribute("autocomplete", "current-password");
        if (authPasswordHint) authPasswordHint.classList.add("hidden");
      } else {
        localStorage.setItem("sapc_auth_token", data.token);
        localStorage.setItem("sapc_username", data.username);
        localStorage.removeItem("sapc_user_picture");
        checkAuthSession();
        showAppWorkspace();
      }
    } catch (err) {
      authError.textContent = err.message;
      authError.classList.remove("hidden");
    }
  });
}

// Client-side Google Callback Handler
async function handleGoogleSignIn(response) {
  try {
    const res = await fetch('/api/auth/google', {
      method: 'POST',
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ credential: response.credential })
    });

    const data = await res.json();
    if (!res.ok) throw new Error(data.error || "Google login failed");

    localStorage.setItem("sapc_auth_token", data.token);
    localStorage.setItem("sapc_username", data.username);
    if (data.picture) {
      localStorage.setItem("sapc_user_picture", data.picture);
    } else {
      localStorage.removeItem("sapc_user_picture");
    }

    if (authScreen) authScreen.classList.add("hidden");
    document.body.classList.remove("auth-active");
    updateProfileUI(data.username, data.picture);
    showAppWorkspace();
  } catch (err) {
    alert("Google Login Error: " + err.message);
  }
}

window.handleGoogleSignIn = handleGoogleSignIn;

// --- Subject API Mode Switcher ---
document.querySelectorAll("#subject-mode-container .subject-btn").forEach(btn => {
  btn.addEventListener("click", () => {
    document.querySelectorAll("#subject-mode-container .subject-btn").forEach(b => {
      b.classList.remove("active");
    });
    btn.classList.add("active");
    selectedSubjectMode = btn.getAttribute("data-subject");
    stopSpeech(true);
    updateSelectionSummary();
    if (cards.length > 0) show(true);
  });
});

// --- Dynamic Strand / Section Renderer ---
function renderStrandSectionOptions() {
  const container = getElement("strand-container");
  const header = getElement("strand-section-header");
  const sub = getElement("strand-section-sub");

  if (!container) return;
  container.replaceChildren();

  const isGrade11 = selectedGrade === "Grade 11";
  const items = isGrade11 ? grade11Sections : grade12Strands;

  header.textContent = isGrade11 ? "Grade 11 Section" : "Academic Strand";
  sub.textContent = isGrade11 ? "Select class section focus:" : "Target testing focus for reviewer:";

  if (!items.includes(selectedStrand)) {
    selectedStrand = items[0];
  }

  items.forEach(itemText => {
    const btn = document.createElement("button");
    btn.type = "button";
    btn.className = `selector-badge ${itemText === selectedStrand ? "active" : ""}`;
    btn.setAttribute("aria-pressed", itemText === selectedStrand ? "true" : "false");
    btn.setAttribute("data-value", itemText);

    const textSpan = document.createElement("span");
    textSpan.textContent = itemText;
    btn.append(textSpan);

    btn.addEventListener("click", () => {
      container.querySelectorAll(".selector-badge").forEach(b => {
        b.classList.remove("active");
        b.setAttribute("aria-pressed", "false");
      });
      btn.classList.add("active");
      btn.setAttribute("aria-pressed", "true");
      selectedStrand = itemText;
      updateSelectionSummary();
    });

    container.append(btn);
  });

  updateSelectionSummary();
}

function updateSelectionSummary() {
  const subjectDisplayNames = {
    general: "General",
    math: "Mathematics",
    filipino: "Filipino"
  };
  getElement("selection-summary").textContent = `Generating for ${selectedGrade} / ${selectedStrand} (${subjectDisplayNames[selectedSubjectMode]})`;
}

document.querySelectorAll("#grade-container .selector-badge").forEach(badge => {
  badge.addEventListener("click", () => {
    document.querySelectorAll("#grade-container .selector-badge").forEach(b => {
      b.classList.remove("active");
      b.setAttribute("aria-pressed", "false");
    });
    badge.classList.add("active");
    badge.setAttribute("aria-pressed", "true");
    selectedGrade = badge.getAttribute("data-value");
    renderStrandSectionOptions();
  });
});

renderStrandSectionOptions();

// --- Document Processing & File Previews ---
const imageInput = getElement("image");
const uploadDropZone = getElement("upload-drop-zone");
const imagePreviewUrls = new Map();

function isImageFile(file) {
  return file.type.startsWith("image/") || /\.(jpg|jpeg|png|gif|webp|heic|heif|avif|svg)$/i.test(file.name);
}

function renderImagePreviews() {
  const previewContainer = getElement("image-previews");
  imagePreviewUrls.forEach((url, file) => {
    if (!selectedImages.includes(file)) {
      URL.revokeObjectURL(url);
      imagePreviewUrls.delete(file);
    }
  });
  previewContainer.replaceChildren();
  previewContainer.classList.toggle("hidden", selectedImages.length === 0);

  selectedImages.forEach((file, index) => {
    const preview = document.createElement("div");
    preview.className = "image-preview";

    if (isImageFile(file)) {
      const image = document.createElement("img");
      if (!imagePreviewUrls.has(file)) {
        imagePreviewUrls.set(file, URL.createObjectURL(file));
      }
      image.src = imagePreviewUrls.get(file);
      image.alt = file.name || `Selected image ${index + 1}`;
      preview.append(image);
    } else {
      const docBadge = document.createElement("div");
      docBadge.style.cssText = "display:grid;place-items:center;aspect-ratio:4/3;background:var(--cream);border-radius:4px;font-weight:800;color:var(--primary);font-size:1.1rem;";
      const ext = (file.name.split(".").pop() || "DOC").toUpperCase();
      docBadge.textContent = `📄 ${ext}`;
      preview.append(docBadge);
    }

    const name = document.createElement("span");
    name.className = "image-preview-name";
    name.textContent = file.name || `File ${index + 1}`;

    const removeButton = document.createElement("button");
    removeButton.type = "button";
    removeButton.className = "remove-image-btn";
    removeButton.textContent = "Remove";
    removeButton.addEventListener("click", () => {
      selectedImages = selectedImages.filter((_, fileIndex) => fileIndex !== index);
      setSelectedImages(selectedImages);
    });

    preview.append(name, removeButton);
    previewContainer.append(preview);
  });
}

function setSelectedImages(files) {
  selectedImages = Array.from(files);
  const fileStatus = getElement("file-name");

  if (selectedImages.length === 1) {
    fileStatus.textContent = selectedImages[0].name || "1 file selected";
  } else if (selectedImages.length > 1) {
    fileStatus.textContent = `${selectedImages.length} files selected`;
  } else {
    fileStatus.textContent = "No files selected";
  }

  renderImagePreviews();
}

if (imageInput) {
  imageInput.addEventListener("change", () => {
    setSelectedImages(imageInput.files);
    imageInput.value = "";
  });
}

if (getElement("notes")) {
  getElement("notes").addEventListener("paste", (event) => {
    const pastedFiles = Array.from(event.clipboardData?.items || [])
      .filter(item => item.kind === "file")
      .map(item => item.getAsFile())
      .filter(Boolean);

    if (pastedFiles.length === 0) return;

    event.preventDefault();
    setSelectedImages([...selectedImages, ...pastedFiles]);
  });
}

if (uploadDropZone) {
  uploadDropZone.addEventListener("keydown", (event) => {
    if (event.key === "Enter" || event.key === " ") {
      event.preventDefault();
      imageInput.click();
    }
  });

  uploadDropZone.addEventListener("dragover", (event) => {
    event.preventDefault();
    uploadDropZone.classList.add("drag-over");
  });

  uploadDropZone.addEventListener("dragleave", (event) => {
    if (!uploadDropZone.contains(event.relatedTarget)) {
      uploadDropZone.classList.remove("drag-over");
    }
  });

  uploadDropZone.addEventListener("drop", (event) => {
    event.preventDefault();
    uploadDropZone.classList.remove("drag-over");
    setSelectedImages(event.dataTransfer.files);
  });
}

function fileToBase64(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.readAsDataURL(file);
    reader.onload = () => resolve(reader.result.split(',')[1]);
    reader.onerror = (error) => reject(error);
  });
}

async function extractTextFromDocument(file) {
  const ext = (file.name.split(".").pop() || "").toLowerCase();

  if (ext === "txt" || file.type === "text/plain") {
    return await file.text();
  }

  if (ext === "pdf" || file.type === "application/pdf") {
    if (!window.pdfjsLib) throw new Error("PDF library not loaded.");
    window.pdfjsLib.GlobalWorkerOptions.workerSrc =
      "https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js";

    const arrayBuffer = await file.arrayBuffer();
    const pdf = await window.pdfjsLib.getDocument({ data: arrayBuffer }).promise;
    let extracted = "";

    for (let pageNum = 1; pageNum <= pdf.numPages; pageNum++) {
      const page = await pdf.getPage(pageNum);
      const content = await page.getTextContent();
      const pageText = content.items.map(item => item.str).join(" ");
      extracted += `\n--- Page ${pageNum} ---\n${pageText}`;
    }
    return extracted.trim();
  }

  if (ext === "pptx" || file.name.endsWith(".pptx")) {
    if (!window.JSZip) throw new Error("JSZip library not loaded for PPTX.");
    const arrayBuffer = await file.arrayBuffer();
    const zip = await window.JSZip.loadAsync(arrayBuffer);
    const slideFiles = Object.keys(zip.files)
      .filter(name => /^ppt\/slides\/slide\d+\.xml$/i.test(name))
      .sort((a, b) => {
        const numA = parseInt(a.match(/slide(\d+)\.xml/i)[1], 10);
        const numB = parseInt(b.match(/slide(\d+)\.xml/i)[1], 10);
        return numA - numB;
      });

    let extracted = "";
    const parser = new DOMParser();

    for (const slidePath of slideFiles) {
      const xmlText = await zip.files[slidePath].async("string");
      const xmlDoc = parser.parseFromString(xmlText, "application/xml");
      const textNodes = Array.from(xmlDoc.getElementsByTagName("a:t"));
      const slideText = textNodes.map(node => node.textContent).join(" ");
      if (slideText.trim()) {
        extracted += `\n--- Slide ---\n${slideText.trim()}`;
      }
    }
    return extracted.trim();
  }

  return "";
}

function typeWriter(element, text, speed = 15) {
  element.textContent = "";
  let index = 0;
  if (typingTimeout) clearTimeout(typingTimeout);

  function type() {
    if (index < text.length) {
      element.textContent += text.charAt(index);
      index++;
      typingTimeout = setTimeout(type, speed);
    }
  }
  type();
}

function cleanQuestionDisplay(text) {
  if (!text) return "";
  return text
    .replace(/(\b\d+[.)]\s*)+$/g, '')
    .replace(/\(\s*(prompt|hint|note|instruction)\s*:.*?\)/gi, '')
    .replace(/^(\s*(true\s*(or|\/)?\s*false|tama\s*(o|\/)?\s*mali|t\s*\/\s*f)\s*[:.-]?\s*)+/gi, '')
    .replace(/[\s(--]*\b(true\s*(or|\/)?\s*false|tama\s*(o|\/)?\s*mali|t\s*\/\s*f)\b[\s)]*$/gi, '')
    .replace(/\s+/g, ' ')
    .trim();
}

function normalizeString(str) {
  if (!str) return "";
  return str.toString()
    .toLowerCase()
    .replace(/^(answer|correct answer|term|definition|key|a)\s*[:.-]\s*/gi, "")
    .replace(/^\s*\d+[\s.)-]+\s*/, "")
    .replace(/[.,;:!?()"'`]+/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

function checkIdentificationMatch(userTyped, expectedAnswer) {
  const u = normalizeString(userTyped);
  const e = normalizeString(expectedAnswer);

  if (!u || !e) return false;
  if (u === e) return true;
  if (e.includes(u) && u.length >= 2) return true;
  if (u.includes(e) && e.length >= 2) return true;

  return false;
}

function getEnumerationItems(value) {
  return value.split(/\r?\n|[,;]+/)
    .map(item => item.replace(/^\s*\d+[.)]\s*/, "").trim())
    .filter(Boolean)
    .map(normalizeString);
}

// Visual Answer Feedback with Delay
function attachChoiceFeedback(choiceButtons) {
  choiceButtons.forEach(option => {
    option.addEventListener("click", event => {
      event.stopPropagation();
      if (choiceButtons.some(choice => choice.disabled)) return;

      choiceButtons.forEach(choice => { choice.disabled = true; });
      const isCorrect = option.dataset.correct === "true";

      if (!answeredState[i]) {
        answeredState[i] = { isCorrect };
        updateScoreUI();
      }

      const cardElem = getElement("card");

      if (isCorrect) {
        option.classList.add("correct");
        cardElem.style.border = "2px solid #2f7544";
        triggerConfetti();

        choiceFlipTimeout = setTimeout(() => {
          stopSpeech(true);
          cardElem.classList.add("flipped");
          cardElem.style.border = "";
          choiceFlipTimeout = null;
        }, 1200);
        return;
      }

      option.classList.add("incorrect");
      cardElem.style.border = "2px solid #a33434";
      triggerWrongXEffect(cardElem);

      const correctChoice = choiceButtons.find(choice => choice.dataset.correct === "true");
      if (correctChoice) correctChoice.classList.add("correct");
      getElement("back").classList.add("revealed-correct");
      
      choiceFlipTimeout = setTimeout(() => {
        stopSpeech(true);
        cardElem.classList.add("flipped");
        cardElem.style.border = "";
        choiceFlipTimeout = null;
      }, 1500);
    });
  });
}

// --- FLASHCARD GENERATOR WITH PROGRESS BAR ---
if (getElement("generate")) {
  getElement("generate").addEventListener("click", async () => {
    const notes = getElement("notes").value;
    const count = getElement("count").value;
    const difficulty = getElement("difficulty").value;

    const loadingContainer = getElement("generation-loading-container");
    const progressBar = getElement("generation-progress-bar");
    const loadingText = getElement("loading-text");
    const statusElem = getElement("status");

    if (!notes.trim() && selectedImages.length === 0) {
      statusElem.textContent = "Please provide study notes or attach at least one file.";
      return;
    }

    statusElem.textContent = "";
    loadingContainer.classList.remove("hidden");
    progressBar.style.width = "10%";
    loadingText.textContent = `Analyzing ${selectedSubjectMode.toUpperCase()} material & generating cards...`;
    getElement("generate").disabled = true;

    let progress = 10;
    const progressInterval = setInterval(() => {
      if (progress < 88) {
        progress += Math.floor(Math.random() * 6) + 2;
        progressBar.style.width = progress + "%";
      }
    }, 280);

    try {
      const imageFiles = selectedImages.filter(isImageFile);
      const docFiles = selectedImages.filter(f => !isImageFile(f));

      let extractedDocsText = "";
      for (const docFile of docFiles) {
        loadingText.textContent = `Reading ${docFile.name}...`;
        const docText = await extractTextFromDocument(docFile);
        if (docText) {
          extractedDocsText += `\n\n[Content from ${docFile.name}]:\n${docText}`;
        }
      }

      const combinedNotes = (notes + "\n" + extractedDocsText).trim();

      const images = await Promise.all(imageFiles.map(async file => ({
        data: await fileToBase64(file),
        mimeType: file.type || "image/jpeg",
        name: file.name
      })));

      const token = localStorage.getItem("sapc_auth_token");
      const headers = { "Content-Type": "application/json" };
      if (token) headers["Authorization"] = `Bearer ${token}`;

      const res = await fetch("/api/flashcards", {
        method: "POST",
        headers,
        body: JSON.stringify({ 
          notes: combinedNotes, 
          count: Number(count),
          images,
          gradeLevel: selectedGrade,
          academicStrand: selectedStrand,
          difficulty,
          subjectMode: selectedSubjectMode
        }),
      });

      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Failed to generate cards.");

      clearInterval(progressInterval);
      progressBar.style.width = "100%";
      loadingText.textContent = "Flashcards generated successfully!";

      cards = data.cards;
      i = 0;
      resetQuizScore();
      saveCardsToStorage();
      getElement("study").classList.remove("hidden");

      setTimeout(() => {
        loadingContainer.classList.add("hidden");
        progressBar.style.width = "0%";
        statusElem.textContent = cards.length < Number(count)
          ? `Done! ${cards.length} unique cards ready.`
          : `Done! ${cards.length} cards ready.`;
      }, 700);

      show(true);
    } catch (err) {
      clearInterval(progressInterval);
      loadingContainer.classList.add("hidden");
      progressBar.style.width = "0%";
      statusElem.textContent = "Error: " + err.message;
    } finally {
      getElement("generate").disabled = false;
    }
  });
}

function show(stopAuto = true) {
  stopSpeech(stopAuto);
  if (typingTimeout) {
    clearTimeout(typingTimeout);
    typingTimeout = null;
  }
  if (choiceFlipTimeout) {
    clearTimeout(choiceFlipTimeout);
    choiceFlipTimeout = null;
  }

  getElement("quiz-summary").classList.add("hidden");
  getElement("card").classList.remove("hidden");
  getElement("hint-text").classList.remove("hidden");
  getElement("study-controls").classList.remove("hidden");

  getElement("card").classList.remove("flipped");
  getElement("card").style.border = "";
  getElement("back").classList.remove("revealed-correct");
  const answerEntry = getElement("typed-answer-entry");
  answerEntry.replaceChildren();
  answerEntry.classList.add("hidden");

  const front = getElement("front");
  const cleanedQuestion = cleanQuestionDisplay(cards[i].question);
  const questionLines = cleanedQuestion.split(/\r?\n/);
  const optionPattern = /^\s*[A-D][.)]\s+/;
  const firstOptionIndex = questionLines.findIndex(line => optionPattern.test(line));

  const isTrueFalse = cards[i].type === "true-false" || /^(true|false|tama|mali)$/i.test(cards[i].answer.trim());
  const isMultipleChoice = cards[i].type === "multiple-choice" || firstOptionIndex !== -1;
  const isLongQuestion = cleanedQuestion.length > 260 || questionLines.length > 7;
  const isEnumeration = cards[i].type === "enumeration";

  front.replaceChildren();
  front.classList.toggle("multiple-choice", isMultipleChoice);
  front.classList.toggle("true-false", isTrueFalse);
  front.classList.toggle("long-content", isLongQuestion);

  front.append(createAudioControlsGroup(() => cleanedQuestion));

  if (isTrueFalse) {
    const question = document.createElement("div");
    question.className = "question-text";
    front.append(question);
    typeWriter(question, cleanedQuestion);

    const options = document.createElement("div");
    options.className = "choice-options true-false-options";

    const rawAnswerMatch = cards[i].answer.trim().match(/^(true|false|tama|mali)/i);
    const correctAnswer = rawAnswerMatch ? rawAnswerMatch[1].toLowerCase() : normalizeString(cards[i].answer);
    const isFilipinoAnswer = rawAnswerMatch && /^(tama|mali)$/i.test(rawAnswerMatch[1]);
    const labels = isFilipinoAnswer ? ["Tama", "Mali"] : ["True", "False"];

    const choiceButtons = labels.map(choiceText => {
      const option = document.createElement("button");
      option.type = "button";
      option.className = "choice-option";
      option.textContent = choiceText;
      
      const choiceNormalized = choiceText.toLowerCase();
      const isMatch = (choiceNormalized === 'true' && correctAnswer === 'true') ||
                      (choiceNormalized === 'false' && correctAnswer === 'false') ||
                      (choiceNormalized === 'tama' && correctAnswer === 'tama') ||
                      (choiceNormalized === 'mali' && correctAnswer === 'mali');

      option.dataset.correct = String(isMatch);
      options.append(option);
      return option;
    });
    attachChoiceFeedback(choiceButtons);
    front.append(options);

  } else if (!isMultipleChoice) {
    const question = document.createElement("div");
    question.className = "question-text";
    front.append(question);
    typeWriter(question, cleanedQuestion);

    const expectedAnswer = isEnumeration
      ? getEnumerationItems(cards[i].answer).sort()
      : [cards[i].answer];

    const form = document.createElement("form");
    form.className = "typed-answer-form";

    const label = document.createElement("label");
    label.htmlFor = "typed-answer-1";
    label.textContent = isEnumeration
      ? `Enter all ${expectedAnswer.length} items, one per box, in any order`
      : "Your answer";

    const answerFields = [];
    let answerControl = isEnumeration ? document.createElement("div") : document.createElement("input");
    if (isEnumeration) answerControl.className = "enumeration-answer-fields";
    
    expectedAnswer.forEach((_, index) => {
      const field = document.createElement("input");
      field.type = "text";
      field.id = `typed-answer-${index + 1}`;
      field.name = `typed-answer-${index + 1}`;
      field.autocomplete = "off";
      field.placeholder = isEnumeration ? "Enter one item" : "Type your answer";
      field.setAttribute("aria-label", isEnumeration ? `Enumeration item ${index + 1}` : "Your answer");
      answerFields.push(field);
      if (isEnumeration) answerControl.append(field);
      else answerControl = field;
    });

    const checkButton = document.createElement("button");
    checkButton.type = "submit";
    checkButton.className = "primary-btn";
    checkButton.textContent = "Check answer";

    const feedback = document.createElement("p");
    feedback.className = "typed-answer-feedback";
    feedback.setAttribute("aria-live", "polite");

    form.addEventListener("submit", event => {
      event.preventDefault();

      let isCorrect = false;
      if (isEnumeration) {
        const submittedAnswer = answerFields
          .map(field => normalizeString(field.value))
          .filter(Boolean)
          .sort();
        isCorrect = submittedAnswer.length === expectedAnswer.length &&
          JSON.stringify(submittedAnswer) === JSON.stringify(expectedAnswer);
      } else {
        const userTyped = answerFields[0]?.value || "";
        isCorrect = checkIdentificationMatch(userTyped, cards[i].answer);
      }

      if (!answeredState[i]) {
        answeredState[i] = { isCorrect };
        updateScoreUI();
      }

      const cardElem = getElement("card");

      if (isCorrect) {
        form.classList.add("is-correct");
        form.classList.remove("is-incorrect");
        cardElem.style.border = "2px solid #2f7544";
        feedback.textContent = "Correct!";
        triggerConfetti();
        answerFields.forEach(field => { field.disabled = true; });
        checkButton.disabled = true;
      } else {
        form.classList.add("is-incorrect");
        form.classList.remove("is-correct");
        cardElem.style.border = "2px solid #a33434";
        feedback.textContent = "Not quite. Try again.";
        triggerWrongXEffect(cardElem);
      }
    });

    form.append(label, answerControl, checkButton, feedback);
    answerEntry.append(form);
    answerEntry.classList.remove("hidden");
  } else {
    const question = document.createElement("div");
    question.className = "question-text";
    front.append(question);

    let mainQuestionText = cleanedQuestion;
    let rawOptions = questionLines.slice(firstOptionIndex);

    if (firstOptionIndex === -1) {
      const matchInline = cleanedQuestion.match(/(.*?)\s+([A-D][.)]\s+.+)/);
      if (matchInline) {
        mainQuestionText = matchInline[1].trim();
        rawOptions = cleanedQuestion.slice(mainQuestionText.length).split(/(?=[A-D][.)]\s+)/).map(s => s.trim()).filter(Boolean);
      }
    } else {
      mainQuestionText = questionLines.slice(0, firstOptionIndex).join("\n").trim();
    }

    typeWriter(question, mainQuestionText);

    const options = document.createElement("div");
    options.className = "choice-options";
    const answer = cards[i].answer.trim();
    const answerLetter = answer.match(/^([A-D])(?:[.)]\s*|$)/i)?.[1]?.toUpperCase();
    const answerText = answer.replace(/^[A-D][.)]\s*/i, "").trim().toLowerCase();
    const choiceButtons = [];

    rawOptions.filter(line => optionPattern.test(line)).forEach(line => {
      const choiceMatch = line.trim().match(/^([A-D])[.)]\s*(.+)$/i);
      const option = document.createElement("button");
      option.type = "button";
      option.className = "choice-option";
      option.textContent = line.trim();
      const isCorrect = answerLetter
        ? choiceMatch?.[1].toUpperCase() === answerLetter
        : choiceMatch?.[2].trim().toLowerCase() === answerText;
      option.dataset.correct = String(Boolean(isCorrect));
      if (choiceMatch) option.dataset.choice = choiceMatch[1].toUpperCase();
      choiceButtons.push(option);
      options.append(option);
    });
    attachChoiceFeedback(choiceButtons);
    front.append(options);
  }

  const back = getElement("back");
  back.replaceChildren();

  back.append(createAudioControlsGroup(() => {
    let fullAnswer = cards[i].answer;
    if (cards[i].explanation) {
      fullAnswer += ". Explanation: " + cards[i].explanation;
    }
    return fullAnswer;
  }));

  const answerLength = cards[i].answer.length + (cards[i].explanation?.length || 0);
  const answerLineCount = cards[i].answer.split(/\r?\n/).length;
  back.classList.toggle("long-content", answerLength > 260 || answerLineCount > 7);
  
  const answerText = document.createElement("div");
  answerText.className = "answer-result";
  answerText.textContent = cards[i].answer;
  back.append(answerText);

  if (cards[i].explanation) {
    const explanation = document.createElement("p");
    explanation.className = "answer-explanation";
    explanation.textContent = cards[i].explanation;
    back.append(explanation);
  }

  getElement("counter").textContent = `Card ${i + 1} of ${cards.length}`;
  getElement("bar").style.width = ((i + 1) / cards.length) * 100 + "%";
  updateScoreUI();
}

if (getElement("card")) {
  getElement("card").addEventListener("click", () => {
    stopSpeech(true);
    getElement("card").classList.toggle("flipped");
  });
}

if (getElement("next")) {
  getElement("next").addEventListener("click", () => {
    if (i >= cards.length - 1) {
      showDeckSummary();
    } else {
      i++;
      show(true);
    }
  });
}

if (getElement("prev")) {
  getElement("prev").addEventListener("click", () => { 
    i = (i - 1 + cards.length) % cards.length; 
    show(true); 
  });
}

if (getElement("shuffle")) {
  getElement("shuffle").addEventListener("click", () => {
    cards.sort(() => Math.random() - 0.5);
    i = 0;
    resetQuizScore();
    saveCardsToStorage();
    show(true);
  });
}

// --- Cross-Platform Export and Import JSON Flashcards ---
const mainExportBtn = getElement("main-export-btn");
const importFileInput = getElement("import-file-input");

async function handleExportCards() {
  if (cards.length === 0) {
    alert("No flashcards available to export.");
    return;
  }

  const fileName = `SAPC_Flashcards_${selectedSubjectMode}_${Date.now()}.json`;
  const jsonBlob = new Blob([JSON.stringify({ cards }, null, 2)], { type: "application/json" });
  const file = new File([jsonBlob], fileName, { type: "application/json" });

  if (navigator.share && navigator.canShare && navigator.canShare({ files: [file] })) {
    try {
      await navigator.share({
        title: 'SAPC Flashcards Export',
        text: 'Here is your exported flashcard deck file.',
        files: [file]
      });
      return;
    } catch (err) {
      if (err.name === 'AbortError') return;
    }
  }

  const blobUrl = URL.createObjectURL(jsonBlob);
  const downloadAnchor = document.createElement("a");
  downloadAnchor.setAttribute("href", blobUrl);
  downloadAnchor.setAttribute("download", fileName);
  document.body.appendChild(downloadAnchor);
  downloadAnchor.click();
  downloadAnchor.remove();
  URL.revokeObjectURL(blobUrl);
}

if (mainExportBtn) {
  mainExportBtn.addEventListener("click", handleExportCards);
}

if (importFileInput) {
  importFileInput.addEventListener("change", (event) => {
    const file = event.target.files && event.target.files[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (e) => {
      try {
        const importedData = JSON.parse(e.target.result);
        const newCards = Array.isArray(importedData) ? importedData : importedData.cards;

        if (Array.isArray(newCards) && newCards.length > 0 && newCards[0].question && newCards[0].answer) {
          cards = newCards;
          i = 0;
          resetQuizScore();
          saveCardsToStorage();
          const studyElement = getElement("study");
          if (studyElement) studyElement.classList.remove("hidden");
          const statusElement = getElement("status");
          if (statusElement) statusElement.textContent = `Successfully imported ${cards.length} cards from JSON!`;
          show(true);
        } else {
          alert("Invalid flashcard JSON format.");
        }
      } catch (err) {
        alert("Failed to parse JSON file: " + err.message);
      }
    };

    reader.readAsText(file);
    importFileInput.value = "";
  });
}

// --- Modal Management ---
const cardModal = getElement("card-modal");
const modalTitle = getElement("modal-title");
const modalQuestion = getElement("modal-question");
const modalAnswer = getElement("modal-answer");
const modalCardType = getElement("modal-card-type");

function inferCardType(card) {
  if (["identification", "multiple-choice", "enumeration", "true-false"].includes(card.type)) {
    return card.type;
  }
  return "identification";
}

function updateModalCardTypeFields() {
  document.querySelectorAll(".custom-card-fields").forEach(fields => {
    fields.classList.toggle("hidden", fields.dataset.cardType !== modalCardType.value);
  });
}

if (modalCardType) {
  modalCardType.addEventListener("change", updateModalCardTypeFields);
}

function openModal(isEdit = false) {
  if (!cardModal) return;
  cardModal.classList.remove("hidden");
  
  if (isEdit && cards.length > 0) {
    const card = cards[i];
    const cardType = inferCardType(card);
    const questionLines = card.question.split(/\r?\n/);
    const firstOptionIndex = questionLines.findIndex(line => /^\s*[A-D][.)]\s+/.test(line));

    modalTitle.textContent = "Edit Flashcard";
    modalCardType.value = cardType;
    
    modalQuestion.value = cardType === "true-false"
      ? cleanQuestionDisplay(card.question)
      : cardType === "multiple-choice" && firstOptionIndex !== -1
        ? questionLines.slice(0, firstOptionIndex).join("\n").trim()
        : cleanQuestionDisplay(card.question);

    modalAnswer.value = cardType === "identification" ? card.answer : "";
    if (getElement("modal-id-explanation")) {
      getElement("modal-id-explanation").value = cardType === "identification" ? (card.explanation || "") : "";
    }
    getElement("modal-enumeration-answer").value = cardType === "enumeration"
      ? card.answer.split(/\r?\n/).map(line => line.replace(/^\s*\d+[.)]\s*/, "")).join("\n")
      : "";
    getElement("modal-explanation").value = cardType === "true-false" ? (card.explanation || "") : "";
    getElement("modal-mc-explanation").value = cardType === "multiple-choice" ? (card.explanation || "") : "";
    
    const correctOption = card.answer.match(/^\s*([A-D])[.)]\s*/i)?.[1]?.toUpperCase() || "A";
    getElement("modal-correct-option").value = correctOption;

    ["a", "b", "c", "d"].forEach((letter) => {
      const optionLine = cardType === "multiple-choice"
        ? questionLines.slice(firstOptionIndex).find(line => new RegExp(`^\\s*${letter}[.)]\\s+`, "i").test(line))
        : null;
      getElement(`modal-option-${letter}`).value = optionLine ? optionLine.replace(/^\s*[A-D][.)]\s+/i, "") : "";
    });

    getElement("modal-true-false-answer").value = /^(false|mali)$/i.test(card.answer.trim()) ? "False" : "True";
    updateModalCardTypeFields();
    editingIndex = i;
  } else {
    modalTitle.textContent = "Create Custom Flashcard";
    modalCardType.value = "identification";
    modalQuestion.value = "";
    modalAnswer.value = "";
    if (getElement("modal-id-explanation")) getElement("modal-id-explanation").value = "";
    getElement("modal-enumeration-answer").value = "";
    getElement("modal-explanation").value = "";
    getElement("modal-mc-explanation").value = "";
    ["a", "b", "c", "d"].forEach(letter => { getElement(`modal-option-${letter}`).value = ""; });
    getElement("modal-correct-option").value = "A";
    getElement("modal-true-false-answer").value = "True";
    updateModalCardTypeFields();
    editingIndex = null;
  }
}

function closeModal() {
  if (cardModal) cardModal.classList.add("hidden");
}

if (getElement("manual-add-btn")) getElement("manual-add-btn").addEventListener("click", () => openModal(false));
if (getElement("edit-card-btn")) getElement("edit-card-btn").addEventListener("click", () => {
  const cardActionsMenu = getElement("card-actions");
  if (cardActionsMenu) cardActionsMenu.open = false;
  openModal(true);
});
if (getElement("close-modal-btn")) getElement("close-modal-btn").addEventListener("click", closeModal);
if (getElement("cancel-modal-btn")) getElement("cancel-modal-btn").addEventListener("click", closeModal);

if (getElement("save-card-btn")) {
  getElement("save-card-btn").addEventListener("click", () => {
    const question = modalQuestion.value.trim();
    const cardType = modalCardType.value;
    if (!question) return alert("Please enter a question.");

    let card;
    if (cardType === "multiple-choice") {
      const letters = ["A", "B", "C", "D"];
      const choices = letters.map(letter => getElement(`modal-option-${letter.toLowerCase()}`).value.trim());
      if (choices.some(choice => !choice)) return alert("Please fill in all four choices.");
      const correctOption = getElement("modal-correct-option").value;
      const mcExplanation = getElement("modal-mc-explanation").value.trim();
      card = {
        question: `${question}\n${choices.map((choice, index) => `${letters[index]}. ${choice}`).join("\n")}`,
        answer: `${correctOption}. ${choices[letters.indexOf(correctOption)]}`,
        explanation: mcExplanation,
        type: cardType
      };
    } else if (cardType === "enumeration") {
      const items = getElement("modal-enumeration-answer").value.split(/\r?\n/)
        .map(item => item.replace(/^\s*\d+[.)]\s*/, "").trim())
        .filter(Boolean);
      if (items.length < 2) return alert("Please enter at least two expected items, one per line.");
      card = { question, answer: items.map((item, index) => `${index + 1}. ${item}`).join("\n"), type: cardType };
    } else if (cardType === "true-false") {
      card = {
        question: question,
        answer: getElement("modal-true-false-answer").value,
        explanation: getElement("modal-explanation").value.trim(),
        type: cardType
      };
    } else {
      const answer = modalAnswer.value.trim();
      const idExplanation = getElement("modal-id-explanation")?.value.trim() || "";
      if (!answer) return alert("Please enter the answer.");
      card = { question, answer, explanation: idExplanation, type: "identification" };
    }

    if (editingIndex !== null) {
      cards[editingIndex] = card;
    } else {
      cards.push(card);
      i = cards.length - 1;
      getElement("study").classList.remove("hidden");
    }
    saveCardsToStorage();
    show(true);
    closeModal();
  });
}

if (getElement("delete-card-btn")) {
  getElement("delete-card-btn").addEventListener("click", () => {
    const cardActionsMenu = getElement("card-actions");
    if (cardActionsMenu) cardActionsMenu.open = false;

    if (cards.length === 0) return;
    if (confirm("Are you sure you want to delete this flashcard?")) {
      cards.splice(i, 1);
      saveCardsToStorage();
      if (cards.length === 0) {
        getElement("study").classList.add("hidden");
      } else {
        i = Math.max(0, i - 1);
        show(true);
      }
    }
  });
}

const clearAllCardsBtn = getElement("clear-all-cards-btn");

if (clearAllCardsBtn) {
  clearAllCardsBtn.addEventListener("click", () => {
    const cardActionsMenu = getElement("card-actions");
    if (cardActionsMenu) cardActionsMenu.open = false;

    if (cards.length === 0) {
      alert("No flashcards available to clear.");
      return;
    }

    if (confirm("Are you sure you want to delete ALL flashcards?")) {
      cards = [];
      i = 0;
      resetQuizScore();
      localStorage.removeItem("sapc_flashcards");
      
      const studyElement = getElement("study");
      if (studyElement) studyElement.classList.add("hidden");
      
      const statusElement = getElement("status");
      if (statusElement) statusElement.textContent = "All flashcards have been cleared.";
    }
  });
}

document.addEventListener("keydown", (e) => {
  if (cardModal && !cardModal.classList.contains("hidden")) return;
  if (e.target.closest("button, summary, input, textarea, select")) return;

  if (e.code === "Space") { 
    e.preventDefault(); 
    if (cards.length > 0) {
      stopSpeech(true);
      getElement("card").classList.toggle("flipped"); 
    }
  }
  if (e.key === "ArrowRight" && cards.length > 0) getElement("next").click();
  if (e.key === "ArrowLeft" && cards.length > 0) getElement("prev").click();
});

loadCardsFromStorage();