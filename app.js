/**
 * Flame Calendar Index - Warm Beige Editorial / Field Radar Engine
 * Features:
 * - Proper Empty State for New Users (starts clean without fake data)
 * - Warm beige paper palette with terracotta and charcoal ink accents
 * - Live UTC clock and telemetry status switches
 * - OCR extraction via Tesseract.js & Flame pattern matching
 * - Google Identity Services OAuth 2.0 Token Client (Client ID configured)
 * - Direct Google Calendar API v3 synchronization & .ICS export
 */

// Global State
const state = {
  events: [], // Events for the currently active day
  eventsByDay: { 0: [], 1: [], 2: [], 3: [], 4: [], 5: [], 6: [] }, // SUN=0 ... SAT=6
  targetDateByDay: { 0: '', 1: '', 2: '', 3: '', 4: '', 5: '', 6: '' },
  dateTextByDay: { 0: '', 1: '', 2: '', 3: '', 4: '', 5: '', 6: '' },
  targetDate: '',
  detectedDateText: '',
  activeDayIndex: -1, // -1 = no day selected yet
  repeatWeekly: true,
  semesterEndDate: '2026-12-18',
  reminderMinutes: 10,
  currentImageSrc: null,
  googleClientId: '',
  googleAccessToken: null,
  user: null, // { name, email, picture }
  tokenClient: null,
  pendingSyncAfterLogin: false
};

// DOM Elements
const dropZone = document.getElementById('dropZone');
const fileInput = document.getElementById('fileInput');
const btnUploadTrigger = document.getElementById('btnUploadTrigger');
const processingSection = document.getElementById('processingSection');
const splitRadarView = document.getElementById('splitRadarView');
const previewImage = document.getElementById('previewImage');
const btnCloseSplitView = document.getElementById('btnCloseSplitView');
const btnToggleSplitView = document.getElementById('btnToggleSplitView');
const btnToggleViewGrid = document.getElementById('btnToggleViewGrid');
const eventsList = document.getElementById('eventsList');
const eventDateInput = document.getElementById('eventDateInput');
const repeatWeeklyCheckbox = document.getElementById('repeatWeeklyCheckbox');
const reminderSelect = document.getElementById('reminderSelect');
const semesterEndInput = document.getElementById('semesterEndInput');
const selectAllContainer = document.getElementById('selectAllContainer');
const selectAllCheckbox = document.getElementById('selectAllCheckbox');
const btnCombineConsecutive = document.getElementById('btnCombineConsecutive');
const detectedCountBadge = document.getElementById('detectedCountBadge');
const topLocationCounter = document.getElementById('topLocationCounter');
const topStatusPill = document.getElementById('topStatusPill');
const topStatusPillText = document.getElementById('topStatusPillText');
const liveClock = document.getElementById('liveClock');
const mainStatusBox = document.getElementById('mainStatusBox');
const statusBoxIcon = document.getElementById('statusBoxIcon');
const heroStatusTitle = document.getElementById('heroStatusTitle');
const heroDateBadge = document.getElementById('heroDateBadge');
const heroStatusSubtitle = document.getElementById('heroStatusSubtitle');
const breakingTickerText = document.getElementById('breakingTickerText');
const feedOcrText = document.getElementById('feedOcrText');
const intelStatusPill = document.getElementById('intelStatusPill');
const intelCountNotice = document.getElementById('intelCountNotice');
const bottomCommandBar = document.getElementById('bottomCommandBar');
const btnGoogleSignIn = document.getElementById('btnGoogleSignIn');
const userProfileBadge = document.getElementById('userProfileBadge');
const userAvatar = document.getElementById('userAvatar');
const userName = document.getElementById('userName');
const userEmail = document.getElementById('userEmail');
const btnSignOut = document.getElementById('btnSignOut');
const btnSyncGoogle = document.getElementById('btnSyncGoogle');
const btnDownloadICS = document.getElementById('btnDownloadICS');
const btnAddManualEvent = document.getElementById('btnAddManualEvent');

const btnOpenHelp = document.getElementById('btnOpenHelp');
const btnCloseHelp = document.getElementById('btnCloseHelp');
const btnDismissHelp = document.getElementById('btnDismissHelp');
const helpModal = document.getElementById('helpModal');
const syncProgressModal = document.getElementById('syncProgressModal');
const btnCloseSyncModal = document.getElementById('btnCloseSyncModal');
const syncModalTitle = document.getElementById('syncModalTitle');
const syncModalSubtitle = document.getElementById('syncModalSubtitle');
const syncModalProgressBar = document.getElementById('syncModalProgressBar');
const syncLogContainer = document.getElementById('syncLogContainer');
const syncCompletedActions = document.getElementById('syncCompletedActions');
const processingTitle = document.getElementById('processingTitle');
const processingStatus = document.getElementById('processingStatus');
const processingProgressBar = document.getElementById('processingProgressBar');

// Initialize App
document.addEventListener('DOMContentLoaded', async () => {
  startLiveClock();
  initUI();
  initListeners();
  await loadServerConfig();
  initGoogleAuth();
  renderEvents(); // Renders the clean empty state for a new user!
  updateLucideIcons();
});

function updateLucideIcons() {
  if (window.lucide) {
    window.lucide.createIcons();
  }
}

// Live Tactical Clock (UTC)
function startLiveClock() {
  function update() {
    const now = new Date();
    const iso = now.toISOString().replace('T', ' ').slice(0, 19);
    if (liveClock) {
      liveClock.textContent = `${iso} UTC`;
    }
  }
  update();
  setInterval(update, 1000);
}

function initUI() {
  eventDateInput.value = state.targetDate;
  reminderSelect.value = state.reminderMinutes.toString();
  repeatWeeklyCheckbox.checked = state.repeatWeekly;
  semesterEndInput.value = state.semesterEndDate;

  const cachedUser = localStorage.getItem('flame_cached_user');
  if (cachedUser) {
    try {
      state.user = JSON.parse(cachedUser);
    } catch {
      state.user = null;
    }
  }
  updateAuthUI();
}

async function loadServerConfig() {
  try {
    const res = await fetch('/api/config');
    if (res.ok) {
      const data = await res.json();
      if (data.google_client_id) {
        state.googleClientId = data.google_client_id;
      }
    }
  } catch (err) {
    console.warn('Could not fetch server config:', err);
  }

  if (!state.googleClientId) {
    state.googleClientId = localStorage.getItem('flame_gcal_client_id') || '';
  }
}

function initListeners() {
  // File upload & Dropzone
  fileInput.addEventListener('change', (e) => {
    if (e.target.files && e.target.files[0]) {
      handleImageFile(e.target.files[0]);
    }
  });

  if (btnUploadTrigger) {
    btnUploadTrigger.addEventListener('click', () => fileInput.click());
  }

  dropZone.addEventListener('dragover', (e) => {
    e.preventDefault();
    dropZone.classList.add('border-terracotta-600', 'bg-[#f5eee1]');
  });

  dropZone.addEventListener('dragleave', (e) => {
    e.preventDefault();
    dropZone.classList.remove('border-terracotta-600', 'bg-[#f5eee1]');
  });

  dropZone.addEventListener('drop', (e) => {
    e.preventDefault();
    dropZone.classList.remove('border-terracotta-600', 'bg-[#f5eee1]');
    if (e.dataTransfer.files && e.dataTransfer.files[0]) {
      handleImageFile(e.dataTransfer.files[0]);
    }
  });

  // Global Clipboard Paste (Ctrl+V anywhere)
  window.addEventListener('paste', (e) => {
    const items = (e.clipboardData || e.originalEvent.clipboardData).items;
    for (let item of items) {
      if (item.type.indexOf('image') === 0) {
        const file = item.getAsFile();
        handleImageFile(file);
        break;
      }
    }
  });




  // Day filter buttons (SUN, MON, TUE, WED, THU, FRI, SAT)
  document.querySelectorAll('.day-btn').forEach(btn => {
    btn.addEventListener('click', (e) => {
      const dayIdx = parseInt(e.currentTarget.dataset.day, 10);
      setActiveDay(dayIdx);
    });
  });

  // Split View Toggles
  btnToggleSplitView.addEventListener('click', () => {
    splitRadarView.classList.toggle('hidden');
  });
  btnToggleViewGrid.addEventListener('click', () => {
    splitRadarView.classList.add('hidden');
  });
  btnCloseSplitView.addEventListener('click', () => {
    splitRadarView.classList.add('hidden');
  });

  // Google Sign-In & Sign-Out Buttons
  btnGoogleSignIn.addEventListener('click', () => {
    triggerGoogleAuth();
  });

  btnSignOut.addEventListener('click', () => {
    handleGoogleSignOut();
  });

  // Manual Add Event
  btnAddManualEvent.addEventListener('click', () => {
    const newEvent = {
      id: 'ev_' + Date.now(),
      courseCode: 'COURSE101',
      courseTitle: 'NEW LECTURE SLOT',
      instructor: 'Prof. Name',
      startTime: '10:00 AM',
      endTime: '10:55 AM',
      location: 'APJ Abdul Kalam 101',
      startHour: 10,
      selected: true
    };
    state.events.push(newEvent);
    renderEvents();
    showToast('Added manual lecture slot');
  });

  // Date and Recurrence
  eventDateInput.addEventListener('change', (e) => {
    state.targetDate = e.target.value;
    if (state.activeDayIndex >= 0) {
      state.targetDateByDay[state.activeDayIndex] = state.targetDate;
    }
    heroDateBadge.textContent = state.targetDate;
    renderEvents();
  });

  repeatWeeklyCheckbox.addEventListener('change', (e) => {
    state.repeatWeekly = e.target.checked;
    const container = document.getElementById('semesterEndContainer');
    if (container) container.style.display = e.target.checked ? 'flex' : 'none';
  });

  semesterEndInput.addEventListener('change', (e) => {
    state.semesterEndDate = e.target.value;
  });

  reminderSelect.addEventListener('change', (e) => {
    state.reminderMinutes = parseInt(e.target.value, 10);
  });

  // Select all checkbox
  selectAllCheckbox.addEventListener('change', (e) => {
    const checked = e.target.checked;
    state.events.forEach(ev => ev.selected = checked);
    renderEvents();
  });

  // Combine back-to-back classes button
  if (btnCombineConsecutive) {
    btnCombineConsecutive.addEventListener('click', () => {
      const prevCount = state.events.length;
      const merged = combineConsecutiveClasses(state.events);
      const diff = prevCount - merged.length;
      if (diff > 0) {
        state.events = merged;
        if (state.activeDayIndex >= 0) {
          state.eventsByDay[state.activeDayIndex] = merged;
        }
        renderEvents();
        updateLucideIcons();
        showToast(`Combined ${diff} consecutive slot${diff > 1 ? 's' : ''} into longer sessions!`);
      } else {
        showToast('No back-to-back classes with matching names found to combine.', 'warning');
      }
    });
  }

  // Sync & Export
  btnDownloadICS.addEventListener('click', () => {
    downloadICSFile();
  });

  btnSyncGoogle.addEventListener('click', () => {
    handleGoogleCalendarSyncAction();
  });

  // Modals
  btnOpenHelp.addEventListener('click', () => helpModal.classList.remove('hidden'));
  const closeHelp = () => helpModal.classList.add('hidden');
  btnCloseHelp.addEventListener('click', closeHelp);
  btnDismissHelp.addEventListener('click', closeHelp);

  btnCloseSyncModal.addEventListener('click', () => {
    syncProgressModal.classList.add('hidden');
  });
}

function updateAuthUI() {
  if (state.user) {
    btnGoogleSignIn.classList.add('hidden');
    userProfileBadge.classList.remove('hidden');
    userAvatar.src = state.user.picture || 'https://lh3.googleusercontent.com/a/default-user=s96-c';
    userName.textContent = state.user.name || 'Student';
    userEmail.textContent = state.user.email || 'Google Account';
  } else {
    btnGoogleSignIn.classList.remove('hidden');
    userProfileBadge.classList.add('hidden');
  }
  updateLucideIcons();
}

// Google Identity Services (GIS) Setup
function initGoogleAuth() {
  if (!window.google || !window.google.accounts || !window.google.accounts.oauth2) {
    setTimeout(initGoogleAuth, 500);
    return;
  }

  if (!state.googleClientId) return;

  try {
    state.tokenClient = google.accounts.oauth2.initTokenClient({
      client_id: state.googleClientId,
      scope: 'https://www.googleapis.com/auth/calendar.events https://www.googleapis.com/auth/userinfo.email https://www.googleapis.com/auth/userinfo.profile',
      error_callback: (error) => {
        console.error('Google OAuth error:', error);
        showToast(`Google Auth: ${error.message || error.type || 'Origin mismatch. Check Authorized Origins'}`, 'error');
      },
      callback: async (tokenResponse) => {
        if (tokenResponse && tokenResponse.error) {
          console.error('Google token error:', tokenResponse);
          showToast(`Google Sign-In: ${tokenResponse.error_description || tokenResponse.error}`, 'error');
          return;
        }
        if (tokenResponse && tokenResponse.access_token) {
          state.googleAccessToken = tokenResponse.access_token;
          await fetchUserProfile();
          updateAuthUI();

          if (state.pendingSyncAfterLogin) {
            state.pendingSyncAfterLogin = false;
            await executeGoogleCalendarSync();
          } else {
            showToast(`Signed in: ${state.user ? state.user.email : 'Google Account'}`);
          }
        }
      }
    });
  } catch (err) {
    console.error('Failed to init Google OAuth client:', err);
  }
}

async function fetchUserProfile() {
  try {
    const res = await fetch('https://www.googleapis.com/oauth2/v3/userinfo', {
      headers: { Authorization: `Bearer ${state.googleAccessToken}` }
    });
    if (res.ok) {
      state.user = await res.json();
      localStorage.setItem('flame_cached_user', JSON.stringify(state.user));
    }
  } catch (err) {
    console.warn('Could not fetch userinfo:', err);
  }
}

function triggerGoogleAuth() {
  if (state.tokenClient) {
    state.tokenClient.requestAccessToken({ prompt: 'select_account' });
  } else {
    showToast('Initializing Google Sign-in...', 'warning');
    initGoogleAuth();
    if (state.tokenClient) {
      state.tokenClient.requestAccessToken({ prompt: 'select_account' });
    }
  }
}

function handleGoogleSignOut() {
  if (state.googleAccessToken && window.google && window.google.accounts && window.google.accounts.oauth2) {
    try {
      google.accounts.oauth2.revoke(state.googleAccessToken);
    } catch (e) {
      console.warn('Revoke error:', e);
    }
  }
  state.googleAccessToken = null;
  state.user = null;
  localStorage.removeItem('flame_cached_user');
  updateAuthUI();
  showToast('Signed out of Google account.');
}

// User Action: Sync
function handleGoogleCalendarSyncAction() {
  const selectedEvents = state.events.filter(e => e.selected);
  if (selectedEvents.length === 0) {
    alert('Please select at least one class to sync.');
    return;
  }

  if (state.googleAccessToken) {
    executeGoogleCalendarSync();
    return;
  }

  if (state.tokenClient) {
    state.pendingSyncAfterLogin = true;
    state.tokenClient.requestAccessToken({ prompt: 'select_account' });
    return;
  }

  triggerGoogleAuth();
}

// Handle Image File Upload
function handleImageFile(file) {
  if (!file.type.match('image.*')) {
    alert('Please upload an image file (PNG, JPG, WebP).');
    return;
  }
  const reader = new FileReader();
  reader.onload = (e) => {
    state.currentImageSrc = e.target.result;
    processImage(state.currentImageSrc);
  };
  reader.readAsDataURL(file);
}


// Helper: Convert time string (e.g. '8:00 AM') to minutes since start of day
function timeToMinutes(timeStr) {
  const parsed = parseTimeString(timeStr);
  return parsed.hours * 60 + parsed.minutes;
}

// Helper: Combine consecutive classes with same name that are <= 5 mins apart
function combineConsecutiveClasses(eventsList) {
  if (!eventsList || eventsList.length <= 1) return eventsList ? [...eventsList] : [];

  // Sort events chronologically by start time
  const sorted = [...eventsList].sort((a, b) => timeToMinutes(a.startTime) - timeToMinutes(b.startTime));
  const combined = [];

  for (let i = 0; i < sorted.length; i++) {
    const curr = { ...sorted[i] };
    if (combined.length === 0) {
      combined.push(curr);
      continue;
    }

    const prev = combined[combined.length - 1];

    // Normalize course codes and titles for matching
    const sameCode = (prev.courseCode || '').trim().toUpperCase() === (curr.courseCode || '').trim().toUpperCase();
    const sameTitle = (prev.courseTitle || '').trim().toUpperCase() === (curr.courseTitle || '').trim().toUpperCase();
    const sameCourse = sameCode || sameTitle;

    const prevEndMin = timeToMinutes(prev.endTime);
    const currStartMin = timeToMinutes(curr.startTime);
    const currEndMin = timeToMinutes(curr.endTime);
    const gap = currStartMin - prevEndMin;

    // If same class and gap between previous end and current start is between 0 and 5 minutes (or overlapping)
    if (sameCourse && gap >= 0 && gap <= 5 && currEndMin > prevEndMin) {
      // Merge into prev: extend its endTime to curr.endTime
      prev.endTime = curr.endTime;
      // Retain or complement location and instructor if missing
      if (!prev.location && curr.location) prev.location = curr.location;
      if (!prev.instructor && curr.instructor) prev.instructor = curr.instructor;
    } else {
      combined.push(curr);
    }
  }

  return combined;
}

// Helper: get next upcoming date YYYY-MM-DD for a given day index (0=Sun...6=Sat)
function getNextDateForDayOfWeek(targetDayIdx) {
  const now = new Date();
  const currentDayIdx = now.getDay();
  let diff = targetDayIdx - currentDayIdx;
  if (diff < 0) diff += 7;
  const d = new Date(now);
  d.setDate(now.getDate() + diff);
  const yyyy = d.getFullYear();
  const mm = String(d.getMonth() + 1).padStart(2, '0');
  const dd = String(d.getDate()).padStart(2, '0');
  return `${yyyy}-${mm}-${dd}`;
}

const DAY_NAMES_FULL = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];

// Helper: day name string → day index (0=Sun … 6=Sat)
function dayNameToIndex(dateText) {
  if (!dateText) return -1;
  const lower = dateText.toLowerCase();
  const daysFull = ['sunday','monday','tuesday','wednesday','thursday','friday','saturday'];
  for (let i = 0; i < daysFull.length; i++) {
    if (lower.includes(daysFull[i])) return i;
  }
  const daysShort = ['sun','mon','tue','wed','thu','fri','sat'];
  for (let i = 0; i < daysShort.length; i++) {
    const regex = new RegExp(`\\b${daysShort[i]}\\b`, 'i');
    if (regex.test(lower)) return i;
  }
  return -1;
}

// Helper: set active day, update button styles, update state.events, re-render
function setActiveDay(dayIdx) {
  state.activeDayIndex = dayIdx;
  state.events = state.eventsByDay[dayIdx] || [];

  if (state.targetDateByDay[dayIdx]) {
    state.targetDate = state.targetDateByDay[dayIdx];
  } else {
    state.targetDate = getNextDateForDayOfWeek(dayIdx);
    state.targetDateByDay[dayIdx] = state.targetDate;
  }
  eventDateInput.value = state.targetDate;

  if (state.dateTextByDay[dayIdx]) {
    state.detectedDateText = state.dateTextByDay[dayIdx];
  } else {
    state.detectedDateText = DAY_NAMES_FULL[dayIdx] || '';
  }

  // Update day button styles
  document.querySelectorAll('.day-btn').forEach(b => {
    const bDay = parseInt(b.dataset.day, 10);
    if (bDay === dayIdx) {
      b.className = 'day-btn active-day px-2.5 py-1 rounded border border-terracotta-600 bg-terracotta-600 text-white text-[11px] font-bold shadow-xs transition';
    } else {
      const hasEvents = (state.eventsByDay[bDay] || []).length > 0;
      b.className = `day-btn px-2.5 py-1 rounded border text-[11px] font-bold transition ${
        hasEvents
          ? 'border-stone-400 bg-[#f0ece4] text-stone-700 hover:text-stone-900'
          : 'border-[#ded6c5] bg-[#fdfbf7] text-stone-400'
      }`;
    }
  });

  renderEvents();
  updateLucideIcons();
}

// Helper: refresh day button dot indicators without changing active
function refreshDayButtonIndicators() {
  document.querySelectorAll('.day-btn').forEach(b => {
    const bDay = parseInt(b.dataset.day, 10);
    const isActive = bDay === state.activeDayIndex;
    const hasEvents = (state.eventsByDay[bDay] || []).length > 0;
    if (isActive) {
      b.className = 'day-btn active-day px-2.5 py-1 rounded border border-terracotta-600 bg-terracotta-600 text-white text-[11px] font-bold shadow-xs transition';
    } else {
      b.className = `day-btn px-2.5 py-1 rounded border text-[11px] font-bold transition ${
        hasEvents
          ? 'border-stone-400 bg-[#f0ece4] text-stone-700 hover:text-stone-900'
          : 'border-[#ded6c5] bg-[#fdfbf7] text-stone-400'
      }`;
    }
  });
}

// Process Image (OCR Extraction)
let isProcessing = false;
async function processImage(imageSrc) {
  if (isProcessing) {
    showToast('Already scanning a screenshot, please wait...', 'warning');
    return;
  }
  isProcessing = true;

  processingSection.classList.remove('hidden');
  processingProgressBar.style.width = '20%';
  processingTitle.textContent = 'Scanning Timetable Screenshot...';
  processingStatus.textContent = 'Extracting course codes, faculty, hours, and classrooms...';

  previewImage.src = imageSrc;

  // Detect actual MIME type from data URL
  const mimeMatch = imageSrc.match(/^data:(image\/[a-zA-Z+]+);base64,/);
  const mimeType = mimeMatch ? mimeMatch[1] : 'image/png';
  const b64 = imageSrc.split(',')[1];

  if (!b64) {
    showToast('Could not read image data. Try again.', 'error');
    processingSection.classList.add('hidden');
    isProcessing = false;
    return;
  }

  processingProgressBar.style.width = '60%';
  const payload = { image: b64, mimeType };
  console.log(`[OCR] Sending timetable screenshot to /api/ocr (MIME: ${mimeType}, payload size: ${Math.round(b64.length / 1024)} KB)`);
  
  try {
    const resp = await fetch('/api/ocr', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    });

    const responseText = await resp.text();
    let data;
    try {
      data = JSON.parse(responseText);
    } catch (parseErr) {
      console.error('[OCR] Server returned non-JSON response:', responseText.slice(0, 300));
      if (resp.status === 504) {
        throw new Error('504 Gateway Timeout: Gemini took too long to respond. Retrying with a faster model...');
      }
      throw new Error(`Server returned HTTP ${resp.status}: ${responseText.slice(0, 150)}`);
    }

    console.log('[OCR] Gemini response received:', data);
    if (!resp.ok || data.status !== 'ok' || !data.result) {
      throw new Error(data.message || 'OCR extraction failed');
    }
    const result = data.result;
    if (result.events && result.events.length > 0) {
      // Check if events have individual dayName or dateText assigned (multi-day schedule)
      const dayGroups = {};
      let hasMultiDayAssignment = false;

      result.events.forEach((e, i) => {
        let eventDayIdx = -1;
        if (e.dayName) eventDayIdx = dayNameToIndex(e.dayName);
        if (eventDayIdx === -1 && e.dateText) eventDayIdx = dayNameToIndex(e.dateText);

        if (eventDayIdx !== -1) {
          hasMultiDayAssignment = true;
          if (!dayGroups[eventDayIdx]) dayGroups[eventDayIdx] = [];
          dayGroups[eventDayIdx].push({
            ...e,
            id: e.id || 'ev_' + Date.now() + '_' + i,
            startHour: parseTimeString(e.startTime).hours,
            selected: true
          });
          if (e.dateText && !state.dateTextByDay[eventDayIdx]) {
            state.dateTextByDay[eventDayIdx] = e.dateText;
          }
        }
      });

      let primaryTargetDay = state.activeDayIndex >= 0 ? state.activeDayIndex : 1;
      let totalImported = 0;

      if (hasMultiDayAssignment && Object.keys(dayGroups).length > 0) {
        // Multi-day schedule: distribute classes into each respective weekday slot
        const populatedDays = Object.keys(dayGroups).map(Number).sort((a, b) => a - b);
        primaryTargetDay = populatedDays.includes(state.activeDayIndex) ? state.activeDayIndex : populatedDays[0];

        populatedDays.forEach(dayIdx => {
          const mergedClasses = combineConsecutiveClasses(dayGroups[dayIdx]);
          state.eventsByDay[dayIdx] = mergedClasses;
          totalImported += mergedClasses.length;

          if (!state.targetDateByDay[dayIdx]) {
            state.targetDateByDay[dayIdx] = getNextDateForDayOfWeek(dayIdx);
          }
          if (!state.dateTextByDay[dayIdx]) {
            state.dateTextByDay[dayIdx] = DAY_NAMES_FULL[dayIdx] || '';
          }
        });

        console.log(`[OCR Multi-Day] Assigned classes across ${populatedDays.length} days:`, populatedDays);
      } else {
        // Single day schedule: assign all events to the single detected day (or active day)
        let parsedEvents = result.events.map((e, i) => ({
          ...e,
          id: e.id || 'ev_' + Date.now() + '_' + i,
          startHour: parseTimeString(e.startTime).hours,
          selected: true
        }));

        parsedEvents = combineConsecutiveClasses(parsedEvents);

        let detectedDay = dayNameToIndex(result.dateText);
        if (detectedDay === -1 && result.targetDate && result.targetDate.match(/^\d{4}-\d{2}-\d{2}$/)) {
          const parts = result.targetDate.split('-').map(Number);
          const parsedD = new Date(parts[0], parts[1] - 1, parts[2]);
          if (!isNaN(parsedD.getTime())) {
            detectedDay = parsedD.getDay();
          }
        }

        const targetDay = detectedDay !== -1 ? detectedDay : (state.activeDayIndex >= 0 ? state.activeDayIndex : 1);
        primaryTargetDay = targetDay;
        state.eventsByDay[targetDay] = parsedEvents;
        totalImported = parsedEvents.length;

        if (detectedDay !== -1) {
          if (result.targetDate) state.targetDateByDay[targetDay] = result.targetDate;
          if (result.dateText) state.dateTextByDay[targetDay] = result.dateText;
        } else {
          if (!state.targetDateByDay[targetDay]) {
            state.targetDateByDay[targetDay] = getNextDateForDayOfWeek(targetDay);
          }
          if (!state.dateTextByDay[targetDay]) {
            state.dateTextByDay[targetDay] = DAY_NAMES_FULL[targetDay] || '';
          }
        }
      }

      processingProgressBar.style.width = '100%';
      setTimeout(() => {
        processingSection.classList.add('hidden');
        isProcessing = false;
        setActiveDay(primaryTargetDay);
        refreshDayButtonIndicators();
        showToast(`Imported ${totalImported} classes across your weekly timetable!`);
      }, 250);
    } else {
      throw new Error('No classes found in screenshot');
    }
  } catch (error) {
    console.error('[OCR] Error:', error);
    processingProgressBar.style.width = '100%';
    setTimeout(() => {
      processingSection.classList.add('hidden');
      isProcessing = false;
      renderEvents();
      updateLucideIcons();
      showToast('Could not read screenshot: ' + error.message, 'error');
    }, 250);
  }
}



// Generate the 18-bar histogram matching pizzint.watch with warm terracotta & paper tones
function generateHistogramBarsHtml(startHour) {
  const totalSlots = 18;
  const activeSlot = Math.max(0, Math.min(totalSlots - 1, startHour - 7));

  let barsHtml = '';
  for (let i = 0; i < totalSlots; i++) {
    const isActive = (i === activeSlot || i === activeSlot + 1);
    const heightPercent = isActive ? (i === activeSlot ? '92%' : '80%') : `${Math.floor(15 + (Math.sin(i * 0.8) + 1) * 8)}%`;
    const barClass = isActive ? 'bar-active-peak' : 'bar-inactive';
    barsHtml += `<div class="flex-1 rounded-t-xs ${barClass}" style="height: ${heightPercent};" title="Hour ${i + 7}:00"></div>`;
  }
  return barsHtml;
}

// Render dynamic state: Empty State for New Users vs Active Cards
function renderEvents() {
  eventsList.innerHTML = '';

  const count = state.events.length;
  const selectedCount = state.events.filter(e => e.selected).length;

  detectedCountBadge.textContent = `${count} CLASSES`;
  topLocationCounter.textContent = `${count} MONITORED`;

  // Dynamic status indicators based on whether user has loaded a schedule
  if (count === 0) {
    // NEW USER / EMPTY STATE
    mainStatusBox.className = 'status-box-standby rounded-xl p-3.5 sm:p-4 flex items-center justify-between relative overflow-hidden transition-all';
    statusBoxIcon.className = 'w-10 h-10 rounded-lg bg-amber-100 border border-amber-400 flex items-center justify-center text-amber-700 shrink-0 text-xl font-bold';
    statusBoxIcon.textContent = '⬡';
    heroStatusTitle.className = 'text-sm sm:text-base font-extrabold text-amber-900 font-tactical tracking-wider uppercase';
    heroStatusTitle.textContent = 'RADAR STATUS: STANDBY';
    heroDateBadge.className = 'text-[10px] uppercase font-mono px-1.5 py-0.5 rounded bg-amber-100 text-amber-800 border border-amber-300 font-bold';
    heroDateBadge.textContent = 'AWAITING UPLOAD';
    heroStatusSubtitle.textContent = 'Drop your Flame timetable screenshot above or press Ctrl+V to engage OCR radar.';
    topStatusPill.className = 'px-2.5 py-0.5 rounded border border-amber-400 bg-amber-50 text-amber-800 font-bold flex items-center space-x-1.5';
    topStatusPillText.textContent = 'STATUS: STANDBY';
    
    feedOcrText.textContent = 'OCR parser initialized. Awaiting user timetable screenshot.';
    intelStatusPill.textContent = 'IDLE';
    intelCountNotice.textContent = '0 DETECTIONS';

    breakingTickerText.textContent = 'Drop your Flame timetable screenshot or press Ctrl + V to automatically detect lecture hours, professors, and classrooms.';

    selectAllContainer.classList.add('hidden');
    bottomCommandBar.classList.add('hidden');

    // Render Clean Empty State
    eventsList.innerHTML = `
      <div class="col-span-full border-2 border-dashed border-[#cfc5b2] rounded-2xl p-8 sm:p-12 text-center space-y-4 bg-[#fbf9f4]">
        <div class="w-14 h-14 rounded-2xl bg-[#ede8df] border border-[#ded6c5] flex items-center justify-center text-terracotta-600 mx-auto">
          <i data-lucide="calendar-search" class="w-7 h-7"></i>
        </div>
        <div class="max-w-md mx-auto space-y-1 font-mono">
          <h3 class="text-sm font-bold text-stone-900 uppercase font-tactical tracking-wide">
            NO LECTURES LOADED YET
          </h3>
          <p class="text-xs text-stone-600 leading-relaxed">
            Take a screenshot of any day on your Flame University portal and drop it here, or press <kbd class="px-1.5 py-0.5 rounded bg-[#ebe4d5] text-stone-800 border border-[#d6cdbc] text-[10px]">Ctrl + V</kbd> to paste. Classes will be added to the correct day automatically.
          </p>
        </div>
      </div>
    `;

    updateLucideIcons();
    return;
  }

  // ACTIVE LOADED STATE
  mainStatusBox.className = 'status-box-armed rounded-xl p-3.5 sm:p-4 flex items-center justify-between relative overflow-hidden transition-all';
  statusBoxIcon.className = 'w-10 h-10 rounded-lg bg-emerald-100 border border-emerald-500 flex items-center justify-center text-emerald-800 shrink-0 text-xl font-bold';
  statusBoxIcon.textContent = '⬢';
  heroStatusTitle.className = 'text-sm sm:text-base font-extrabold text-emerald-900 font-tactical tracking-wider uppercase';
  heroStatusTitle.textContent = `CLASSCON 1: ARMED (${selectedCount} OF ${count} ACTIVE)`;
  const dayNames = ['SUNDAY', 'MONDAY', 'TUESDAY', 'WEDNESDAY', 'THURSDAY', 'FRIDAY', 'SATURDAY'];
  const dayNameShort = ['SUN', 'MON', 'TUE', 'WED', 'THU', 'FRI', 'SAT'];
  const activeDayName = state.activeDayIndex >= 0 ? dayNames[state.activeDayIndex] : '';

  heroDateBadge.className = 'text-[10px] uppercase font-mono px-1.5 py-0.5 rounded bg-emerald-100 text-emerald-800 border border-emerald-300 font-bold';
  heroDateBadge.textContent = state.detectedDateText ? state.detectedDateText.toUpperCase() : (activeDayName || 'SCHEDULE LOADED');
  heroStatusSubtitle.textContent = `TIMETABLE PARSED &bull; ${count} LECTURES READY FOR GOOGLE CALENDAR PRIMARY SYNC`;
  topStatusPill.className = 'px-2.5 py-0.5 rounded border border-emerald-600 bg-emerald-50 text-emerald-900 font-bold flex items-center space-x-1.5';
  topStatusPillText.textContent = 'STATUS: ARMED';

  feedOcrText.textContent = `Detected ${count} lecture slots in APJ Abdul Kalam hall.`;
  intelStatusPill.textContent = 'ACTIVE';
  intelCountNotice.textContent = `${count} DETECTIONS`;

  breakingTickerText.innerHTML = state.events.map(ev => 
    `<span class="font-bold text-terracotta-600">${escapeHtml(ev.courseCode)}</span> (${escapeHtml(ev.courseTitle)}) with ${escapeHtml(ev.instructor)} at ${escapeHtml(ev.startTime)} [${escapeHtml(ev.location)}]`
  ).join(' &bull; ');

  selectAllContainer.classList.remove('hidden');
  bottomCommandBar.classList.remove('hidden');
  selectAllCheckbox.checked = count > 0 && selectedCount === count;

  // Render the 3x2 Tactical Cards Grid in Warm Beige
  state.events.forEach((event, index) => {
    const card = document.createElement('div');
    card.className = `beige-card rounded-xl p-3.5 space-y-2.5 transition-all relative ${event.selected ? 'border-[#cfc5b2]' : 'border-[#ded6c5] opacity-60 bg-[#f9f7f2]'}`;

    const gcalWebLink = generateGoogleCalendarWebUrl(event);
    const startParsed = parseTimeString(event.startTime);
    const histogramHtml = generateHistogramBarsHtml(startParsed.hours);
    const cardDayLabel = activeDayName || 'SCHEDULED';

    card.innerHTML = `
      <!-- Card Top Header (Title + Utility Buttons) -->
      <div class="flex items-start justify-between gap-2 border-b border-[#ded6c5] pb-2 font-mono">
        <div class="flex items-center space-x-2 flex-1 truncate">
          <input type="checkbox" data-index="${index}" class="event-checkbox w-3.5 h-3.5 rounded bg-white border-[#cfc5b2] text-terracotta-600 focus:ring-0 cursor-pointer" ${event.selected ? 'checked' : ''}>
          <span class="text-terracotta-600 text-xs">▼</span>
          <h4 class="text-xs font-bold text-stone-900 uppercase tracking-wide truncate">
            ${escapeHtml(event.courseCode)} (${escapeHtml(event.courseTitle)})
          </h4>
        </div>
        <div class="flex items-center space-x-1 shrink-0">
          <a href="${gcalWebLink}" target="_blank" title="Add directly to Google Calendar" class="w-6 h-6 rounded bg-[#ede8df] hover:bg-[#e4dcce] text-stone-700 flex items-center justify-center border border-[#ded6c5] transition text-[10px]">
            <i data-lucide="external-link" class="w-3 h-3"></i>
          </a>
          <button type="button" data-action="delete" data-index="${index}" title="Remove lecture slot" class="w-6 h-6 rounded bg-[#ede8df] hover:bg-red-100 text-stone-500 hover:text-red-700 flex items-center justify-center border border-[#ded6c5] transition text-[10px]">
            <i data-lucide="x" class="w-3 h-3"></i>
          </button>
        </div>
      </div>

      <!-- Second Row: Status Badge + Location -->
      <div class="flex items-center justify-between text-[10px] font-mono">
        <div class="flex items-center space-x-2">
          <span class="px-2 py-0.5 rounded bg-[#ede8df] text-stone-800 font-bold border border-[#ded6c5] uppercase">
            SCHEDULED
          </span>
          <span class="text-stone-600 truncate max-w-[150px]">${escapeHtml(event.instructor)}</span>
        </div>
        <div class="flex items-center space-x-1 text-stone-600 font-mono">
          <i data-lucide="map-pin" class="w-3 h-3 text-terracotta-600"></i>
          <span class="text-stone-900 font-bold truncate">${escapeHtml(event.location)}</span>
        </div>
      </div>

      <!-- Third Row: Schedule Occupancy Histogram -->
      <div class="space-y-1 pt-1 font-mono">
        <div class="flex items-center justify-between text-[9px] text-stone-500 uppercase">
          <span>SCHEDULE OCCUPANCY ANALYSIS</span>
          <span class="text-terracotta-600 font-bold">${escapeHtml(event.startTime)} - ${escapeHtml(event.endTime)}</span>
        </div>
        
        <!-- Warm Beige Histogram Chart -->
        <div class="h-16 bg-[#ede8df] rounded-lg p-1.5 flex items-end space-x-1 border border-[#ded6c5]">
          ${histogramHtml}
        </div>

        <!-- Axis Ticks below graph -->
        <div class="flex items-center justify-between text-[8px] text-stone-500 px-1 pt-0.5">
          <span>8a</span>
          <span>10a</span>
          <span>12p</span>
          <span>2p</span>
          <span>4p</span>
          <span>6p</span>
          <span>CLOSED</span>
        </div>
      </div>

      <!-- Bottom Row: Time slot & Day of the class -->
      <div class="pt-1 border-t border-[#ded6c5] flex items-center justify-between text-[10px] font-mono text-stone-600">
        <div class="flex items-center space-x-1">
          <i data-lucide="clock" class="w-3 h-3 text-terracotta-600"></i>
          <span class="text-stone-900 font-bold">${escapeHtml(event.startTime)} - ${escapeHtml(event.endTime)}</span>
        </div>
        <span class="text-stone-600 font-bold text-[10px] tracking-wide uppercase">${escapeHtml(cardDayLabel)}</span>
      </div>
    `;

    eventsList.appendChild(card);
  });

  // Attach event handlers
  document.querySelectorAll('.event-checkbox').forEach(cb => {
    cb.addEventListener('change', (e) => {
      const idx = parseInt(e.target.dataset.index, 10);
      state.events[idx].selected = e.target.checked;
      renderEvents();
    });
  });

  document.querySelectorAll('button[data-action="delete"]').forEach(btn => {
    btn.addEventListener('click', (e) => {
      const idx = parseInt(e.currentTarget.dataset.index, 10);
      state.events.splice(idx, 1);
      renderEvents();
      showToast('Removed class slot');
    });
  });

  updateLucideIcons();
}

// Google Calendar API Sync Flow
async function executeGoogleCalendarSync() {
  const selectedEvents = state.events.filter(e => e.selected);
  if (selectedEvents.length === 0) return;

  syncProgressModal.classList.remove('hidden');
  syncCompletedActions.classList.add('hidden');
  syncModalTitle.textContent = 'SYNCING TO GOOGLE CALENDAR...';
  syncModalSubtitle.textContent = `Transmitting ${selectedEvents.length} lectures via Google Calendar API`;
  syncModalProgressBar.style.width = '0%';
  syncLogContainer.innerHTML = '';

  const timeZone = Intl.DateTimeFormat().resolvedOptions().timeZone || 'Asia/Kolkata';
  let successCount = 0;

  for (let i = 0; i < selectedEvents.length; i++) {
    const event = selectedEvents[i];
    const logItem = document.createElement('div');
    logItem.className = 'flex items-center justify-between text-[10px] font-mono p-1.5 rounded bg-[#fdfbf7] border border-[#ded6c5]';
    logItem.innerHTML = `
      <span class="text-stone-800">${escapeHtml(event.courseCode)} (${escapeHtml(event.courseTitle)})</span>
      <span class="text-terracotta-600 font-bold">TRANSMITTING...</span>
    `;
    syncLogContainer.appendChild(logItem);

    try {
      const { startIso, endIso } = computeDateTimeIso(state.targetDate, event.startTime, event.endTime);
      
      const payload = {
        summary: `${event.courseCode} - ${event.courseTitle}`,
        description: `Instructor: ${event.instructor}\nClassroom: ${event.location}\nCourse Code: ${event.courseCode}\n\nImported via Flame Calendar Index`,
        location: event.location,
        start: {
          dateTime: startIso,
          timeZone: timeZone
        },
        end: {
          dateTime: endIso,
          timeZone: timeZone
        }
      };

      if (state.repeatWeekly && state.semesterEndDate) {
        const untilFormatted = state.semesterEndDate.replace(/-/g, '') + 'T235959Z';
        payload.recurrence = [`RRULE:FREQ=WEEKLY;UNTIL=${untilFormatted}`];
      }

      if (state.reminderMinutes >= 0) {
        payload.reminders = {
          useDefault: false,
          overrides: [
            { method: 'popup', minutes: state.reminderMinutes }
          ]
        };
      }

      const response = await fetch('https://www.googleapis.com/calendar/v3/calendars/primary/events', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${state.googleAccessToken}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify(payload)
      });

      if (!response.ok) {
        if (response.status === 401) {
          state.googleAccessToken = null;
          updateAuthUI();
          throw new Error('OAuth token expired. Please click Sign in with Google again.');
        }
        const errJson = await response.json();
        throw new Error(errJson.error ? errJson.error.message : 'API call failed');
      }

      const result = await response.json();
      successCount++;

      logItem.className = 'flex items-center justify-between text-[10px] font-mono p-1.5 rounded bg-emerald-50 border border-emerald-300 text-emerald-900';
      logItem.innerHTML = `
        <span class="font-bold">${escapeHtml(event.courseCode)} (${escapeHtml(event.courseTitle)})</span>
        <a href="${result.htmlLink || 'https://calendar.google.com'}" target="_blank" class="text-emerald-700 hover:underline font-bold">
          ADDED &bull; VIEW &rarr;
        </a>
      `;

    } catch (err) {
      logItem.className = 'flex items-center justify-between text-[10px] font-mono p-1.5 rounded bg-red-50 border border-red-300 text-red-900';
      logItem.innerHTML = `
        <span>${escapeHtml(event.courseCode)}</span>
        <span class="text-red-600 text-[9px]">${escapeHtml(err.message)}</span>
      `;
    }

    const progressPct = Math.round(((i + 1) / selectedEvents.length) * 100);
    syncModalProgressBar.style.width = `${progressPct}%`;
  }

  syncModalTitle.textContent = 'SYNC TRANSMISSION COMPLETED!';
  syncModalSubtitle.textContent = `Successfully added ${successCount} of ${selectedEvents.length} classes to Google Calendar.`;
  syncCompletedActions.classList.remove('hidden');
  updateLucideIcons();
}

// Download .ICS Calendar File
function downloadICSFile() {
  const selectedEvents = state.events.filter(e => e.selected);
  if (selectedEvents.length === 0) {
    alert('Please select at least one class to export.');
    return;
  }

  let icsContent = [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    'PRODID:-//Flame Calendar Index//EN',
    'CALSCALE:GREGORIAN',
    'METHOD:PUBLISH',
    'X-WR-CALNAME:Flame University Classes',
    'X-WR-TIMEZONE:Asia/Kolkata'
  ];

  const now = new Date();
  const nowIso = now.toISOString().replace(/[-:]/g, '').split('.')[0] + 'Z';

  selectedEvents.forEach(event => {
    const { startUtcStr, endUtcStr } = computeUtcDateTimeForIcs(state.targetDate, event.startTime, event.endTime);
    const uid = `${event.id}_${Date.now()}@flameuniv.local`;

    icsContent.push('BEGIN:VEVENT');
    icsContent.push(`UID:${uid}`);
    icsContent.push(`DTSTAMP:${nowIso}`);
    icsContent.push(`DTSTART:${startUtcStr}`);
    icsContent.push(`DTEND:${endUtcStr}`);
    icsContent.push(`SUMMARY:${icsClean(event.courseCode + ' (' + event.courseTitle + ')')}`);
    icsContent.push(`DESCRIPTION:${icsClean('Instructor: ' + event.instructor + '\\nClassroom: ' + event.location + '\\n\\nImported via Flame Calendar Index')}`);
    icsContent.push(`LOCATION:${icsClean(event.location)}`);

    if (state.repeatWeekly && state.semesterEndDate) {
      const untilIcs = state.semesterEndDate.replace(/-/g, '') + 'T235959Z';
      icsContent.push(`RRULE:FREQ=WEEKLY;UNTIL=${untilIcs}`);
    }

    if (state.reminderMinutes >= 0) {
      icsContent.push('BEGIN:VALARM');
      icsContent.push('ACTION:DISPLAY');
      icsContent.push(`DESCRIPTION:Class reminder for ${icsClean(event.courseTitle)}`);
      icsContent.push(`TRIGGER:-PT${state.reminderMinutes}M`);
      icsContent.push('END:VALARM');
    }

    icsContent.push('END:VEVENT');
  });

  icsContent.push('END:VCALENDAR');

  const blob = new Blob([icsContent.join('\r\n')], { type: 'text/calendar;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `flame_timetable_${state.targetDate}.ics`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);

  showToast(`Exported ${selectedEvents.length} classes as .ICS calendar feed!`);
}

// Generate single Google Calendar web link
function generateGoogleCalendarWebUrl(event) {
  try {
    const { startUtcStr, endUtcStr } = computeUtcDateTimeForIcs(state.targetDate, event.startTime, event.endTime);
    const title = encodeURIComponent(`${event.courseCode} (${event.courseTitle})`);
    const details = encodeURIComponent(`Instructor: ${event.instructor}\nClassroom: ${event.location}\nImported via Flame Calendar Index`);
    const location = encodeURIComponent(event.location || '');
    let recurrenceParam = '';
    if (state.repeatWeekly && state.semesterEndDate) {
      const untilIcs = state.semesterEndDate.replace(/-/g, '') + 'T235959Z';
      recurrenceParam = `&recur=RRULE:FREQ=WEEKLY;UNTIL=${untilIcs}`;
    }
    return `https://calendar.google.com/calendar/render?action=TEMPLATE&text=${title}&dates=${startUtcStr}/${endUtcStr}&details=${details}&location=${location}${recurrenceParam}`;
  } catch {
    return 'https://calendar.google.com';
  }
}

// Date & Time calculation utilities
function computeDateTimeIso(dateStr, startStr, endStr) {
  const start = parseTimeString(startStr);
  const end = parseTimeString(endStr);

  const [y, m, d] = dateStr.split('-').map(Number);
  const startDate = new Date(y, m - 1, d, start.hours, start.minutes, 0);
  const endDate = new Date(y, m - 1, d, end.hours, end.minutes, 0);

  return {
    startIso: startDate.toISOString(),
    endIso: endDate.toISOString()
  };
}

function computeUtcDateTimeForIcs(dateStr, startStr, endStr) {
  const start = parseTimeString(startStr);
  const end = parseTimeString(endStr);

  const [y, m, d] = dateStr.split('-').map(Number);
  const startDate = new Date(y, m - 1, d, start.hours, start.minutes, 0);
  const endDate = new Date(y, m - 1, d, end.hours, end.minutes, 0);

  const startUtcStr = startDate.toISOString().replace(/[-:]/g, '').split('.')[0] + 'Z';
  const endUtcStr = endDate.toISOString().replace(/[-:]/g, '').split('.')[0] + 'Z';

  return { startUtcStr, endUtcStr };
}

function parseTimeString(timeStr) {
  if (!timeStr) return { hours: 8, minutes: 0 };
  timeStr = timeStr.trim();
  let [time, modifier] = timeStr.split(/\s+/);
  if (!modifier && (time.toLowerCase().endsWith('am') || time.toLowerCase().endsWith('pm'))) {
    modifier = time.slice(-2);
    time = time.slice(0, -2);
  }
  let [hours, minutes] = time.split(':').map(Number);
  if (isNaN(minutes)) minutes = 0;
  if (isNaN(hours)) hours = 8;

  if (modifier) {
    const mod = modifier.toUpperCase();
    if (mod === 'PM' && hours < 12) hours += 12;
    if (mod === 'AM' && hours === 12) hours = 0;
  }
  return { hours, minutes };
}

function icsClean(str) {
  return (str || '').replace(/[\\;,\n]/g, (match) => {
    if (match === '\n') return '\\n';
    return '\\' + match;
  });
}

function escapeHtml(str) {
  if (!str) return '';
  return str.replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;')
            .replace(/'/g, '&#039;');
}

function showToast(msg, type = 'success') {
  const toast = document.createElement('div');
  const borderClass = type === 'error' ? 'border-red-400 bg-red-50 text-red-900' : type === 'warning' ? 'border-amber-400 bg-amber-50 text-amber-900' : 'border-stone-400 bg-[#fdfbf7] text-stone-900';
  toast.className = `fixed bottom-5 right-5 z-50 px-4 py-2 rounded-xl border text-xs font-mono font-bold shadow-xl flex items-center space-x-2 transition-all duration-300 transform translate-y-2 opacity-0 ${borderClass}`;
  toast.innerHTML = `
    <span class="w-2 h-2 rounded-full ${type === 'error' ? 'bg-red-500' : type === 'warning' ? 'bg-amber-500' : 'bg-terracotta-600'}"></span>
    <span>${escapeHtml(msg)}</span>
  `;
  document.body.appendChild(toast);

  requestAnimationFrame(() => {
    toast.classList.remove('translate-y-2', 'opacity-0');
  });

  setTimeout(() => {
    toast.classList.add('translate-y-2', 'opacity-0');
    setTimeout(() => toast.remove(), 300);
  }, 3200);
}
