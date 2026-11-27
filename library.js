let lastFilteredOwnedBooks = null;
let isMyLibActivelyScrolling = false;
let myLibScrollIdleTimer = null;
/* =========================================================
 * All Books 내 서재 · 필터 · 기록 수정 · 바코드 스캐너 (library.js)
 * ========================================================= */
 /* =========================================================
 * ISBN 바코드 스캐너 (BarcodeDetector API + 수동 입력 Fallback)
 * ========================================================= */
 async function openBarcodeScanner(mode = 'search') {
 barcodeScanTargetMode = mode;
 document.getElementById('barcodeModalOverlay').classList.add('open');
 pushModalHistory('barcode');
 document.getElementById('manualIsbnInput').value = '';
 const statusEl = document.getElementById('barcodeStatusText');
 statusEl.innerText = '카메라를 연결하는 중입니다...';
 refreshIcons();

 if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
 statusEl.innerText = '이 브라우저에서는 카메라를 열 수 없습니다. 아래에 ISBN 숫자를 직접 입력해 주세요.';
 return;
 }

 try {
 barcodeStream = await navigator.mediaDevices.getUserMedia({
 video: { facingMode: { ideal: 'environment' } },
 audio: false
 });
 const video = document.getElementById('barcodeVideo');
 video.srcObject = barcodeStream;
 await video.play();

 if (!('BarcodeDetector' in window)) {
 statusEl.innerText = '자동 바코드 인식을 지원하지 않는 환경입니다. 아래에 ISBN을 직접 입력해 주세요.';
 return;
 }

 const detector = new BarcodeDetector({ formats: ['ean_13', 'ean_8', 'code_128'] });
 statusEl.innerText = '책 뒷면 ISBN 바코드를 비춰주세요...';
 barcodeScanLoopActive = true;
 let lastDetectTs = 0;

 const scanFrame = async (now) => {
 if (!barcodeScanLoopActive) return;
 if (now - lastDetectTs >= 180) {
 lastDetectTs = now;
 try {
 if (video.readyState >= 2) {
 const barcodes = await detector.detect(video);
 for (const code of barcodes) {
 const cleaned = normalizeIsbn(code.rawValue);
 if (cleaned.length === 13 && (cleaned.startsWith('978') || cleaned.startsWith('979'))) {
 if (navigator.vibrate) navigator.vibrate(80);
 handleScannedIsbn(cleaned);
 return;
 }
 }
 }
 } catch (e) {}
 }
 if (barcodeScanLoopActive) {
 requestAnimationFrame(scanFrame);
 }
 };
 requestAnimationFrame(scanFrame);
 } catch (err) {
 statusEl.innerText = '카메라 권한이 거부되었거나 사용할 수 없습니다. 아래에 ISBN을 직접 입력해 주세요.';
 }
 }

 function closeBarcodeScanner() {
 barcodeScanLoopActive = false;
 if (barcodeStream) {
 barcodeStream.getTracks().forEach(t => t.stop());
 barcodeStream = null;
 }
 const video = document.getElementById('barcodeVideo');
 if (video) video.srcObject = null;
 document.getElementById('barcodeModalOverlay').classList.remove('open');
 popModalHistory('barcode');
 }

 function submitManualScannedIsbn() {
 const cleaned = normalizeIsbn(document.getElementById('manualIsbnInput').value);
 if (cleaned.length < 10) {
 showToast('10자리 또는 13자리 ISBN 숫자를 입력해 주세요.', 'error');
 return;
 }
 handleScannedIsbn(cleaned);
 }

 function handleScannedIsbn(isbn) {
  const mode = barcodeScanTargetMode;
  closeBarcodeScanner();

  if (mode === 'addModal') {
    document.getElementById('ownedInputIsbn').value = isbn;
    syncInlineMetaButtons();
    renderOwnedMetaPlotBox();
    showToast(`ISBN ${isbn} 인식 완료`, 'success');
    autoFillOwnedBookMeta(isbn, false, false, true);
    return;
  }

  const ownedList = myOwnedBooksIndex.byIsbn.get(isbn);
  const owned = ownedList ? pickBestOwnedBook(ownedList) : null;
  if (owned) {
    showToast(`이미 내 서재 보유 중: ${formatOwnedTitle(owned)}`, 'success');
  } else {
    showToast(`ISBN ${isbn} 인식 완료`, 'success');
  }
  document.getElementById('searchInput').value = isbn;
  executeSearch(isbn, { fromBarcode: true });
}


 /* =========================================================
 * 내 서재 모달 · 통계 · 정렬 · 중복 확인 · 편집/추가/자동채우기
 * ========================================================= */
 let selectedRatingBreakdownStar = 'all';

 
 function selectMyLibTopTab(tab) {
   const searchInput = document.getElementById('myLibSearchInput');
   const clearBtn = document.getElementById('myLibSearchClearBtn');
   if (searchInput) searchInput.value = '';
   if (clearBtn) clearBtn.classList.add('hidden');
   myLibDuplicatesMode = false;
   myLibFormatFilter = 'all';
   myLibOwnershipFilter = 'all';
   myLibReadingStatuses = [];
   if (tab === 'unread') myLibReadingStatuses = ['예정'];
   else if (tab === 'paper') myLibFormatFilter = 'paper';
   else if (tab === 'ebook') myLibFormatFilter = 'ebook';
   else if (tab === 'borrowed') myLibOwnershipFilter = '대여중';
   applyMyLibFilters();
 }

 function renderMyLibStatsBar() {
 const bar = document.getElementById('myLibStatsBar');
 if (!bar) return;
 const stats = computeLibraryStats();
 const isAll = !myLibDuplicatesMode && myLibReadingStatuses.length === 0 && myLibOwnershipFilter === 'all' && myLibFormatFilter === 'all' && myLibRatingFilter === 'all' && myLibSelectedTags.length === 0 && myLibSelectedSources.length === 0;
 const unreadCount = myOwnedBooks.filter(b => { const st = normalizeReadingStatus(b.status); return st === '예정' || st === ''; }).length;
 const activeBorrowedCount = myOwnedBooks.filter(b => isOwnedBorrowed(b) && !isOwnedSold(b) && !isOwnedReturned(b)).length;
 const activeTab = myLibDuplicatesMode ? ''
 : (myLibReadingStatuses.length === 1 && myLibReadingStatuses[0] === '예정' && myLibFormatFilter === 'all' && myLibOwnershipFilter === 'all') ? 'unread'
 : (myLibOwnershipFilter === '대여중' && myLibFormatFilter === 'all' && myLibReadingStatuses.length === 0) ? 'borrowed'
 : (myLibFormatFilter === 'paper' && myLibOwnershipFilter === 'all' && myLibReadingStatuses.length === 0) ? 'paper'
 : (myLibFormatFilter === 'ebook' && myLibOwnershipFilter === 'all' && myLibReadingStatuses.length === 0) ? 'ebook'
 : (isAll ? 'all' : '');
 bar.innerHTML = `
 <button type="button" class="mylib-top-tab ${activeTab === 'all' ? 'active' : ''}" onclick="selectMyLibTopTab('all')">전체 <strong>${stats.total}</strong></button>
 <button type="button" class="mylib-top-tab ${activeTab === 'unread' ? 'active' : ''}" onclick="selectMyLibTopTab('unread')">읽지 않음 <strong>${unreadCount}</strong></button>
 <button type="button" class="mylib-top-tab ${activeTab === 'paper' ? 'active' : ''}" onclick="selectMyLibTopTab('paper')">종이책 <strong>${stats.paper}</strong></button>
 <button type="button" class="mylib-top-tab ${activeTab === 'ebook' ? 'active' : ''}" onclick="selectMyLibTopTab('ebook')">e-book <strong>${stats.ebooks}</strong></button>
 <button type="button" class="mylib-top-tab ${activeTab === 'borrowed' ? 'active' : ''}" onclick="selectMyLibTopTab('borrowed')">대여중 <strong>${activeBorrowedCount}</strong></button>
 `;

 
 }

 function openRatingBreakdownModal(initialStar = 'all') {
 selectedRatingBreakdownStar = initialStar;
 renderRatingBreakdownModal();
 document.getElementById('ratingBreakdownModalOverlay').classList.add('open');
 pushModalHistory('ratingBreakdown');
 refreshIcons();
 }

 function closeRatingBreakdownModal() {
 document.getElementById('ratingBreakdownModalOverlay').classList.remove('open');
 popModalHistory('ratingBreakdown');
 }

 function selectRatingBreakdownStar(starVal) {
 selectedRatingBreakdownStar = starVal;
 renderRatingBreakdownModal();
 }

 function renderRatingBreakdownModal() {
 const stats = computeLibraryStats();
 const ratedBooks = myOwnedBooks.filter(b => parseRating(b.rating) > 0);
 const counts = { 5: 0, 4: 0, 3: 0, 2: 0, 1: 0 };
 ratedBooks.forEach(b => {
 const r = parseRating(b.rating);
 if (counts[r] !== undefined) counts[r]++;
 });
 const maxCnt = Math.max(1, ...Object.values(counts));

 const titleEl = document.getElementById('ratingModalTitle');
 if (titleEl) {
 titleEl.innerText = `평점별 도서 (평균 ${stats.avgRating} · ${ratedBooks.length}권)`;
 }

 const distEl = document.getElementById('ratingDistList');
 if (distEl) {
 distEl.innerHTML = [5, 4, 3, 2, 1].map(star => {
 const cnt = counts[star];
 const pct = Math.round((cnt / maxCnt) * 100);
 const isAct = String(selectedRatingBreakdownStar) === String(star);
 return `
 <div class="rating-dist-row ${isAct ? 'active' : ''}" onclick="selectRatingBreakdownStar(${star})">
 <span class="rating-dist-label">${star}점</span>
 <div class="rating-dist-bar-bg"><div class="rating-dist-bar-fill" style="width:${cnt > 0 ? Math.max(6, pct) : 0}%;"></div></div>
 <span class="rating-dist-cnt">${cnt}권</span>
 </div>
 `;
 }).join('');
 }

 document.querySelectorAll('#ratingStarTabs .mylib-filter-chip').forEach(btn => {
 btn.classList.toggle('active', btn.getAttribute('data-star') === String(selectedRatingBreakdownStar));
 });

 const listEl = document.getElementById('ratingBooksList');
 if (!listEl) return;

 const filtered = (selectedRatingBreakdownStar === 'all'
 ? ratedBooks
 : ratedBooks.filter(b => parseRating(b.rating) === Number(selectedRatingBreakdownStar))
 ).slice().sort((a, b) => parseRating(b.rating) - parseRating(a.rating) || String(b.finishDate || '').localeCompare(String(a.finishDate || '')) || String(a.title || '').localeCompare(String(b.title || ''), 'ko'));

 if (filtered.length === 0) {
 listEl.innerHTML = `<div class="loading-msg" style="padding:18px;">해당 평점의 도서가 없습니다.</div>`;
 return;
 }

 listEl.innerHTML = filtered.map(b => {
 const idx = myOwnedBooks.indexOf(b);
 const ebook = isOwnedEbook(b);
 const r = parseRating(b.rating);
 const period = formatReadingPeriod(b.startDate, b.finishDate);
 return `
 <div class="owned-mini-row clickable" onclick="openOwnedEditModalByIndex(${idx})">
 <div class="owned-mini-info">
 <p class="owned-mini-title">${ebook ? '' : ''}${escapeHtml(formatOwnedTitle(b))} <span class="mylib-badge rating">♥ ${r}</span></p>
 <p class="owned-mini-meta">${escapeHtml(formatAuthorWithSuffix(b.author))}${b.publisher ? ' · ' + escapeHtml(b.publisher) : ''}${period ? ' · ' + escapeHtml(period) : ''}</p>
 ${b.review ? `<div class="mylib-item-review" style="margin-top:4px;">${escapeHtml(b.review)}</div>` : ''}
 </div>
 </div>
 `;
 }).join('');
 }

 function resetMyLibFiltersAndSearch() {
  const searchInput = document.getElementById('myLibSearchInput');
  const clearBtn = document.getElementById('myLibSearchClearBtn');
  if (searchInput) searchInput.value = '';
  if (clearBtn) clearBtn.classList.add('hidden');
  myLibDuplicatesMode = false;
  myLibReadingStatuses = [];
  myLibOwnershipFilter = 'all';
  myLibFormatFilter = 'all';
  myLibRatingFilter = 'all';
  myLibSelectedTags = [];
  myLibSelectedSources = [];
  isViewingSkippedDuplicates = false;
  toggleMyLibFilterDrawer(false);
  updateMyLibFilterChipsUI();
  renderMyLibActiveChips();
}

function openMyLibraryModal(openSetup = false, initialStatus = null, _fromTab = false) {
  resetMyLibFiltersAndSearch();
  if (!_fromTab && typeof switchAppTab === 'function') {
    switchAppTab('library', { fromOpenMyLib: true });
  } else {
    document.getElementById('myLibModalOverlay').classList.add('open');
  }
  const setupBox = document.getElementById('myLibSetupBox');
  document.getElementById('myLibUrlInput').value = getUnifiedApiUrl();
  document.getElementById('myLibPinInput').value = getSheetWritePin();

  if (openSetup) setupBox.classList.remove('hidden');
  else setupBox.classList.add('hidden');

  if (initialStatus) {
    setMyLibStatusFilter(initialStatus);
  } else {
    renderMyLibStatsBar();
    populateMyLibFilters();
    renderMyLibraryList(true);
  }
  const scrollBody = document.getElementById('myLibScrollBody');
  if (scrollBody) scrollBody.scrollTop = 0;
  refreshIcons();

  if (myOwnedBooks.length === 0) {
    syncAllFromSheet(false);
  }
}

 function toggleMyLibFabMenu(forceOpen) {
 const stack = document.getElementById('myLibFabStack');
 if (!stack) return;
 const willOpen = typeof forceOpen === 'boolean' ? forceOpen : !stack.classList.contains('open');
 stack.classList.toggle('open', willOpen);
 }

 function openAddBookWithSearch() {
 toggleMyLibFabMenu(false);
 openOwnedEditModal(null);
 setTimeout(() => document.getElementById('ownedInputTitle')?.focus(), 80);
 }

 function openAddBookWithBarcode() {
 toggleMyLibFabMenu(false);
 openOwnedEditModal(null);
 openBarcodeScanner('addModal');
 }

 function closeMyLibraryModal() {
 closeQuickPopover();
 closeMyLibManageSheet();
 if (myLibMultiSelectMode) {
   exitMyLibMultiSelectMode();
 }
 resetMyLibFiltersAndSearch();
 document.getElementById('myLibModalOverlay').classList.remove('open');
 if (typeof switchAppTab === 'function' && currentAppTab === 'library') {
   switchAppTab('home', { skipReset: true });
 }
 }

 function toggleMyLibSetupBox(forceOpen) {
  const box = document.getElementById('myLibSetupBox');
  if (!box) return;
  const willOpen = typeof forceOpen === 'boolean' ? forceOpen : box.classList.contains('hidden');
  box.classList.toggle('hidden', !willOpen);
  if (willOpen) {
    document.getElementById('myLibUrlInput').value = getUnifiedApiUrl();
    document.getElementById('myLibPinInput').value = getSheetWritePin();
    refreshIcons(box);
  }
}

 function saveCustomSheetUrl() {
 const val = document.getElementById('myLibUrlInput').value.trim();
 if (!val || !val.startsWith('https://script.google.com/')) {
 showToast('올바른 Google Apps Script 웹 앱 URL을 입력해 주세요.', 'error');
 return;
 }
 localStorage.setItem('unifiedSheetApiUrl', val);
 showToast('시트 URL이 저장되었습니다.', 'success');
 syncAllFromSheet(true);
 }

 function resetCustomSheetUrl() {
 localStorage.removeItem('unifiedSheetApiUrl');
 document.getElementById('myLibUrlInput').value = SHEET_API_URL;
 showToast('기본 시트 URL로 복원했습니다.');
 syncAllFromSheet(true);
 }

 function saveSheetWritePin() {
 const val = document.getElementById('myLibPinInput').value.trim();
 if (val) {
 localStorage.setItem('sheetWritePin', val);
 showToast('시트 쓰기 PIN이 저장되었습니다.', 'success');
 } else {
 localStorage.removeItem('sheetWritePin');
 showToast('시트 쓰기 PIN을 해제했습니다.');
 }
 }

 function handleMyLibSearchInput() {
 const input = document.getElementById('myLibSearchInput');
 const clearBtn = document.getElementById('myLibSearchClearBtn');
 if (clearBtn && input) clearBtn.classList.toggle('hidden', !input.value);
 renderMyLibraryList(true);
 }

 function clearMyLibSearchInput() {
 const input = document.getElementById('myLibSearchInput');
 const clearBtn = document.getElementById('myLibSearchClearBtn');
 if (input) input.value = '';
 if (clearBtn) clearBtn.classList.add('hidden');
 renderMyLibraryList(true);
 input?.focus();
 }

 function populateMyLibFilters() {
 const tagCount = new Map();

 myOwnedBooks.forEach(b => {
 String(b.tags || '').split(',').forEach(t => {
 const clean = t.trim();
 if (clean && !isEbookTagToken(clean)) tagCount.set(clean, (tagCount.get(clean) || 0) + 1);
 });
 });

 const allTopTags = Array.from(tagCount.entries())
 .sort((a, b) => b[1] - a[1])
 .slice(0, 25);

 const tagContainer = document.getElementById('myLibTagFilters');
 if (!tagContainer) return;
 tagContainer.innerHTML = '';

 const allBtn = document.createElement('button');
 allBtn.type = 'button';
 allBtn.className = `ridi-chip ${myLibSelectedTags.length === 0 ? 'active' : ''}`;
 allBtn.textContent = '전체';
 allBtn.addEventListener('click', () => setMyLibTagFilter(''));
 tagContainer.appendChild(allBtn);

 allTopTags.forEach(([tag, cnt]) => {
 const btn = document.createElement('button');
 btn.type = 'button';
 btn.className = `ridi-chip ${myLibSelectedTags.includes(tag) ? 'active' : ''}`;
 btn.textContent = `#${tag} (${cnt})`;
 btn.addEventListener('click', () => setMyLibTagFilter(tag));
 tagContainer.appendChild(btn);
 });

 // 대여처 필터 채우기 (로고 + 도서관명 한 줄)
 const srcContainer = document.getElementById('myLibSourceFilters');
 if (srcContainer) {
 const srcCount = new Map();
 myOwnedBooks.forEach(b => {
 const s = getOwnedSource(b);
 if (s) srcCount.set(s, (srcCount.get(s) || 0) + 1);
 });
 const topSources = Array.from(srcCount.entries()).sort((a, b) => b[1] - a[1]);
 srcContainer.innerHTML = '';

 const allSrcBtn = document.createElement('button');
 allSrcBtn.type = 'button';
 allSrcBtn.className = `ridi-chip ${myLibSelectedSources.length === 0 ? 'active' : ''}`;
 allSrcBtn.textContent = '전체';
 allSrcBtn.addEventListener('click', () => setMyLibSourceFilter(''));
 srcContainer.appendChild(allSrcBtn);

 topSources.forEach(([srcName]) => {
 const meta = getSourceAppMeta(srcName);
 const btn = document.createElement('button');
 btn.type = 'button';
 btn.className = `ridi-chip ${myLibSelectedSources.includes(srcName) ? 'active' : ''}`;
 const img = document.createElement('img');
 img.className = 'source-chip-logo';
 img.src = meta.icon;
 img.alt = '';
 img.onerror = function () { this.style.display = 'none'; };
 const span = document.createElement('span');
 span.textContent = srcName;
 btn.appendChild(img);
 btn.appendChild(span);
 btn.addEventListener('click', () => setMyLibSourceFilter(srcName));
 srcContainer.appendChild(btn);
 });
 }
 }

 function updateMyLibFilterChipsUI() {
 const isDup = myLibDuplicatesMode;
 document.querySelectorAll('#myLibStatusFilters .ridi-chip').forEach(btn => {
 if (btn.hasAttribute('data-ownership')) {
 btn.classList.toggle('active', !isDup && myLibOwnershipFilter === btn.getAttribute('data-ownership'));
 } else if (btn.hasAttribute('data-format')) {
 btn.classList.toggle('active', !isDup && myLibFormatFilter === btn.getAttribute('data-format'));
 } else if (btn.hasAttribute('data-status')) {
 const val = btn.getAttribute('data-status');
 if (val === 'all') btn.classList.toggle('active', !isDup && myLibReadingStatuses.length === 0);
 else btn.classList.toggle('active', !isDup && myLibReadingStatuses.includes(val));
 } else if (btn.hasAttribute('data-rating')) {
 btn.classList.toggle('active', !isDup && myLibRatingFilter === btn.getAttribute('data-rating'));
 }
 });
 const dupBtn = document.getElementById('myLibDupFilterBtn');
 if (dupBtn) dupBtn.classList.toggle('active', isDup);
 }

 function toggleMyLibFilterDrawer(forceOpen) {
 const drawer = document.getElementById('myLibFilterDrawer');
 const btn = document.getElementById('myLibFilterToggleBtn');
 if (!drawer || !btn) return;
 const willOpen = typeof forceOpen === 'boolean' ? forceOpen : drawer.classList.contains('hidden');
 drawer.classList.toggle('hidden', !willOpen);
 btn.classList.toggle('is-open', willOpen);
 btn.setAttribute('aria-expanded', willOpen ? 'true' : 'false');

 }

 function renderMyLibActiveChips() {
 const bar = document.getElementById('myLibActiveChipsBar');
 const btn = document.getElementById('myLibFilterToggleBtn');
 const badge = document.getElementById('myLibFilterCountBadge');
 if (!bar || !btn || !badge) return;

 const chips = [];

 if (myLibDuplicatesMode) {
 chips.push({ label: '중복 확인', onClick: () => setMyLibStatusFilter('all') });
 } else {
 if (myLibOwnershipFilter !== 'all') {
 const ownVal = myLibOwnershipFilter;
 chips.push({ label: ownVal, onClick: () => toggleMyLibOwnershipFilter(ownVal) });
 }
 if (myLibFormatFilter !== 'all') {
 const fmtVal = myLibFormatFilter;
 chips.push({ label: fmtVal === 'paper' ? '종이책' : 'e-book', onClick: () => toggleMyLibFormatFilter(fmtVal) });
 }
 myLibReadingStatuses.forEach(stVal => {
 chips.push({ label: stVal, onClick: () => toggleMyLibReadingStatusFilter(stVal) });
 });
 if (myLibRatingFilter !== 'all') {
 const rVal = myLibRatingFilter;
 chips.push({ label: rVal === '0' ? '미평가' : `${rVal}점`, onClick: () => toggleMyLibRatingFilter(rVal) });
 }
 myLibSelectedSources.forEach(srcVal => {
 chips.push({ label: srcVal, onClick: () => setMyLibSourceFilter(srcVal) });
 });
 }
 myLibSelectedTags.forEach(tagVal => {
 chips.push({ label: `#${tagVal}`, onClick: () => setMyLibTagFilter(tagVal) });
 });

 btn.classList.toggle('has-active', chips.length > 0);
 badge.innerText = String(chips.length);
 badge.classList.toggle('hidden', chips.length === 0);

 bar.innerHTML = '';
 if (chips.length === 0) {
 bar.classList.add('hidden');
 } else {
 bar.classList.remove('hidden');
 chips.forEach(c => {
 const chipBtn = document.createElement('button');
 chipBtn.type = 'button';
 chipBtn.className = 'mylib-active-chip';
 chipBtn.textContent = `${c.label} ✕`;
 chipBtn.addEventListener('click', c.onClick);
 bar.appendChild(chipBtn);
 });

 }
 }

 function applyMyLibFilters() {
 if (!myLibDuplicatesMode) {
 isViewingSkippedDuplicates = false;
 lastSkippedDupUndo = null;
 }
 updateMyLibFilterChipsUI();
 renderMyLibStatsBar();
 populateMyLibFilters();
 renderMyLibActiveChips();
 renderMyLibraryList(true);
 }

 function setMyLibStatusFilter(status) {
 if (status === 'all') {
 myLibDuplicatesMode = false;
 myLibReadingStatuses = [];
 myLibOwnershipFilter = 'all';
 myLibFormatFilter = 'all';
 myLibRatingFilter = 'all';
 myLibSelectedTags = [];
 myLibSelectedSources = [];
 } else if (status === 'e-book') {
 myLibDuplicatesMode = false;
 myLibOwnershipFilter = 'all';
 myLibFormatFilter = 'ebook';
 } else if (status === '종이책') {
 myLibDuplicatesMode = false;
 myLibOwnershipFilter = 'all';
 myLibFormatFilter = 'paper';
 } else if (status === '소장' || status === '대여' || status === '판매') {
 myLibDuplicatesMode = false;
 myLibOwnershipFilter = status;
 } else if (status === 'duplicates') {
 myLibDuplicatesMode = !myLibDuplicatesMode;
 } else {
 myLibDuplicatesMode = false;
 myLibReadingStatuses = [status];
 myLibOwnershipFilter = 'all';
 myLibFormatFilter = 'all';
 myLibRatingFilter = 'all';
 myLibSelectedTags = [];
 }
 applyMyLibFilters();
 }

 function setMyLibOwnershipFilter(val) {
 myLibDuplicatesMode = false;
 myLibOwnershipFilter = val;
 applyMyLibFilters();
 }

 function toggleMyLibOwnershipFilter(val) {
 myLibDuplicatesMode = false;
 myLibOwnershipFilter = (myLibOwnershipFilter === val) ? 'all' : val;
 applyMyLibFilters();
 }

 function setMyLibFormatFilter(val) {
 myLibDuplicatesMode = false;
 myLibFormatFilter = val;
 applyMyLibFilters();
 }

 function toggleMyLibFormatFilter(val) {
 myLibDuplicatesMode = false;
 myLibFormatFilter = (myLibFormatFilter === val) ? 'all' : val;
 applyMyLibFilters();
 }

 function setMyLibReadingStatusOnly(val) {
 myLibDuplicatesMode = false;
 myLibReadingStatuses = val === 'all' ? [] : [val];
 applyMyLibFilters();
 }

 function toggleMyLibReadingStatusFilter(st) {
 myLibDuplicatesMode = false;
 const idx = myLibReadingStatuses.indexOf(st);
 if (idx > -1) myLibReadingStatuses.splice(idx, 1);
 else myLibReadingStatuses.push(st);
 applyMyLibFilters();
 }

 function setMyLibRatingFilter(val) {
 myLibDuplicatesMode = false;
 myLibRatingFilter = val;
 applyMyLibFilters();
 }

 function toggleMyLibRatingFilter(val) {
 myLibDuplicatesMode = false;
 myLibRatingFilter = (myLibRatingFilter === val) ? 'all' : val;
 applyMyLibFilters();
 }

 function setMyLibTagFilter(tag) {
 if (!tag) {
 myLibSelectedTags = [];
 } else {
 const idx = myLibSelectedTags.indexOf(tag);
 if (idx > -1) myLibSelectedTags.splice(idx, 1);
 else myLibSelectedTags.push(tag);
 }
 applyMyLibFilters();
 }

 function setMyLibSourceFilter(src) {
 myLibDuplicatesMode = false;
 if (!src) {
 myLibSelectedSources = [];
 } else {
 const idx = myLibSelectedSources.indexOf(src);
 if (idx > -1) myLibSelectedSources.splice(idx, 1);
 else myLibSelectedSources.push(src);
 }
 applyMyLibFilters();
 }

 function getFilteredOwnedBooks() {
 const q = (document.getElementById('myLibSearchInput')?.value || '').trim().toLowerCase();
 const qCompact = q.replace(/\s+/g, '');
 const sortMode = document.getElementById('myLibSortSelect')?.value || 'recent';
 const dupSet = myLibDuplicatesMode ? getDuplicateOwnedBookSet() : null;

 let result = myOwnedBooks.filter(b => {
 if (myLibDuplicatesMode) {
 if (!dupSet.has(b)) return false;
 } else {
 if (myLibOwnershipFilter === '소장' && (isOwnedBorrowed(b) || isOwnedSold(b) || isOwnedReturned(b))) return false;
 if ((myLibOwnershipFilter === '대여중' || myLibOwnershipFilter === '대여') && (!isOwnedBorrowed(b) || isOwnedSold(b) || isOwnedReturned(b))) return false;
 if (myLibOwnershipFilter === '반납' && !isOwnedReturned(b)) return false;
 if (myLibOwnershipFilter === '판매' && !isOwnedSold(b)) return false;
 if (myLibFormatFilter === 'ebook' && !isOwnedEbook(b)) return false;
 if (myLibFormatFilter === 'paper' && isOwnedEbook(b)) return false;

 if (myLibReadingStatuses.length > 0) {
 const st = normalizeReadingStatus(b.status);
 const statusMatched = myLibReadingStatuses.some(targetSt =>
 targetSt === '예정' ? (st === '예정' || st === '') : (st === targetSt)
 );
 if (!statusMatched) return false;
 }

 if (myLibRatingFilter !== 'all') {
 const r = parseRating(b.rating);
 if (String(r) !== String(myLibRatingFilter)) return false;
 }
 }

 if (myLibSelectedTags.length > 0) {
 const tags = String(b.tags || '').split(',').map(t => t.trim());
 const tagMatched = myLibSelectedTags.some(t => tags.includes(t));
 if (!tagMatched) return false;
 }

 if (myLibSelectedSources.length > 0) {
 const s = getOwnedSource(b);
 if (!myLibSelectedSources.includes(s)) return false;
 }



 if (q) {
 const hay = `${b.title || ''} ${b.author || ''} ${b.translator || ''} ${b.tags || ''} ${b.publisher || ''} ${getOwnedSeries(b)} ${b.vol || ''} ${getOwnedMemo(b)} ${b.isbn || ''} ${b.review || ''} ${getOwnedSource(b)} ${isOwnedSold(b) ? '판매' : ''}`.toLowerCase();
 if (!hay.includes(q) && !(qCompact.length >= 2 && hay.replace(/\s+/g, '').includes(qCompact))) {
 return false;
 }
 }
 return true;
 });

 if (myLibDuplicatesMode) {
 result = result.slice().sort((a, b) => normalizeBookTitle(a.title).localeCompare(normalizeBookTitle(b.title), 'ko'));
 return result;
 }


 result = result.slice();
 const onlyPlanned = myLibReadingStatuses.length === 1 && myLibReadingStatuses[0] === '예정';

 if (sortMode === 'recent') {
 result.sort((a, b) => {
 if (onlyPlanned) {
 const aExp = normalizeReadingStatus(a.status) === '예정' ? 0 : 1;
 const bExp = normalizeReadingStatus(b.status) === '예정' ? 0 : 1;
 if (aExp !== bExp) return aExp - bExp;
 }
 return (Number(b.row) || 0) - (Number(a.row) || 0);
 });
 } else if (sortMode === 'dueDate') {
 result.sort((a, b) => {
 const da = (isOwnedBorrowed(a) && !isOwnedSold(a) && a.dueDate) ? String(a.dueDate) : '9999-99-99';
 const db = (isOwnedBorrowed(b) && !isOwnedSold(b) && b.dueDate) ? String(b.dueDate) : '9999-99-99';
 return da.localeCompare(db) || (Number(b.row) || 0) - (Number(a.row) || 0);
 });
 } else if (sortMode === 'finishDate') {
 result.sort((a, b) => String(b.finishDate || '').localeCompare(String(a.finishDate || '')) || parseRating(b.rating) - parseRating(a.rating));
 } else if (sortMode === 'rating') {
 result.sort((a, b) => parseRating(b.rating) - parseRating(a.rating) || String(a.title || '').localeCompare(String(b.title || ''), 'ko'));
 } else if (sortMode === 'title') {
 result.sort((a, b) => String(a.title || '').localeCompare(String(b.title || ''), 'ko'));
 } else if (sortMode === 'author') {
 result.sort((a, b) => String(a.author || '').localeCompare(String(b.author || ''), 'ko'));
 } else if (onlyPlanned) {
 result.sort((a, b) => {
 const aExplicit = normalizeReadingStatus(a.status) === '예정' ? 0 : 1;
 const bExplicit = normalizeReadingStatus(b.status) === '예정' ? 0 : 1;
 return aExplicit - bExplicit;
 });
 }

 return result;
 }

 function renderMyLibraryList(resetLimit = false) {
 if (resetLimit) { myLibVisibleLimit = 80; lastFilteredOwnedBooks = null; const _lc = document.getElementById('myLibListContainer'); if (_lc) _lc.dataset.renderedCount = '0'; }
 const listEl = document.getElementById('myLibListContainer');
 const infoEl = document.getElementById('myLibResultInfo');

 if (myOwnedBooks.length === 0) {
 infoEl.innerText = '내 서재 0권';
 listEl.innerHTML = `<div class="empty-state-illust-wrap" style="grid-column:1/-1;"><img class="empty-state-illust-img" src="${ILLUST_STACKED_BOOKS}" alt=""><span>아직 등록된 책이 없거나 시트에서 불러오는 중입니다.</span></div>`;
 return;
 }

 const ignoredSet = getIgnoredDuplicateKeys();
 const skippedGroupEntries = [];
 myOwnedBooksIndex.byBaseTitle.forEach((arr, key) => {
 if (arr.length >= 2 && ignoredSet.has(key)) {
 skippedGroupEntries.push({ key, books: arr });
 }
 });
 const skippedGroupCount = skippedGroupEntries.length;

 if (myLibDuplicatesMode && isViewingSkippedDuplicates) {
 const totalSkippedBooks = skippedGroupEntries.reduce((sum, g) => sum + g.books.length, 0);
 infoEl.innerHTML = `건너뛰기한 도서 ${skippedGroupCount}그룹 (${totalSkippedBooks}권) · <button class="owned-chip-btn indigo" style="padding:2px 8px; font-size:10.5px;" onclick="toggleSkippedDuplicatesView(false)">← 중복 확인</button>${skippedGroupCount > 0 ? ` <button class="owned-chip-btn skip" style="padding:2px 8px; font-size:10.5px;" onclick="resetSkippedDuplicates()">전체 복원</button>` : ''}`;

 if (skippedGroupCount === 0) {
 listEl.innerHTML = `<div class="loading-msg">건너뛰기한 도서가 없습니다.<br><button class="owned-chip-btn indigo" style="margin-top:8px;" onclick="toggleSkippedDuplicatesView(false)">← 중복 확인으로 돌아가기</button></div>`;
 return;
 }

 skippedGroupEntries.sort((a, b) => a.key.localeCompare(b.key, 'ko'));
 listEl.innerHTML = skippedGroupEntries.map(({ key, books }) => {
 const safeKey = encodeURIComponent(key);
 const headerHtml = `
 <div class="dup-group-header" style="background:#eef2ff; border-color:#c7d2fe; color:#3730a3;">
 <span>✓ 중복 아님으로 건너뛴 그룹 (${books.length}권)</span>
 <button class="owned-chip-btn indigo" onclick="restoreSkippedDuplicateGroup(decodeURIComponent('${safeKey}'))">복원</button>
 </div>
 `;
 const cardsHtml = books.map(b => {
 const idx = myOwnedBooks.indexOf(b);
 const ebook = isOwnedEbook(b);
 const transSup = getTranslatorSupervisorInfo(b);
 const subLine = `${escapeHtml(formatAuthorWithSuffix(b.author))}${b.publisher ? ' · ' + escapeHtml(b.publisher) : ''}${transSup ? ' · ' + escapeHtml(transSup) : ''}`;
 return `
 <div class="mylib-item" onclick="openOwnedEditModalByIndex(${idx})">
 <div class="mylib-item-top">
 <div style="min-width:0; flex:1;">
 <p class="mylib-item-title">${escapeHtml(formatOwnedTitle(b))}</p>
 <p class="mylib-item-sub">${subLine}</p>
 </div>
 <div class="owned-mini-actions" onclick="event.stopPropagation()">
 <button class="owned-chip-btn danger icon-trash-btn" onclick="quickDeleteOwnedByIndex(${idx})" title="삭제" aria-label="삭제">${TRASH_ICON_SVG_14}</button>
 </div>
 </div>
 <div class="mylib-item-badges">
 ${ebook ? '<span class="mylib-badge ebook">e-book</span>' : ''}
 ${formatSeriesBadgeText(b) ? `<span class="mylib-badge series">${escapeHtml(formatSeriesBadgeText(b))}</span>` : ''}
 ${b.isbn ? `<span class="mylib-badge">ISBN ${escapeHtml(b.isbn)}</span>` : ''}
 </div>
 </div>
 `;
 }).join('');
 return headerHtml + cardsHtml;
 }).join('');
 refreshIcons();
 return;
 }

 const canReuseFiltered = !resetLimit && !myLibDuplicatesMode && Array.isArray(lastFilteredOwnedBooks);
 const filtered = canReuseFiltered ? lastFilteredOwnedBooks : getFilteredOwnedBooks();
 if (!myLibDuplicatesMode) lastFilteredOwnedBooks = filtered;
 if (myLibDuplicatesMode) {
 infoEl.innerHTML = `중복 의심 ${filtered.length}권 · <button class="owned-chip-btn skip" style="padding:2px 8px; font-size:10.5px;" onclick="toggleSkippedDuplicatesView(true)">건너뛰기한 도서 목록 (${skippedGroupCount})</button>`;
 } else {
 infoEl.innerText = `총 ${myOwnedBooks.length}권 중 ${filtered.length}권 표시`;
 }

 const dupUndoBarHtml = (myLibDuplicatesMode && lastSkippedDupUndo) ? `
 <div class="inline-undo-bar full-span">
 <span style="min-width:0; overflow:hidden; text-overflow:ellipsis; white-space:nowrap;">'${escapeHtml(lastSkippedDupUndo.title)}' 중복 그룹을 건너뛰었습니다.</span>
 <button type="button" class="inline-undo-btn" onclick="undoLastSkipDuplicateGroup()">실행 취소</button>
 </div>
 ` : '';

 if (filtered.length === 0) {
 listEl.innerHTML = myLibDuplicatesMode
 ? `${dupUndoBarHtml}<div class="loading-msg">확인할 중복 의심 도서가 없습니다.${skippedGroupCount > 0 ? `<br><button class="owned-chip-btn skip" style="margin-top:8px;" onclick="toggleSkippedDuplicatesView(true)">건너뛰기한 도서 목록 보기 (${skippedGroupCount})</button>` : ''}</div>`
 : `<div class="empty-state-illust-wrap" style="grid-column:1/-1;"><img class="empty-state-illust-img" src="${ILLUST_STACKED_BOOKS}" alt=""><span>조건에 맞는 책이 없습니다.</span></div>`;
 return;
 }

 const prioritizePaperBorrowed = (myLibOwnershipFilter === '대여중' || myLibOwnershipFilter === '대여');
 if (prioritizePaperBorrowed) {
 filtered.sort((a, b) => {
 const ea = isOwnedEbook(a) ? 1 : 0;
 const eb = isOwnedEbook(b) ? 1 : 0;
 if (ea !== eb) return ea - eb;
 const da = String(a.dueDate || '').trim();
 const db = String(b.dueDate || '').trim();
 if (da && db) return da.localeCompare(db);
 if (da) return -1;
 if (db) return 1;
 return 0;
 });
 }
 const prevRenderedCount = Number(listEl.dataset.renderedCount || '0');
  const canAppend = !resetLimit && !myLibDuplicatesMode && !myLibMultiSelectMode && prevRenderedCount > 0 && prevRenderedCount < myLibVisibleLimit;
  const startIdx = canAppend ? prevRenderedCount : 0;
  const slice = filtered.slice(startIdx, myLibVisibleLimit);
  const listCoverCache = getBookCoverCache();
  let lastDupKey = '';

  const chunkHtml = slice.map(b => {
    let idx = myOwnedBooks.indexOf(b);
    if (idx === -1 && b && b.row !== undefined) idx = myOwnedBooks.findIndex(x => x.row === b.row);
    let groupHeaderHtml = '';
    if (myLibDuplicatesMode) {
      const dupKey = normalizeBookTitle(b.title);
      if (dupKey !== lastDupKey) {
        lastDupKey = dupKey;
        const safeKey = encodeURIComponent(dupKey);
        const safeSampleTitle = encodeURIComponent(formatOwnedTitle(b));
        const groupBooks = myOwnedBooksIndex.byBaseTitle.get(dupKey) || [];
        groupHeaderHtml = `
          <div class="dup-group-header">
            <span>중복 의심 그룹 (${groupBooks.length}권)</span>
            <button class="owned-chip-btn skip" onclick="skipDuplicateGroup(decodeURIComponent('${safeKey}'), decodeURIComponent('${safeSampleTitle}'))">건너뛰기</button>
          </div>
        `;
      }
    }
    return groupHeaderHtml + buildMyLibCardHtml(b, idx, listCoverCache, {
      showPublisher: myLibDuplicatesMode,
      isDupMode: myLibDuplicatesMode,
      isMsMode: myLibMultiSelectMode,
      isSelected: myLibMultiSelectMode && myLibSelectedRows.has(b.row)
    });
  }).join('');

  const remaining = filtered.length - myLibVisibleLimit;
  const loadMoreHtml = remaining > 0
    ? `<button class="kyobo-mini-btn mylib-load-more" onclick="loadMoreMyLibrary()">더 보기 (${remaining}권 남음)</button>`
    : '';

  if (canAppend) {
    listEl.querySelector('.mylib-load-more')?.remove();
    listEl.insertAdjacentHTML('beforeend', chunkHtml + loadMoreHtml);
  } else {
    listEl.innerHTML = dupUndoBarHtml + chunkHtml + loadMoreHtml;
  }
  listEl.dataset.renderedCount = String(Math.min(filtered.length, myLibVisibleLimit));
}

 
 const DEFAULT_GOOGLE_SHEET_VIEW_URL = 'https://docs.google.com/spreadsheets/d/1yIJUUF9n1tenlcBfPTN02q2KqJg1AyBMgrBeFcAUJwY/edit';
 let myLibMultiSelectMode = false;
 let myLibSelectedRows = new Set();
 let myLibLongPressTimer = null;
 let myLibLongPressStartX = 0;
 let myLibLongPressStartY = 0;
 let myLibLongPressTriggered = false;

 function openMyLibManageSheet() {
   closeQuickPopover();
   const overlay = document.getElementById('myLibManageSheetOverlay');
   if (!overlay) return;
   const dupCount = getDuplicateOwnedBookSet().size;
   const badge = document.getElementById('manageSheetDupBadge');
   if (badge) {
     badge.textContent = String(dupCount);
     badge.classList.toggle('hidden', dupCount === 0);
   }
   const fBadge = document.getElementById('manageSheetFollowBadge');
   if (fBadge) {
     const fCnt = getFollowedAuthors().length;
     fBadge.textContent = String(fCnt);
     fBadge.classList.toggle('hidden', fCnt === 0);
   }
   overlay.classList.add('open');
   refreshIcons();
 }

 function closeMyLibManageSheet() {
   document.getElementById('myLibManageSheetOverlay')?.classList.remove('open');
 }

 function openGoogleSheetDirect() {
   window.open(DEFAULT_GOOGLE_SHEET_VIEW_URL, '_blank', 'noopener');
 }

 function positionQuickPopover(anchorEl) {
   const menu = document.getElementById('quickPopoverMenu');
   if (!menu || !anchorEl) return;
   const rect = anchorEl.getBoundingClientRect();
   menu.style.visibility = 'hidden';
   menu.classList.remove('hidden');
   const mw = menu.offsetWidth || 200;
   const mh = menu.offsetHeight || 140;
   let left = rect.right - mw;
   if (left < 10) left = 10;
   if (left + mw > window.innerWidth - 10) left = window.innerWidth - mw - 10;
   let top = rect.bottom + 6;
   if (top + mh > window.innerHeight - 12) {
     top = Math.max(10, rect.top - mh - 6);
   }
   menu.style.left = left + 'px';
   menu.style.top = top + 'px';
   menu.style.visibility = 'visible';
 }

 function closeQuickPopover() {
   document.getElementById('quickPopoverBackdrop')?.classList.add('hidden');
   document.getElementById('quickPopoverMenu')?.classList.add('hidden');
 }

 function openCardQuickActionPopover(ev, idx) {
  ev.stopPropagation();
  const b = myOwnedBooks[idx];
  if (!b) return;
  const menu = document.getElementById('quickPopoverMenu');
  const backdrop = document.getElementById('quickPopoverBackdrop');
  if (!menu || !backdrop) return;

  const curSt = normalizeReadingStatus(b.status);
  const statuses = ['예정', '읽는 중', '완독', '중단'];
  const statusBtns = statuses.map(st => {
    const isAct = curSt === st;
    const cls = isAct ? (st === '완독' ? 'active-done' : 'active') : '';
    return `<button type="button" class="quick-status-btn ${cls}" onclick="quickChangeOwnedStatus(${idx}, '${st}')">${st}</button>`;
  }).join('');

  const curOwn = isOwnedSold(b) ? 'sold' : (isOwnedReturned(b) ? 'returned' : (isOwnedBorrowed(b) ? 'borrowed' : 'owned'));
  const ownItems = [
    { key: 'owned', label: '소장', actCls: 'active-own' },
    { key: 'borrowed', label: '대여중', actCls: 'active-borrow' },
    { key: 'returned', label: '반납', actCls: 'active-warn' },
    { key: 'sold', label: '판매', actCls: 'active-warn' }
  ];
  const ownBtns = ownItems.map(it => {
    const cls = curOwn === it.key ? it.actCls : '';
    return `<button type="button" class="quick-status-btn ${cls}" onclick="quickChangeOwnedOwnership(${idx}, '${it.key}')">${it.label}</button>`;
  }).join('');

  const popThumb = getOwnedBookThumbUrl(b);
  menu.innerHTML = `
    <div class="quick-popover-book-header">
      <img class="quick-popover-book-thumb" src="${escapeHtml(popThumb)}" alt="" onerror="this.onerror=null;this.src=NO_COVER_SVG">
      <div class="quick-popover-book-meta">
        <p class="quick-popover-book-title">${escapeHtml(formatOwnedTitle(b))}</p>
        <p class="quick-popover-book-author">${escapeHtml(formatAuthorText(b.author))}</p>
      </div>
    </div>
    <div class="quick-popover-divider"></div>
    <button type="button" class="quick-popover-item" onclick="closeQuickPopover(); openOwnedEditModalByIndex(${idx});">
      <span>수정</span>
    </button>
    <button type="button" class="quick-popover-item danger" onclick="closeQuickPopover(); quickDeleteOwnedByIndex(${idx});">
      <span>서재에서 삭제</span>
    </button>
    <div class="quick-popover-divider"></div>
    <div class="quick-popover-section-label">독서상태</div>
    <div class="quick-popover-status-grid">${statusBtns}</div>
    <div class="quick-popover-section-label" style="margin-top:2px;">소장 상태</div>
    <div class="quick-popover-status-grid">${ownBtns}</div>
  `;
  backdrop.classList.remove('hidden');
  positionQuickPopover(ev.currentTarget);
  refreshIcons(menu);
}

async function quickChangeOwnedOwnership(idx, mode) {
  closeQuickPopover();
  const b = myOwnedBooks[idx];
  if (!b) return;
  const labelMap = { owned: '소장', borrowed: '대여중', returned: '반납', sold: '판매' };
  const isBorrowed = (mode === 'borrowed');
  const isReturned = (mode === 'returned');
  const isSold = (mode === 'sold');
  const updatedBook = {
    ...b,
    isEbook: isOwnedEbook(b),
    isBorrowed,
    isReturned,
    isSold,
    source: isSold ? '' : (b.source || b.borrowSource || ''),
    borrowSource: isSold ? '' : (b.borrowSource || b.source || ''),
    dueDate: isBorrowed ? (b.dueDate || '') : ''
  };
  setOwnedBorrowFlag(updatedBook, isBorrowed);
  try {
    const res = await sendSheetPost({
      target: 'library',
      action: 'lib_update',
      row: b.row,
      origTitle: b.title,
      origAuthor: b.author,
      origIsbn: b.isbn,
      origIsEbook: isOwnedEbook(b),
      book: updatedBook
    });
    if (res && res.status === 'ok') {
      showToast(`'${formatOwnedTitle(b)}' 상태를 '${labelMap[mode]}'(으)로 변경했어요.`, 'success');
    }
  } catch (e) {
    showToast('소장 상태 변경에 실패했습니다.', 'error');
  }
}

async function quickChangeOwnedStatus(idx, newStatus) {
   closeQuickPopover();
   const b = myOwnedBooks[idx];
   if (!b) return;
   const today = getTodayDateStr();
   const updatedBook = { ...b, status: newStatus };
   if (newStatus === '읽는 중' && !updatedBook.startDate) updatedBook.startDate = today;
   if (newStatus === '완독' && !updatedBook.finishDate) updatedBook.finishDate = today;
   try {
     const res = await sendSheetPost({
       target: 'library',
       action: 'lib_update',
       row: b.row,
       origTitle: b.title,
       origAuthor: b.author,
       book: updatedBook
     });
     if (res && res.status === 'ok') {
       showToast(`'${formatOwnedTitle(b)}' 상태를 '${newStatus}'(으)로 변경했어요.`, 'success');
     }
   } catch (e) {
     showToast('상태 변경에 실패했습니다.', 'error');
   }
 }

 function handleMyLibCardPointerDown(ev, idx) {
   if (myLibDuplicatesMode || myLibMultiSelectMode || isMyLibActivelyScrolling) return;
   if (ev.target.closest('button')) return;
   myLibLongPressTriggered = false;
   myLibLongPressStartX = ev.clientX;
   myLibLongPressStartY = ev.clientY;
   cancelMyLibCardLongPress();
   myLibLongPressTimer = setTimeout(() => {
     myLibLongPressTriggered = true;
     const b = myOwnedBooks[idx];
     if (!b) return;
     if (navigator.vibrate) { try { navigator.vibrate(20); } catch (e) {} }
     enterMyLibMultiSelectMode(b.row);
   }, 480);
 }

 function handleMyLibCardPointerMove(ev) {
   if (!myLibLongPressTimer) return;
   if (Math.hypot(ev.clientX - myLibLongPressStartX, ev.clientY - myLibLongPressStartY) > 6) {
     cancelMyLibCardLongPress();
   }
 }

 function cancelMyLibCardLongPress() {
   if (myLibLongPressTimer) {
     clearTimeout(myLibLongPressTimer);
     myLibLongPressTimer = null;
   }
 }

 function handleMyLibCardClick(ev, idx) {
   if (myLibLongPressTriggered) {
     myLibLongPressTriggered = false;
     return;
   }
   if (myLibMultiSelectMode) {
     const b = myOwnedBooks[idx];
     if (!b) return;
     if (myLibSelectedRows.has(b.row)) myLibSelectedRows.delete(b.row);
     else myLibSelectedRows.add(b.row);

     updateMyLibMultiSelectBar();
     const cardEl = ev.currentTarget || ev.target.closest('.mylib-item');
     if (cardEl) cardEl.classList.toggle('is-selected', myLibSelectedRows.has(b.row));
     return;
   }
   openOwnedEditModalByIndex(idx);
 }

 const batchEditState = {
   open: false,
   ownership: '',
   format: '',
   source: '',
   dueDate: '',
   status: '',
   tags: ''
 };

 function resetBatchEditState() {
   batchEditState.ownership = '';
   batchEditState.format = '';
   batchEditState.source = '';
   batchEditState.dueDate = '';
   batchEditState.status = '';
   batchEditState.tags = '';
   const sIn = document.getElementById('batchSourceInput');
   const dIn = document.getElementById('batchDueDateInput');
   const tIn = document.getElementById('batchTagsInput');
   if (sIn) sIn.value = '';
   if (dIn) dIn.value = '';
   if (tIn) tIn.value = '';
   renderBatchEditPanelUI();
 }

 function toggleBatchEditPanel(forceState) {
   if (myLibSelectedRows.size === 0 && forceState !== false) {
     showToast('수정할 책을 먼저 선택해 주세요.', 'info');
     return;
   }
   batchEditState.open = (typeof forceState === 'boolean') ? forceState : !batchEditState.open;
   renderBatchEditPanelUI();
 }

 function toggleBatchEditField(field, val) {
   batchEditState[field] = (batchEditState[field] === val) ? '' : val;
   if (field === 'ownership' && batchEditState.ownership !== 'borrowed') {
     batchEditState.dueDate = '';
     const dIn = document.getElementById('batchDueDateInput');
     if (dIn) dIn.value = '';
   }
   renderBatchEditPanelUI();
 }

 function selectBatchSourceChip(src) {
   const norm = normalizeSourceName(src);
   batchEditState.source = (batchEditState.source === norm) ? '' : norm;
   const sIn = document.getElementById('batchSourceInput');
   if (sIn) sIn.value = batchEditState.source;
   renderBatchEditPanelUI();
 }

 function setBatchDueDatePlus7Days() {
   const d = new Date();
   d.setDate(d.getDate() + 7);
   const y = d.getFullYear();
   const m = String(d.getMonth() + 1).padStart(2, '0');
   const day = String(d.getDate()).padStart(2, '0');
   const val = `${y}-${m}-${day}`;
   batchEditState.dueDate = val;
   const dIn = document.getElementById('batchDueDateInput');
   if (dIn) dIn.value = val;
 }

 function renderBatchEditPanelUI() {
   const panel = document.getElementById('myLibBatchEditPanel');
   const toggleBtn = document.getElementById('myLibBatchEditToggleBtn');
   if (panel) panel.classList.toggle('hidden', !batchEditState.open);
   if (toggleBtn) toggleBtn.classList.toggle('active', batchEditState.open);

   const ownClsMap = { owned: 'active-owned', borrowed: 'active-borrowed', returned: 'active-returned', sold: 'active-sold' };
   document.querySelectorAll('#batchOwnershipGroup .owned-ridi-chip').forEach(btn => {
     const v = btn.getAttribute('data-val');
     btn.classList.remove('active-owned', 'active-borrowed', 'active-returned', 'active-sold');
     if (v === batchEditState.ownership && ownClsMap[v]) btn.classList.add(ownClsMap[v]);
   });

   const fmtClsMap = { paper: 'active-paper', ebook: 'active-ebook' };
   document.querySelectorAll('#batchFormatGroup .owned-ridi-chip').forEach(btn => {
     const v = btn.getAttribute('data-val');
     btn.classList.remove('active-paper', 'active-ebook');
     if (v === batchEditState.format && fmtClsMap[v]) btn.classList.add(fmtClsMap[v]);
   });

   const stClsMap = { '예정': 'active-planned', '읽는 중': 'active-reading', '완독': 'active-done', '중단': 'active-stop' };
   document.querySelectorAll('#batchStatusGroup .owned-ridi-chip').forEach(btn => {
     const v = btn.getAttribute('data-val');
     btn.classList.remove('active-planned', 'active-reading', 'active-done', 'active-stop');
     if (v === batchEditState.status && stClsMap[v]) btn.classList.add(stClsMap[v]);
   });

   const dueRow = document.getElementById('batchDueDateRow');
   if (dueRow) dueRow.classList.toggle('hidden', batchEditState.ownership !== 'borrowed');

   const srcLabel = document.getElementById('batchSourceLabel');
   if (srcLabel) {
     srcLabel.textContent = (batchEditState.ownership === 'borrowed' || batchEditState.ownership === 'returned') ? '대여처 *' : '소장/대여처';
   }

   const srcChipsEl = document.getElementById('batchSourceChips');
   if (srcChipsEl) {
     const isEbookMode = batchEditState.format === 'ebook';
     const isBorrowMode = batchEditState.ownership === 'borrowed' || batchEditState.ownership === 'returned';
     let pool = [];
     if (isBorrowMode && isEbookMode) pool = EBOOK_BORROW_SOURCES;
     else if (isBorrowMode && batchEditState.format === 'paper') pool = OFFLINE_BORROW_SOURCES;
     else if (isEbookMode) pool = Array.from(new Set([...EBOOK_OWNED_SOURCES, ...EBOOK_BORROW_SOURCES]));
     else pool = Array.from(new Set([...OFFLINE_BORROW_SOURCES, ...EBOOK_OWNED_SOURCES, ...EBOOK_BORROW_SOURCES]));
     const curSrc = normalizeSourceName(batchEditState.source);
     srcChipsEl.innerHTML = pool.map(src => {
       const norm = normalizeSourceName(src);
       const act = curSrc === norm ? 'active-owned' : '';
       return `<button type="button" class="owned-ridi-chip ${act}" onclick="selectBatchSourceChip('${escapeHtml(norm)}')">${escapeHtml(norm)}</button>`;
     }).join('');
   }

   const applyBtn = document.getElementById('myLibBatchApplyBtn');
   if (applyBtn) {
     applyBtn.textContent = `선택한 ${myLibSelectedRows.size}권 일괄 적용`;
   }
   if (panel && batchEditState.open) refreshIcons(panel);
 }

 async function applyBatchEditChanges() {
   const targets = myOwnedBooks.filter(b => myLibSelectedRows.has(b.row));
   if (targets.length === 0) { showToast('선택된 책이 없어요.', 'info'); return; }

   const hasOwn = !!batchEditState.ownership;
   const hasFmt = !!batchEditState.format;
   const normSource = normalizeSourceName(batchEditState.source);
   const hasSrc = !!normSource;
   const hasDue = !!batchEditState.dueDate;
   const hasSt = !!batchEditState.status;
   const newTags = String(batchEditState.tags || '').split(/[,\s]+/).map(t => t.replace(/^#+/, '').trim()).filter(Boolean);
   const hasTags = newTags.length > 0;

   if (!hasOwn && !hasFmt && !hasSrc && !hasDue && !hasSt && !hasTags) {
     showToast('변경할 항목을 하나 이상 선택해 주세요.', 'info');
     return;
   }

   if (hasOwn && (batchEditState.ownership === 'borrowed' || batchEditState.ownership === 'returned') && !hasSrc) {
     const missingSrcCount = targets.filter(b => !getOwnedSource(b)).length;
     if (missingSrcCount > 0) {
       showToast(`대여처가 없는 책 ${missingSrcCount}권이 있어 대여처를 선택해야 합니다.`, 'error');
       return;
     }
   }

   const applyBtn = document.getElementById('myLibBatchApplyBtn');
   if (applyBtn) { applyBtn.disabled = true; applyBtn.textContent = '적용 중...'; }
   showToast(`${targets.length}권 일괄 수정 중...`, 'info');

   const today = getTodayDateStr();
   let okCount = 0;
   for (const b of targets) {
     const nextIsEbook = hasFmt ? (batchEditState.format === 'ebook') : isOwnedEbook(b);
     let nextBorrowed = isOwnedBorrowed(b);
     let nextReturned = isOwnedReturned(b);
     let nextSold = isOwnedSold(b);
     if (hasOwn) {
       nextBorrowed = (batchEditState.ownership === 'borrowed');
       nextReturned = (batchEditState.ownership === 'returned');
       nextSold = (batchEditState.ownership === 'sold');
     }
     const nextSource = nextSold ? '' : (hasSrc ? normSource : getOwnedSource(b));
     const nextDue = nextBorrowed ? (hasDue ? batchEditState.dueDate : (b.dueDate || '')) : '';
     const nextStatus = hasSt ? batchEditState.status : (b.status || '');
     let nextStart = b.startDate || '';
     let nextFinish = b.finishDate || '';
     if (hasSt && nextStatus === '읽는 중' && !nextStart) nextStart = today;
     if (hasSt && nextStatus === '완독' && !nextFinish) nextFinish = today;

     let nextTagsStr = b.tags || '';
     if (hasTags) {
       const existing = String(b.tags || '').split(',').map(t => t.trim()).filter(Boolean);
       const merged = existing.slice();
       newTags.forEach(t => { if (!merged.includes(t)) merged.push(t); });
       nextTagsStr = merged.join(', ');
     }

     const updatedBook = {
       ...b,
       isEbook: nextIsEbook,
       isBorrowed: nextBorrowed,
       isReturned: nextReturned,
       isSold: nextSold,
       source: nextSource,
       borrowSource: nextSource,
       dueDate: nextDue,
       status: nextStatus,
       startDate: nextStart,
       finishDate: nextFinish,
       tags: nextTagsStr
     };
     setOwnedEbookFlag(updatedBook, nextIsEbook);
     setOwnedBorrowFlag(updatedBook, nextBorrowed);
     try {
       const res = await sendSheetPost({
         target: 'library',
         action: 'lib_update',
         row: b.row,
         origTitle: b.title,
         origAuthor: b.author,
         origIsbn: b.isbn,
         origIsEbook: isOwnedEbook(b),
         book: updatedBook
       });
       if (res && res.status === 'ok') okCount++;
     } catch (e) {}
   }

   if (applyBtn) applyBtn.disabled = false;
   exitMyLibMultiSelectMode();
   showToast(`${okCount}권을 일괄 수정했어요.`, 'success');
 }

 function getMultiSelectCandidateBooks() {
   const filtered = Array.isArray(lastFilteredOwnedBooks) ? lastFilteredOwnedBooks : getFilteredOwnedBooks();
   return filtered.filter(b => b && b.row !== undefined);
 }

 function enterMyLibMultiSelectMode(initialRow) {
   myLibDuplicatesMode = false;
   myLibMultiSelectMode = true;
   myLibSelectedRows.clear();
   batchEditState.open = false;
   resetBatchEditState();
   if (initialRow !== undefined && initialRow !== null) myLibSelectedRows.add(initialRow);
   updateMyLibMultiSelectBar();
   renderMyLibraryList(false);
 }

 function exitMyLibMultiSelectMode() {
   myLibMultiSelectMode = false;
   myLibSelectedRows.clear();
   batchEditState.open = false;
   resetBatchEditState();
   updateMyLibMultiSelectBar();
   renderMyLibraryList(false);
 }

 function updateMyLibMultiSelectBar() {
   const bar = document.getElementById('myLibMultiSelectBar');
   const cntEl = document.getElementById('myLibMultiSelectCount');
   const allBtn = document.getElementById('myLibSelectAllBtn');
   const fab = document.getElementById('myLibFabStack');
   if (fab) fab.classList.toggle('hidden', myLibMultiSelectMode);
   if (!bar) return;
   bar.classList.toggle('hidden', !myLibMultiSelectMode);
   if (cntEl) cntEl.textContent = `${myLibSelectedRows.size}권 선택됨`;
   if (allBtn) {
     const candidates = getMultiSelectCandidateBooks();
     const allSelected = candidates.length > 0 && candidates.every(b => myLibSelectedRows.has(b.row));
     allBtn.textContent = allSelected ? '전체해제' : `전체선택 (${candidates.length})`;
   }
   renderBatchEditPanelUI();
   if (myLibMultiSelectMode) refreshIcons(bar);
 }

 function toggleSelectAllMyLib() {
   const candidates = getMultiSelectCandidateBooks();
   const allSelected = candidates.length > 0 && candidates.every(b => myLibSelectedRows.has(b.row));
   if (allSelected) {
     myLibSelectedRows.clear();
   } else {
     candidates.forEach(b => myLibSelectedRows.add(b.row));
   }
   updateMyLibMultiSelectBar();
   renderMyLibraryList(false);
 }

 async function batchUpdateSelectedOwnership(mode) {
   const targets = myOwnedBooks.filter(b => myLibSelectedRows.has(b.row));
   if (targets.length === 0) { showToast('선택된 책이 없어요.', 'info'); return; }
   const labelMap = { owned: '소장', borrowed: '대여중', returned: '반납', sold: '판매' };
   const label = labelMap[mode] || mode;
   let okCount = 0;
   showToast(`${targets.length}권을 '${label}' 상태로 변경 중...`, 'info');
   for (const b of targets) {
     const isBorrowed = (mode === 'borrowed');
     const isReturned = (mode === 'returned');
     const isSold = (mode === 'sold');
     const updatedBook = {
       ...b,
       isEbook: isOwnedEbook(b),
       isBorrowed,
       isReturned,
       isSold,
       source: isSold ? '' : (b.source || b.borrowSource || ''),
       borrowSource: isSold ? '' : (b.borrowSource || b.source || ''),
       dueDate: isBorrowed ? (b.dueDate || '') : ''
     };
     setOwnedBorrowFlag(updatedBook, isBorrowed);
     try {
       const res = await sendSheetPost({
         target: 'library',
         action: 'lib_update',
         row: b.row,
         origTitle: b.title,
         origAuthor: b.author,
         origIsbn: b.isbn,
         origIsEbook: isOwnedEbook(b),
         book: updatedBook
       });
       if (res && res.status === 'ok') okCount++;
     } catch (e) {}
   }
   exitMyLibMultiSelectMode();
   showToast(`${okCount}권을 '${label}'(으)로 변경했어요.`, 'success');
 }

 async function batchUpdateSelectedStatus(newStatus) {
   const targets = myOwnedBooks.filter(b => myLibSelectedRows.has(b.row));
   if (targets.length === 0) { showToast('선택된 책이 없어요.', 'info'); return; }
   const today = getTodayDateStr();
   let okCount = 0;
   showToast(`${targets.length}권의 상태를 '${newStatus}'(으)로 변경 중...`, 'info');
   for (const b of targets) {
     const updatedBook = { ...b, status: newStatus };
     if (newStatus === '읽는 중' && !updatedBook.startDate) updatedBook.startDate = today;
     if (newStatus === '완독' && !updatedBook.finishDate) updatedBook.finishDate = today;
     try {
       const res = await sendSheetPost({
         target: 'library',
         action: 'lib_update',
         row: b.row,
         origTitle: b.title,
         origAuthor: b.author,
         book: updatedBook
       });
       if (res && res.status === 'ok') okCount++;
     } catch (e) {}
   }
   exitMyLibMultiSelectMode();
   showToast(`${okCount}권을 '${newStatus}'(으)로 변경했어요.`, 'success');
 }

 
 async function batchUpdateSelectedTags() {
   const targets = myOwnedBooks.filter(b => myLibSelectedRows.has(b.row));
   if (targets.length === 0) { showToast('선택된 책이 없어요.', 'info'); return; }
   const raw = prompt(`선택한 ${targets.length}권에 추가할 태그를 입력하세요 (쉼표 또는 띄어쓰기로 구분):`, '');
   if (raw === null) return;
   const newTags = raw.split(/[,\s]+/).map(t => t.replace(/^#+/, '').trim()).filter(Boolean);
   if (newTags.length === 0) return;
   let okCount = 0;
   showToast(`${targets.length}권에 태그 추가 중...`, 'info');
   for (const b of targets) {
     const existing = String(b.tags || '').split(',').map(t => t.trim()).filter(Boolean);
     const merged = existing.slice();
     newTags.forEach(t => { if (!merged.includes(t)) merged.push(t); });
     try {
       const res = await sendSheetPost({
         target: 'library',
         action: 'lib_update',
         row: b.row,
         origTitle: b.title,
         origAuthor: b.author,
         book: { ...b, tags: merged.join(', ') }
       });
       if (res && res.status === 'ok') okCount++;
     } catch (e) {}
   }
   exitMyLibMultiSelectMode();
   showToast(`${okCount}권에 태그(#${newTags.join(', #')})를 추가했어요.`, 'success');
 }


 async function batchDeleteSelectedBooks() {
  const targets = myOwnedBooks.filter(b => myLibSelectedRows.has(b.row)).sort((a, b) => (Number(b.row) || 0) - (Number(a.row) || 0));
  if (targets.length === 0) { showToast('선택된 책이 없어요.', 'info'); return; }
  if (!confirm(`선택한 ${targets.length}권의 도서를 내 서재에서 삭제할까요?`)) return;
  const backups = targets.map(t => ({ ...t }));
  let okCount = 0;
  showToast(`${targets.length}권 삭제 중...`, '');
  for (const target of targets) {
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
      if (res && res.status === 'ok') okCount++;
    } catch (e) {}
  }
  exitMyLibMultiSelectMode();
  if (okCount > 0) {
    showToast(`${okCount}권을 삭제했습니다.`, '', {
      label: '실행 취소',
      onClick: () => restoreDeletedOwnedBooks(backups)
    });
  } else {
    showToast('삭제에 실패했습니다.', 'error');
  }
}

 function loadMoreMyLibrary() {
 myLibVisibleLimit += 60;
 renderMyLibraryList(false);
 }

 function searchFromMyLibraryByIndex(idx) {
 const b = myOwnedBooks[idx];
 if (!b) return;
 const cleanTitle = String(b.title || '')
 .replace(/^\d{1,3}\s+(?=\D)/, '')
 .replace(/\([^)]*\)/g, '')
 .trim();
 closeMyLibraryModal();
 document.getElementById('liveOwnedDropdown').classList.add('hidden');
 document.getElementById('searchInput').value = cleanTitle;
 executeSearch(cleanTitle);
 }

 function openOwnedAddModalForSearchIndex(index) {
 const item = currentBooksList[index];
 if (!item || !item.doc) return;
 const doc = item.doc;
 const parsedPeople = splitAuthorAndTranslator(doc.authors || '');
 openOwnedEditModal({
 mode: 'add',
 book: {
 title: doc.bookname || '',
 author: parsedPeople.author,
 translator: parsedPeople.translator,
 publisher: doc.publisher || '',
 tags: extractTagsFromDoc(doc).join(', '),
 series: '', memo: '', status: '예정', rating: '',
 isbn: String(doc.isbn13 || doc.isbn || ''),
 pubYear: doc.publication_year || '',
 cover: doc.bookImageURL || '',
 description: doc.description || '',
 kdc: doc.class_nm || '',
 finishDate: '', review: ''
 }
 });
 }

 function openOwnedAddModalForCurrent() {
 if (!currentSelectedBook) {
 openOwnedEditModal({
 mode: 'add',
 book: {
 title: document.getElementById('searchInput').value.trim(),
 author: '', publisher: '', tags: '', series: '', memo: '', status: '예정', rating: '', isbn: '', finishDate: '', review: ''
 }
 });
 return;
 }

 const parsedPeople = splitAuthorAndTranslator(currentSelectedBook.authors || '');
 openOwnedEditModal({
 mode: 'add',
 book: {
 title: currentSelectedBook.bookname || '',
 author: parsedPeople.author,
 translator: parsedPeople.translator,
 publisher: currentSelectedBook.publisher || '',
 tags: extractTagsFromDoc(currentSelectedBook).join(', '), series: '', memo: '', status: '예정', rating: '',
 isbn: String(currentSelectedBook.isbn13 || currentSelectedBook.isbn || ''),
 finishDate: '', review: ''
 }
 });
 }

 function openOwnedEditModalByIndex(idx) {
 const book = myOwnedBooks[idx];
 if (!book) return;
 openOwnedEditModal({ mode: 'edit', book: { ...book } });
 }

 function openMoveBookmarkToLibraryModal(bookmark, replaceHistory = false) {
 if (!bookmark) return;
 openOwnedEditModal({
 mode: 'add',
 replaceHistory: !!replaceHistory,
 fromBookmarkIsbn: String(bookmark.isbn || ''),
 book: {
 title: bookmark.title || '',
 author: formatAuthorText(bookmark.author || ''),
 publisher: '',
 tags: '',
 note: '',
 status: '예정',
 rating: '',
 isbn: String(bookmark.isbn || ''),
 finishDate: '',
 review: bookmark.memo ? bookmark.memo.slice(0, 120) : ''
 }
 });
 }

 function openOwnedEditModal(context) {
 const ctx = context || {
 mode: 'add',
 book: { title: '', author: '', publisher: '', tags: '', series: '', memo: '', status: '예정', rating: '', isbn: '', startDate: '', finishDate: '', review: '' }
 };
 activeOwnedEditContext = ctx;
 lastAutoFillQueryKey = '';
 const b = ctx.book;

 document.getElementById('ownedEditModalTitle').innerText =
 ctx.fromBookmarkIsbn ? '북마크 → 내 서재로 옮기기' :
 (ctx.mode === 'edit' ? '내 서재 기록 수정' : '내 서재에 새 책 추가');

 const checkRow = document.getElementById('removeBookmarkCheckRow');
 if (ctx.fromBookmarkIsbn) {
 checkRow.classList.remove('hidden');
 document.getElementById('removeBookmarkOnMove').checked = true;
 } else {
 checkRow.classList.add('hidden');
 }

 document.getElementById('ownedInputTitle').value = b.title || '';
 document.getElementById('ownedInputAuthor').value = b.author || '';
 document.getElementById('ownedInputPublisher').value = b.publisher || '';
 setOwnedEditTagsFromString(b.tags || '');
 document.getElementById('ownedInputSeries').value = getOwnedSeries(b);
 document.getElementById('ownedInputVol').value = String(b.vol || '').trim();
 document.getElementById('ownedInputTranslator').value = String(b.translator || '').trim();
 document.getElementById('ownedInputMemo').value = getOwnedMemo(b);
 document.getElementById('ownedInputIsbn').value = b.isbn || '';
 document.getElementById('ownedInputStartDate').value = b.startDate || '';
 document.getElementById('ownedInputFinishDate').value = b.finishDate || '';
 const reviewEl = document.getElementById('ownedInputReview');
 reviewEl.value = b.review || '';
 setTimeout(() => autoResizeTextarea(reviewEl), 0);

 const normalizedSt = normalizeReadingStatus(b.status) || (ctx.mode === 'add' ? '예정' : '');
 selectOwnedStatus(normalizedSt, false);
 selectOwnedRating(parseRating(b.rating), false);
 document.getElementById('ownedInputDueDate').value = b.dueDate || '';
 const initialSourceVal = getOwnedSource(b);
 setOwnedBorrowToggle(isOwnedBorrowed(b));
 selectedOwnedIsReturned = isOwnedReturned(b);
 setOwnedSoldToggle(isOwnedSold(b));
 setOwnedEbookToggle(isOwnedEbook(b));
 updateSourceFieldUI(initialSourceVal);
 updateDueDateFieldVisibility();
 currentModalPubYear = String(b.pubYear || '').trim();
 currentModalDescription = String(b.description || '').trim();
 currentModalKdc = String(b.kdc || '').trim();
 currentModalVol = String(b.vol || '').trim();
 currentModalLoanStats = String(b.loanStats || '').trim();
 currentModalKakaoUrl = '';
 isOwnedPlotExpanded = false;
 isOwnedPlotEditing = false;
 const bioCache = getBookAuthorBioCache();
 const bioKey = normalizeIsbn(b.isbn) || normalizeBookTitle(b.title);
 currentModalAuthorBio = (bioKey && bioCache[bioKey]) ? bioCache[bioKey] : '';
 closeOwnedBookCandidates();
 resetOwnedAuthorOtherBooksUI(b.author || '');
 resetAllInlineMetaEditors();
 syncInlineMetaButtons();
 renderOwnedMetaPlotBox();
 renderRecommendedTagPicks();
 loadOwnedEditCover(b);

 const deleteBtn = document.getElementById('ownedDeleteBtn');
 if (deleteBtn) {
 if (ctx.mode === 'edit') deleteBtn.classList.remove('hidden');
 else deleteBtn.classList.add('hidden');
 }

 ownedModalInitialSnapshot = getOwnedModalFormSnapshot();

 const editOverlay = document.getElementById('ownedEditModalOverlay');
 editOverlay.classList.add('open');
 const editModalBox = editOverlay.querySelector('.memo-modal-box');
 if (editModalBox) {
   editModalBox.scrollTop = 0;
   requestAnimationFrame(() => { editModalBox.scrollTop = 0; });
 }
 pushModalHistory('ownedEdit', !!ctx.replaceHistory);
 refreshIcons(editOverlay);

 if (ctx.mode === 'edit') {
 autoFetchMissingBookMetaOnEditOpen(b);
 }
 }

 let ownedModalInitialSnapshot = '';

 function getOwnedModalFormSnapshot() {
 return JSON.stringify({
 title: (document.getElementById('ownedInputTitle')?.value || '').trim(),
 author: (document.getElementById('ownedInputAuthor')?.value || '').trim(),
 translator: (document.getElementById('ownedInputTranslator')?.value || '').trim(),
 isbn: normalizeIsbn(document.getElementById('ownedInputIsbn')?.value || ''),
 pubYear: currentModalPubYear || '',
 kdc: cleanCategoryDisplay(currentModalKdc || ''),
 dueDate: (document.getElementById('ownedInputDueDate')?.value || '').trim(),
 source: (document.getElementById('ownedInputSource')?.value || '').trim(),
 status: selectedOwnedStatus,
 rating: selectedOwnedRating,
 startDate: (document.getElementById('ownedInputStartDate')?.value || '').trim(),
 finishDate: (document.getElementById('ownedInputFinishDate')?.value || '').trim(),
 review: (document.getElementById('ownedInputReview')?.value || '').trim(),
 tags: ownedEditTagsList.join(','),
 series: (document.getElementById('ownedInputSeries')?.value || '').trim(),
 vol: (document.getElementById('ownedInputVol')?.value || '').trim(),
 publisher: (document.getElementById('ownedInputPublisher')?.value || '').trim(),
 memo: (document.getElementById('ownedInputMemo')?.value || '').trim(),
 isEbook: selectedOwnedIsEbook,
 isBorrowed: selectedOwnedIsBorrowed,
 isReturned: selectedOwnedIsReturned,
 isSold: selectedOwnedIsSold,
 description: currentModalDescription || '',
 cover: currentModalCoverUrl || ''
 });
 }

 function isOwnedModalDirty() {
 if (!activeOwnedEditContext || !ownedModalInitialSnapshot) return false;
 return getOwnedModalFormSnapshot() !== ownedModalInitialSnapshot;
 }

 function openDirtyConfirmModal() {
 const el = document.getElementById('dirtyConfirmModalOverlay');
 if (!el) return;
 el.classList.add('open');
 pushModalHistory('dirtyConfirm');
 }

 function cancelDirtyConfirmModal() {
 const el = document.getElementById('dirtyConfirmModalOverlay');
 if (el) el.classList.remove('open');
 popModalHistory('dirtyConfirm');
 }

 function discardAndCloseOwnedEditModal() {
 const el = document.getElementById('dirtyConfirmModalOverlay');
 if (el) el.classList.remove('open');
 popModalHistory('dirtyConfirm', true);
 closeOwnedEditModal(true);
 }

 function saveAndCloseOwnedEditModal() {
 const el = document.getElementById('dirtyConfirmModalOverlay');
 if (el) el.classList.remove('open');
 popModalHistory('dirtyConfirm', true);
 saveOwnedBookFromModal();
 }

 function closeOwnedEditModal(force = false) {
 if (!force && activeOwnedEditContext && isOwnedModalDirty()) {
 // 안드로이드 뒤로가기로 popstate가 이미 발생했다면 모달 히스토리를 유지한 채 확인창 표시
 if (isHandlingPopState) {
 pushModalHistory('ownedEdit', false);
 }
 openDirtyConfirmModal();
 return;
 }
 document.getElementById('ownedEditModalOverlay').classList.remove('open');
 popModalHistory('ownedEdit');
 activeOwnedEditContext = null;
 ownedModalInitialSnapshot = '';
 }

 function selectOwnedStatus(statusVal, autoDate = true) {
 selectedOwnedStatus = statusVal || '';
 const clsMap = { '예정': 'active-planned', '읽는 중': 'active-reading', '완독': 'active-done', '중단': 'active-stop' };
 document.querySelectorAll('#ownedStatusGroup .owned-ridi-chip').forEach(btn => {
 const val = btn.getAttribute('data-val');
 btn.classList.remove('active-planned', 'active-reading', 'active-done', 'active-stop');
 if (val === selectedOwnedStatus && clsMap[val]) btn.classList.add(clsMap[val]);
 });
 if (autoDate) {
 const startEl = document.getElementById('ownedInputStartDate');
 const finishEl = document.getElementById('ownedInputFinishDate');
 if (selectedOwnedStatus === '읽는 중' && startEl && !startEl.value) {
 startEl.value = getTodayDateStr();
 } else if (selectedOwnedStatus === '완독' && finishEl && !finishEl.value) {
 finishEl.value = getTodayDateStr();
 }
 }
 updateDueDateFieldVisibility();
 updateOwnedModalCoverVisuals();
 }

 function selectOwnedRating(starVal, allowToggleReset = true) {
 const n = Math.min(5, Math.max(0, Math.round(Number(starVal) || 0)));
 if (allowToggleReset && selectedOwnedRating === n) {
 selectedOwnedRating = 0;
 } else {
 selectedOwnedRating = n;
 }
 document.querySelectorAll('#ownedStarPicker .star-btn').forEach(btn => {
 const s = Number(btn.getAttribute('data-star')) || 0;
 btn.classList.toggle('active', s <= selectedOwnedRating);
 });
 }

 const EBOOK_OWNED_SOURCES = ['교보e-book', '알라딘e-book', '리디북스', '북이오', '구글플레이북'];
 const EBOOK_BORROW_SOURCES = ['밀리의서재', '알라딘e-book', '알라딘전자도서관', '교보전자도서관', '예스24전자도서관', '이씨오도서관', '서울도서관통합전자책', '부커스', '북큐브', '에피루스'];
 const OFFLINE_BORROW_SOURCES = ['남산도서관', '청파도서관', '꿈나무도서관', '이화여대도서관'];

 function makeAppBadgeSvg(bg, fg, text, sub = '') {
 const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="64" height="64" viewBox="0 0 64 64">` +
 `<rect width="64" height="64" rx="16" fill="${bg}"/>` +
 `<text x="32" y="${sub ? '32' : '38'}" text-anchor="middle" font-family="sans-serif" font-size="${text.length > 3 ? '14' : (text.length > 2 ? '17' : '22')}" font-weight="900" fill="${fg}">${text}</text>` +
 (sub ? `<text x="32" y="48" text-anchor="middle" font-family="sans-serif" font-size="10" font-weight="700" fill="${fg}" opacity="0.9">${sub}</text>` : '') +
 `</svg>`;
 return 'data:image/svg+xml;charset=UTF-8,' + encodeURIComponent(svg);
 }

 const SOURCE_APP_META = {
 '교보e-book': { short: '교보e-book', icon: EMBEDDED_ICONS.kyoboebook },
 '알라딘e-book': { short: '알라딘e-book', icon: EMBEDDED_ICONS.aladinebook },
 '리디북스': { short: '리디북스', icon: EMBEDDED_ICONS.ridibooks },
 '북이오': { short: '북이오', icon: EMBEDDED_ICONS.bookio },
 '구글플레이북': { short: '구글플레이북', icon: EMBEDDED_ICONS.googleplaybook },
 '밀리의서재': { short: '밀리의서재', icon: EMBEDDED_ICONS.millie },
 '알라딘전자도서관': { short: '알라딘전자도서관', icon: EMBEDDED_ICONS.aladinelib },
 '교보전자도서관': { short: '교보전자도서관', icon: EMBEDDED_ICONS.kyoboelib },
 '예스24전자도서관': { short: '예스24전자도서관', icon: EMBEDDED_ICONS.yes24elib },
 '이씨오도서관': { short: '이씨오도서관', icon: EMBEDDED_ICONS.eco_library },
 '서울도서관통합전자책': { short: '서울도서관통합전자책', icon: EMBEDDED_ICONS.seoulebook },
 '부커스': { short: '부커스', icon: EMBEDDED_ICONS.bookers },
 '북큐브': { short: '북큐브', icon: EMBEDDED_ICONS.bookcube },
 '에피루스': { short: '에피루스', icon: EMBEDDED_ICONS.epyrus },
 '남산도서관': { short: '남산도서관', icon: EMBEDDED_ICONS.namsan },
 '청파도서관': { short: '청파도서관', icon: EMBEDDED_ICONS.chungpa },
 '꿈나무도서관': { short: '꿈나무도서관', icon: EMBEDDED_ICONS.yongsan_ggumnamu },
 '이화여대도서관': { short: '이화여대도서관', icon: EMBEDDED_ICONS.ewha },
 '송파도서관': { short: '송파도서관', icon: EMBEDDED_ICONS.songpa }
 };

 function getSourceAppMeta(name) {
 const norm = normalizeSourceLabel(name);
 if (SOURCE_APP_META[norm]) return SOURCE_APP_META[norm];
 const logo = getLibraryLogoSrc(name);
 return {
 short: String(name || '').replace(/도서관|전자도서관|통합전자책/g, '').trim() || name,
 icon: logo || makeAppBadgeSvg('#64748b', '#ffffff', String(name || '?').slice(0, 2))
 };
 }

 function selectOwnedSourceOption(name) {
 const inputEl = document.getElementById('ownedInputSource');
 if (!inputEl) return;
 inputEl.value = (inputEl.value === name) ? '' : name;
 updateSourceFieldUI(inputEl.value);
 updateDueDateFieldVisibility();
 }

 function updateSourceFieldUI(overrideVal) {
 const field = document.getElementById('ownedSourceField');
 const label = document.getElementById('ownedSourceLabel');
 const inputEl = document.getElementById('ownedInputSource');
 const gridEl = document.getElementById('ownedSourcePickerGrid');
 if (!field || !label || !inputEl || !gridEl) return;

 const currentVal = normalizeSourceLabel(typeof overrideVal === 'string' ? overrideVal : (inputEl.value || ''));
 let presets = [];
 let showField = false;

 const isBorrowOrReturn = selectedOwnedIsBorrowed || selectedOwnedIsReturned;
 if (isBorrowOrReturn && selectedOwnedIsEbook) {
 showField = true;
 label.innerText = '대여처';
 presets = EBOOK_BORROW_SOURCES;
 } else if (isBorrowOrReturn && !selectedOwnedIsEbook) {
 showField = true;
 label.innerText = '대여처';
 presets = OFFLINE_BORROW_SOURCES;
 } else if (!isBorrowOrReturn && !selectedOwnedIsSold && selectedOwnedIsEbook) {
 showField = true;
 label.innerText = '소장처';
 presets = EBOOK_OWNED_SOURCES;
 } else if (currentVal && !selectedOwnedIsSold) {
 showField = true;
 label.innerText = '소장처/대여처';
 presets = [];
 }

 field.classList.toggle('hidden', !showField);
 inputEl.value = currentVal || '';

 const optionsList = presets.slice();
 if (currentVal && !optionsList.includes(currentVal)) {
 optionsList.unshift(currentVal);
 }

 gridEl.innerHTML = '';
 optionsList.forEach(name => {
 const meta = getSourceAppMeta(name);
 const btn = document.createElement('button');
 btn.type = 'button';
 btn.className = 'owned-source-icon-btn' + (currentVal === name ? ' active' : '');
 btn.title = name;
 btn.onclick = () => selectOwnedSourceOption(name);
 const img = document.createElement('img');
 img.className = 'owned-source-icon-img';
 img.src = meta.icon;
 img.alt = meta.short;
 img.onerror = function () {
 this.onerror = null;
 this.src = makeAppBadgeSvg('#64748b', '#ffffff', meta.short.slice(0, 2));
 };
 const lbl = document.createElement('span');
 lbl.className = 'owned-source-icon-label';
 lbl.textContent = name;
 btn.appendChild(img);
 btn.appendChild(lbl);
 gridEl.appendChild(btn);
 });

 const addBtn = document.createElement('button');
 addBtn.type = 'button';
 addBtn.className = 'owned-source-icon-btn';
 addBtn.title = '소장처·대여처 직접 입력';
 addBtn.onclick = () => promptCustomOwnedSource();
 addBtn.innerHTML = `<img class="owned-source-icon-img" src="${escapeHtml(makeAppBadgeSvg('#f1f5f9', '#64748b', '+'))}" alt="직접 입력"><span class="owned-source-icon-label">직접 입력</span>`;
 gridEl.appendChild(addBtn);
 }

 function promptCustomOwnedSource() {
 const inputEl = document.getElementById('ownedInputSource');
 const entered = prompt('소장처 또는 대여처 이름을 입력해 주세요.', inputEl?.value || '');
 if (entered === null) return;
 const clean = entered.trim();
 if (inputEl) inputEl.value = clean;
 updateSourceFieldUI(clean);
 updateDueDateFieldVisibility();
 }

 function updateDueDateFieldVisibility() {
 const field = document.getElementById('ownedDueDateField');
 if (!field) return;
 const finishVal = (document.getElementById('ownedInputFinishDate')?.value || '').trim();
 const sourceVal = (document.getElementById('ownedInputSource')?.value || '').trim();
 // 완독일이 적혀있으면 숨김 / 오프라인 대여 또는 e-book 대여(알라딘)일 때 표시
 const showDue = selectedOwnedIsBorrowed && !selectedOwnedIsSold && !finishVal && (!selectedOwnedIsEbook || sourceVal.includes('알라딘'));
 field.classList.toggle('hidden', !showDue);
 }

 function refreshOwnedModeDependentFields() {
 updateSourceFieldUI();
 updateDueDateFieldVisibility();
 }

 function setOwnedEbookToggle(isOn) {
 selectedOwnedIsEbook = !!isOn;
 const ebBtn = document.getElementById('ownedEbookToggleBtn');
 const ppBtn = document.getElementById('ownedPaperToggleBtn');
 if (ebBtn) {
 ebBtn.classList.toggle('active-ebook', selectedOwnedIsEbook);
 ebBtn.setAttribute('aria-checked', selectedOwnedIsEbook ? 'true' : 'false');
 updateOwnedModalCoverVisuals();
 }
 if (ppBtn) {
 ppBtn.classList.toggle('active-paper', !selectedOwnedIsEbook);
 ppBtn.setAttribute('aria-checked', !selectedOwnedIsEbook ? 'true' : 'false');
 }
 updateOwnedModalCoverVisuals();
 refreshOwnedModeDependentFields();
 }

 function toggleOwnedEbookSwitch() {
 setOwnedEbookToggle(!selectedOwnedIsEbook);
 }

 function syncOwnedOwnershipButtonsUI() {
 const isOwnedMode = !selectedOwnedIsBorrowed && !selectedOwnedIsSold && !selectedOwnedIsReturned;
 const ownBtn = document.getElementById('ownedOwnToggleBtn');
 if (ownBtn) {
 ownBtn.classList.toggle('active-owned', isOwnedMode);
 ownBtn.setAttribute('aria-checked', isOwnedMode ? 'true' : 'false');
 }
 const borrowBtn = document.getElementById('ownedBorrowToggleBtn');
 if (borrowBtn) {
 borrowBtn.classList.toggle('active-borrowed', selectedOwnedIsBorrowed);
 borrowBtn.setAttribute('aria-checked', selectedOwnedIsBorrowed ? 'true' : 'false');
 }
 const retBtn = document.getElementById('ownedReturnToggleBtn');
 if (retBtn) {
 retBtn.classList.toggle('active-sold', selectedOwnedIsReturned);
 retBtn.setAttribute('aria-checked', selectedOwnedIsReturned ? 'true' : 'false');
 }
 const soldBtn = document.getElementById('ownedSoldToggleBtn');
 if (soldBtn) {
 soldBtn.classList.toggle('active-sold', selectedOwnedIsSold);
 soldBtn.setAttribute('aria-checked', selectedOwnedIsSold ? 'true' : 'false');
 }
 updateOwnedModalCoverVisuals();
 }

 function selectOwnedOwnershipMode(mode) {
 selectedOwnedIsBorrowed = (mode === 'borrowed');
 selectedOwnedIsReturned = (mode === 'returned');
 selectedOwnedIsSold = (mode === 'sold');
 syncOwnedOwnershipButtonsUI();
 refreshOwnedModeDependentFields();
 }

 function setOwnedBorrowToggle(isOn) {
 selectedOwnedIsBorrowed = !!isOn;
 if (selectedOwnedIsBorrowed) selectedOwnedIsSold = false;
 syncOwnedOwnershipButtonsUI();
 refreshOwnedModeDependentFields();
 }

 function setOwnedSoldToggle(isOn) {
 selectedOwnedIsSold = !!isOn;
 if (selectedOwnedIsSold) selectedOwnedIsBorrowed = false;
 syncOwnedOwnershipButtonsUI();
 refreshOwnedModeDependentFields();
 }

 function appendOwnedTag(tag) {
 addOwnedTagValue(tag);
 }



 function stripHtmlText(raw) {
 if (!raw) return '';
 const div = document.createElement('div');
 div.innerHTML = String(raw);
 return (div.textContent || div.innerText || '').trim();
 }

 function formatKdcFromDoc(doc) {
 if (!doc) return '';
 const no = String(doc.class_no || '').trim();
 const nm = String(doc.class_nm || '').trim();
 if (no && nm) return `${no} · ${nm}`;
 return nm || no || '';
 }

 function summarizeLoanInfoFromDtlResponse(data, doc) {
 const parts = [];
 const loanInfo = data?.response?.loanInfo;
 let totalCnt = 0;
 let ranking = '';
 let topAge = '';
 let topGender = '';

 if (Array.isArray(loanInfo)) {
 loanInfo.forEach(item => {
 if (item?.Total) {
 totalCnt = Number(item.Total.loanCnt) || totalCnt;
 if (item.Total.ranking) ranking = String(item.Total.ranking);
 }
 if (Array.isArray(item?.ageResult) && item.ageResult.length > 0) {
 const sorted = item.ageResult.slice().sort((a, b) => (Number(b?.age?.loanCnt) || 0) - (Number(a?.age?.loanCnt) || 0));
 const best = sorted[0]?.age;
 if (best && Number(best.loanCnt) > 0 && best.name) topAge = best.name;
 }
 if (Array.isArray(item?.genderResult) && item.genderResult.length > 0) {
 const sorted = item.genderResult.slice().sort((a, b) => (Number(b?.gender?.loanCnt) || 0) - (Number(a?.gender?.loanCnt) || 0));
 const best = sorted[0]?.gender;
 if (best && Number(best.loanCnt) > 0 && best.name) topGender = best.name;
 }
 });
 }

 if (!totalCnt && doc?.loan_count) {
 totalCnt = Number(doc.loan_count) || 0;
 }

 if (totalCnt > 0) parts.push(`누적 대출 ${totalCnt.toLocaleString()}회`);
 if (ranking) parts.push(`순위 ${Number(ranking).toLocaleString()}위`);
 if (topAge || topGender) parts.push(`주요 독자: ${[topAge, topGender].filter(Boolean).join(' ')}`);
 return parts.join(' · ');
 }

 let isOwnedPlotEditing = false;

 function handleOwnedMetaPlotBoxClick(ev) {
  if (isOwnedPlotEditing) return;
  if (ev.target.closest('a, button, input, textarea')) return;
  toggleOwnedPlotExpand();
}

 function toggleOwnedPlotEditMode(editing) {
  isOwnedPlotEditing = !!editing;
  if (isOwnedPlotEditing) isOwnedPlotExpanded = true;
  renderOwnedMetaPlotBox();
  if (isOwnedPlotEditing) {
    const ta = document.getElementById('ownedPlotDescTextarea');
    if (ta) {
      ta.focus();
      ta.setSelectionRange(ta.value.length, ta.value.length);
    }
  }
 }

 function syncPlotSeriesToHidden() {
  const sEl = document.getElementById('ownedPlotSeriesInput');
  const vEl = document.getElementById('ownedPlotVolInput');
  const hSeries = document.getElementById('ownedInputSeries');
  const hVol = document.getElementById('ownedInputVol');
  if (sEl && hSeries) hSeries.value = sEl.value.trim();
  if (vEl && hVol) {
    const cleanVol = String(vEl.value || '').replace(/[^0-9]/g, '');
    hVol.value = cleanVol;
    currentModalVol = cleanVol;
  }
 }

 let ownedPlotBlurTimer = null;

 function scheduleOwnedPlotEditAutoFinish() {
  if (ownedPlotBlurTimer) clearTimeout(ownedPlotBlurTimer);
  ownedPlotBlurTimer = setTimeout(() => {
    ownedPlotBlurTimer = null;
    if (!isOwnedPlotEditing) return;
    const box = document.getElementById('ownedMetaPlotBox');
    const active = document.activeElement;
    if (box && active && box.contains(active)) return;
    finishOwnedPlotEditMode();
  }, 120);
 }

 function finishOwnedPlotEditMode() {
  if (ownedPlotBlurTimer) { clearTimeout(ownedPlotBlurTimer); ownedPlotBlurTimer = null; }
  const ta = document.getElementById('ownedPlotDescTextarea');
  if (ta) currentModalDescription = ta.value.trim();
  syncPlotSeriesToHidden();
  isOwnedPlotEditing = false;
  renderOwnedMetaPlotBox();
 }

function toggleOwnedPlotExpand() {
 isOwnedPlotExpanded = !isOwnedPlotExpanded;
 renderOwnedMetaPlotBox();
 }

 function cleanCategoryDisplay(rawKdc) {
 const KDC_MAJOR_MAP = {
 '0': '총류', '1': '철학', '2': '종교', '3': '사회과학', '4': '자연과학',
 '5': '기술과학', '6': '예술', '7': '언어', '8': '문학', '9': '역사'
 };
 const s = String(rawKdc || '').trim();
 if (!s) return '';
 let clean = s.replace(/^(?:KDC\s*)?[0-9]+(?:\.[0-9]+)?\s*(?:[·•:|\-/]\s*)?/i, '').trim();
 if (!clean || !/[가-힣a-zA-Z]/.test(clean)) {
 const m = s.match(/([0-9])/);
 clean = (m && KDC_MAJOR_MAP[m[1]]) ? KDC_MAJOR_MAP[m[1]] : s;
 }
 return clean;
 }

 function isDetailedKdc(kdcStr) {
 const s = cleanCategoryDisplay(kdcStr);
 return s.includes('>');
 }

 async function fetchDetailedKdcFromData4Lib(isbn, forceRefresh = false) {
 const cleanIsbn = normalizeIsbn(isbn);
 if (cleanIsbn.length !== 10 && cleanIsbn.length !== 13) return '';
 if (!forceRefresh) {
 const cached = getApiCache('kdc', cleanIsbn, API_CACHE_TTL_MS);
 if (cached !== null) return String(cached || '');
 }
 if (!forceRefresh && getApiUsageRecord().count >= DAILY_API_LIMIT - 5) return '';
 try {
 const data = await data4LibProxyFetch('srchDtlList', { isbn13: cleanIsbn, loaninfoYN: 'N' });
 const detailBook = data?.response?.detail?.[0]?.book;
 const classNm = cleanCategoryDisplay(detailBook?.class_nm || '');
 setApiCache('kdc', cleanIsbn, classNm, 500);
 return classNm;
 } catch (e) {
 return '';
 }
 }

 function syncInlineMetaButtons() {
 const map = [
 { key: 'pubYear', val: currentModalPubYear, display: currentModalPubYear ? formatPubYearText(currentModalPubYear) : '', inputId: 'ownedInputPubYear' },
 { key: 'kdc', val: cleanCategoryDisplay(currentModalKdc), display: cleanCategoryDisplay(currentModalKdc), inputId: 'ownedInputKdc' },
 { key: 'isbn', val: normalizeIsbn(document.getElementById('ownedInputIsbn')?.value || ''), display: normalizeIsbn(document.getElementById('ownedInputIsbn')?.value || ''), inputId: 'ownedInputIsbn' },
 { key: 'publisher', val: (document.getElementById('ownedInputPublisher')?.value || '').trim(), display: (document.getElementById('ownedInputPublisher')?.value || '').trim(), inputId: 'ownedInputPublisher' },
 { key: 'author', val: (document.getElementById('ownedInputAuthor')?.value || '').trim(), display: (document.getElementById('ownedInputAuthor')?.value || '').trim(), inputId: 'ownedInputAuthor' },
 { key: 'translator', val: (document.getElementById('ownedInputTranslator')?.value || '').trim(), display: (document.getElementById('ownedInputTranslator')?.value || '').trim(), inputId: 'ownedInputTranslator' }
 ];
 map.forEach(item => {
 const btn = document.getElementById('ownedMetaBtn_' + item.key);
 const inp = document.getElementById(item.inputId);
 if (inp && document.activeElement !== inp) {
 inp.value = item.val;
 }
 if (btn) {
 btn.textContent = item.display || '';
 btn.classList.toggle('is-empty', !item.display);
 }
 });
 updateMetaAuthorMiniSubBtn(getPrimaryAuthorForModal(document.getElementById('ownedInputAuthor')?.value || ''));
 }

 function startInlineMetaEdit(key) {
 const inputIdMap = {
 pubYear: 'ownedInputPubYear',
 kdc: 'ownedInputKdc',
 isbn: 'ownedInputIsbn',
 publisher: 'ownedInputPublisher',
 author: 'ownedInputAuthor',
 translator: 'ownedInputTranslator'
 };
 const btn = document.getElementById('ownedMetaBtn_' + key);
 const inp = document.getElementById(inputIdMap[key]);
 if (!btn || !inp) return;
 btn.classList.add('hidden');
 inp.classList.remove('hidden');
 inp.focus();
 inp.select();
 }

 function finishInlineMetaEdit(key) {
 const inputIdMap = {
 pubYear: 'ownedInputPubYear',
 kdc: 'ownedInputKdc',
 isbn: 'ownedInputIsbn',
 publisher: 'ownedInputPublisher',
 author: 'ownedInputAuthor',
 translator: 'ownedInputTranslator'
 };
 const btn = document.getElementById('ownedMetaBtn_' + key);
 const inp = document.getElementById(inputIdMap[key]);
 if (!btn || !inp) return;
 const val = inp.value.trim();
 if (key === 'pubYear') {
 currentModalPubYear = val.replace(/[^0-9]/g, '').slice(0, 4);
 inp.value = currentModalPubYear;
 } else if (key === 'kdc') {
 currentModalKdc = cleanCategoryDisplay(val);
 inp.value = currentModalKdc;
 } else if (key === 'isbn') {
 inp.value = normalizeIsbn(val);
 } else if (key === 'author') {
 renderRecommendedTagPicks();
 resetOwnedAuthorOtherBooksUI(val);
 }
 inp.classList.add('hidden');
 btn.classList.remove('hidden');
 syncInlineMetaButtons();
 renderOwnedMetaPlotBox();
 }

 function resetAllInlineMetaEditors() {
 ['pubYear', 'kdc', 'isbn', 'publisher', 'author', 'translator'].forEach(key => {
 const btn = document.getElementById('ownedMetaBtn_' + key);
 const inpMap = { pubYear: 'ownedInputPubYear', kdc: 'ownedInputKdc', isbn: 'ownedInputIsbn', publisher: 'ownedInputPublisher', author: 'ownedInputAuthor', translator: 'ownedInputTranslator' };
 const inp = document.getElementById(inpMap[key]);
 if (btn) btn.classList.remove('hidden');
 if (inp) inp.classList.add('hidden');
 });
 }

 function openOwnedMetaExternalLink(target) {
 const isbnVal = normalizeIsbn(document.getElementById('ownedInputIsbn')?.value || '');
 const titleVal = (document.getElementById('ownedInputTitle')?.value || '').trim();
 const qKey = isbnVal || extractMainTitleForSearch(titleVal) || titleVal;
 if (!qKey) {
   showToast('책 제목이나 ISBN 정보가 없어 이동할 수 없습니다.', 'error');
   return;
 }
 let url = '';
 if (target === 'aladin') {
   url = (isbnVal.length === 10 || isbnVal.length === 13)
     ? `https://www.aladin.co.kr/shop/wproduct.aspx?ISBN=${encodeURIComponent(isbnVal)}`
     : `https://www.aladin.co.kr/m/msearch.aspx?SearchWord=${encodeURIComponent(qKey)}&SearchTarget=All&start=h_keyword`;
 } else if (target === 'daum') {
   url = currentModalKakaoUrl || `https://search.daum.net/search?w=book&q=${encodeURIComponent(qKey)}`;
 } else if (target === 'kyobo') {
   url = `https://search.kyobobook.co.kr/search?keyword=${encodeURIComponent(qKey)}`;
 }
 if (url) window.open(url, '_blank', 'noopener');
 }

 function toggleOwnedIsbnEditor() {}

 function renderOwnedMetaPlotBox() {
 const box = document.getElementById('ownedMetaPlotBox');
 const heading = document.getElementById('ownedMetaPlotHeading');
 const body = document.getElementById('ownedMetaPlotBody');
 if (!box || !heading || !body) return;

 const cleanDesc = stripHtmlText(currentModalDescription);
 const seriesVal = (document.getElementById('ownedInputSeries')?.value || '').trim();
 const volVal = (document.getElementById('ownedInputVol')?.value || currentModalVol || '').trim();
 const volHash = formatVolHash(volVal);
 const isbnVal = normalizeIsbn(document.getElementById('ownedInputIsbn')?.value || '');

 const titleVal = (document.getElementById('ownedInputTitle')?.value || '').trim();
 const qKey = isbnVal || extractMainTitleForSearch(titleVal) || titleVal;
 const daumUrl = qKey ? (currentModalKakaoUrl || `https://search.daum.net/search?w=book&q=${encodeURIComponent(qKey)}`) : '';
 const aladinUrl = (isbnVal.length === 10 || isbnVal.length === 13)
   ? `https://www.aladin.co.kr/shop/wproduct.aspx?ISBN=${encodeURIComponent(isbnVal)}`
   : (qKey ? `https://www.aladin.co.kr/m/msearch.aspx?SearchWord=${encodeURIComponent(qKey)}&SearchTarget=All&start=h_keyword` : '');

 const titleLabelHtml = daumUrl
 ? `<a href="${escapeHtml(daumUrl)}" target="_blank" rel="noopener" class="owned-plot-title-link" title="카카오 도서 검색으로 이동">책 소개</a>`
 : '<span>책 소개</span>';

 if (isOwnedPlotEditing) {
   heading.innerHTML = `
     <span class="owned-plot-title-group">
       ${titleLabelHtml}
     </span>
     <span class="owned-plot-series-edit-wrap" onclick="event.stopPropagation()">
       <input type="text" id="ownedPlotSeriesInput" class="owned-plot-series-input" value="${escapeHtml(seriesVal)}" placeholder="시리즈명" oninput="syncPlotSeriesToHidden()" onblur="scheduleOwnedPlotEditAutoFinish()" onkeydown="if(event.key==='Enter'){event.preventDefault(); finishOwnedPlotEditMode();}">
       <input type="text" id="ownedPlotVolInput" class="owned-plot-vol-input" inputmode="numeric" value="${escapeHtml(volVal)}" placeholder="넘버" oninput="syncPlotSeriesToHidden()" onblur="scheduleOwnedPlotEditAutoFinish()" onkeydown="if(event.key==='Enter'){event.preventDefault(); finishOwnedPlotEditMode();}">
     </span>
   `;
   syncInlineMetaButtons();
   body.classList.remove('is-clamped');
   body.innerHTML = `
     <textarea id="ownedPlotDescTextarea" class="owned-plot-desc-textarea" rows="5" placeholder="책 소개(줄거리)를 입력해 주세요." oninput="currentModalDescription = this.value;" onblur="scheduleOwnedPlotEditAutoFinish()" onclick="event.stopPropagation()">${escapeHtml(cleanDesc)}</textarea>
     <div class="owned-plot-edit-footer" onclick="event.stopPropagation()">
       <button type="button" class="owned-plot-done-btn" onmousedown="event.preventDefault()" onclick="event.stopPropagation(); finishOwnedPlotEditMode();" title="책 소개·시리즈 수정 완료">완료</button>
     </div>
   `;
 } else {
   const editPencilHtml = `<button type="button" class="owned-plot-edit-btn" onclick="event.stopPropagation(); toggleOwnedPlotEditMode(true);" title="책 소개·시리즈 수정" aria-label="책 소개 및 시리즈 수정"><i data-lucide="pencil" size="11"></i></button>`;
   const seriesBadgeHtml = (seriesVal && volHash)
   ? `<span class="mylib-badge series">${escapeHtml(seriesVal)} ${escapeHtml(volHash)}</span>`
   : (seriesVal ? `<span class="mylib-badge series">${escapeHtml(seriesVal)}</span>` : (volHash ? `<span class="mylib-badge series">${escapeHtml(volHash)}</span>` : ''));
   heading.innerHTML = `<span class="owned-plot-title-group">${titleLabelHtml}${editPencilHtml}</span>${seriesBadgeHtml}`;
   syncInlineMetaButtons();

   const descText = cleanDesc || '등록된 줄거리 정보가 없습니다.';
   const isTruncatedBySource = /([.]{3}|…)\s*$/.test(descText);
   const fullLinkHtml = (aladinUrl && isTruncatedBySource && isOwnedPlotExpanded)
     ? ` <a href="${escapeHtml(aladinUrl)}" target="_blank" rel="noopener" class="owned-author-bio-link" style="margin-left:3px;" title="알라딘 책 페이지로 이동">전문 보기 ↗</a>`
     : '';
   body.classList.toggle('is-clamped', !isOwnedPlotExpanded);
   body.innerHTML = `${escapeHtml(descText)}${fullLinkHtml}`;
 }
 refreshIcons(box);


 const authorBioBox = document.getElementById('ownedAuthorBioBox');
 if (authorBioBox) {
 const cleanBio = stripHtmlText(currentModalAuthorBio);
 if (cleanBio) {
 authorBioBox.innerHTML = `<div class="owned-author-bio-label">저자소개</div><div>${escapeHtml(cleanBio)}</div>`;
 authorBioBox.classList.remove('hidden');
 } else {
 authorBioBox.innerHTML = '';
 authorBioBox.classList.add('hidden');
 }
 }

 const storeLinksEl = document.getElementById('ownedTitleStoreLinks');
 const kakaoLinkEl = document.getElementById('ownedKakaoIconLink');
 const kyoboLinkEl = document.getElementById('ownedKyoboIconLink');
 const aladinLinkEl = document.getElementById('ownedAladinIconLink');
 if (storeLinksEl && kyoboLinkEl && aladinLinkEl) {
 if (qKey) {
 if (kakaoLinkEl) kakaoLinkEl.href = currentModalKakaoUrl || `https://search.daum.net/search?w=book&q=${encodeURIComponent(qKey)}`;
 kyoboLinkEl.href = `https://search.kyobobook.co.kr/search?keyword=${encodeURIComponent(qKey)}`;
 aladinLinkEl.href = (isbnVal.length === 10 || isbnVal.length === 13) ? `https://www.aladin.co.kr/shop/wproduct.aspx?ISBN=${encodeURIComponent(isbnVal)}` : `https://www.aladin.co.kr/m/msearch.aspx?SearchWord=${encodeURIComponent(qKey)}&SearchTarget=All&start=h_keyword`;
 storeLinksEl.classList.remove('hidden');
 } else {
 storeLinksEl.classList.add('hidden');
 }
 }

 box.classList.remove('hidden');
 }

 function getPrimaryAuthorForModal(authorRaw) {
 const people = extractPersonRoleEntries(authorRaw || '', '저자');
 const primary = people.find(p => p.role === '저자') || people[0];
 return primary?.name || String(authorRaw || '').split(/[,;\/]/)[0].trim();
 }

 function resetOwnedAuthorOtherBooksUI(authorRaw) {
 const boxEl = document.getElementById('ownedAuthorOtherBooksDetails');
 const titleEl = document.getElementById('ownedAuthorOtherBooksTitle');
 const listEl = document.getElementById('ownedAuthorOtherBooksList');
 if (!boxEl || !titleEl || !listEl) return;

 modalAuthorOtherBooksLoadedFor = '';
 modalAuthorOtherBooksList = [];

 const primaryAuthor = getPrimaryAuthorForModal(authorRaw);
 if (!primaryAuthor || primaryAuthor === '저자 미상') {
 boxEl.classList.add('hidden');
 listEl.innerHTML = '';
 return;
 }

 titleEl.innerText = `${primaryAuthor} 저자의 다른 도서`;
 updateFollowButtonEl(document.getElementById('ownedModalFollowBtn'), primaryAuthor);
 listEl.innerHTML = '';
 boxEl.classList.remove('hidden');
 loadOwnedAuthorOtherBooks();
 }

 async function loadOwnedAuthorOtherBooks() {
 const authorRaw = document.getElementById('ownedInputAuthor')?.value || activeOwnedEditContext?.book?.author || '';
 const primaryAuthor = getPrimaryAuthorForModal(authorRaw);
 if (!primaryAuthor || modalAuthorOtherBooksLoadedFor === primaryAuthor || modalAuthorOtherBooksLoadingFor === primaryAuthor) return;

 const listEl = document.getElementById('ownedAuthorOtherBooksList');
 if (!listEl) return;
 modalAuthorOtherBooksLoadingFor = primaryAuthor;
 listEl.innerHTML = '<div style="font-size:12px; color:var(--sec-text); padding:10px 4px;">카카오에서 작가의 다른 책을 불러오는 중입니다...</div>';

 try {
 const cacheKey = 'v2:' + primaryAuthor.toLowerCase();
 let books = getApiCache('kakaoAuthor', cacheKey, API_CACHE_TTL_MS);
 if (!Array.isArray(books)) {
 const res = await fetchWithTimeout(buildSheetGetUrl({ action: 'authorBooks', author: primaryAuthor }));
 if (!res.ok) throw new Error(`HTTP ${res.status}`);
 const data = await res.json();
 if (!data || !Array.isArray(data.books)) {
 listEl.innerHTML = '<div style="font-size:12px; color:var(--sec-text); padding:10px 4px;">Code.gs를 최신 버전으로 재배포하면 작가의 다른 책을 볼 수 있습니다.</div>';
 return;
 }
 books = data.books;
 setApiCache('kakaoAuthor', cacheKey, books, 250);
 }

 const curTitleNorm = normalizeBookTitle(document.getElementById('ownedInputTitle')?.value || '');
 const curIsbn = normalizeIsbn(document.getElementById('ownedInputIsbn')?.value || '');
 const filtered = books.filter(b => {
 if (curIsbn && b.isbn && normalizeIsbn(b.isbn) === curIsbn) return false;
 if (curTitleNorm && normalizeBookTitle(b.title) === curTitleNorm) return false;
 return true;
 });

 modalAuthorOtherBooksLoadedFor = primaryAuthor;
 modalAuthorOtherBooksList = filtered;

 if (filtered.length === 0) {
 listEl.innerHTML = '<div style="font-size:12px; color:var(--sec-text); padding:10px 4px;">다른 등록 도서가 없습니다.</div>';
 return;
 }

 listEl.innerHTML = filtered.map((b, idx) => {
 const ownedMatch = findOwnedMatch({ bookname: b.title, authors: b.author, isbn13: b.isbn });
 let badgeHtml = '';
 if (ownedMatch) {
 const eb = isOwnedEbook(ownedMatch.owned);
 badgeHtml = `<span class="cover-badge ${eb ? 'ebook' : 'owned'}" style="font-size:9px; padding:1px 4px;">${eb ? 'e-book' : '서재'}</span>`;
 }
 return `
 <div class="owned-author-other-card" onclick="openModalAuthorOtherBook(${idx})" title="${escapeHtml(b.title)}">
 ${badgeHtml}
 <img src="${escapeHtml(normalizeCoverUrl(b.cover))}" alt="" loading="lazy" onerror="this.onerror=null;this.src=NO_COVER_SVG">
 <p>${escapeHtml(b.title)}</p>
 <p class="yr">${b.pubYear ? escapeHtml(b.pubYear) + '년' : ''}</p>
 </div>
 `;
 }).join('');
 } catch (e) {
 listEl.innerHTML = '<div style="font-size:12px; color:#b91c1c; padding:10px 4px;">작가의 다른 책을 불러오지 못했습니다.</div>';
 } finally {
 if (modalAuthorOtherBooksLoadingFor === primaryAuthor) modalAuthorOtherBooksLoadingFor = '';
 }
 }

 function openModalAuthorOtherBook(idx) {
 const b = modalAuthorOtherBooksList[idx];
 if (!b) return;
 const ownedMatch = findOwnedMatch({ bookname: b.title, authors: b.author, isbn13: b.isbn });
 if (ownedMatch) {
 const ownedIdx = myOwnedBooks.indexOf(ownedMatch.owned);
 if (ownedIdx > -1) {
 openOwnedEditModalByIndex(ownedIdx);
 return;
 }
 }
 closeOwnedEditModal();
 closeMyLibraryModal();
 const kw = extractMainTitleForSearch(b.title) || b.title;
 document.getElementById('searchInput').value = kw;
 executeSearch(kw);
 }

 function setOwnedCoverDisplay(url) {
 const colEl = document.getElementById('ownedCoverCol');
 const imgEl = document.getElementById('ownedEditCoverImg');
 if (!imgEl || !colEl) return;

 if (url && !isPlaceholderCoverUrl(url)) {
 currentModalCoverUrl = normalizeCoverUrl(url);
 imgEl.src = currentModalCoverUrl;
 imgEl.classList.remove('hidden');
 colEl.classList.add('has-cover');
 } else {
 currentModalCoverUrl = '';
 imgEl.src = '';
 imgEl.classList.add('hidden');
 colEl.classList.remove('has-cover');
 }
 }

 function handleOwnedCoverError() {
 setOwnedCoverDisplay('');
 }

 function triggerOwnedCoverUpload() {
 const input = document.getElementById('ownedCoverFileInput');
 if (!input) return;
 input.value = '';
 input.click();
 }

 function clearOwnedCoverManual() {
  const prevUrl = currentModalCoverUrl;
  setOwnedCoverDisplay('');
  showToast('표지를 삭제했습니다.', '', prevUrl ? {
    label: '실행 취소',
    onClick: () => {
      setOwnedCoverDisplay(prevUrl);
      showToast('표지를 복원했습니다.', 'success');
    }
  } : null);
}

 function compressCoverImageFile(file) {
 return new Promise((resolve, reject) => {
 const reader = new FileReader();
 reader.onerror = () => reject(new Error('파일을 읽지 못했습니다.'));
 reader.onload = () => {
 const img = new Image();
 img.onerror = () => reject(new Error('이미지 형식을 인식하지 못했습니다.'));
 img.onload = () => {
 const encodeWith = (maxW, maxH, quality) => {
 let w = img.naturalWidth || img.width;
 let h = img.naturalHeight || img.height;
 if (!w || !h) return '';
 const ratio = Math.min(maxW / w, maxH / h, 1);
 w = Math.max(1, Math.round(w * ratio));
 h = Math.max(1, Math.round(h * ratio));
 const canvas = document.createElement('canvas');
 canvas.width = w;
 canvas.height = h;
 const ctx = canvas.getContext('2d');
 ctx.fillStyle = '#ffffff';
 ctx.fillRect(0, 0, w, h);
 ctx.drawImage(img, 0, 0, w, h);
 return canvas.toDataURL('image/jpeg', quality);
 };

 // 구글 시트 단일 셀 한도(50,000자) 이내로 안전하게 자동 압축
 const presets = [
 [200, 300, 0.76],
 [180, 270, 0.65],
 [150, 225, 0.55],
 [120, 180, 0.45]
 ];
 for (const [mw, mh, q] of presets) {
 const dataUrl = encodeWith(mw, mh, q);
 if (dataUrl && dataUrl.length <= 38000) {
 resolve(dataUrl);
 return;
 }
 }
 reject(new Error('이미지 용량이 너무 큽니다. 다른 이미지를 선택해 주세요.'));
 };
 img.src = reader.result;
 };
 reader.readAsDataURL(file);
 });
 }

 async function handleOwnedCoverFileSelect(event) {
 const file = event?.target?.files?.[0];
 if (!file) return;
 if (!file.type || !file.type.startsWith('image/')) {
 showToast('이미지 파일만 첨부할 수 있습니다.', 'error');
 return;
 }
 try {
 const compressedDataUrl = await compressCoverImageFile(file);
 setOwnedCoverDisplay(compressedDataUrl);
 showToast('표지 이미지를 Google Drive에 업로드하는 중입니다...');

 const titleHint = (document.getElementById('ownedInputTitle')?.value || 'book_cover').trim().slice(0, 24);
 try {
 const res = await sendSheetPost({
 action: 'uploadCoverImage',
 imageDataUrl: compressedDataUrl,
 fileName: titleHint
 });
 if (res && res.status === 'ok' && res.url) {
 setOwnedCoverDisplay(res.url);
 showToast("표지를 Drive에 저장했습니다. '저장'을 눌러 시트에 반영해 주세요.", 'success');
 return;
 }
 } catch (uploadErr) {}

 // Drive 권한 미승인 또는 구버전 Code.gs일 경우 기존 경량 Base64로 안전 폴백
 showToast("표지 이미지를 첨부했습니다. '저장'을 눌러 시트에 반영해 주세요.", 'success');
 } catch (err) {
 showToast(err?.message || '표지 이미지를 처리하지 못했습니다.', 'error');
 } finally {
 if (event?.target) event.target.value = '';
 }
 }

 function loadOwnedEditCover(book) {
 const isbn = normalizeIsbn(book?.isbn);
 const title = String(book?.title || '').trim();
 const cacheKey = isbn || normalizeBookTitle(title);

 let foundUrl = '';
 if (book?.cover) foundUrl = book.cover;
 if (!foundUrl && currentSelectedBook && isbn && normalizeIsbn(currentSelectedBook.isbn13 || currentSelectedBook.isbn) === isbn) {
 foundUrl = currentSelectedBook.bookImageURL || '';
 }
 if (!foundUrl && currentBooksList.length > 0 && isbn) {
 const hit = currentBooksList.find(it => normalizeIsbn(it.doc.isbn13 || it.doc.isbn) === isbn);
 if (hit && hit.doc.bookImageURL) foundUrl = hit.doc.bookImageURL;
 }
 if (!foundUrl && isbn) {
 const bms = safeReadJson('myBookmarks', []);
 const bmHit = bms.find(x => normalizeIsbn(x.isbn) === isbn);
 if (bmHit && bmHit.cover) foundUrl = bmHit.cover;
 }
 if (!foundUrl && cacheKey) {
 const cache = getBookCoverCache();
 if (cache[cacheKey]) foundUrl = cache[cacheKey];
 }

 setOwnedCoverDisplay(foundUrl);
 }

 function getAutoMetaFetchedKeys() {
 try { return JSON.parse(localStorage.getItem('autoMetaFetchedKeys') || '{}'); } catch (e) { return {}; }
 }

 function markAutoMetaFetchedKey(key) {
 if (!key) return;
 const map = getAutoMetaFetchedKeys();
 map[key] = Date.now();
 try { localStorage.setItem('autoMetaFetchedKeys', JSON.stringify(map)); } catch (e) {}
 }

 async function refreshOwnedBookMetaNow() {
 if (!activeOwnedEditContext) return;
 lastAutoFillQueryKey = '';
 await autoFillOwnedBookMeta('', false, true);
 }

 async function autoFetchMissingBookMetaOnEditOpen(book, forceRefresh = false) {
 if (!book || !activeOwnedEditContext || activeOwnedEditContext.mode !== 'edit') return;

 const hasSheetCover = !!String(book.cover || '').trim();
 const hasSheetDesc = !!String(book.description || '').trim();
 const hasSheetPubYear = !!String(book.pubYear || '').trim();
 const hasSheetKdc = !!String(book.kdc || '').trim();
 const hasDetailedSheetKdc = isDetailedKdc(book.kdc);
 const hasSheetTranslator = !!String(book.translator || '').trim();

 const isbn = normalizeIsbn(book.isbn);
 const needProxyLookup = forceRefresh || !hasSheetCover || !hasSheetDesc || !hasSheetPubYear || !hasSheetKdc || !hasSheetTranslator;
 const needDetailedKdcLookup = (isbn.length === 10 || isbn.length === 13) && (forceRefresh || !hasDetailedSheetKdc);

 // 모든 메타와 세부 분류(>)가 이미 채워져 있으면 요청 0회
 if (!needProxyLookup && !needDetailedKdcLookup) return;

 const title = String(book.title || '').trim();
 const fetchKey = isbn || normalizeBookTitle(title);
 if (!fetchKey) return;

 const targetRow = book.row;
 try {
 let proxyBook = {};
 if (needProxyLookup) {
 const proxyRes = await lookupBookViaSheetProxy(
 isbn.length >= 10 ? isbn : '',
 isbn.length >= 10 ? '' : title,
 book.author || '',
 forceRefresh
 );
 if (proxyRes.ok && proxyRes.book) proxyBook = proxyRes.book;
 }

 const resolvedIsbn = normalizeIsbn(isbn || proxyBook.isbn || '');
 let d4lKdc = '';
 if ((resolvedIsbn.length === 10 || resolvedIsbn.length === 13) && (forceRefresh || !isDetailedKdc(proxyBook.kdc || book.kdc))) {
 d4lKdc = await fetchDetailedKdcFromData4Lib(resolvedIsbn, forceRefresh);
 }

 const isSameModalOpen = activeOwnedEditContext && activeOwnedEditContext.mode === 'edit' && activeOwnedEditContext.book.row === targetRow;

 const fetchedCover = proxyBook.cover ? normalizeCoverUrl(proxyBook.cover) : (currentModalCoverUrl || '');
 const fetchedPubYear = String(proxyBook.pubYear || book.pubYear || '').trim();
 const fetchedDesc = stripHtmlText(proxyBook.description || book.description || '').slice(0, 2500);
 const fetchedKdc = cleanCategoryDisplay(d4lKdc || proxyBook.kdc || book.kdc || '');
 const fetchedVol = String(proxyBook.vol || book.vol || '').trim();
 const fetchedTranslator = formatAutoTranslatorText(proxyBook.translator) || String(book.translator || '').trim();

 if (fetchedCover) saveBookCoverCache(fetchKey, fetchedCover);

 const kdcUpgraded = !!fetchedKdc && fetchedKdc !== cleanCategoryDisplay(book.kdc || '') && (isDetailedKdc(fetchedKdc) || !hasSheetKdc);

 if (isSameModalOpen) {
 const wasDirtyBeforeAutoFill = isOwnedModalDirty();
 if (proxyBook.url) currentModalKakaoUrl = proxyBook.url;
 if (proxyBook.authorBio) {
 currentModalAuthorBio = stripHtmlText(proxyBook.authorBio).slice(0, 1200);
 const bk = normalizeIsbn(proxyBook.isbn || document.getElementById('ownedInputIsbn')?.value) || normalizeBookTitle(proxyBook.title || document.getElementById('ownedInputTitle')?.value);
 if (bk) saveBookAuthorBioCache(bk, currentModalAuthorBio);
 }
 if (fetchedCover && !currentModalCoverUrl) setOwnedCoverDisplay(fetchedCover);
 if (fetchedPubYear && !currentModalPubYear) currentModalPubYear = fetchedPubYear;
 if (fetchedDesc && !currentModalDescription) currentModalDescription = fetchedDesc;
 if (fetchedKdc && (!currentModalKdc || (isDetailedKdc(fetchedKdc) && !isDetailedKdc(currentModalKdc)))) {
 currentModalKdc = fetchedKdc;
 }
 if (fetchedVol && !currentModalVol) {
 currentModalVol = fetchedVol;
 const volEl = document.getElementById('ownedInputVol');
 if (volEl && !volEl.value.trim()) volEl.value = fetchedVol;
 }
 if (fetchedTranslator) {
 const trEl = document.getElementById('ownedInputTranslator');
 if (trEl && !trEl.value.trim()) trEl.value = fetchedTranslator;
 }
 renderOwnedMetaPlotBox();
 renderRecommendedTagPicks();
 // 자동 메타 보강만으로 isDirty가 오작동하지 않도록 스냅샷 갱신
 if (!wasDirtyBeforeAutoFill) ownedModalInitialSnapshot = getOwnedModalFormSnapshot();
 }

 // 로컬 메모리(myOwnedBooks)에도 즉시 반영
 if (fetchedCover && !book.cover) book.cover = fetchedCover;
 if (fetchedPubYear && !book.pubYear) book.pubYear = fetchedPubYear;
 if (fetchedDesc && !book.description) book.description = fetchedDesc;
 if (kdcUpgraded) book.kdc = fetchedKdc;
 if (fetchedVol && !book.vol) book.vol = fetchedVol;
 if (fetchedTranslator && !book.translator) book.translator = fetchedTranslator;

 const needSheetSave = (fetchedCover && !hasSheetCover) || (fetchedPubYear && !hasSheetPubYear) || (fetchedDesc && !hasSheetDesc) || kdcUpgraded || (fetchedTranslator && !hasSheetTranslator);
 if (needSheetSave) {
 sendSheetPost({
 target: 'library',
 action: 'lib_patch_meta',
 row: book.row,
 origTitle: book.title,
 origAuthor: book.author,
 origIsbn: book.isbn,
 origIsEbook: isOwnedEbook(book),
 cover: fetchedCover,
 pubYear: fetchedPubYear,
 description: fetchedDesc,
 kdc: fetchedKdc,
 vol: fetchedVol,
 translator: fetchedTranslator,
 loanStats: book.loanStats || ''
 }).catch(() => {});
 }
 } catch (e) {}
 }

 /* 스페이스바/쉼표/엔터 기반 태그 칩 에디터 */
 function setOwnedEditTagsFromString(tagStr) {
 ownedEditTagsList = String(tagStr || '')
 .split(',')
 .map(t => t.replace(/^#+/, '').trim())
 .filter(t => t && !isEbookTagToken(t));
 ownedEditTagsList = Array.from(new Set(ownedEditTagsList));
 renderOwnedTagChips();
 const input = document.getElementById('ownedTagInput');
 if (input) input.value = '';
 }

 function renderOwnedTagChips() {
 const box = document.getElementById('ownedTagChipBox');
 const input = document.getElementById('ownedTagInput');
 if (!box || !input) return;

 box.querySelectorAll('.tag-chip-item').forEach(el => el.remove());
 ownedEditTagsList.forEach((tag, idx) => {
 const chip = document.createElement('span');
 chip.className = 'tag-chip-item' + (tag === '전자책' ? ' is-ebook-chip' : '');
 chip.innerHTML = `#${escapeHtml(tag)} <button type="button" class="tag-chip-remove" aria-label="태그 삭제" onclick="event.stopPropagation(); removeOwnedTagByIndex(${idx})">✕</button>`;
 box.insertBefore(chip, input);
 });
 input.placeholder = ownedEditTagsList.length === 0 ? '스페이스바로 구분' : '';
 renderRecommendedTagPicks();
 }

 function autoResizeTextarea(el) {
 if (!el) return;
 el.style.height = 'auto';
 el.style.height = Math.max(44, el.scrollHeight) + 'px';
 }

 function renderRecommendedTagPicks() {
 const container = document.getElementById('ownedRecommendedTagPicks');
 if (!container) return;

 const selectedSet = new Set(ownedEditTagsList.map(t => t.toLowerCase()));
 const recTags = [];
 const pushRec = (t) => {
 const clean = String(t || '').replace(/^#+/, '').trim();
 if (!clean || isEbookTagToken(clean)) return;
 if (selectedSet.has(clean.toLowerCase())) return;
 if (!recTags.includes(clean)) recTags.push(clean);
 };

 // 1) 현재 입력된 도서 정보(제목·줄거리·출판사·KDC) 기반 추천 태그
 const curTitle = (document.getElementById('ownedInputTitle')?.value || '').trim();
 const curPub = (document.getElementById('ownedInputPublisher')?.value || '').trim();
 const curAuthor = (document.getElementById('ownedInputAuthor')?.value || '').trim();
 extractTagsFromDoc({
 bookname: curTitle,
 description: currentModalDescription,
 publisher: curPub,
 kdcRaw: currentModalKdc
 }).forEach(pushRec);

 // 2) 같은 저자의 내 서재 기존 도서에 달린 태그
 if (curAuthor && myOwnedBooks.length > 0) {
 myOwnedBooks.forEach(b => {
 if (hasAuthorOverlap(b.author, curAuthor)) {
 String(b.tags || '').split(',').forEach(pushRec);
 }
 });
 }

 // 3) 내 서재 전체 인기 태그 상위 순으로 보충
 const freq = new Map();
 myOwnedBooks.forEach(b => {
 String(b.tags || '').split(',').forEach(raw => {
 const clean = raw.trim();
 if (clean && !isEbookTagToken(clean)) freq.set(clean, (freq.get(clean) || 0) + 1);
 });
 });
 Array.from(freq.entries())
 .sort((a, b) => b[1] - a[1])
 .slice(0, 15)
 .forEach(([tag]) => pushRec(tag));

 ['과학', '인문학', '문학', '사회과학', '에세이'].forEach(pushRec);

 container.innerHTML = '';
 recTags.slice(0, 12).forEach(tag => {
 const btn = document.createElement('button');
 btn.type = 'button';
 btn.className = 'quick-tag-pick';
 btn.textContent = `+ ${tag}`;
 btn.onclick = () => appendOwnedTag(tag);
 container.appendChild(btn);
 });
 }

 function closeOwnedBookCandidates() {
 const box = document.getElementById('ownedBookCandidatesBox');
 const list = document.getElementById('ownedBookCandidatesList');
 if (box) box.classList.add('hidden');
 if (list) list.innerHTML = '';
 ownedBookCandidatesList = [];
 }

 function handleOwnedTitleInput() {
 renderOwnedMetaPlotBox();
 renderRecommendedTagPicks();
 if (ownedTitleSearchTimer) clearTimeout(ownedTitleSearchTimer);
 const title = (document.getElementById('ownedInputTitle')?.value || '').trim();
 if (!title || title.length < 2) {
 closeOwnedBookCandidates();
 return;
 }
 // 새 책 추가 모드에서는 입력 멈춤 550ms 후 자동으로 후보 리스트 표시
 if (activeOwnedEditContext && activeOwnedEditContext.mode === 'add') {
 ownedTitleSearchTimer = setTimeout(() => {
 searchOwnedBookCandidatesNow(true);
 }, 550);
 }
 }

 let ownedCandidatesCoverOnlyMode = false;

 function openOwnedCoverMorePopover(ev) {
   ev.stopPropagation();
   const menu = document.getElementById('quickPopoverMenu');
   const backdrop = document.getElementById('quickPopoverBackdrop');
   if (!menu || !backdrop) return;
   const hasCover = !!currentModalCoverUrl;
   menu.innerHTML = `
     <button type="button" class="quick-popover-item" onclick="closeQuickPopover(); openBookCoverModal();">
       <span>표지 교체하기</span>
     </button>
     <button type="button" class="quick-popover-item" onclick="closeQuickPopover(); triggerOwnedCoverUpload();">
       <span>사진 첨부하기</span>
     </button>
     ${hasCover ? `<div class="quick-popover-divider"></div>
     <button type="button" class="quick-popover-item danger" onclick="closeQuickPopover(); clearOwnedCoverManual();">
       <span>표지 삭제</span>
     </button>` : ''}
   `;
   backdrop.classList.remove('hidden');
   positionQuickPopover(ev.currentTarget);
   refreshIcons(menu);
 }

 function openOwnedCoverPicker() {
   ownedCandidatesCoverOnlyMode = true;
   searchOwnedBookCandidatesNow(false, true);
 }

 async function refetchAndSearchOwnedCandidates() {
   ownedCandidatesCoverOnlyMode = false;
   searchOwnedBookCandidatesNow(false, false);
 }

 async function searchOwnedBookCandidatesNow(silent = false, coverOnly = false) {
 ownedCandidatesCoverOnlyMode = !!coverOnly;
 const title = (document.getElementById('ownedInputTitle')?.value || '').trim();
 if (!title || title.length < 2) {
 if (!silent) showToast('책 제목을 2글자 이상 입력해 주세요.', 'error');
 return;
 }
 const box = document.getElementById('ownedBookCandidatesBox');
 const listEl = document.getElementById('ownedBookCandidatesList');
 const titleEl = document.getElementById('ownedBookCandidatesTitle');
 if (!box || !listEl || !titleEl) return;

 box.classList.remove('hidden');
 titleEl.innerText = `'${title}' 후보 검색 중...`;
 listEl.innerHTML = '<div style="font-size:11.5px; color:var(--sec-text); padding:10px 4px;">도서 목록을 불러오는 중입니다...</div>';

 try {
 const cacheKey = 'v2:' + title.toLowerCase();
 let books = getApiCache('kakaoCand', cacheKey, API_CACHE_TTL_MS);
 if (!Array.isArray(books)) {
 const res = await fetchWithTimeout(buildSheetGetUrl({ action: 'searchBooks', query: title }));
 if (!res.ok) throw new Error(`HTTP ${res.status}`);
 const data = await res.json();
 if (!data || !Array.isArray(data.books)) {
 titleEl.innerText = '후보 검색 불가';
 listEl.innerHTML = '<div style="font-size:11.5px; color:var(--sec-text); padding:8px 4px;">최신 Code.gs를 재배포하면 제목 후보를 가로로 고를 수 있습니다.</div>';
 return;
 }
 books = data.books;
 setApiCache('kakaoCand', cacheKey, books, 200);
 }

 ownedBookCandidatesList = books;
 const aladinMoreCardHtml = `
 <a class="owned-cand-card owned-cand-aladin-card" href="https://www.aladin.co.kr/search/wsearchresult.aspx?SearchTarget=All&SearchWord=${encodeURIComponent(title)}" target="_blank" rel="noopener" title="알라딘에서 찾아보기" style="text-decoration:none;">
 <div class="owned-cand-add-box"><i data-lucide="plus" size="22" color="#4f46e5"></i></div>
 <p style="white-space:normal; line-height:1.25; color:#4f46e5;">알라딘에서<br>찾아보기</p>
 </a>
 `;
 if (books.length === 0) {
 titleEl.innerText = '검색된 도서 후보 없음';
 listEl.innerHTML = aladinMoreCardHtml;
 refreshIcons(box);
 return;
 }

 titleEl.innerText = ownedCandidatesCoverOnlyMode ? '* 적용할 표지를 골라주세요.' : '* 원하시는 책을 골라주세요.';
 listEl.innerHTML = books.map((b, idx) => {
 const ownedMatch = findOwnedMatch({ bookname: b.title, authors: b.author, isbn13: b.isbn });
 let badgeHtml = '';
 if (ownedMatch) {
 const eb = isOwnedEbook(ownedMatch.owned);
 const br = isOwnedBorrowed(ownedMatch.owned);
 const sd = isOwnedSold(ownedMatch.owned);
 if (sd) badgeHtml = '<span class="cover-badge sold" style="font-size:9px; padding:1px 4px;">판매</span>';
 else if (br) badgeHtml = '<span class="cover-badge borrowed" style="font-size:9px; padding:1px 4px;">대여</span>';
 else badgeHtml = `<span class="cover-badge ${eb ? 'ebook' : 'owned'}" style="font-size:9px; padding:1px 4px;">${eb ? 'e-book' : '서재'}</span>`;
 }
 return `
 <div class="owned-cand-card" onclick="applyOwnedBookCandidate(${idx})" title="${escapeHtml(b.title)}">
 ${badgeHtml}
 <img src="${escapeHtml(normalizeCoverUrl(b.cover))}" alt="" loading="lazy" onerror="this.onerror=null;this.src=NO_COVER_SVG">
 <p>${escapeHtml(b.title)}</p>
 <p class="sub">${escapeHtml(b.author || b.publisher || '')}</p>
 <p class="sub">${b.pubYear ? escapeHtml(b.pubYear) + '년' : ''}</p>
 </div>
 `;
 }).join('') + aladinMoreCardHtml;
 refreshIcons(box);
 } catch (e) {
 titleEl.innerText = '후보 조회 실패';
 listEl.innerHTML = '<div style="font-size:11.5px; color:#b91c1c; padding:8px 4px;">도서 후보를 불러오지 못했습니다.</div>';
 }
 }

 async function applyOwnedBookCandidate(idx) {
 const b = ownedBookCandidatesList[idx];
 if (!b) return;
 const isCoverOnly = ownedCandidatesCoverOnlyMode;
 ownedCandidatesCoverOnlyMode = false;
 closeOwnedBookCandidates();
 if (isCoverOnly) {
 if (b.cover) {
 setOwnedCoverDisplay(b.cover);
 saveBookCoverCache(normalizeIsbn(document.getElementById('ownedInputIsbn')?.value || b.isbn) || normalizeBookTitle(document.getElementById('ownedInputTitle')?.value || b.title), b.cover);
 showToast('선택한 표지를 적용했습니다. 저장을 눌러 반영해 주세요.', 'success');
 } else {
 showToast('선택한 도서에 표지 이미지가 없습니다.', 'error');
 }
 return;
 }

 document.getElementById('ownedInputTitle').value = b.title || '';
 document.getElementById('ownedInputAuthor').value = b.author || '';
 if (b.author) resetOwnedAuthorOtherBooksUI(b.author);
 document.getElementById('ownedInputTranslator').value = b.translator ? formatAutoTranslatorText(b.translator) : '';
 if (b.publisher) document.getElementById('ownedInputPublisher').value = b.publisher;
 document.getElementById('ownedInputIsbn').value = b.isbn || '';
 currentModalPubYear = b.pubYear || '';
 currentModalKdc = '';
 currentModalVol = '';
 if (b.description) currentModalDescription = stripHtmlText(b.description).slice(0, 2500);
 if (b.url) currentModalKakaoUrl = b.url;
 if (b.cover) {
 setOwnedCoverDisplay(b.cover);
 saveBookCoverCache(normalizeIsbn(b.isbn) || normalizeBookTitle(b.title), b.cover);
 }

 syncInlineMetaButtons();
 renderOwnedMetaPlotBox();
 renderRecommendedTagPicks();
 showToast('자동 채움 완료', 'success');

 // 표지(후보) 선택 후에만 해당 ISBN으로 분류·시리즈·권수·상세정보 보강
 if (b.isbn) {
 lastAutoFillQueryKey = `isbn:${normalizeIsbn(b.isbn)}`;
 await autoFillOwnedBookMeta(b.isbn, true, true);
 syncInlineMetaButtons();
 renderRecommendedTagPicks();
 }
 }

 function addOwnedTagValue(raw) {
 const cleaned = String(raw || '').replace(/^#+/, '').trim();
 if (!cleaned) return;
 if (isEbookTagToken(cleaned)) {
 setOwnedEbookToggle(true);
 showToast('e-book 여부는 상단 e-book 토글로 설정했어요.');
 return;
 }
 if (!ownedEditTagsList.includes(cleaned)) {
 ownedEditTagsList.push(cleaned);
 renderOwnedTagChips();
 }
 }

 function removeOwnedTagByIndex(idx) {
 ownedEditTagsList.splice(idx, 1);
 renderOwnedTagChips();
 }

 function handleOwnedTagKeydown(e) {
 const input = e.target;
 if (e.key === ' ' || e.key === ',' || e.key === 'Enter') {
 const val = input.value.trim();
 if (val) {
 e.preventDefault();
 val.split(/[,\s]+/).forEach(addOwnedTagValue);
 input.value = '';
 } else if (e.key === 'Enter') {
 e.preventDefault();
 }
 } else if (e.key === 'Backspace' && input.value === '' && ownedEditTagsList.length > 0) {
 ownedEditTagsList.pop();
 renderOwnedTagChips();
 }
 }

 function handleOwnedTagInput(input) {
 // 모바일 키보드에서 공백/쉼표가 조합 입력 직후 들어오는 경우 처리
 if (/[,\s]$/.test(input.value)) {
 const parts = input.value.split(/[,\s]+/);
 parts.forEach(addOwnedTagValue);
 input.value = '';
 }
 }

 function commitPendingOwnedTag() {
 const input = document.getElementById('ownedTagInput');
 if (!input) return;
 const val = input.value.trim();
 if (val) {
 val.split(/[,\s]+/).forEach(addOwnedTagValue);
 input.value = '';
 }
 }

 function triggerAutoFillOwnedMeta(forceByIsbn = false) {
 if (!activeOwnedEditContext) return;
 const rawIsbn = (document.getElementById('ownedInputIsbn')?.value || '').trim();
 const isbnVal = normalizeIsbn(rawIsbn);
 const title = (document.getElementById('ownedInputTitle')?.value || '').trim();

 const queryKey = rawIsbn
 ? `isbn:${isbnVal || rawIsbn}`
 : (title.length >= 2 ? `title:${title.toLowerCase()}` : '');
 if (!queryKey || queryKey === lastAutoFillQueryKey) return;

 if (forceByIsbn && (isbnVal.length === 10 || isbnVal.length === 13)) {
 lastAutoFillQueryKey = queryKey;
 autoFillOwnedBookMeta(isbnVal, false, true);
 return;
 }

 const hasTitle = !!title;
 const hasAuthor = !!document.getElementById('ownedInputAuthor')?.value.trim();
 const hasPub = !!document.getElementById('ownedInputPublisher')?.value.trim();
 const hasIsbn = isbnVal.length >= 10;
 const hasCover = !document.getElementById('ownedEditCoverImg')?.classList.contains('hidden');
 const hasTags = ownedEditTagsList.length > 0;
 if (hasTitle && hasAuthor && hasPub && hasIsbn && hasCover && hasTags) return;

 lastAutoFillQueryKey = queryKey;
 autoFillOwnedBookMeta(isbnVal, false, false);
 }

 async function autoFillOwnedBookMeta(forcedIsbn = '', silent = false, forceRefresh = false, fromBarcode = false) {
 const rawIsbn = String(forcedIsbn || document.getElementById('ownedInputIsbn')?.value || '').trim();
 const isbnVal = normalizeIsbn(rawIsbn);
 const title = (document.getElementById('ownedInputTitle')?.value || '').trim();
 const author = (document.getElementById('ownedInputAuthor')?.value || '').trim();

 if (!rawIsbn && !title) {
 if (forceRefresh && !silent) showToast('ISBN 또는 책 제목을 먼저 입력해 주세요.', 'error');
 return;
 }

 if (rawIsbn && isbnVal.length !== 10 && isbnVal.length !== 13) {
 if (!silent) showToast(`ISBN 형식을 확인해 주세요. (현재 숫자 ${isbnVal.length}자리 · 10 또는 13자리 필요)`, 'error');
 return;
 }

 const refreshBtn = document.getElementById('ownedMetaRefreshBtn');
 if (refreshBtn) { refreshBtn.disabled = true; refreshBtn.style.opacity = '0.45'; }

 try {
 // 카카오(1순위) + 국립중앙도서관(2순위)만 조회 (정보나루 API 0회)
 const proxyRes = await lookupBookViaSheetProxy(
 rawIsbn ? isbnVal : '',
 rawIsbn ? '' : title,
 author,
 forceRefresh
 );

 if (!proxyRes.ok) {
 if (!silent) showToast(`도서 조회 실패: ${proxyRes.error}`, 'error');
 return;
 }

 const proxyBook = proxyRes.book;
 if (!proxyBook) {
    if (!silent) {
      showToast(
        fromBarcode
          ? '도서를 찾지 못했습니다. 바코드를 다시 스캔해 주세요.'
          : (rawIsbn ? `ISBN(${isbnVal}) 도서 정보를 찾지 못했습니다.` : `'${title}' 도서 정보를 찾지 못했습니다.`),
        'error'
      );
    }
    if (fromBarcode) {
      setTimeout(() => openBarcodeScanner('addModal'), 450);
    }
    return;
  }

 if (!activeOwnedEditContext) return;

 if (proxyBook.url) currentModalKakaoUrl = proxyBook.url;
 if (proxyBook.authorBio) {
 currentModalAuthorBio = stripHtmlText(proxyBook.authorBio).slice(0, 1200);
 const bk = normalizeIsbn(proxyBook.isbn || document.getElementById('ownedInputIsbn')?.value) || normalizeBookTitle(proxyBook.title || document.getElementById('ownedInputTitle')?.value);
 if (bk) saveBookAuthorBioCache(bk, currentModalAuthorBio);
 }
 const doc = {
 bookname: proxyBook.title || '',
 authors: proxyBook.author || '',
 translator: proxyBook.translator || '',
 publisher: proxyBook.publisher || '',
 isbn13: proxyBook.isbn || '',
 publication_year: proxyBook.pubYear || '',
 bookImageURL: proxyBook.cover || '',
 description: proxyBook.description || '',
 series: proxyBook.series || '',
 vol: proxyBook.vol || '',
 kdcRaw: proxyBook.kdc || ''
 };

 const filledLabels = [];
 if (doc.bookname && !document.getElementById('ownedInputTitle').value.trim()) {
 document.getElementById('ownedInputTitle').value = doc.bookname;
 filledLabels.push('제목');
 }
 if (doc.authors || doc.translator) {
 const parsedPeople = splitAuthorAndTranslator(doc.authors || '');
 if (parsedPeople.author && (forceRefresh || !document.getElementById('ownedInputAuthor').value.trim())) {
 document.getElementById('ownedInputAuthor').value = parsedPeople.author;
 resetOwnedAuthorOtherBooksUI(parsedPeople.author);
 filledLabels.push('저자');
 }
 const trEl = document.getElementById('ownedInputTranslator');
 const resolvedTrans = formatAutoTranslatorText(doc.translator) || parsedPeople.translator;
 if (resolvedTrans && trEl && (forceRefresh || !trEl.value.trim())) {
 trEl.value = resolvedTrans;
 filledLabels.push('저자 외');
 }
 }
 if (doc.publisher && (forceRefresh || !document.getElementById('ownedInputPublisher').value.trim())) {
 document.getElementById('ownedInputPublisher').value = doc.publisher;
 filledLabels.push('출판사');
 }
 if ((doc.isbn13 || doc.isbn) && (forceRefresh || !document.getElementById('ownedInputIsbn').value.trim())) {
 document.getElementById('ownedInputIsbn').value = doc.isbn13 || doc.isbn;
 filledLabels.push('ISBN');
 }
 if (forceRefresh || !document.getElementById('ownedInputSeries').value.trim()) {
 const inferredSeries = doc.series || inferSeriesNameFromDoc(doc);
 if (inferredSeries) {
 document.getElementById('ownedInputSeries').value = inferredSeries;
 filledLabels.push('시리즈');
 }
 }
 if (ownedEditTagsList.length === 0) {
 const autoTags = extractTagsFromDoc(doc);
 if (autoTags.length > 0) {
 autoTags.forEach(addOwnedTagValue);
 filledLabels.push('태그');
 }
 }
 if (doc.publication_year && (!currentModalPubYear || forceRefresh)) {
 if (!currentModalPubYear) filledLabels.push('출간연도');
 currentModalPubYear = String(doc.publication_year).trim();
 }
 if (doc.description && (!currentModalDescription || forceRefresh)) {
 if (!currentModalDescription) filledLabels.push('줄거리');
 currentModalDescription = stripHtmlText(doc.description).slice(0, 2500);
 }
 const targetIsbnForKdc = normalizeIsbn(doc.isbn13 || doc.isbn || isbnVal);
 let resolvedKdc = cleanCategoryDisplay(doc.kdcRaw || '');
 if ((targetIsbnForKdc.length === 10 || targetIsbnForKdc.length === 13) && (forceRefresh || !isDetailedKdc(resolvedKdc))) {
 const d4lClassNm = await fetchDetailedKdcFromData4Lib(targetIsbnForKdc, forceRefresh);
 if (d4lClassNm) resolvedKdc = d4lClassNm;
 }
 if (resolvedKdc && (forceRefresh || !currentModalKdc || (isDetailedKdc(resolvedKdc) && !isDetailedKdc(currentModalKdc)))) {
 currentModalKdc = resolvedKdc;
 renderRecommendedTagPicks();
 filledLabels.push('분류');
 }
 if (doc.vol && !currentModalVol) {
 currentModalVol = String(doc.vol).trim();
 const volEl = document.getElementById('ownedInputVol');
 if (volEl && !volEl.value.trim()) volEl.value = currentModalVol;
 filledLabels.push('권수');
 }
 renderOwnedMetaPlotBox();
 if (doc.bookImageURL && (!currentModalCoverUrl || forceRefresh)) {
 if (!currentModalCoverUrl) filledLabels.push('표지');
 setOwnedCoverDisplay(doc.bookImageURL);
 saveBookCoverCache(normalizeIsbn(doc.isbn13 || doc.isbn) || normalizeBookTitle(doc.bookname), doc.bookImageURL);
 }
 if (filledLabels.length > 0 && !silent) {
    showToast(forceRefresh ? '정보 새로고침 완료' : '자동 채움 완료', 'success');
  } else if (forceRefresh && !silent) {
 showToast('최신 도서 정보를 확인했습니다.', 'success');
 }
 } catch (e) {
 if (!silent) {
 showToast('도서 정보 조회 중 오류가 발생했습니다.', 'error');
 }
 } finally {
 if (refreshBtn) { refreshBtn.disabled = false; refreshBtn.style.opacity = ''; }
 }
 }

 async function saveOwnedBookFromModal() {
 if (!activeOwnedEditContext) return;
 if (isOwnedPlotEditing) {
 const ta = document.getElementById('ownedPlotDescTextarea');
 if (ta) currentModalDescription = ta.value.trim();
 syncPlotSeriesToHidden();
 }
 const title = document.getElementById('ownedInputTitle').value.trim();
 if (!title) {
 showToast('책 제목을 입력해 주세요.', 'error');
 return;
 }
 const isBorrowOrReturn = !selectedOwnedIsSold && (selectedOwnedIsBorrowed || selectedOwnedIsReturned);
 const selectedSourceVal = (document.getElementById('ownedInputSource')?.value || '').trim();
 if (isBorrowOrReturn && !selectedSourceVal) {
 showToast('대여중/반납 상태에서는 대여처를 반드시 선택해 주세요.', 'error');
 document.getElementById('ownedSourceField')?.scrollIntoView({ behavior: 'smooth', block: 'center' });
 return;
 }

 const saveBtn = document.getElementById('ownedSaveBtn');
 saveBtn.disabled = true;
 saveBtn.innerText = '저장 중...';
 saveBtn.style.opacity = '0.7';
 showToast('저장 중입니다...', '');

 commitPendingOwnedTag();
 const cleanTags = ownedEditTagsList.filter(t => !isEbookTagToken(t));
 const bookPayload = {
 title: title.replace(/\s*\(전자책\)\s*/gi, ' ').replace(/\s+/g, ' ').trim(),
 author: document.getElementById('ownedInputAuthor').value.trim(),
 publisher: document.getElementById('ownedInputPublisher').value.trim(),
 tags: cleanTags.join(', '),
 isEbook: selectedOwnedIsEbook,
 isSold: selectedOwnedIsSold,
 isReturned: selectedOwnedIsReturned && !selectedOwnedIsSold,
 isBorrowed: selectedOwnedIsBorrowed && !selectedOwnedIsSold && !selectedOwnedIsReturned,
 source: selectedOwnedIsSold ? '' : normalizeSourceName(document.getElementById('ownedInputSource')?.value || ''),
 borrowSource: selectedOwnedIsSold ? '' : normalizeSourceName(document.getElementById('ownedInputSource')?.value || ''),
 dueDate: (() => {
 const srcVal = document.getElementById('ownedInputSource')?.value.trim() || '';
 const finVal = document.getElementById('ownedInputFinishDate')?.value.trim() || '';
 const allowDue = selectedOwnedIsBorrowed && !selectedOwnedIsSold && !finVal && (!selectedOwnedIsEbook || srcVal.includes('알라딘'));
 return allowDue ? document.getElementById('ownedInputDueDate').value.trim() : '';
 })(),
 cover: currentModalCoverUrl || '',
 pubYear: currentModalPubYear || '',
 description: currentModalDescription || '',
 kdc: cleanCategoryDisplay(currentModalKdc || ''),
 vol: String(document.getElementById('ownedInputVol')?.value.trim() || currentModalVol || '').replace(/[^0-9]/g, ''),
 loanStats: currentModalLoanStats || '',
 series: document.getElementById('ownedInputSeries').value.trim(),
 translator: document.getElementById('ownedInputTranslator')?.value.trim() || '',
 memo: document.getElementById('ownedInputMemo').value.trim(),
 status: selectedOwnedStatus,
 rating: selectedOwnedRating > 0 ? formatStarRating(selectedOwnedRating) : '',
 isbn: normalizeIsbn(document.getElementById('ownedInputIsbn').value),
 startDate: document.getElementById('ownedInputStartDate').value.trim(),
 finishDate: document.getElementById('ownedInputFinishDate').value.trim(),
 review: document.getElementById('ownedInputReview').value.trim()
 };
 setOwnedEbookFlag(bookPayload, selectedOwnedIsEbook);
 setOwnedBorrowFlag(bookPayload, selectedOwnedIsBorrowed);

 const shouldSyncSiblings = true;

 try {
 let res;
 if (activeOwnedEditContext.fromBookmarkIsbn) {
 const removeBm = document.getElementById('removeBookmarkOnMove').checked;
 res = await sendSheetPost({
 action: 'moveBookmarkToLibrary',
 isbn: activeOwnedEditContext.fromBookmarkIsbn,
 removeBookmark: removeBm,
 syncSiblings: shouldSyncSiblings,
 book: bookPayload
 });
 if (res && res.status === 'duplicate') {
 if (confirm('이미 비슷한 제목의 도서가 시트에 있습니다. 그래도 추가할까요?')) {
 res = await sendSheetPost({
 action: 'moveBookmarkToLibrary',
 isbn: activeOwnedEditContext.fromBookmarkIsbn,
 removeBookmark: removeBm,
 force: true,
 syncSiblings: shouldSyncSiblings,
 book: bookPayload
 });
 } else {
 return;
 }
 }
 } else if (activeOwnedEditContext.mode === 'edit') {
 res = await sendSheetPost({
 target: 'library',
 action: 'lib_update',
 row: activeOwnedEditContext.book.row,
 origTitle: activeOwnedEditContext.book.title,
 origAuthor: activeOwnedEditContext.book.author,
 origIsbn: activeOwnedEditContext.book.isbn,
 origIsEbook: isOwnedEbook(activeOwnedEditContext.book),
 syncSiblings: shouldSyncSiblings,
 book: bookPayload
 });
 } else {
 res = await sendSheetPost({
 target: 'library',
 action: 'lib_add',
 syncSiblings: shouldSyncSiblings,
 book: bookPayload
 });
 if (res && res.status === 'duplicate') {
 if (confirm('이미 비슷한 제목의 도서가 시트에 있습니다. 그래도 새로 추가할까요?')) {
 res = await sendSheetPost({
 target: 'library',
 action: 'lib_add',
 force: true,
 syncSiblings: shouldSyncSiblings,
 book: bookPayload
 });
 } else {
 return;
 }
 }
 }

 if (res && res.status === 'ok') {
 const syncedCnt = Array.isArray(res.updatedBooks) ? res.updatedBooks.length : 0;
 closeOwnedEditModal(true);
 showToast(syncedCnt > 0 ? `저장했습니다. (같은 책 ${syncedCnt}권에도 평점·한줄평·메모 동기화)` : '저장했습니다.', 'success');
 } else if (res && res.status !== 'unauthorized') {
 showToast(res.message || '시트 저장 중 오류가 발생했습니다.', 'error');
 }
 } catch (e) {
 console.error(e);
 showToast('구글 시트와 통신하지 못했습니다.', 'error');
 } finally {
 saveBtn.disabled = false;
 saveBtn.innerText = '저장';
 saveBtn.style.opacity = '';
 }
 }

 async function deleteOwnedBookFromModal() {
  if (!activeOwnedEditContext || activeOwnedEditContext.mode !== 'edit') return;
  const target = activeOwnedEditContext.book;
  if (!confirm(`'${formatOwnedTitle(target)}' 도서를 내 서재에서 삭제할까요?`)) return;
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
      closeOwnedEditModal(true);
      showToast(`'${formatOwnedTitle(backup)}' 도서를 삭제했습니다.`, '', {
        label: '실행 취소',
        onClick: () => restoreDeletedOwnedBooks([backup])
      });
    } else if (res && res.status !== 'unauthorized') {
      showToast(res.message || '삭제 중 오류가 발생했습니다.', 'error');
    }
  } catch (e) {
    showToast('삭제 요청에 실패했습니다.', 'error');
  }
}


/* =========================================================
 * 책 표지 교체 모달 (관심 저자 사진 교체와 동일 레이아웃 + 알라딘 URL 지원)
 * ========================================================= */
function openBookCoverModal() {
  const overlay = document.getElementById('bookCoverModalOverlay');
  const titleEl = document.getElementById('bookCoverModalTitle');
  const searchInp = document.getElementById('bookCoverSearchInput');
  const urlInp = document.getElementById('customBookCoverUrlInput');
  const curTitle = (document.getElementById('ownedInputTitle')?.value || '').trim();
  if (!overlay) return;
  if (titleEl) {
    titleEl.innerHTML = `${curTitle ? escapeHtml(curTitle) + ' 표지 교체' : '책 표지 교체'}`;
  }
  if (searchInp) searchInp.value = curTitle;
  if (urlInp) urlInp.value = currentModalCoverUrl || '';
  overlay.classList.add('open');
  pushModalHistory('bookCover');
  refreshIcons(overlay);
  if (curTitle) {
    searchBookCoverCandidates();
  } else {
    const statusEl = document.getElementById('bookCoverPhotoStatus');
    const gridEl = document.getElementById('bookCoverPhotoGrid');
    const aladinLink = document.getElementById('aladinCoverSearchLink');
    if (statusEl) statusEl.textContent = '책 제목을 입력해 표지를 검색하거나 URL을 붙여넣어 주세요.';
    if (gridEl) gridEl.innerHTML = '';
    if (aladinLink) aladinLink.href = 'https://www.aladin.co.kr/search/wsearchresult.aspx?SearchTarget=All';
  }
}

function closeBookCoverModal() {
  document.getElementById('bookCoverModalOverlay')?.classList.remove('open');
  popModalHistory('bookCover');
}

async function searchBookCoverCandidates() {
  const q = (document.getElementById('bookCoverSearchInput')?.value || document.getElementById('ownedInputTitle')?.value || '').trim();
  const statusEl = document.getElementById('bookCoverPhotoStatus');
  const gridEl = document.getElementById('bookCoverPhotoGrid');
  const aladinLink = document.getElementById('aladinCoverSearchLink');
  if (!statusEl || !gridEl) return;
  if (aladinLink) {
    aladinLink.href = `https://www.aladin.co.kr/search/wsearchresult.aspx?SearchTarget=All&SearchWord=${encodeURIComponent(q)}`;
  }
  if (!q || q.length < 2) {
    statusEl.textContent = '검색어를 2글자 이상 입력해 주세요.';
    gridEl.innerHTML = '';
    return;
  }
  statusEl.textContent = `'${q}' 표지 검색 중...`;
  gridEl.innerHTML = '<div class="loading-msg" style="padding:14px;">표지 후보를 불러오는 중입니다...</div>';

  try {
    const cacheKey = 'v2:' + q.toLowerCase();
    let books = getApiCache('kakaoCand', cacheKey, API_CACHE_TTL_MS);
    if (!Array.isArray(books)) {
      const res = await fetchWithTimeout(buildSheetGetUrl({ action: 'searchBooks', query: q }));
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = await res.json();
      books = Array.isArray(data?.books) ? data.books : [];
      if (books.length > 0) setApiCache('kakaoCand', cacheKey, books, 200);
    }
    const withCovers = books.filter(b => b && b.cover);
    if (withCovers.length === 0) {
      statusEl.textContent = '검색된 표지가 없습니다. 우측 알라딘에서 찾아 URL을 붙여넣거나 기기에서 첨부해 주세요.';
      gridEl.innerHTML = '';
      return;
    }
    statusEl.textContent = `표지 후보 ${withCovers.length}건 (원하는 표지를 터치하면 바로 적용됩니다)`;
    gridEl.innerHTML = withCovers.map((b, i) => `
      <div class="wiki-photo-card" data-cover-idx="${i}" title="${escapeHtml(b.title || '')}">
        <img src="${escapeHtml(normalizeCoverUrl(b.cover))}" alt="${escapeHtml(b.title || '')}" loading="lazy" referrerpolicy="no-referrer" onerror="this.closest('.wiki-photo-card').style.display='none'">
        <span class="wiki-photo-card-title">${escapeHtml(b.title || '표지')}</span>
      </div>
    `).join('');
    gridEl.querySelectorAll('.wiki-photo-card').forEach(el => {
      const idx = Number(el.getAttribute('data-cover-idx'));
      el.addEventListener('click', () => {
        const picked = withCovers[idx];
        if (!picked?.cover) return;
        setOwnedCoverDisplay(picked.cover);
        saveBookCoverCache(normalizeIsbn(document.getElementById('ownedInputIsbn')?.value || picked.isbn) || normalizeBookTitle(document.getElementById('ownedInputTitle')?.value || picked.title), picked.cover);
        showToast('선택한 표지를 적용했습니다. 저장을 눌러 반영해 주세요.', 'success');
        closeBookCoverModal();
      });
    });
  } catch (e) {
    statusEl.textContent = '표지 검색 중 오류가 발생했습니다. URL을 직접 입력해 주세요.';
    gridEl.innerHTML = '';
  }
}

async function applyCustomBookCoverUrl() {
  const inp = document.getElementById('customBookCoverUrlInput');
  const rawVal = (inp?.value || '').trim();
  if (!rawVal || !/^https?:\/\//i.test(rawVal)) {
    showToast('올바른 이미지 주소 또는 알라딘 상품 URL(http/https)을 입력해 주세요.', 'error');
    return;
  }

  let finalCoverUrl = rawVal;
  const looksLikeImage = /\.(jpe?g|png|webp|gif|bmp)(\?.*)?$/i.test(rawVal) || /image\.aladin\.co\.kr|contents\.kyobobook|image\.yes24|search1\.kakaocdn|bookthumb-phinf/i.test(rawVal);

  if (!looksLikeImage) {
    showToast('페이지에서 표지 이미지를 추출하는 중입니다...');
    try {
      const reqUrl = buildSheetGetUrl({ action: 'extractCoverUrl', url: rawVal });
      if (reqUrl) {
        const res = await fetchWithTimeout(reqUrl);
        if (res.ok) {
          const data = await res.json();
          if (data && data.status === 'ok' && data.coverUrl) {
            finalCoverUrl = data.coverUrl;
          } else {
            showToast('해당 URL에서 표지 이미지를 찾지 못했습니다. 이미지 주소를 직접 복사해 넣어 주세요.', 'error');
            return;
          }
        }
      }
    } catch (e) {
      showToast('URL에서 표지 이미지를 가져오지 못했습니다.', 'error');
      return;
    }
  }

  setOwnedCoverDisplay(finalCoverUrl);
  saveBookCoverCache(normalizeIsbn(document.getElementById('ownedInputIsbn')?.value) || normalizeBookTitle(document.getElementById('ownedInputTitle')?.value), finalCoverUrl);
  showToast('표지를 변경했습니다. 저장을 눌러 반영해 주세요.', 'success');
  closeBookCoverModal();
}