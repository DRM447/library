/* =========================================================
 * All BOOKs API · 캐시 · 동기화 · 데이터 유틸리티 (api.js)
 * ========================================================= */
 function safeReadJson(key, fallback) {
 try {
 const raw = localStorage.getItem(key);
 if (raw === null || raw === '') return fallback;
 const parsed = JSON.parse(raw);
 return parsed !== null && parsed !== undefined ? parsed : fallback;
 } catch (e) {
 return fallback;
 }
 }

 /* IndexedDB 경량 래퍼 (대용량 내 서재 캐시 저장용 — localStorage 5MB 한도 초과 방지) */
 const AllBooksIDB = (() => {
 const DB_NAME = 'allbooks-db';
 const STORE_NAME = 'kv';
 let dbPromise = null;
 function openDb() {
 if (dbPromise) return dbPromise;
 if (typeof indexedDB === 'undefined') return Promise.resolve(null);
 dbPromise = new Promise(resolve => {
 try {
 const req = indexedDB.open(DB_NAME, 1);
 req.onupgradeneeded = () => {
 const db = req.result;
 if (!db.objectStoreNames.contains(STORE_NAME)) db.createObjectStore(STORE_NAME);
 };
 req.onsuccess = () => resolve(req.result);
 req.onerror = () => resolve(null);
 } catch (e) {
 resolve(null);
 }
 });
 return dbPromise;
 }
 async function get(key) {
 const db = await openDb();
 if (!db) return null;
 return new Promise(resolve => {
 try {
 const tx = db.transaction(STORE_NAME, 'readonly');
 const req = tx.objectStore(STORE_NAME).get(key);
 req.onsuccess = () => resolve(req.result ?? null);
 req.onerror = () => resolve(null);
 } catch (e) {
 resolve(null);
 }
 });
 }
 async function set(key, value) {
 const db = await openDb();
 if (!db) return false;
 return new Promise(resolve => {
 try {
 const tx = db.transaction(STORE_NAME, 'readwrite');
 tx.objectStore(STORE_NAME).put(value, key);
 tx.oncomplete = () => resolve(true);
 tx.onerror = () => resolve(false);
 } catch (e) {
 resolve(false);
 }
 });
 }
 return { get, set };
 })();

 function buildSheetGetUrl(paramsObj = {}) {
 const sheetUrl = getUnifiedApiUrl();
 if (!sheetUrl) return '';
 const sep = sheetUrl.includes('?') ? '&' : '?';
 const qs = new URLSearchParams();
 const pin = getSheetWritePin();
 if (pin) qs.set('pin', pin);
 Object.entries(paramsObj).forEach(([k, v]) => {
 if (v !== undefined && v !== null && String(v) !== '') qs.set(k, String(v));
 });
 const qStr = qs.toString();
 return qStr ? `${sheetUrl}${sep}${qStr}` : sheetUrl;
 }

 function refreshIcons(rootEl = document) {
 if (!window.lucide || !rootEl) return;
 if (rootEl.querySelector && !rootEl.querySelector('[data-lucide]')) return;
 lucide.createIcons();
 }

 refreshIcons();
 const SHEET_API_URL = "https://script.google.com/macros/s/AKfycbzHqNHCuv0lBtDdvyR6v2IZhqAFEvejja29Es-YRldKEArp3tteVjn3Zz28UMB0t82H/exec";

 const API_CACHE_TTL_MS = 90 * 24 * 60 * 60 * 1000; // 도서·저자·추천 90일 장기 캐시
 const DAILY_API_LIMIT = 500;

 function getApiUsageRecord() {
 const today = getTodayDateStr();
 try {
 const rec = JSON.parse(localStorage.getItem('data4LibUsage') || '{}');
 if (rec.date === today && typeof rec.count === 'number') return rec;
 } catch (e) {}
 return { date: today, count: 0 };
 }

 
function getCustomAuthorPhotos() {
  const obj = safeReadJson('customAuthorPhotos', {});
  return (obj && typeof obj === 'object' && !Array.isArray(obj)) ? obj : {};
}

function getCustomAuthorPhoto(authorName) {
  const key = String(authorName || '').trim().toLowerCase();
  if (!key) return '';
  const map = getCustomAuthorPhotos();
  return typeof map[key] === 'string' ? map[key] : '';
}

function saveCustomAuthorPhoto(authorName, url) {
  const key = String(authorName || '').trim().toLowerCase();
  if (!key) return;
  const map = getCustomAuthorPhotos();
  if (url) map[key] = String(url).trim();
  else delete map[key];
  try { localStorage.setItem('customAuthorPhotos', JSON.stringify(map)); } catch (e) {}
  pushSyncStateToSheet(true);
}

let syncStateDebounceTimer = null;

 function pushSyncStateToSheet(immediate = false) {
 const sendNow = () => {
 const payload = {
 action: 'saveSyncState',
 syncState: {
 ignoredDuplicates: Array.from(getIgnoredDuplicateKeys()),
 recentBooks: safeReadJson('recentBooks', []),
 apiUsage: getApiUsageRecord(),
 fixedTargetLibCodes: getFixedTargetLibCodes(),
 followedAuthors: getFollowedAuthors(),
 dismissedNewReleases: getDismissedNewReleases(),
        authorPhotos: getCustomAuthorPhotos()
 }
 };
 sendSheetPost(payload).catch(() => {});
 };
 if (syncStateDebounceTimer) clearTimeout(syncStateDebounceTimer);
 if (immediate) sendNow();
 else syncStateDebounceTimer = setTimeout(sendNow, 800);
 }

 function applyRemoteSyncState(remoteState) {
 if (!remoteState || typeof remoteState !== 'object') return;
 if (Array.isArray(remoteState.ignoredDuplicates)) {
 try { localStorage.setItem('ignoredDuplicateGroups', JSON.stringify(remoteState.ignoredDuplicates)); } catch (e) {}
 updateDuplicateFilterBadge();
 }
 if (Array.isArray(remoteState.recentBooks)) {
 try { localStorage.setItem('recentBooks', JSON.stringify(remoteState.recentBooks.slice(0, 10))); } catch (e) {}
 }
 if (remoteState.apiUsage && remoteState.apiUsage.date === getTodayDateStr() && typeof remoteState.apiUsage.count === 'number') {
 const localRec = getApiUsageRecord();
 const mergedCount = Math.max(localRec.count || 0, remoteState.apiUsage.count || 0);
 try { localStorage.setItem('data4LibUsage', JSON.stringify({ date: getTodayDateStr(), count: mergedCount })); } catch (e) {}
 renderApiUsagePill();
 }
 if (remoteState.fixedTargetLibCodes && typeof remoteState.fixedTargetLibCodes === 'object') {
 const mergedLibs = { ...getFixedTargetLibCodes(), ...remoteState.fixedTargetLibCodes };
 try { localStorage.setItem('fixedTargetLibCodes', JSON.stringify(mergedLibs)); } catch (e) {}
 }
 if (Array.isArray(remoteState.followedAuthors)) {
  const localFollowed = safeReadJson('followedAuthors', []);
  if (remoteState.followedAuthors.length === 0 && Array.isArray(localFollowed) && localFollowed.length > 0) {
    pushSyncStateToSheet(true);
  } else {
    try { localStorage.setItem('followedAuthors', JSON.stringify(remoteState.followedAuthors)); } catch (e) {}
  }
 }
 if (Array.isArray(remoteState.dismissedNewReleases)) {
  try { localStorage.setItem('dismissedNewReleases', JSON.stringify(remoteState.dismissedNewReleases)); } catch (e) {}
 }
 if (remoteState.authorPhotos && typeof remoteState.authorPhotos === 'object') {
  const merged = { ...getCustomAuthorPhotos(), ...remoteState.authorPhotos };
  try { localStorage.setItem('customAuthorPhotos', JSON.stringify(merged)); } catch (e) {}
 }
 }

 function incrementApiUsage(step = 1) {
 const rec = getApiUsageRecord();
 rec.count += step;
 try { localStorage.setItem('data4LibUsage', JSON.stringify(rec)); } catch (e) {}
 renderApiUsagePill();
 pushSyncStateToSheet(false);
 }

 function renderApiUsagePill() {
 const el = document.getElementById('apiUsagePill');
 if (!el) return;
 const rec = getApiUsageRecord();
 el.innerText = `API ${rec.count}/${DAILY_API_LIMIT}`;
 el.className = 'api-usage-pill' + (rec.count >= 450 ? ' danger' : (rec.count >= 350 ? ' warn' : ''));
 }

 function showApiUsageInfo() {
 const rec = getApiUsageRecord();
 const sCnt = Object.keys(readCacheBucket('d4lCache_search')).length;
 const aCnt = Object.keys(readCacheBucket('d4lCache_author')).length;
 const rCnt = Object.keys(readCacheBucket('d4lCache_rec')).length;
 const lCnt = Object.keys(readCacheBucket('d4lCache_libStatus')).length;
 const cCnt = Object.keys(getBookCoverCache()).length;
 const libCnt = Object.keys(getFixedTargetLibCodes()).length;
 if (confirm(`오늘 정보나루 API 사용: ${rec.count} / ${DAILY_API_LIMIT}회\n저장된 캐시: 검색 ${sCnt}건 · 저자 ${aCnt}명 · 추천 ${rCnt}건 · 대출 ${lCnt}건 · 표지 ${cCnt}개\n고정된 관심 도서관 코드: ${libCnt}/4곳\n\n[확인]을 누르면 캐시된 검색/저자/추천/대출 데이터를 초기화합니다. (취소 시 유지)`)) {
 localStorage.removeItem('d4lCache_search');
 localStorage.removeItem('d4lCache_author');
 localStorage.removeItem('d4lCache_rec');
 localStorage.removeItem('d4lCache_libStatus');
 showToast('검색·저자·추천·대출 캐시를 초기화했습니다.');
 }
 }

 async function data4LibProxyFetch(endpoint, paramsObj = {}, _retried = false) {
 const reqUrl = buildSheetGetUrl({ action: 'd4lProxy', endpoint, ...paramsObj });
 if (!reqUrl) throw new Error('시트 URL이 설정되지 않았습니다.');
 const res = await fetch(reqUrl);
 if (!res.ok) {
 throw new Error(`HTTP ${res.status}`);
 }
 const data = await res.json();
 if (data && data.status === 'unauthorized') {
 if (!_retried) {
 const entered = await openPinPromptModal('도서 검색을 위해 설정된 PIN을 입력해 주세요.');
 if (entered) return data4LibProxyFetch(endpoint, paramsObj, true);
 }
 throw new Error('PIN 인증이 필요합니다.');
 }
 incrementApiUsage(1);
 return data;
 }

 async function fetchD4lDetailCached(isbn13, withLoanInfo = true) {
 const cleanIsbn = normalizeIsbn(isbn13);
 if (cleanIsbn.length < 10) return null;
 const cacheKey = `k2:${cleanIsbn}`;
 const cached = getApiCache('dtl', cacheKey, API_CACHE_TTL_MS);
 if (cached && cached.payload) return cached.payload;
 const res = await lookupBookViaSheetProxy(cleanIsbn, '', '', false);
 const bk = res && res.ok ? res.book : null;
 if (!bk) return null;
 const authorsFull = [bk.author, bk.translator].filter(Boolean).join(' ; ');
 const payload = {
 response: {
 detail: [{
 book: {
 bookname: bk.title || '',
 authors: authorsFull || bk.author || '',
 publisher: bk.publisher || '',
 publication_year: bk.pubYear || '',
 isbn13: bk.isbn || cleanIsbn,
 bookImageURL: bk.cover || '',
 description: bk.description || '',
 url: bk.url || '',
 class_nm: bk.kdc || '',
 vol: bk.vol || '',
 series: bk.series || ''
 }
 }]
 }
 };
 setApiCache('dtl', cacheKey, { hasLoanInfo: false, payload }, 500);
 return payload;
 }

 async function lookupBookViaSheetProxy(isbn, title, author, forceRefresh = false) {
 const cleanIsbn = normalizeIsbn(isbn);
 const cleanTitle = String(title || '').trim();
 const cacheKey = cleanIsbn
 ? `isbn:${cleanIsbn}`
 : `title:${cleanTitle.toLowerCase()}|${String(author || '').trim().toLowerCase()}`;
 if (!cleanIsbn && !cleanTitle) return { ok: true, book: null };

 if (!forceRefresh) {
 const cached = getApiCache('proxyBook', cacheKey, API_CACHE_TTL_MS);
 if (cached !== null) return { ok: true, book: cached.book || null, cached: true };
 }

 const queryParams = { action: 'lookupBook' };
 if (cleanIsbn) queryParams.isbn = cleanIsbn;
 else queryParams.title = cleanTitle;
 if (author) queryParams.author = String(author).trim();
 const reqUrl = buildSheetGetUrl(queryParams);
 if (!reqUrl) return { ok: false, error: '시트 URL이 설정되지 않았습니다.' };

 try {
 const res = await fetch(reqUrl);
 if (!res.ok) return { ok: false, error: `서버 응답 오류 (HTTP ${res.status})` };
 const data = await res.json();
 if (data && data.status === 'unauthorized') {
 return { ok: false, error: 'PIN 인증이 필요합니다. 설정에서 PIN을 확인해 주세요.' };
 }
 if (!data || !('source' in data)) {
 return { ok: false, error: 'Code.gs를 최신 버전으로 재배포해 주세요.' };
 }
 if (data.book) {
 setApiCache('proxyBook', cacheKey, { book: data.book }, 500);
 }
 return { ok: true, book: data.book || null, source: data.source };
 } catch (e) {
 return { ok: false, error: '네트워크 연결 또는 Apps Script 응답 오류입니다.' };
 }
 }

 function readCacheBucket(bucketKey) {
 try {
 return JSON.parse(localStorage.getItem(bucketKey) || '{}');
 } catch (e) {
 return {};
 }
 }

 function writeCacheBucket(bucketKey, bucketObj, maxEntries = 400) {
 const keys = Object.keys(bucketObj);
 if (keys.length > maxEntries) {
 keys.sort((a, b) => (bucketObj[a]?.ts || 0) - (bucketObj[b]?.ts || 0));
 const removeCount = keys.length - maxEntries;
 for (let i = 0; i < removeCount; i++) delete bucketObj[keys[i]];
 }
 try {
 localStorage.setItem(bucketKey, JSON.stringify(bucketObj));
 } catch (e) {
 const sorted = Object.keys(bucketObj).sort((a, b) => (bucketObj[a]?.ts || 0) - (bucketObj[b]?.ts || 0));
 const drop = Math.max(1, Math.floor(sorted.length * 0.35));
 for (let i = 0; i < drop; i++) delete bucketObj[sorted[i]];
 try { localStorage.setItem(bucketKey, JSON.stringify(bucketObj)); } catch (err) {}
 }
 }

 function getApiCache(ns, key, ttlMs = API_CACHE_TTL_MS) {
 const bucket = readCacheBucket(`d4lCache_${ns}`);
 const entry = bucket[key];
 if (!entry || !entry.ts) return null;
 if (Date.now() - entry.ts > ttlMs) return null;
 return entry.data;
 }

 function setApiCache(ns, key, data, maxEntries = 400) {
 const bucket = readCacheBucket(`d4lCache_${ns}`);
 bucket[key] = { ts: Date.now(), data };
 writeCacheBucket(`d4lCache_${ns}`, bucket, maxEntries);
 }

 function compactBookDoc(doc) {
 if (!doc) return null;
 return {
 bookname: doc.bookname || '',
 authors: doc.authors || '',
 publisher: doc.publisher || '',
 publication_year: doc.publication_year || '',
 isbn13: doc.isbn13 || '',
 isbn: doc.isbn || '',
 bookImageURL: doc.bookImageURL || '',
 class_nm: doc.class_nm || '',
 class_no: doc.class_no || '',
 vol: doc.vol || '',
 url: doc.url || '',
 description: doc.description ? String(doc.description).slice(0, 320) : ''
 };
 }

 const DEFAULT_TARGET_LIB_CODES = {
 cheongpa: { libCode: '111120', name: '용산구립 청파도서관', priority: 2, isInterlibrary: true, libKey: 'cheongpa' },
 namsan: { libCode: '111010', name: '서울특별시교육청 남산도서관', priority: 3, isInterlibrary: false, libKey: 'namsan' }
 };

 function getFixedTargetLibCodes() {
 try {
 const stored = JSON.parse(localStorage.getItem('fixedTargetLibCodes') || '{}');
 return { ...DEFAULT_TARGET_LIB_CODES, ...(stored && typeof stored === 'object' ? stored : {}) };
 } catch (e) {
 return { ...DEFAULT_TARGET_LIB_CODES };
 }
 }

 function saveFixedTargetLibCode(libKey, libInfo) {
 if (!libKey || !libInfo?.libCode) return;
 const map = getFixedTargetLibCodes();
 if (map[libKey]?.libCode === libInfo.libCode) return;
 map[libKey] = libInfo;
 try { localStorage.setItem('fixedTargetLibCodes', JSON.stringify(map)); } catch (e) {}
 pushSyncStateToSheet(true);
 }

 let currentBooksList = [];
 let currentSameAuthorBooks = [];
 let sameAuthorPager = { authorName: '', pageNo: 1, numFound: 0, seenTitles: new Set(), currentIsbn: '' };
 let currentRecommendBooks = [];
 let currentSelectedBook = null;
 let activeMemoTarget = null;
 let isEnrichingBookmarks = false;
 let isSearchActive = false;
 let latestSearchSeq = 0;
let lastSearchFromBarcode = false;
 let toastTimer = null;

 // 바코드 스캐너 상태
 let barcodeStream = null;
 let barcodeScanLoopActive = false;
 let barcodeScanTargetMode = 'search'; // 'search' | 'addModal'

 // 내 서재 (전체_도서_리스트) 상태 변수
 let myOwnedBooks = [];
 let myOwnedBooksIndex = { byIsbn: new Map(), byBaseTitle: new Map() };
 let myLibDuplicatesMode = false;
 let myLibReadingStatuses = [];
 let myLibOwnershipFilter = 'all';
 let myLibFormatFilter = 'all';
 let myLibRatingFilter = 'all';
 let myLibSelectedTags = [];
 let myLibSelectedSources = [];
 let myLibVisibleLimit = 40;
 let activeOwnedEditContext = null;
 let selectedOwnedStatus = '';
 let selectedOwnedRating = 0;
 let selectedOwnedIsEbook = false;
 let selectedOwnedIsBorrowed = false;
 let selectedOwnedIsSold = false;
 let selectedOwnedIsReturned = false;
 let currentModalCoverUrl = '';
 let currentModalPubYear = '';
 let currentModalDescription = '';
 let currentModalKdc = '';
 let currentModalVol = '';
 let currentModalLoanStats = '';
 let currentModalKakaoUrl = '';
 let isOwnedPlotExpanded = false;
 let currentModalAuthorBio = '';
 let ownedBookCandidatesList = [];
 let ownedTitleSearchTimer = null;
 let modalAuthorOtherBooksLoadedFor = '';
 let modalAuthorOtherBooksLoadingFor = '';
 let modalAuthorOtherBooksList = [];
 let currentRandomPick = null;
 let currentRandomPicks = [];
 let isHomeBorrowedExpanded = false;
 let lastStartReadingUndo = null;
 let lastSkippedDupUndo = null;
 let isViewingSkippedDuplicates = false;
 let ownedEditTagsList = [];
 let lastAutoFillQueryKey = '';

 function getUnifiedApiUrl() {
 const custom = (localStorage.getItem('unifiedSheetApiUrl') || '').trim();
 if (custom === "https://script.google.com/macros/s/AKfycbx2Nfma38CUR4djvg9LaIJaLexkzitNcpJyC76DaglRUnhT_nob8gZMS3I1-0psMKnqmA/exec") {
 localStorage.removeItem('unifiedSheetApiUrl');
 return SHEET_API_URL;
 }
 return custom || SHEET_API_URL;
 }

 function getSheetWritePin() {
 return (localStorage.getItem('sheetWritePin') || '').trim();
 }

 const LIB_STATUS_CACHE_TTL_MS = 60 * 60 * 1000; // 도서관 대출 캐시 1시간 TTL

 function getSavedLibraryStatus(isbn) {
 const key = normalizeIsbn(isbn);
 if (!key) return null;
 const bucket = readCacheBucket('d4lCache_libStatus');
 const entry = bucket[key];
 if (!entry || !Array.isArray(entry.results) || !entry.ts) return null;
 if (Date.now() - entry.ts > LIB_STATUS_CACHE_TTL_MS) return null;
 return entry;
 }

 function saveLibraryStatusToStorage(isbn, results, remainingKeys = [], matchedMeta = null) {
 const key = normalizeIsbn(isbn);
 if (!key) return;
 const bucket = readCacheBucket('d4lCache_libStatus');
 bucket[key] = {
 ts: Date.now(),
 results: Array.isArray(results) ? results : [],
 remainingKeys: Array.isArray(remainingKeys) ? remainingKeys : [],
 matchedMeta: matchedMeta || null
 };
 writeCacheBucket('d4lCache_libStatus', bucket, 300);
 }

 function formatShortTimestamp(ts) {
 if (!ts) return '';
 const d = new Date(ts);
 const m = String(d.getMonth() + 1).padStart(2, '0');
 const day = String(d.getDate()).padStart(2, '0');
 const hh = String(d.getHours()).padStart(2, '0');
 const mm = String(d.getMinutes()).padStart(2, '0');
 return `${m}/${day} ${hh}:${mm}`;
 }

 function getTodayDateStr() {
 const now = new Date();
 const y = now.getFullYear();
 const m = String(now.getMonth() + 1).padStart(2, '0');
 const d = String(now.getDate()).padStart(2, '0');
 return `${y}-${m}-${d}`;
 }

 function setStartDateToday() {
 document.getElementById('ownedInputStartDate').value = getTodayDateStr();
 }

 function setFinishDateToday() {
 document.getElementById('ownedInputFinishDate').value = getTodayDateStr();
 updateDueDateFieldVisibility();
 }

 function setDueDatePlus7Days() {
 const inputEl = document.getElementById('ownedInputDueDate');
 const raw = String(inputEl?.value || '').trim();
 let d = new Date();
 if (/^\d{4}-\d{2}-\d{2}$/.test(raw)) {
 const [yy, mm, dd] = raw.split('-').map(Number);
 d = new Date(yy, mm - 1, dd);
 }
 d.setDate(d.getDate() + 7);
 const y = d.getFullYear();
 const m = String(d.getMonth() + 1).padStart(2, '0');
 const day = String(d.getDate()).padStart(2, '0');
 inputEl.value = `${y}-${m}-${day}`;
 }

 function getBookAuthorBioCache() {
 try { return JSON.parse(localStorage.getItem('bookAuthorBioCache')) || {}; } catch (e) { return {}; }
 }

 function saveBookAuthorBioCache(key, bio) {
 const k = String(key || '').trim();
 const v = String(bio || '').trim();
 if (!k || !v) return;
 const cache = getBookAuthorBioCache();
 cache[k] = v.slice(0, 1200);
 const keys = Object.keys(cache);
 if (keys.length > 500) delete cache[keys[0]];
 try { localStorage.setItem('bookAuthorBioCache', JSON.stringify(cache)); } catch (e) {}
 }

 function getBookCoverCache() {
 try { return JSON.parse(localStorage.getItem('bookCoverCache')) || {}; } catch (e) { return {}; }
 }

 function saveBookCoverCache(key, url) {
 const k = String(key || '').trim();
 const u = String(url || '').trim();
 if (!k || !u || isPlaceholderCoverUrl(u) || u.startsWith('data:image/')) return;
 const cache = getBookCoverCache();
 cache[k] = normalizeCoverUrl(u);
 const keys = Object.keys(cache);
 if (keys.length > 800) {
 delete cache[keys[0]];
 }
 localStorage.setItem('bookCoverCache', JSON.stringify(cache));
 }

 function formatReadingPeriod(startDate, finishDate) {
 const s = String(startDate || '').trim();
 const f = String(finishDate || '').trim();
 if (s && f) return `${s} ~ ${f}`;
 if (f) return f;
 if (s) return `${s} ~`;
 return '';
 }



 function inferSeriesNameFromDoc(doc) {
 if (!doc) return '';
 const title = String(doc.bookname || '');
 const pub = String(doc.publisher || '');
 const vol = String(doc.vol || '').trim();

 // 1) 내 서재 기존 시리즈명과 출판사/제목 패턴 매칭
 if (/들려주는\s+.+이야기/.test(title) && pub.includes('자음과모음')) {
 return vol ? `철학자가 들려주는 철학 이야기 ${vol}` : '철학자가 들려주는 철학 이야기';
 }
 if (pub.includes('펭귄클래식')) {
 return vol ? `펭귄클래식 시리즈 ${vol}` : '펭귄클래식 시리즈';
 }
 if (pub.includes('더클래식')) {
 return '더클래식 세계문학';
 }

 // 2) 제목 속 괄호/콜론 시리즈 패턴 (예: '민음사 세계문학전집 12', '... 시리즈 3')
 const m = title.match(/([가-힣A-Za-z0-9\s]{2,20}(?:시리즈|전집|문고|컬렉션|클래식)(?:\s*\d{1,3})?)/);
 if (m && m[1]) return m[1].trim();

 // 3) 기존 내 서재 시리즈 그룹명과 출판사/제목이 겹치면 활용
 const existingGroups = new Set();
 myOwnedBooks.forEach(b => {
 const g = extractSeriesGroupName(getOwnedSeries(b));
 if (g && g.length >= 3) existingGroups.add(g);
 });
 for (const grp of existingGroups) {
 if (title.includes(grp)) return vol ? `${grp} ${vol}` : grp;
 }
 return '';
 }

 function escapeHtml(str) {
 return String(str || '')
 .replace(/&/g, '&amp;')
 .replace(/</g, '&lt;')
 .replace(/>/g, '&gt;')
 .replace(/"/g, '&quot;')
 .replace(/'/g, '&#39;');
 }

 
 function isPlaceholderCoverUrl(url) {
 const s = String(url || '').trim();
 return !s || s === NO_COVER_SVG || s.startsWith('data:image/svg+xml') || s.includes('via.placeholder.com');
 }

 function normalizeCoverUrl(url) {
 const s = String(url || '').trim();
 if (isPlaceholderCoverUrl(s)) return NO_COVER_SVG;
 return s.startsWith('http://') ? 'https://' + s.slice(7) : s;
 }

 function formatAuthorText(author) {
 const cleaned = String(author || '').replace(/^\s*(지은이|저자)\s*[:：]\s*/i, '').trim();
 return cleaned || '저자 미상';
 }

 function formatAutoTranslatorText(raw) {
 let s = String(raw || '').trim();
 if (!s) return '';
 s = s
 .replace(/\s*\(옮긴이\)/g, ' 옮김')
 .replace(/\s*\(감수자?\)/g, ' 감수')
 .replace(/\s*\(엮은이\)/g, ' 엮음')
 .replace(/\s*\(편집자?\)/g, ' 편집')
 .replace(/,\s*/g, ', ')
 .replace(/\s+/g, ' ')
 .trim();
 if (!/(?:옮김|감수|편집|엮음|그림|기획|해설)$/.test(s)) {
 s += ' 옮김';
 }
 return s;
 }

 function formatAuthorWithSuffix(author) {
 const s = String(author || '').trim();
 if (!s) return '저자 미상';
 if (/(?:^|\s)(지음|저자\s*미상|글·그림|글그림|글|그림|엮음|편저|감수|옮김)$/.test(s)) return s;
 return `${s} 지음`;
 }

 function formatPubYearText(pubYear) {
 const cleaned = String(pubYear || '').trim();
 if (!cleaned) return '출간일 미상';
 return cleaned.endsWith('년') ? cleaned : `${cleaned}년`;
 }

 /* =========================================================
 * 평점 · 독서 상태 · 전자책 제목 표기 헬퍼
 * ========================================================= */
 function parseRating(val) {
 const raw = String(val || '').trim();
 if (!raw) return 0;
 const num = Number(raw);
 if (!Number.isNaN(num) && num > 0) return Math.min(5, Math.max(0, Math.round(num)));
 const marks = (raw.match(/[★♥❤]/g) || []).length;
 return Math.min(5, Math.max(0, marks));
 }

 function formatStarRating(num) {
 const n = Math.min(5, Math.max(0, Math.round(Number(num) || 0)));
 if (n <= 0) return '';
 return '♥'.repeat(n) + '♡'.repeat(5 - n);
 }

 function formatRatingShort(val) {
 const n = parseRating(val);
 return n > 0 ? '♥'.repeat(n) : '';
 }

 function normalizeReadingStatus(raw) {
 const s = String(raw || '').trim();
 if (s === '읽기 전' || s === '읽을 예정') return '예정';
 return s;
 }

 function getCoverStatusBorderCls(book) {
 if (!book) return '';
 const st = normalizeReadingStatus(book.status);
 if (st === '예정') return 'cover-status-planned';
 if (st === '읽는 중') return 'cover-status-reading';
 if (st === '완독') return 'cover-status-done';
 return '';
 }

 function getDueDaysDiff(dueStr) {
 const due = String(dueStr || '').trim();
 if (!due || !/^\d{4}-\d{2}-\d{2}$/.test(due)) return null;
 const today = new Date();
 today.setHours(0, 0, 0, 0);
 const [y, m, d] = due.split('-').map(Number);
 const target = new Date(y, m - 1, d);
 return Math.round((target - today) / (1000 * 60 * 60 * 24));
 }

 function getCoverOwnershipObiHtml(book) {
 if (!book) return '';
 if (isOwnedSold(book)) return '<div class="cover-own-obi red-tag">판매</div>';
 if (isOwnedReturned(book)) return '<div class="cover-own-obi red-tag">반납</div>';
 if (isOwnedBorrowed(book)) {
 const diffDays = getDueDaysDiff(book.dueDate);
 if (diffDays !== null && diffDays < 180) {
 const cls = diffDays <= 3 ? 'due-urgent' : 'due-tag';
 const label = diffDays < 0 ? `D+${Math.abs(diffDays)}` : (diffDays === 0 ? '오늘반납' : `D-${diffDays}`);
 return `<div class="cover-own-obi ${cls}">${label}</div>`;
 }
 }
 return '';
 }

 function getCoverDoneStampHtml(book) {
 if (!book) return '';
 const st = normalizeReadingStatus(book.status);
 if (st === '완독') return '<div class="cover-done-stamp" aria-label="완독"></div>';
 if (st === '중단' || st === '중지') return '<div class="cover-stop-stamp" aria-label="중단"></div>';
 return '';
 }

 function getCoverFormatDotHtml(book) { return ''; }

 function updateOwnedModalCoverVisuals() {
 const colEl = document.getElementById('ownedCoverCol');
 const st = normalizeReadingStatus(selectedOwnedStatus);
 if (colEl) {
 colEl.classList.remove('cover-status-planned', 'cover-status-reading', 'cover-status-done', 'cover-status-stop');
 if (st === '예정') colEl.classList.add('cover-status-planned');
 else if (st === '읽는 중') colEl.classList.add('cover-status-reading');
 else if (st === '완독') colEl.classList.add('cover-status-done');
 }
 const stampEl = document.getElementById('ownedCoverDoneStamp');
 if (stampEl) stampEl.classList.toggle('hidden', st !== '완독');
 const stopStampEl = document.getElementById('ownedCoverStopStamp');
 if (stopStampEl) stopStampEl.classList.toggle('hidden', st !== '중단' && st !== '중지');

 const obiEl = document.getElementById('ownedCoverOwnObi');
 if (obiEl) {
 if (selectedOwnedIsSold) {
 obiEl.className = 'cover-own-obi red-tag';
 obiEl.textContent = '판매';
 } else if (selectedOwnedIsReturned) {
 obiEl.className = 'cover-own-obi red-tag';
 obiEl.textContent = '반납';
 } else if (selectedOwnedIsBorrowed) {
 const dueVal = document.getElementById('ownedInputDueDate')?.value || '';
 const diffDays = getDueDaysDiff(dueVal);
 if (diffDays !== null && diffDays < 180) {
 obiEl.className = 'cover-own-obi ' + (diffDays <= 3 ? 'due-urgent' : 'due-tag');
 obiEl.textContent = diffDays < 0 ? `D+${Math.abs(diffDays)}` : (diffDays === 0 ? '오늘반납' : `D-${diffDays}`);
 } else {
 obiEl.className = 'cover-own-obi hidden';
 obiEl.textContent = '';
 }
 } else {
 obiEl.className = 'cover-own-obi hidden';
 obiEl.textContent = '';
 }
 }
 }

 function getOwnedSeries(b) {
 return String(b?.series || b?.note || '').trim();
 }

 function getOwnedMemo(b) {
 return String(b?.memo || '').trim();
 }

 function getTranslatorSupervisorInfo(b) {
 const tr = String(b?.translator || '').trim();
 if (tr) return tr;
 const memo = getOwnedMemo(b);
 if (!memo) return '';
 if (/(옮긴이|옮김|역자|편역|공역|감수자|감수|엮은이|엮음)/.test(memo)) {
 return memo;
 }
 return '';
 }

 function formatVolHash(vol) {
 const v = String(vol || '').replace(/^[#\s]+/, '').replace(/(권|호)$/, '').trim();
 return v ? `#${v}` : '';
 }

 function formatSeriesBadgeText(b) {
 const s = getOwnedSeries(b);
 const vHash = formatVolHash(b?.vol);
 if (!s && !vHash) return '';
 if (s && !vHash) return s;
 if (!s && vHash) return vHash;
 const rawV = vHash.slice(1);
 if (s.endsWith(vHash) || s.endsWith(` ${rawV}`) || s.endsWith(`${rawV}권`)) return s;
 return `${s} ${vHash}`;
 }

 function extractSeriesGroupName(seriesStr) {
 return String(seriesStr || '').trim().replace(/\s+\d+(?:\s*권|\s*호)?$/, '').trim();
 }

 function getOwnedEbookFlags() {
 try {
 return JSON.parse(localStorage.getItem('ownedEbookFlags') || '{}');
 } catch (e) {
 return {};
 }
 }

 function getOwnedBookStorageKey(book) {
 const isbn = normalizeIsbn(book?.isbn);
 if (isbn) return `isbn:${isbn}`;
 const normTitle = normalizeBookTitle(book?.title);
 return normTitle ? `title:${normTitle}` : '';
 }

 function setOwnedEbookFlag(book, isEbook) {
 const key = getOwnedBookStorageKey(book);
 if (!key) return;
 const flags = getOwnedEbookFlags();
 flags[key] = !!isEbook;
 try { localStorage.setItem('ownedEbookFlags', JSON.stringify(flags)); } catch (e) {}
 }

 function isEbookTagToken(tag) {
 const low = String(tag || '').replace(/^#+/, '').trim().toLowerCase();
 return low === '전자책' || low === 'ebook' || low === 'e-book';
 }

 function isOwnedEbook(ownedBook) {
 if (!ownedBook) return false;
 if (typeof ownedBook.isEbook === 'boolean') return ownedBook.isEbook;
 const rawFlag = String(ownedBook.isEbook || ownedBook.format || '').trim().toLowerCase();
 if (rawFlag === 'true' || rawFlag === 'y' || rawFlag === '전자책' || rawFlag === 'ebook') return true;
 if (rawFlag === 'false' || rawFlag === 'n' || rawFlag === '종이책') return false;

 const key = getOwnedBookStorageKey(ownedBook);
 if (key) {
 const flags = getOwnedEbookFlags();
 if (typeof flags[key] === 'boolean') return flags[key];
 }

 const combined = `${ownedBook?.tags || ''} ${getOwnedSeries(ownedBook)} ${getOwnedMemo(ownedBook)} ${ownedBook?.title || ''}`.toLowerCase();
 return combined.includes('전자책') || combined.includes('ebook') || combined.includes('e-book');
 }

 function getOwnedBorrowFlags() {
 try { return JSON.parse(localStorage.getItem('ownedBorrowFlags') || '{}'); } catch (e) { return {}; }
 }

 function setOwnedBorrowFlag(book, isBorrowed) {
 const key = getOwnedBookStorageKey(book);
 if (!key) return;
 const flags = getOwnedBorrowFlags();
 flags[key] = !!isBorrowed;
 try { localStorage.setItem('ownedBorrowFlags', JSON.stringify(flags)); } catch (e) {}
 }

 function isOwnedBorrowed(ownedBook) {
 if (!ownedBook) return false;
 if (typeof ownedBook.isBorrowed === 'boolean') return ownedBook.isBorrowed;
 const raw = String(ownedBook.isBorrowed || '').trim().toLowerCase();
 if (raw === 'true' || raw === 'y' || raw === '대여' || raw === '1') return true;
 if (raw === 'false' || raw === 'n' || raw === '소장' || raw === '0') return false;
 const key = getOwnedBookStorageKey(ownedBook);
 if (key) {
 const flags = getOwnedBorrowFlags();
 if (typeof flags[key] === 'boolean') return flags[key];
 }
 return false;
 }

 function isOwnedSold(ownedBook) {
 if (!ownedBook) return false;
 if (typeof ownedBook.isSold === 'boolean') return ownedBook.isSold;
 const raw = String(ownedBook.isSold || '').trim().toLowerCase();
 return raw === '판매' || raw === 'sold' || raw === 'true';
 }

 function isOwnedReturned(ownedBook) {
 if (!ownedBook) return false;
 if (typeof ownedBook.isReturned === 'boolean') return ownedBook.isReturned;
 const raw = String(ownedBook.isReturned || '').trim().toLowerCase();
 return raw === '반납' || raw === 'returned' || raw === 'true';
 }

 function getLibraryLogoSrc(sourceName) {
 const s = String(sourceName || '').trim();
 if (!s) return '';
 if (s.includes('꿈나무')) return EMBEDDED_ICONS.yongsan_ggumnamu;
 if (s.includes('청파')) return EMBEDDED_ICONS.chungpa;
 if (s.includes('용산')) return EMBEDDED_ICONS.yongsan;
 if (s.includes('마포')) return EMBEDDED_ICONS.mapo;
 if (s.includes('남산')) return EMBEDDED_ICONS.namsan;
 if (s.includes('교육청')) return EMBEDDED_ICONS.seoul_edu;
 if (s.includes('이화')) return EMBEDDED_ICONS.ewha;
 if (s.includes('통합전자책')) return EMBEDDED_ICONS.seoulebook;
 if (s.includes('서울도서관') || s.includes('서울시')) return EMBEDDED_ICONS.seoul_lib;
 if (s.includes('송파')) return EMBEDDED_ICONS.songpa;
 if (s.includes('영등포')) return EMBEDDED_ICONS.yeongdeungpo;
 if (s.includes('강동') && s.includes('B')) return EMBEDDED_ICONS.gangdong_b;
 if (s.includes('강동')) return EMBEDDED_ICONS.gangdong_a;
 if (s.includes('중랑')) return EMBEDDED_ICONS.jungnang;
 if (s.includes('동대문')) return EMBEDDED_ICONS.dongdaemun;
 if (s.includes('성북')) return EMBEDDED_ICONS.seongbuk;
 if (s.includes('관악')) return EMBEDDED_ICONS.gwanak;
 if (s.includes('노원')) return EMBEDDED_ICONS.nowon;
 if (s.includes('도봉')) return EMBEDDED_ICONS.dobong;
 if (s.includes('강서')) return EMBEDDED_ICONS.gangseo;
 if (s.includes('종로')) return EMBEDDED_ICONS.jongno;
 if (s.includes('동작')) return EMBEDDED_ICONS.dongjak;
 if (s.includes('금천')) return EMBEDDED_ICONS.geumcheon;
 if (s.includes('구로')) return EMBEDDED_ICONS.guro;
 if (s.includes('중구')) return EMBEDDED_ICONS.junggu;
 if (s.includes('양천')) return EMBEDDED_ICONS.yangcheon;
 if (s.includes('강북')) return EMBEDDED_ICONS.gangbuk;
 if (s.includes('밀리')) return EMBEDDED_ICONS.millie;
 if (s.includes('알라딘') && s.includes('도서관')) return EMBEDDED_ICONS.aladinelib;
 if (s.includes('알라딘') && /e-?book/i.test(s)) return EMBEDDED_ICONS.aladinebook;
 if (s.includes('알라딘') && s.includes('중고')) return EMBEDDED_ICONS.aladin_used;
 if (s.includes('알라딘')) return EMBEDDED_ICONS.aladin;
 if (s.includes('리디')) return EMBEDDED_ICONS.ridibooks;
 if (s.includes('이씨오') || s.toLowerCase().includes('eco')) return EMBEDDED_ICONS.eco_library;
 if (s.includes('교보') && s.includes('도서관')) return EMBEDDED_ICONS.kyoboelib;
 if (s.includes('교보') && /e-?book/i.test(s)) return EMBEDDED_ICONS.kyoboebook;
 if (s.includes('교보')) return EMBEDDED_ICONS.kyobo;
 if (s.includes('예스24') || s.toLowerCase().includes('yes24')) return EMBEDDED_ICONS.yes24elib;
 if (s.includes('북큐브')) return EMBEDDED_ICONS.bookcube;
 if (s.includes('부커스')) return EMBEDDED_ICONS.bookers;
 if (s.includes('북이오')) return EMBEDDED_ICONS.bookio;
 if (s.includes('에피루스')) return EMBEDDED_ICONS.epyrus;
 if (s.includes('플레이북') || s.includes('구글')) return EMBEDDED_ICONS.googleplaybook;
 return '';
 }

 function normalizeSourceLabel(raw) {
 let s = String(raw || '').trim();
 if (!s) return '';
 s = s.replace(/\([^)]*\)/g, '');
 s = s.replace(/\s+/g, '');
 s = s.replace(/마포평생학습관?아현분관|마포평생아현분관/g, '마포아현분관');
 s = s.replace(/e-?book/gi, 'e-book');
 return s;
 }

 function getOwnedSource(b) {
 return normalizeSourceLabel(b?.source || b?.borrowSource || '');
 }

 function getDueDateBadgeHtml(book) {
 if (!book || !isOwnedBorrowed(book)) return '';
 if (isOwnedEbook(book) && !getOwnedSource(book).includes('알라딘')) return '';
 if (String(book.finishDate || '').trim()) return '';
 const st = normalizeReadingStatus(book.status);
 if (st === '완독' || st === '중단') return '';
 const due = String(book.dueDate || '').trim();
 if (!due || !/^\d{4}-\d{2}-\d{2}$/.test(due)) return '';
 const today = new Date();
 today.setHours(0, 0, 0, 0);
 const [y, m, d] = due.split('-').map(Number);
 const target = new Date(y, m - 1, d);
 const diffDays = Math.round((target - today) / (1000 * 60 * 60 * 24));
 if (diffDays < 0) return `<span class="mylib-badge due-soon">반납 D+${Math.abs(diffDays)}</span>`;
 if (diffDays === 0) return `<span class="mylib-badge due-soon">오늘 반납</span>`;
 if (diffDays <= 3) return `<span class="mylib-badge due-soon">반납 D-${diffDays}</span>`;
 return `<span class="mylib-badge due-normal">반납 D-${diffDays}</span>`;
 }

 function formatOwnedTitle(ownedBook) {
 return String(ownedBook?.title || '').replace(/\s*\(전자책\)\s*/gi, ' ').replace(/\s+/g, ' ').trim();
 }

 function extractTagsFromDoc(doc) {
 if (!doc) return [];
 const tags = [];
 const pushTag = (t) => {
 const clean = String(t || '').trim();
 if (clean && !isEbookTagToken(clean) && !tags.includes(clean)) tags.push(clean);
 };

 let classNm = String(doc.class_nm || '').trim();
 let classNo = String(doc.class_no || '').trim();
 const kdcRaw = String(doc.kdcRaw || doc.kdc || '').trim();
 if (!classNo && kdcRaw) {
 const mNo = kdcRaw.match(/(?:KDC\s*)?([0-9]+(?:\.[0-9]+)?)/i);
 if (mNo) classNo = mNo[1];
 }
 if (!classNm && kdcRaw) {
 const stripped = kdcRaw.replace(/^(?:KDC\s*)?[0-9]+(?:\.[0-9]+)?\s*(?:[·•:|\-/]\s*)?/i, '').trim();
 if (stripped) classNm = stripped;
 }
 const parts = classNm ? classNm.split(/[>/·]/).map(s => s.trim()).filter(Boolean) : [];
 const top = parts[0] || '';
 const sub = parts[1] || '';

 if (top.includes('철학') || classNo.startsWith('1')) {
 pushTag('인문학');
 pushTag('철학');
 if (sub.includes('심리')) pushTag('심리학');
 } else if (top.includes('종교') || classNo.startsWith('2')) {
 pushTag('인문학');
 pushTag('종교');
 } else if (top.includes('사회과학') || classNo.startsWith('3')) {
 pushTag('사회과학');
 if (sub.includes('경제')) pushTag('경제');
 else if (sub.includes('정치')) pushTag('정치');
 else if (sub.includes('사회')) pushTag('사회학');
 else if (sub.includes('교육')) pushTag('교육');
 else if (sub.includes('법')) pushTag('법학');
 } else if (top.includes('자연과학') || classNo.startsWith('4')) {
 pushTag('과학');
 if (sub && !sub.includes('자연과학') && sub.length <= 8) pushTag(sub);
 } else if (top.includes('기술과학') || classNo.startsWith('5')) {
 pushTag('과학');
 pushTag('기술과학');
 } else if (top.includes('예술') || classNo.startsWith('6')) {
 pushTag('예술');
 if (sub && sub.length <= 8) pushTag(sub);
 } else if (top.includes('언어') || classNo.startsWith('7')) {
 pushTag('인문학');
 pushTag('언어');
 } else if (top.includes('문학') || classNo.startsWith('8')) {
 pushTag('문학');
 if (sub.includes('한국')) pushTag('한국문학');
 else if (sub.includes('일본')) pushTag('일본문학');
 else if (sub.includes('영미') || sub.includes('독일') || sub.includes('프랑스') || sub.includes('스페인') || sub.includes('이탈리아') || sub.includes('러시아') || sub.includes('서양')) {
 pushTag('서양문학');
 } else if (sub.includes('중국')) pushTag('중국문학');
 if (classNm.includes('수필') || classNm.includes('에세이')) pushTag('에세이');
 } else if (top.includes('역사') || classNo.startsWith('9')) {
 pushTag('인문학');
 pushTag('역사');
 } else if (top.includes('총류') || classNo.startsWith('0')) {
 pushTag('인문학');
 }

 // KDC 분류 정보가 없을 때 제목·줄거리·출판사 키워드로 보조 태그 추론
 if (tags.length === 0) {
 const text = `${doc.bookname || doc.title || ''} ${doc.description || ''} ${doc.publisher || ''}`.toLowerCase();
 const rules = [
 { re: /(장편소설|단편소설|연작소설|소설집|추리소설|미스터리|스릴러|판타지|sf\b|과학소설|시집|문학상|작품집)/i, add: ['문학'] },
 { re: /(에세이|산문집|수필|일기|회고록|자서전)/i, add: ['에세이'] },
 { re: /(물리학|양자역학|상대성이론|천문학|우주론|블랙홀|생물학|진화론|유전자|뇌과학|화학|수학|과학자|과학책)/i, add: ['과학'] },
 { re: /(철학|윤리학|인문학|사상사|미학|논리학|고전)/i, add: ['인문학', '철학'] },
 { re: /(역사|세계사|한국사|근현대사|문명사|제국|전쟁사)/i, add: ['인문학', '역사'] },
 { re: /(심리학|정신분석|트라우마|인지심리|상담)/i, add: ['인문학', '심리학'] },
 { re: /(사회학|정치|경제학|자본주의|민주주의|페미니즘|젠더|여성학|불평등|노동|법학|사회과학)/i, add: ['사회과학'] },
 { re: /(미술|예술|음악|영화|건축|디자인|사진집)/i, add: ['예술'] },
 { re: /(자기계발|습관|공부법|시간관리|생산성)/i, add: ['자기계발'] }
 ];
 rules.forEach(rule => {
 if (rule.re.test(text)) rule.add.forEach(pushTag);
 });
 if (tags.includes('문학')) {
 if (/(일본|나오키|아쿠타가와|무라카미|히가시노|도쿄)/.test(text)) pushTag('일본문학');
 else if (/(한국|창비|문학과지성사|이상문학상|현대문학)/.test(text)) pushTag('한국문학');
 if (/(sf\b|공상과학|우주|로봇|디스토피아)/i.test(text)) pushTag('SF');
 else if (/(추리|미스터리|살인|탐정|스릴러)/.test(text)) pushTag('추리·미스터리');
 }
 }

 return tags.slice(0, 4);
 }

 /* =========================================================
 * 내 서재(전체_도서_리스트) 정규화 · 매칭 · 인물 역할 분석
 * ========================================================= */
 function normalizeIsbn(isbn) {
 return String(isbn || '').replace(/[^0-9Xx]/g, '').toUpperCase();
 }

 function normalizeBookTitle(title) {
 let s = String(title || '').toLowerCase().trim();
 s = s.replace(/^\d{1,3}\s+(?=\D)/, '');
 s = s.split(/\s*=\s*|[:：]|\s+[-–—―]\s+/)[0];
 s = s.replace(/\([^)]*\)|\[[^\]]*\]|【[^】]*】|〈[^〉]*〉|《[^》]*》/g, '');
 return s.replace(/[\s·・.,!?'"~()\[\]{}\-_/:;：–—―]+/g, '');
 }

 function extractMainTitleForSearch(raw) {
 let s = String(raw || '').trim();
 if (!s) return '';
 s = s.split(/\s*=\s*|\s*\/\s*|\s*[:：]\s*|\s+[-–—―]\s+/)[0].trim();
 s = s.replace(/\([^)]*\)|\[[^\]]*\]|【[^】]*】/g, '').trim();
 return s || String(raw || '').trim();
 }

 function detectRoleFromSegment(seg) {
 const s = String(seg || '');
 if (/(해설자|해설)/.test(s)) return '해설';
 if (/(감수자|감수)/.test(s)) return '감수';
 if (/(옮긴이|옮김|편역|공역|역자|\b역\b|역\s*$)/.test(s)) return '옮긴이';
 if (/(엮은이|엮음|편저|편집|엮어)/.test(s)) return '엮은이';
 if (/(지은이|저자|지음|글·그림|글그림|원작|공저|그림|글)/.test(s)) return '저자';
 return '';
 }

 function extractPersonRoleEntries(text, defaultRole = '저자') {
 const raw = String(text || '').trim();
 if (!raw) return [];

 const entries = [];
 const seen = new Set();

 // 세미콜론 기준 역할 그룹 분리 (예: "지은이: 에드 용 ;옮긴이: 양병찬", "대니얼 데닛 지음 ;노승영 옮김")
 const segments = raw.split(/[;；]+/);
 segments.forEach(seg => {
 const segRole = detectRoleFromSegment(seg) || defaultRole;
 // 쉼표/슬래시로 개별 인물 분리
 const parts = seg.split(/[,/·&|]+/);
 parts.forEach(part => {
 const partRole = detectRoleFromSegment(part) || segRole;
 const cleanedDisplay = part
 .replace(/(지은이|저자|글·그림|글그림|원작|엮은이|엮음|편저|편집|해설자|해설|감수자|감수|옮긴이|옮김|편역|공역|역자|지음|공저|그림|글|역)\s*[:：]?/gi, ' ')
 .replace(/\([^)]*\)|\[[^\]]*\]|【[^】]*】|〈[^〉]*〉|《[^》]*》/g, ' ')
 .replace(/\s+/g, ' ')
 .replace(/\s*외$/g, '')
 .trim();

 const cleanKey = cleanedDisplay.toLowerCase().replace(/\s+/g, '');
 if (cleanKey.length >= 2 && !/^\d+$/.test(cleanKey) && !seen.has(`${cleanKey}|${partRole}`)) {
 seen.add(`${cleanKey}|${partRole}`);
 entries.push({ name: cleanedDisplay, clean: cleanKey, role: partRole });
 }
 });
 });

 return entries;
 }

 function splitAuthorAndTranslator(authorsRaw) {
 const entries = extractPersonRoleEntries(authorsRaw, '저자');
 if (entries.length === 0) {
 return { author: formatAuthorText(authorsRaw), translator: '' };
 }
 const authorNames = [];
 const roleGroups = new Map();
 const roleSuffix = { '옮긴이': '옮김', '감수': '감수', '엮은이': '엮음', '해설': '해설' };

 entries.forEach(e => {
 if (e.role === '저자') {
 if (!authorNames.includes(e.name)) authorNames.push(e.name);
 } else {
 if (!roleGroups.has(e.role)) roleGroups.set(e.role, []);
 const arr = roleGroups.get(e.role);
 if (!arr.includes(e.name)) arr.push(e.name);
 }
 });

 const translatorParts = [];
 roleGroups.forEach((names, role) => {
 const suffix = roleSuffix[role] || role;
 translatorParts.push(`${names.join(', ')} ${suffix}`);
 });

 return {
 author: authorNames.length > 0 ? authorNames.join(', ') : formatAuthorText(authorsRaw),
 translator: translatorParts.join(' · ')
 };
 }

 function personKeysMatch(a, b) {
 if (!a || !b) return false;
 if (a === b) return true;
 if (a.length >= 3 && b.length >= 3 && (a.includes(b) || b.includes(a))) return true;
 return false;
 }

 function hasAuthorOverlap(authorA, authorB) {
 const aEntries = extractPersonRoleEntries(authorA, '저자');
 const bEntries = extractPersonRoleEntries(authorB, '저자');
 if (!aEntries.length || !bEntries.length) return false;
 return aEntries.some(a => bEntries.some(b => personKeysMatch(a.clean, b.clean)));
 }

 // 선택 도서의 저자 · 옮긴이 · 감수 · 엮은이 모두가 참여한 다른 보유 도서 찾기
 function findOtherOwnedBooksByAuthor(apiBook) {
 if (!apiBook || myOwnedBooks.length === 0) return [];
 const authorStr = apiBook.authors || apiBook.author || '';
 const selectedPeople = extractPersonRoleEntries(authorStr, '저자');
 if (selectedPeople.length === 0) return [];

 const matched = findOwnedMatch(apiBook);
 const excludeRow = matched ? matched.owned.row : null;
 const selectedNormTitle = normalizeBookTitle(apiBook.bookname || apiBook.title);

 const rolePriority = { '저자': 1, '엮은이': 2, '옮긴이': 3, '감수': 4, '참여': 5 };
 const results = [];

 myOwnedBooks.forEach(b => {
 if (excludeRow !== null && b.row === excludeRow) return;
 if (selectedNormTitle && normalizeBookTitle(b.title) === selectedNormTitle) return;

 const ownedAuthorPeople = extractPersonRoleEntries(b.author, '저자');
 const transStr = String(b.translator || '').trim();
 const ownedTransPeople = transStr ? extractPersonRoleEntries(transStr, detectRoleFromSegment(transStr) || '옮긴이') : [];
 const memoAndSeries = `${getOwnedMemo(b)} ; ${getOwnedSeries(b)}`;
 const ownedNotePeople = extractPersonRoleEntries(memoAndSeries, detectRoleFromSegment(memoAndSeries) || '참여');
 const ownedAllPeople = [...ownedAuthorPeople, ...ownedTransPeople, ...ownedNotePeople];

 let bestMatch = null;
 for (const sp of selectedPeople) {
 for (const op of ownedAllPeople) {
 if (personKeysMatch(sp.clean, op.clean)) {
 const resolvedRole = (op.role && op.role !== '저자') ? op.role : (sp.role || op.role || '저자');
 const prio = rolePriority[resolvedRole] || 5;
 if (!bestMatch || prio < bestMatch.priority) {
 bestMatch = {
 book: b,
 role: resolvedRole,
 personName: sp.name,
 priority: prio
 };
 }
 }
 }
 }

 if (bestMatch) {
 results.push(bestMatch);
 }
 });

 results.sort((a, b) => a.priority - b.priority || String(a.book.title || '').localeCompare(String(b.book.title || ''), 'ko'));
 return results;
 }

 function getOwnedPriorityRank(book) {
 if (isOwnedSold(book)) return 1;      // 판매 최우선
 if (!isOwnedBorrowed(book)) return 2; // 소장
 return 3;                              // 대여
 }

 function pickBestOwnedBook(books) {
 if (!Array.isArray(books) || books.length === 0) return null;
 if (books.length === 1) return books[0];
 return books.slice().sort((a, b) => {
 const rankDiff = getOwnedPriorityRank(a) - getOwnedPriorityRank(b);
 if (rankDiff !== 0) return rankDiff;
 const ratingDiff = parseRating(b.rating) - parseRating(a.rating);
 if (ratingDiff !== 0) return ratingDiff;
 return (Number(b.row) || 0) - (Number(a.row) || 0);
 })[0];
 }

 function rebuildOwnedBooksIndex() {
 const byIsbn = new Map();
 const byBaseTitle = new Map();

 myOwnedBooks.forEach(book => {
 const isbn = normalizeIsbn(book.isbn);
 if (isbn) {
 if (!byIsbn.has(isbn)) byIsbn.set(isbn, []);
 byIsbn.get(isbn).push(book);
 }

 const normTitle = normalizeBookTitle(book.title);
 if (normTitle) {
 if (!byBaseTitle.has(normTitle)) byBaseTitle.set(normTitle, []);
 byBaseTitle.get(normTitle).push(book);
 }
 });

 myOwnedBooksIndex = { byIsbn, byBaseTitle };
 updateMyLibBadge();
 updateDuplicateFilterBadge();
 }

 function getIgnoredDuplicateKeys() {
 try {
 const arr = JSON.parse(localStorage.getItem('ignoredDuplicateGroups')) || [];
 return new Set(Array.isArray(arr) ? arr : []);
 } catch (e) {
 return new Set();
 }
 }

 function skipDuplicateGroup(normTitleKey, sampleTitle = '') {
 if (!normTitleKey) return;
 const set = getIgnoredDuplicateKeys();
 set.add(normTitleKey);
 localStorage.setItem('ignoredDuplicateGroups', JSON.stringify(Array.from(set)));
 lastSkippedDupUndo = { key: normTitleKey, title: sampleTitle || normTitleKey };
 updateDuplicateFilterBadge();
 renderMyLibraryList(false);
 pushSyncStateToSheet(true);
 showToast('해당 중복 그룹을 건너뛰었습니다.', '', {
 label: '실행 취소',
 onClick: () => undoLastSkipDuplicateGroup()
 });
 }

 function undoLastSkipDuplicateGroup() {
 if (!lastSkippedDupUndo || !lastSkippedDupUndo.key) return;
 const key = lastSkippedDupUndo.key;
 lastSkippedDupUndo = null;
 const set = getIgnoredDuplicateKeys();
 set.delete(key);
 localStorage.setItem('ignoredDuplicateGroups', JSON.stringify(Array.from(set)));
 updateDuplicateFilterBadge();
 renderMyLibraryList(false);
 pushSyncStateToSheet(true);
 showToast('건너뛰기를 취소했습니다.', 'success');
 }

 function restoreSkippedDuplicateGroup(normTitleKey) {
 if (!normTitleKey) return;
 const set = getIgnoredDuplicateKeys();
 set.delete(normTitleKey);
 localStorage.setItem('ignoredDuplicateGroups', JSON.stringify(Array.from(set)));
 if (lastSkippedDupUndo && lastSkippedDupUndo.key === normTitleKey) lastSkippedDupUndo = null;
 updateDuplicateFilterBadge();
 renderMyLibraryList(false);
 pushSyncStateToSheet(true);
 showToast('중복 확인 목록으로 복원했습니다.', 'success');
 }

 function toggleSkippedDuplicatesView(show) {
 isViewingSkippedDuplicates = typeof show === 'boolean' ? show : !isViewingSkippedDuplicates;
 renderMyLibraryList(true);
 }

 function resetSkippedDuplicates() {
 if (!confirm('건너뛰기한 중복 항목들을 모두 중복 확인 목록으로 복원할까요?')) return;
 localStorage.removeItem('ignoredDuplicateGroups');
 lastSkippedDupUndo = null;
 isViewingSkippedDuplicates = false;
 updateDuplicateFilterBadge();
 renderMyLibraryList(true);
 pushSyncStateToSheet(true);
 showToast('건너뛰기한 중복 항목을 모두 복원했습니다.', 'success');
 }

 async function restoreDeletedOwnedBooks(booksList) {
  const items = Array.isArray(booksList) ? booksList : [booksList];
  let restored = 0;
  for (const b of items) {
    if (!b) continue;
    try {
      const res = await sendSheetPost({
        target: 'library',
        action: 'lib_add',
        force: true,
        book: b
      });
      if (res && res.status === 'ok') restored++;
    } catch (e) {}
  }
  if (restored > 0) {
    showToast(restored > 1 ? `${restored}권을 복원했습니다.` : `'${formatOwnedTitle(items[0])}' 도서를 복원했습니다.`, 'success');
  } else {
    showToast('복원에 실패했습니다.', 'error');
  }
}

async function quickDeleteOwnedByIndex(idx) {
  const target = myOwnedBooks[idx];
  if (!target) return;
  const backup = { ...target };
  try {
    const res = await sendSheetPost({
      target: 'library',
      action: 'lib_delete',
      row: target.row,
      origTitle: target.title,
      origAuthor: target.author,
      origIsbn: target.isbn,
      origIsEbook: isOwnedEbook(target)
    });
    if (res && res.status === 'ok') {
      showToast(`'${formatOwnedTitle(backup)}' 도서를 삭제했습니다.`, '', {
        label: '실행 취소',
        onClick: () => restoreDeletedOwnedBooks([backup])
      });
    }
  } catch (e) {
    showToast('삭제 요청에 실패했습니다.', 'error');
  }
}

 function getDuplicateOwnedBookSet() {
 const ignored = getIgnoredDuplicateKeys();
 const dupRows = new Set();
 myOwnedBooksIndex.byBaseTitle.forEach((arr, key) => {
 if (arr.length >= 2 && !ignored.has(key)) {
 arr.forEach(b => dupRows.add(b));
 }
 });
 return dupRows;
 }

 function updateDuplicateFilterBadge() {
 const btn = document.getElementById('myLibDupFilterBtn');
 const dot = document.getElementById('myLibDupDot');
 if (!btn) return;
 const dupCount = getDuplicateOwnedBookSet().size;
 btn.title = dupCount > 0 ? `중복 확인 (${dupCount}권)` : '중복 확인';
 if (dot) {
 dot.innerText = String(dupCount);
 dot.classList.toggle('hidden', dupCount <= 0);
 }
 }

 function findOwnedMatch(apiBook) {
 if (!apiBook || myOwnedBooks.length === 0) return null;

 const isbn = normalizeIsbn(apiBook.isbn13 || apiBook.isbn);
 if (isbn && myOwnedBooksIndex.byIsbn.has(isbn)) {
 const isbnMatches = myOwnedBooksIndex.byIsbn.get(isbn);
 return { owned: pickBestOwnedBook(isbnMatches), matchType: 'isbn', allMatches: isbnMatches };
 }

 const normTitle = normalizeBookTitle(apiBook.bookname || apiBook.title);
 if (!normTitle) return null;
 const apiAuthor = apiBook.authors || apiBook.author || '';

 const candidates = myOwnedBooksIndex.byBaseTitle.get(normTitle) || [];
 if (candidates.length > 0) {
 const exactAuthors = candidates.filter(c => hasAuthorOverlap(c.author, apiAuthor));
 if (exactAuthors.length > 0) return { owned: pickBestOwnedBook(exactAuthors), matchType: 'title_author', allMatches: exactAuthors };
 if (normTitle.length >= 4) {
 return { owned: pickBestOwnedBook(candidates), matchType: 'title', allMatches: candidates };
 }
 }

 if (apiAuthor && normTitle.length >= 3) {
 const authorTitleMatch = myOwnedBooks.find(b => {
 if (!hasAuthorOverlap(b.author, apiAuthor)) return false;
 const ownedNorm = normalizeBookTitle(b.title);
 if (!ownedNorm || ownedNorm.length < 3) return false;
 return normTitle.startsWith(ownedNorm) || ownedNorm.startsWith(normTitle) ||
 (ownedNorm.length >= 4 && (normTitle.includes(ownedNorm) || ownedNorm.includes(normTitle)));
 });
 if (authorTitleMatch) {
 return { owned: authorTitleMatch, matchType: 'title_author' };
 }
 }

 return null;
 }

 function findOwnedMatchesForSearch(keyword, extraAuthorStrings = []) {
 const qRaw = String(keyword || '').trim().toLowerCase();
 const qCompact = qRaw.replace(/[\s·・.,!?'"~()\[\]{}\-_/:;]+/g, '');
 const qWords = qRaw.split(/\s+/).filter(w => w.length >= 2);
 if (!qRaw || myOwnedBooks.length === 0) return [];

 const scored = [];
 const matchedBooksSet = new Set();
 const qIsbn = normalizeIsbn(qRaw);

 myOwnedBooks.forEach(b => {
 const bIsbn = normalizeIsbn(b.isbn);
 const normTitle = normalizeBookTitle(b.title);
 const normAuthor = String(b.author || '').toLowerCase().replace(/[\s·・.,]+/g, '');
 const hay = `${b.title || ''} ${b.author || ''} ${b.translator || ''} ${b.tags || ''} ${b.publisher || ''} ${getOwnedSeries(b)} ${getOwnedMemo(b)} ${b.review || ''} ${getOwnedSource(b)}`.toLowerCase();
 const hayCompact = hay.replace(/\s+/g, '');

 let score = 0;
 let kind = 'similar';

 if (qIsbn.length >= 10 && bIsbn && bIsbn === qIsbn) {
 score = 110;
 kind = 'exact';
 } else if (qCompact && (normTitle === qCompact || normAuthor === qCompact)) {
 score = 100;
 kind = 'exact';
 } else if (qCompact.length >= 2 && (normTitle.includes(qCompact) || normAuthor.includes(qCompact))) {
 score = 85;
 kind = 'exact';
 } else if (qCompact.length >= 3 && (qCompact.includes(normTitle) && normTitle.length >= 3)) {
 score = 75;
 kind = 'exact';
 } else if (hay.includes(qRaw) || (qCompact.length >= 2 && hayCompact.includes(qCompact))) {
 score = 60;
 kind = 'related';
 } else if (qWords.length >= 2) {
 const hitWords = qWords.filter(w => hay.includes(w));
 // 2어절 검색(예: '대니얼 데닛')은 두 단어 모두 일치해야 하며, 3어절 이상만 1단어 누락 허용
 if (hitWords.length === qWords.length) {
 score = 70;
 kind = 'exact';
 } else if (qWords.length >= 3 && hitWords.length >= qWords.length - 1) {
 score = 40 + hitWords.length * 5;
 kind = 'similar';
 }
 } else if (qCompact.length >= 4 && normTitle.length >= 4) {
 let common = 0;
 for (let i = 0; i < qCompact.length - 1; i++) {
 const bi = qCompact.slice(i, i + 2);
 if (normTitle.includes(bi)) common++;
 }
 const ratio = common / (qCompact.length - 1);
 if (ratio >= 0.72) {
 score = Math.round(ratio * 55);
 kind = 'similar';
 }
 }

 if (score > 0) {
 scored.push({ book: b, score, kind });
 matchedBooksSet.add(b);
 }
 });

 // 일치한 도서 또는 API 검색 결과 저자의 다른 보유 도서(동일 저자·참여작) 함께 표시
 const seedPeople = [];
 const seenPersonKeys = new Set();
 const addSeedPeopleFromText = (txt, defaultRole = '저자') => {
 extractPersonRoleEntries(txt, defaultRole).forEach(p => {
 if (p.clean && p.clean.length >= 2 && !seenPersonKeys.has(p.clean)) {
 seenPersonKeys.add(p.clean);
 seedPeople.push(p);
 }
 });
 };

 scored.forEach(({ book: b, score }) => {
 if (score >= 70 && b.author) {
 addSeedPeopleFromText(b.author, '저자');
 }
 });
 (extraAuthorStrings || []).forEach(aStr => {
 if (aStr) addSeedPeopleFromText(aStr, '저자');
 });

 if (seedPeople.length > 0) {
 myOwnedBooks.forEach(b => {
 if (matchedBooksSet.has(b)) return;
 const ownedAuthorPeople = extractPersonRoleEntries(b.author, '저자');
 const transStr = String(b.translator || '').trim();
 const ownedTransPeople = transStr ? extractPersonRoleEntries(transStr, detectRoleFromSegment(transStr) || '옮긴이') : [];
 const memoAndSeries = `${getOwnedMemo(b)} ; ${getOwnedSeries(b)}`;
 const ownedNotePeople = extractPersonRoleEntries(memoAndSeries, detectRoleFromSegment(memoAndSeries) || '참여');
 const ownedAllPeople = [...ownedAuthorPeople, ...ownedTransPeople, ...ownedNotePeople];

 const hitPerson = seedPeople.find(sp => ownedAllPeople.some(op => personKeysMatch(sp.clean, op.clean)));
 if (hitPerson) {
 scored.push({ book: b, score: 50, kind: 'same_author', personName: hitPerson.name });
 matchedBooksSet.add(b);
 }
 });
 }

 scored.sort((a, b) => b.score - a.score);
 return scored;
 }

 function updateMyLibBadge() {
 const badge = document.getElementById('myLibBadge');
 if (badge) {
 badge.innerText = myOwnedBooks.length;
 badge.style.display = myOwnedBooks.length > 0 ? 'flex' : 'none';
 }
 }

 function saveOwnedBooksToCache(books) {
 if (!Array.isArray(books)) return;
 AllBooksIDB.set('myOwnedBooksCache', books).then(ok => {
 if (ok) {
 try { localStorage.removeItem('myOwnedBooksCache'); } catch (e) {}
 } else {
 // IndexedDB 미지원 환경 폴백: 용량 초과 방지를 위해 긴 줄거리 제외 후 저장
 try {
 const slim = books.map(b => ({ ...b, description: b.description ? String(b.description).slice(0, 160) : '' }));
 localStorage.setItem('myOwnedBooksCache', JSON.stringify(slim));
 } catch (e) {}
 }
 });
 }

 async function loadCachedOwnedBooks() {
 try {
 const idbCached = await AllBooksIDB.get('myOwnedBooksCache');
 if (Array.isArray(idbCached) && idbCached.length > 0) {
 if (myOwnedBooks.length === 0) {
 myOwnedBooks = idbCached;
 rebuildOwnedBooksIndex();
 renderHomeReadingDashboard();
 refreshOwnedUIEverywhere();
 }
 return;
 }
 const legacyRaw = localStorage.getItem('myOwnedBooksCache');
 if (legacyRaw) {
 const legacy = JSON.parse(legacyRaw);
 if (Array.isArray(legacy) && legacy.length > 0) {
 if (myOwnedBooks.length === 0) {
 myOwnedBooks = legacy;
 rebuildOwnedBooksIndex();
 renderHomeReadingDashboard();
 refreshOwnedUIEverywhere();
 }
 saveOwnedBooksToCache(legacy);
 }
 }
 } catch (e) {}
 }


 /* =========================================================
 * 통합 구글 시트 동기화 (북마크 + 전체_도서_리스트 + PIN 보호)
 * ========================================================= */
 async function syncAllFromSheet(showFeedback = false, _retryAfterPin = false) {
 const url = buildSheetGetUrl();
 const statusEl = document.getElementById('myLibSyncStatus');
 if (!url) return;

 if (statusEl) statusEl.innerText = '동기화 중...';
 try {
 const res = await fetch(url);
 const data = await res.json();

 if (data && data.status === 'unauthorized') {
 if (statusEl) statusEl.innerText = 'PIN 인증 필요';
 if (!_retryAfterPin) {
 const entered = await openPinPromptModal(
 getSheetWritePin()
 ? '입력된 PIN이 일치하지 않습니다. 올바른 PIN을 다시 입력해 주세요.'
 : '내 서재를 불러오려면 설정된 PIN을 입력해 주세요. (한 번 입력하면 이 기기에 저장됩니다)'
 );
 if (entered) return syncAllFromSheet(showFeedback, true);
 } else if (showFeedback) {
 showToast('PIN이 일치하지 않습니다. 설정에서 확인해 주세요.', 'error');
 }
 return;
 }

 if (data.status === 'ok') {
 if (Array.isArray(data.bookmarks)) {
 const merged = mergeBookmarksWithMeta(data.bookmarks);
 try { localStorage.setItem('myBookmarks', JSON.stringify(merged)); } catch (e) {}
 loadBookmarks();
 refreshCurrentBookBookmarkUI();
 }

 if (data.syncState) {
 applyRemoteSyncState(data.syncState);
 }

 if (Array.isArray(data.books)) {
 myOwnedBooks = data.books;
 saveOwnedBooksToCache(myOwnedBooks);
 rebuildOwnedBooksIndex();
 if (statusEl) statusEl.innerText = `동기화 완료 (${myOwnedBooks.length}권)`;
 if (showFeedback) showToast(`내 서재 ${myOwnedBooks.length}권 동기화 완료`, 'success');
 } else {
 if (statusEl) statusEl.innerText = '통합 Code.gs 배포 필요';
 if (showFeedback) {
 showToast('Apps Script가 북마크만 반환 중입니다. 통합 Code.gs 배포를 확인해 주세요.', 'error');
 }
 }

 refreshOwnedUIEverywhere();
 renderHomeReadingDashboard();
 } else {
 if (statusEl) statusEl.innerText = '응답 확인 필요';
 if (showFeedback) showToast('시트 응답을 확인해 주세요.', 'error');
 }
 } catch (e) {
 console.error('구글 시트 통합 동기화 실패:', e);
 if (statusEl) statusEl.innerText = '동기화 실패 (캐시 사용)';
 if (showFeedback) showToast('동기화에 실패했습니다. 캐시 데이터를 표시합니다.', 'error');
 }
 }

 let pinPromptResolver = null;

 function openPinPromptModal(message = '') {
 const overlay = document.getElementById('pinPromptModalOverlay');
 const descEl = document.getElementById('pinPromptDesc');
 const inputEl = document.getElementById('pinPromptInput');
 if (!overlay || !inputEl) return Promise.resolve(false);

 if (descEl) {
 descEl.innerText = message || '도서 추가·수정·삭제를 위해 설정된 쓰기 PIN을 입력해 주세요. (한 번 입력하면 이 기기에 저장됩니다)';
 }
 inputEl.value = '';
 overlay.classList.add('open');
 pushModalHistory('pinPrompt');
 refreshIcons(overlay);
 setTimeout(() => inputEl.focus(), 60);

 return new Promise(resolve => {
 pinPromptResolver = resolve;
 });
 }

 function closePinPromptModal(submitted = false) {
 const overlay = document.getElementById('pinPromptModalOverlay');
 if (overlay) overlay.classList.remove('open');
 popModalHistory('pinPrompt');
 if (pinPromptResolver) {
 const fn = pinPromptResolver;
 pinPromptResolver = null;
 fn(!!submitted);
 }
 }

 function submitPinPromptModal() {
 const inputEl = document.getElementById('pinPromptInput');
 const val = String(inputEl?.value || '').trim();
 if (!val) {
 showToast('PIN을 입력해 주세요.', 'error');
 inputEl?.focus();
 return;
 }
 localStorage.setItem('sheetWritePin', val);
 const setupInput = document.getElementById('myLibPinInput');
 if (setupInput) setupInput.value = val;
 showToast('PIN이 저장되었습니다.', 'success');
 closePinPromptModal(true);
 }

 async function sendSheetPost(payload, _retryAfterPin = false) {
 const url = getUnifiedApiUrl();
 const pin = getSheetWritePin();
 const bodyPayload = pin ? { ...payload, pin } : payload;

 const res = await fetch(url, {
 method: 'POST',
 headers: { 'Content-Type': 'text/plain;charset=utf-8' },
 body: JSON.stringify(bodyPayload)
 });
 const data = await res.json();

 if (data && data.status === 'unauthorized') {
 // 백그라운드 동기화 요청이 아니라 사용자가 직접 실행한 쓰기 작업일 때만 PIN 창 팝업
 if (payload.action !== 'saveSyncState' && !_retryAfterPin) {
 const entered = await openPinPromptModal(
 pin
 ? '입력된 PIN이 일치하지 않습니다. 올바른 쓰기 PIN을 다시 입력해 주세요.'
 : '시트에 저장하려면 쓰기 PIN이 필요합니다. PIN을 입력하면 바로 저장됩니다.'
 );
 if (entered) {
 return sendSheetPost(payload, true);
 }
 } else if (payload.action !== 'saveSyncState') {
 showToast('PIN이 일치하지 않습니다. 다시 확인해 주세요.', 'error');
 }
 return data;
 }

 if (Array.isArray(data.bookmarks)) {
 const merged = mergeBookmarksWithMeta(data.bookmarks);
 try { localStorage.setItem('myBookmarks', JSON.stringify(merged)); } catch (e) {}
 loadBookmarks(false);
 refreshCurrentBookBookmarkUI();
 }
 if (data.syncState) {
 applyRemoteSyncState(data.syncState);
 }

 let booksMutated = false;
 if (Array.isArray(data.books)) {
 myOwnedBooks = data.books;
 booksMutated = true;
 } else {
 if (data.addedBook) {
 myOwnedBooks.push(data.addedBook);
 booksMutated = true;
 }
 if (data.updatedBook) {
 const idx = myOwnedBooks.findIndex(b => b.row === data.updatedBook.row);
 if (idx > -1) myOwnedBooks[idx] = data.updatedBook;
 else myOwnedBooks.push(data.updatedBook);
 booksMutated = true;
 }
 if (Array.isArray(data.updatedBooks) && data.updatedBooks.length > 0) {
 data.updatedBooks.forEach(ub => {
 const idx = myOwnedBooks.findIndex(b => b.row === ub.row);
 if (idx > -1) myOwnedBooks[idx] = ub;
 });
 booksMutated = true;
 }
 if (typeof data.deletedRow === 'number' && data.deletedRow >= 2) {
 myOwnedBooks = myOwnedBooks
 .filter(b => b.row !== data.deletedRow)
 .map(b => (b.row > data.deletedRow ? { ...b, row: b.row - 1 } : b));
 booksMutated = true;
 }
 }

 if (booksMutated) {
 saveOwnedBooksToCache(myOwnedBooks);
 rebuildOwnedBooksIndex();
 refreshOwnedUIEverywhere();
 }
 renderHomeReadingDashboard();
 return data;
 }



function getSourceBadgeClassName(srcText) {
  const txt = String(srcText || '');
  if (txt.includes('알라딘')) return 'src-aladin';
  if (txt.includes('교보')) return 'src-kyobo';
  if (txt.includes('리디')) return 'src-ridi';
  if (txt.includes('예스24') || txt.includes('yes24')) return 'src-yes24';
  if (txt.includes('밀리')) return 'src-millie';
  if (txt.includes('남산')) return 'src-namsan';
  if (txt.includes('꿈나무')) return 'src-dream';
  if (txt.includes('도서관') || txt.includes('분관')) return 'src-other-lib';
  return 'ebook';
}

function buildMyLibCardHtml(b, idx, listCoverCache, opts = {}) {
  const ebook = isOwnedEbook(b);
  const statusVal = normalizeReadingStatus(b.status);
  const ratingShort = formatRatingShort(b.rating);
  const transSup = getTranslatorSupervisorInfo(b);
  const showPub = !!(opts.showPublisher && b.publisher);
  const pubText = showPub ? ` · ${escapeHtml(b.publisher)}` : '';
  const subLine = `${escapeHtml(formatAuthorWithSuffix(b.author))}${pubText}${transSup ? ' · ' + escapeHtml(transSup) : ''}`;
  const rawTags = String(b.tags || '').split(',').map(t => t.trim()).filter(t => t && !isEbookTagToken(t));
  const srcText = getOwnedSource(b);
  const srcColorCls = getSourceBadgeClassName(srcText);
  const formatBadgeHtml = ebook
    ? '<span class="mylib-badge src-ebook-fmt">e-book</span>'
    : '<span class="mylib-badge src-paper-fmt">종이책</span>';
  const sourceBadgeHtml = srcText
    ? `<span class="mylib-badge ${srcColorCls}">${escapeHtml(srcText)}</span>`
    : '';
  const dueBadgeHtml = getDueDateBadgeHtml(b);
  const tagBadges = formatBadgeHtml + sourceBadgeHtml + dueBadgeHtml + rawTags.slice(0, 3)
    .map(t => `<span class="mylib-badge">#${escapeHtml(t)}</span>`).join('');

  const thumbUrl = getOwnedBookThumbUrl(b, listCoverCache);
  const ownObiHtml = getCoverOwnershipObiHtml(b);
  const doneStampHtml = getCoverDoneStampHtml(b);
  const statusBorderCls = getCoverStatusBorderCls(b);
  const thumbHtml = `<div class="mylib-thumb-col"><div class="mylib-item-thumb-wrap ${statusBorderCls}">${ownObiHtml}${doneStampHtml}<img class="mylib-item-thumb" src="${escapeHtml(thumbUrl)}" alt="" loading="lazy" decoding="async" onerror="this.onerror=null;this.src=NO_COVER_SVG"></div>${ratingShort ? `<div class="mylib-thumb-rating">${ratingShort}</div>` : ''}</div>`;

  const isDupMode = !!opts.isDupMode;
  const isMsMode = !!opts.isMsMode;
  const isSelected = !!opts.isSelected;
  const isPostSearch = !!opts.isPostSearch;
  const cardStateCls = isDupMode ? 'is-dup' : (statusVal === '완독' ? 'is-done' : '');

  let rightCtrlHtml = '';
  if (isDupMode) {
    rightCtrlHtml = `<div class="owned-mini-actions" onclick="event.stopPropagation()"><button class="owned-chip-btn danger icon-trash-btn" onclick="quickDeleteOwnedByIndex(${idx})" title="삭제" aria-label="삭제">${TRASH_ICON_SVG_14}</button></div>`;
  } else if (isMsMode) {
    rightCtrlHtml = `<span class="mylib-select-check" aria-hidden="true">✓</span>`;
  } else if (!isPostSearch) {
    rightCtrlHtml = `<div class="mylib-item-right-ctrl" onclick="event.stopPropagation()"><button type="button" class="mylib-card-more-btn" onclick="openCardQuickActionPopover(event, ${idx})" title="빠른 작업" aria-label="빠른 작업">${MORE_ICON_SVG_16}</button></div>`;
  }

  const kindPill = opts.kindPillHtml || '';
  const clickAttr = isPostSearch
    ? `onclick="openOwnedEditModalByIndex(${idx})"`
    : `data-book-idx="${idx}" onclick="handleMyLibCardClick(event, ${idx})" oncontextmenu="if(myLibMultiSelectMode) event.preventDefault();"`;

  const periodStr = formatReadingPeriod(b.startDate, b.finishDate);
  const seriesStr = formatSeriesBadgeText(b);

  return `
    <div class="mylib-item ${cardStateCls} ${isSelected ? 'is-selected' : ''}" ${clickAttr}>
      <div class="mylib-item-row">
        ${thumbHtml}
        <div class="mylib-item-body">
          <div class="mylib-item-top">
            <div style="min-width:0; flex:1;">
              <p class="mylib-item-title">${escapeHtml(formatOwnedTitle(b))} ${kindPill}</p>
              <p class="mylib-item-sub">${subLine}</p>
            </div>
            ${rightCtrlHtml}
          </div>
          ${b.review ? `<div class="mylib-item-review">${escapeHtml(b.review)}</div>` : ''}
          <div class="mylib-item-badges">
            ${periodStr ? `<span class="mylib-badge date">${escapeHtml(periodStr)}</span>` : ''}
            ${seriesStr ? `<span class="mylib-badge series">${escapeHtml(seriesStr)}</span>` : ''}
            ${tagBadges}
          </div>
        </div>
      </div>
    </div>
  `;
}
