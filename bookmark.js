/* =========================================================
 * All BOOKs 홈 대시보드 · 북마크 · 관심 저자 · 신간 알림 (bookmark.js)
 * ========================================================= */
 /* =========================================================
 * 홈 독서 대시보드 (검색 전)
 * ========================================================= */
 function resetToHomeDashboard() {
 isSearchActive = false;
 document.getElementById('searchInput').value = '';
 updateSearchClearBtn();
 
 document.getElementById('recentSearchArea').classList.add('hidden');
 document.getElementById('postSearchOwnedCard')?.classList.add('hidden');
 document.getElementById('searchResultsCard').classList.add('hidden');
 document.getElementById('mainBookResultCard').classList.add('hidden');
 document.getElementById('linksCard').classList.add('hidden');
 document.getElementById('apiLibraryBox').classList.add('hidden');
 document.getElementById('apiSameAuthorBox').classList.add('hidden');
 document.getElementById('apiRecommendBox').classList.add('hidden');
 renderHomeReadingDashboard();
 }

 function computeLibraryStats() {
 const total = myOwnedBooks.length;
 let borrowedCount = 0;
 let soldCount = 0;
 let ebooks = 0;
 let done = 0;
 let doneThisYear = 0;
 let reading = 0;
 let ratingSum = 0;
 let ratingCount = 0;
 const readingTagMap = new Map();
 const currentYear = String(new Date().getFullYear());

 myOwnedBooks.forEach(b => {
 if (isOwnedSold(b)) soldCount++;
 else if (isOwnedBorrowed(b)) borrowedCount++;
 if (isOwnedEbook(b)) ebooks++;
 const st = normalizeReadingStatus(b.status);
 if (st === '완독') {
 done++;
 if (String(b.finishDate || '').startsWith(currentYear)) {
 doneThisYear++;
 }
 } else if (st === '읽는 중') {
 reading++;
 String(b.tags || '').split(',').forEach(t => {
 const clean = t.trim();
 if (clean && clean !== '전자책') readingTagMap.set(clean, (readingTagMap.get(clean) || 0) + 1);
 });
 }

 const r = parseRating(b.rating);
 if (r > 0) { ratingSum += r; ratingCount++; }
 });

 const topReadingTagEntry = Array.from(readingTagMap.entries()).sort((a, b) => b[1] - a[1])[0];
 const bookmarks = safeReadJson('myBookmarks', []);

 return {
 total,
 ownedOnly: total - borrowedCount - soldCount,
 borrowedCount,
 soldCount,
 paper: total - ebooks,
 ebooks,
 done,
 doneThisYear,
 reading,
 donePct: total > 0 ? Math.round((done / total) * 100) : 0,
 avgRating: ratingCount > 0 ? (ratingSum / ratingCount).toFixed(1) : '-',
 topReadingTag: topReadingTagEntry ? topReadingTagEntry[0] : '',
 bookmarkCount: bookmarks.length
 };
 }

 function getOwnedBookThumbUrl(b, cacheObj = null) {
 if (!b) return NO_COVER_SVG;
 const cache = cacheObj || getBookCoverCache();
 const rawCover = String(b.cover || '').trim()
 || (b.isbn ? cache[normalizeIsbn(b.isbn)] : '')
 || cache[normalizeBookTitle(b.title)]
 || '';
 return !isPlaceholderCoverUrl(rawCover) ? normalizeCoverUrl(rawCover) : NO_COVER_SVG;
 }

 function renderHomeReadingDashboard() {
 const dash = document.getElementById('homeReadingDashboard');
 if (!dash) return;

 if (isSearchActive || myOwnedBooks.length === 0) {
 dash.classList.add('hidden');
 return;
 }

 dash.classList.remove('hidden');
 const stats = computeLibraryStats();

 const kpiStripEl = document.getElementById('homeKpiStrip'); if (kpiStripEl) kpiStripEl.innerHTML = `
 <div class="home-kpi-card" onclick="openMyLibraryModal(false, 'all')">
 <span class="home-kpi-label">전체 도서</span>
 <span class="home-kpi-value">${stats.total}권</span>
 </div>
 <div class="home-kpi-card" onclick="openMyLibraryModal(false, '완독')">
 <span class="home-kpi-label">완독 현황</span>
 <span class="home-kpi-value">${stats.done}권</span>
 </div>
 <div class="home-kpi-card" onclick="openMyLibraryModal(false, '읽는 중')">
 <span class="home-kpi-label">읽는 중</span>
 <span class="home-kpi-value">${stats.reading}권</span>
 </div>
 <div class="home-kpi-card" onclick="event.stopPropagation(); toggleBookmarkModal();">
 <span class="home-kpi-label">내 북마크</span>
 <span class="home-kpi-value">${stats.bookmarkCount}권</span>
 </div>
 `;

 const borrowedBooks = myOwnedBooks
 .filter(b => isOwnedBorrowed(b) && !isOwnedSold(b) && !isOwnedReturned(b) && !isOwnedEbook(b) && !String(b.finishDate || '').trim() && !['완독', '중단'].includes(normalizeReadingStatus(b.status)))
 .slice()
 .sort((a, b) => {
 const da = String(a.dueDate || '').trim();
 const db = String(b.dueDate || '').trim();
 if (da && db) return da.localeCompare(db);
 if (da) return -1;
 if (db) return 1;
 return (Number(b.row) || 0) - (Number(a.row) || 0);
 });
 const borrowCountEl = document.getElementById('homeBorrowedCountText');
 if (borrowCountEl) borrowCountEl.innerText = `총 ${borrowedBooks.length}권`;
 const readingEl = document.getElementById('homeReadingNowList');
 if (borrowedBooks.length === 0) {
 readingEl.innerHTML = `
 <div class="empty-state-illust-wrap">
 <img class="empty-state-illust-img" src="${ILLUST_BORROWED_BOOKS}" alt="대여 도서">
 <span>현재 대여 중인 도서가 없어요.<br>빌린 책을 등록하면 반납일과 함께 바로 확인할 수 있어요.</span>
 </div>
 `;
 } else {
 const defaultVisible = 3;
 const visibleBorrowed = isHomeBorrowedExpanded ? borrowedBooks : borrowedBooks.slice(0, defaultVisible);
 const toggleBtnHtml = borrowedBooks.length > defaultVisible
 ? `<button type="button" class="home-more-btn" onclick="toggleHomeBorrowedExpand()">${isHomeBorrowedExpanded ? '접기 ▲' : `더보기 (+${borrowedBooks.length - defaultVisible}권) ▼`}</button>`
 : '';
 const homeCoverCache = getBookCoverCache();
 readingEl.innerHTML = visibleBorrowed.map(b => {
 const idx = myOwnedBooks.indexOf(b);
 const dueBadge = getDueDateBadgeHtml(b);
 const src = getOwnedSource(b);
 const st = normalizeReadingStatus(b.status);
 const logoSrc = getLibraryLogoSrc(src);
 const thumbUrl = getOwnedBookThumbUrl(b, homeCoverCache);
 const srcHtml = src
 ? `<span style="display:inline-flex; align-items:center;">${logoSrc ? `<img src="${escapeHtml(logoSrc)}" class="home-lib-logo" alt="" onerror="this.style.display='none'">` : ''}${escapeHtml(src)}</span>`
 : '';
 const metaParts = [srcHtml, escapeHtml(formatAuthorWithSuffix(b.author)), st ? escapeHtml(st) : ''].filter(Boolean);
 return `
 <div class="owned-mini-row clickable" onclick="openOwnedEditModalByIndex(${idx})">
 <img class="home-borrow-thumb ${getCoverStatusBorderCls(b)}" src="${escapeHtml(thumbUrl)}" alt="" loading="lazy" onerror="this.onerror=null;this.src=NO_COVER_SVG">
 <div class="owned-mini-info">
 <p class="owned-mini-title">${escapeHtml(formatOwnedTitle(b))} ${dueBadge}</p>
 <p class="owned-mini-meta">${metaParts.join(' · ')}</p>
 </div>
 </div>
 `;
 }).join('') + toggleBtnHtml;
 }

 renderHomeNewReleaseCard();
 if (!currentRandomPick || !myOwnedBooks.includes(currentRandomPick)) {
 pickRandomUnreadBook();
 } else {
 renderRandomPickCard();
 }
 refreshIcons();
 }

 function toggleHomeBorrowedExpand() {
 isHomeBorrowedExpanded = !isHomeBorrowedExpanded;
 renderHomeReadingDashboard();
 }

 function openMyLibraryThisYearDone() {
 const sortEl = document.getElementById('myLibSortSelect');
 if (sortEl) sortEl.value = 'finishDate';
 openMyLibraryModal(false, '완독');
 }

 function openMyLibraryByTag(tag) {
 openMyLibraryModal(false, '읽는 중');
 if (tag) setMyLibTagFilter(tag);
 }

 function pickRandomUnreadBook(shuffle = false) {
 const eligible = myOwnedBooks.filter(b => {
 if (isOwnedSold(b) || isOwnedReturned(b)) return false;
 if (String(b.finishDate || '').trim()) return false;
 const st = normalizeReadingStatus(b.status);
 return st !== '완독' && st !== '중단' && st !== '중지';
 });
 if (eligible.length === 0) {
 currentRandomPick = null;
 currentRandomPicks = [];
 renderRandomPickCard();
 return;
 }
 const shuffleArr = (arr) => {
 const copy = arr.slice();
 for (let i = copy.length - 1; i > 0; i--) {
 const j = Math.floor(Math.random() * (i + 1));
 [copy[i], copy[j]] = [copy[j], copy[i]];
 }
 return copy;
 };
 const pickFromPool = (pool, count, prevSet) => {
 const shuffled = shuffleArr(pool);
 const res = [];
 for (const b of shuffled) {
 if (shuffle && prevSet.has(b) && pool.length > count) continue;
 res.push(b);
 if (res.length >= count) break;
 }
 for (const b of shuffled) {
 if (res.length >= count) break;
 if (!res.includes(b)) res.push(b);
 }
 return res;
 };

 const prevSet = new Set(currentRandomPicks);
 const isQualifyingBorrowed = (b) => {
 if (!isOwnedBorrowed(b)) return false;
 if (!isOwnedEbook(b)) return true;
 const diff = getDueDaysDiff(b.dueDate);
 return diff !== null && diff < 60;
 };
 const borrowedPool = eligible.filter(isQualifyingBorrowed);
 const readingPool = eligible.filter(b => normalizeReadingStatus(b.status) === '읽는 중' && !isQualifyingBorrowed(b));

 let picked = [];
 if (borrowedPool.length > 0) {
 picked = pickFromPool(borrowedPool, 2, prevSet);
 if (picked.length < 2 && readingPool.length > 0) {
 const extra = pickFromPool(readingPool, 2 - picked.length, prevSet);
 picked = picked.concat(extra);
 }
 } else if (readingPool.length > 0) {
 picked = pickFromPool(readingPool, 2, prevSet);
 } else {
 picked = pickFromPool(eligible, 2, prevSet);
 }

 currentRandomPicks = picked;
 currentRandomPick = picked[0] || null;
 renderRandomPickCard();
 }

 function renderRandomPickCard() {
 const container = document.getElementById('homeRandomPickContainer');
 if (!container) return;

 const undoBarHtml = lastStartReadingUndo ? `
 <div class="inline-undo-bar">
 <span style="min-width:0; overflow:hidden; text-overflow:ellipsis; white-space:nowrap;">'${escapeHtml(formatOwnedTitle(lastStartReadingUndo.book))}' 읽는 중</span>
 <button type="button" class="inline-undo-btn" onclick="undoStartReadingOwned()">실행 취소</button>
 </div>
 ` : '';

 if (!currentRandomPicks || currentRandomPicks.length === 0) {
 container.innerHTML = `${undoBarHtml}<div class="empty-state-illust-wrap"><img class="empty-state-illust-img" src="${ILLUST_WHAT_TO_READ}" alt=""><span>추천할 도서가 없습니다.</span></div>`;
 return;
 }

 const cardsHtml = currentRandomPicks.map(b => {
 const idx = myOwnedBooks.indexOf(b);
 const ebook = isOwnedEbook(b);
 const st = normalizeReadingStatus(b.status);
 const authorDisplay = formatAuthorWithSuffix(b.author);
 const fmtBadge = ebook
 ? '<span class="mylib-badge src-ebook-fmt">e-book</span>'
 : '<span class="mylib-badge src-paper-fmt">종이책</span>';
 const tags = String(b.tags || '').split(',').map(t => t.trim()).filter(t => t && !isEbookTagToken(t)).slice(0, 3)
 .map(t => `<span class="mylib-badge">#${escapeHtml(t)}</span>`).join('');
 const randomThumbUrl = getOwnedBookThumbUrl(b);
 return `
 <div class="random-pick-box clickable" onclick="openOwnedEditModalByIndex(${idx})">
 <div class="random-pick-thumb-wrap ${getCoverStatusBorderCls(b)}">
 ${getCoverOwnershipObiHtml(b)}
 ${getCoverDoneStampHtml(b)}
 <img class="random-pick-thumb" src="${escapeHtml(randomThumbUrl)}" alt="" loading="lazy" onerror="this.onerror=null;this.src=NO_COVER_SVG">
 </div>
 <div class="random-pick-body">
 <p class="random-pick-title">${escapeHtml(formatOwnedTitle(b))}</p>
 <p class="random-pick-meta" style="font-weight:700; color:#374151;">${escapeHtml(authorDisplay)}${b.publisher ? ' · ' + escapeHtml(b.publisher) : ''}${getOwnedSeries(b) ? ' · ' + escapeHtml(getOwnedSeries(b)) : ''}</p>
 <div class="mylib-item-badges">${fmtBadge}${getDueDateBadgeHtml(b)}${st ? `<span class="mylib-badge ${st === '읽는 중' ? 'status-reading' : 'status-planned'}">${escapeHtml(st)}</span>` : ''}${tags}</div>
 ${st !== '읽는 중' ? `<div class="random-pick-actions" onclick="event.stopPropagation()"><button class="owned-action-btn add" onclick="startReadingOwnedByIndex(${idx})">읽기 시작</button></div>` : ''}
 </div>
 </div>
 `;
 }).join('');

 container.innerHTML = `${undoBarHtml}<div class="home-random-stack">${cardsHtml}</div>`;
 }

 async function startReadingOwnedByIndex(idx) {
 const b = myOwnedBooks[idx];
 if (!b) return;
 const prevSnapshot = {
 row: b.row,
 title: b.title,
 author: b.author,
 prevStatus: b.status || '',
 prevStartDate: b.startDate || '',
 book: { ...b }
 };
 try {
 const res = await sendSheetPost({
 target: 'library',
 action: 'lib_update',
 row: b.row,
 origTitle: b.title,
 origAuthor: b.author,
 book: { ...b, status: '읽는 중', startDate: b.startDate || getTodayDateStr() }
 });
 if (res && res.status === 'ok') {
 lastStartReadingUndo = prevSnapshot;
 pickRandomUnreadBook();
 showToast(`'${formatOwnedTitle(b)}' 읽는 중으로 변경했어요.`, 'success', {
 label: '실행 취소',
 onClick: () => undoStartReadingOwned()
 });
 }
 } catch (e) {
 showToast('상태 업데이트에 실패했습니다.', 'error');
 }
 }

 async function undoStartReadingOwned() {
 if (!lastStartReadingUndo) return;
 const snap = lastStartReadingUndo;
 const currentTarget = myOwnedBooks.find(x => x.row === snap.row) || snap.book;
 lastStartReadingUndo = null;
 try {
 const res = await sendSheetPost({
 target: 'library',
 action: 'lib_update',
 row: currentTarget.row,
 origTitle: currentTarget.title,
 origAuthor: currentTarget.author,
 book: { ...currentTarget, status: snap.prevStatus, startDate: snap.prevStartDate }
 });
 if (res && res.status === 'ok') {
 const restored = myOwnedBooks.find(x => x.row === currentTarget.row);
 if (restored) currentRandomPick = restored;
 renderRandomPickCard();
 showToast(`'${formatOwnedTitle(currentTarget)}' 읽기 시작을 취소했어요.`);
 }
 } catch (e) {
 showToast('실행 취소에 실패했습니다.', 'error');
 }
 }


 /* =========================================================
 * 북마크 메타 캐시 · HTTPS 보정 · 북마크 UI
 * ========================================================= */
 function getBookMetaCache() {
 try {
 return JSON.parse(localStorage.getItem('bookMetaCache')) || {};
 } catch (e) {
 return {};
 }
 }

 function saveBookMetaCache(isbn, author, pubYear) {
 const key = String(isbn || '').trim();
 if (!key) return;
 const cache = getBookMetaCache();
 cache[key] = {
 author: author || (cache[key] && cache[key].author) || '',
 pubYear: pubYear || (cache[key] && cache[key].pubYear) || ''
 };
 localStorage.setItem('bookMetaCache', JSON.stringify(cache));
 }

 function mergeBookmarksWithMeta(bookmarks) {
 const cache = getBookMetaCache();
 return (bookmarks || []).map(book => {
 const isbn = String(book.isbn || '');
 const cached = cache[isbn] || {};
 const author = book.author || cached.author || '';
 const pubYear = book.pubYear || book.publication_year || cached.pubYear || '';
 const cover = normalizeCoverUrl(book.cover);
 if (isbn && (author || pubYear)) {
 cache[isbn] = { author, pubYear };
 }
 return { ...book, cover, author, pubYear };
 });
 }

 async function enrichMissingBookmarkMeta() {
 if (isEnrichingBookmarks) return;
 if (getApiUsageRecord().count >= 450) return;
 const bookmarks = mergeBookmarksWithMeta(safeReadJson('myBookmarks', []));
 const missing = bookmarks.filter(b => b.isbn && (!b.author || !b.pubYear)).slice(0, 3);
 if (missing.length === 0) return;

 isEnrichingBookmarks = true;
 const updatedItems = [];
 try {
 await Promise.all(missing.map(async (b) => {
 const isbn = String(b.isbn);
 try {
 const data = await fetchD4lDetailCached(isbn, false);
 const detailBook = data?.response?.detail?.[0]?.book;
 if (detailBook) {
 const author = detailBook.authors || b.author || '';
 const pubYear = detailBook.publication_year || b.pubYear || '';
 if (author || pubYear) {
 b.author = author;
 b.pubYear = pubYear;
 saveBookMetaCache(isbn, author, pubYear);
 updatedItems.push({ isbn, author, pubYear, cover: normalizeCoverUrl(b.cover) });
 }
 }
 } catch (e) {}
 }));

 if (updatedItems.length > 0) {
 localStorage.setItem('myBookmarks', JSON.stringify(bookmarks));
 loadBookmarks(false);
 sendSheetPost({ action: 'updateMeta', items: updatedItems }).catch(() => {});
 }
 } finally {
 isEnrichingBookmarks = false;
 }
 }


function getBookmarks() {
  return mergeBookmarksWithMeta(safeReadJson('myBookmarks', []));
}

 function closeBookmarkModal() {
  closeQuickPopover();
  if (bmMultiSelectMode) {
    bmMultiSelectMode = false;
    bmSelectedIsbns.clear();
    updateBookmarkMultiSelectBar();
  }
  const modal = document.getElementById('bookmarkModal');
  if (modal && modal.classList.contains('open')) {
    modal.classList.remove('open');
    popModalHistory('bookmark');
  }
}

 function toggleBookmarkModal() {
 const modal = document.getElementById('bookmarkModal');
 if (!modal) return;
 if (modal.classList.contains('open')) {
 closeBookmarkModal();
 } else {
 modal.classList.add('open');
 pushModalHistory('bookmark');
 enrichMissingBookmarkMeta();
 refreshIcons();
 }
 }

 function refreshCurrentBookBookmarkUI() {
 if (!currentSelectedBook) return;
 const isbn = String(currentSelectedBook.isbn13 || currentSelectedBook.isbn || '');
 const bookmarks = safeReadJson('myBookmarks', []);
 const savedBook = bookmarks.find(b => String(b.isbn) === isbn);
 updateBookmarkBtnUI(!!savedBook, savedBook ? (savedBook.memo || '') : '');
 }

 function openBookmarkMemoModalForCurrent() {
 if (!currentSelectedBook) return;
 const isbn = String(currentSelectedBook.isbn13 || currentSelectedBook.isbn || '');
 if (!isbn) {
 showToast('ISBN 정보가 없어 북마크에 보관할 수 없습니다.', 'error');
 return;
 }
 const bookmarks = mergeBookmarksWithMeta(safeReadJson('myBookmarks', []));
 const existing = bookmarks.find(b => String(b.isbn) === isbn);

 if (!existing) {
 const author = currentSelectedBook.authors || '';
 const pubYear = currentSelectedBook.publication_year || '';
 if (author || pubYear) {
 saveBookMetaCache(isbn, author, pubYear);
 }
 const newBook = {
 title: currentSelectedBook.bookname,
 isbn: isbn,
 cover: normalizeCoverUrl(currentSelectedBook.bookImageURL),
 keyword: document.getElementById('searchInput').value,
 author: author,
 pubYear: pubYear,
 memo: ''
 };
 bookmarks.push(newBook);
 localStorage.setItem('myBookmarks', JSON.stringify(bookmarks));
 loadBookmarks(false);
 refreshCurrentBookBookmarkUI();
 renderHomeReadingDashboard();
 sendSheetPost({ action: 'add', book: newBook }).catch(() => {});
 showToast('북마크에 저장되었습니다.', 'success');

 openMemoModal({
 ...newBook,
 isExisting: true,
 isNewBookmark: true
 });
 return;
 }

 removeBookmark(isbn);
 }

 function openMemoModalForIsbn(isbn) {
 const bookmarks = mergeBookmarksWithMeta(safeReadJson('myBookmarks', []));
 const existing = bookmarks.find(b => String(b.isbn) === String(isbn));
 if (!existing) return;

 openMemoModal({
 ...existing,
 isbn: String(existing.isbn),
 memo: existing.memo || '',
 isExisting: true
 });
 }

 function openMemoModal(target) {
 activeMemoTarget = target;
 const hasMemo = !!(target.memo && target.memo.trim());
 document.getElementById('memoModalTitle').innerText = (target.isNewBookmark || !hasMemo) ? '메모 추가' : '메모 수정';
 document.getElementById('memoModalBookName').innerText = target.title;
 document.getElementById('memoTextarea').value = target.memo || '';

 const actionsRow = document.getElementById('memoModalActions');
 const deleteBtn = document.getElementById('memoDeleteBtn');
 const moveBtn = document.getElementById('memoMoveToLibBtn');
 if (target.isExisting && !target.isNewBookmark) {
 actionsRow.classList.remove('hidden');
 deleteBtn.classList.remove('hidden');
 moveBtn.classList.remove('hidden');
 } else {
 actionsRow.classList.add('hidden');
 deleteBtn.classList.add('hidden');
 moveBtn.classList.add('hidden');
 }

 document.getElementById('memoModalOverlay').classList.add('open');
 pushModalHistory('memo');
 refreshIcons();
 }

 function closeMemoModal(skipHistoryBack = false) {
 document.getElementById('memoModalOverlay').classList.remove('open');
 popModalHistory('memo', skipHistoryBack);
 activeMemoTarget = null;
 }

 function moveActiveBookmarkToLibrary() {
 if (!activeMemoTarget) return;
 const target = { ...activeMemoTarget };
 closeMemoModal(true);
 openMoveBookmarkToLibraryModal(target, true);
 }

 function saveFromMemoModal() {
 if (!activeMemoTarget) return;
 const memo = document.getElementById('memoTextarea').value.trim();
 const targetIsbn = String(activeMemoTarget.isbn);
 const author = activeMemoTarget.author || '';
 const pubYear = activeMemoTarget.pubYear || '';

 if (author || pubYear) {
 saveBookMetaCache(targetIsbn, author, pubYear);
 }

 let bookmarks = mergeBookmarksWithMeta(safeReadJson('myBookmarks', []));
 const idx = bookmarks.findIndex(b => String(b.isbn) === targetIsbn);

 if (idx > -1) {
 if (activeMemoTarget.isNewBookmark && !memo) {
 closeMemoModal();
 return;
 }
 bookmarks[idx].memo = memo;
 if (author) bookmarks[idx].author = author;
 if (pubYear) bookmarks[idx].pubYear = pubYear;
 localStorage.setItem('myBookmarks', JSON.stringify(bookmarks));
 loadBookmarks(false);
 refreshCurrentBookBookmarkUI();
 sendSheetPost({ action: 'updateMemo', isbn: targetIsbn, memo: memo, author: author, pubYear: pubYear }).catch(() => {});
 showToast('북마크 메모가 저장되었습니다.', 'success');
 } else {
 const newBook = {
 title: activeMemoTarget.title,
 isbn: targetIsbn,
 cover: normalizeCoverUrl(activeMemoTarget.cover),
 keyword: activeMemoTarget.keyword,
 author: author,
 pubYear: pubYear,
 memo: memo
 };
 bookmarks.push(newBook);
 localStorage.setItem('myBookmarks', JSON.stringify(bookmarks));
 loadBookmarks(false);
 refreshCurrentBookBookmarkUI();
 sendSheetPost({ action: 'add', book: newBook }).catch(() => {});
 showToast('북마크에 저장되었습니다.', 'success');
 }

 renderHomeReadingDashboard();
 closeMemoModal();
 }

 function deleteFromMemoModal() {
 if (!activeMemoTarget) return;
 const targetIsbn = String(activeMemoTarget.isbn);
 closeMemoModal();
 removeBookmark(targetIsbn);
 }

 function updateBookmarkBtnUI(isBookmarked, memo = '') {
  const btn = document.getElementById('bookmarkBtn');
  if (btn) {
    if (isBookmarked) {
      btn.innerHTML = '<i data-lucide="bookmark" size="16" fill="#f59e0b" color="#f59e0b"></i>';
      btn.title = '북마크 해제';
      btn.style.borderColor = '#f59e0b';
      btn.style.backgroundColor = '#fffbeb';
    } else {
      btn.innerHTML = '<i data-lucide="bookmark" size="16" color="var(--sec-text)"></i>';
      btn.title = '북마크 저장';
      btn.style.borderColor = 'var(--border)';
      btn.style.backgroundColor = 'transparent';
    }
    refreshIcons(btn);
  }

  const memoBox = document.getElementById('mainBookMemoBox');
  const memoText = document.getElementById('mainBookMemoText');
  if (memoBox && memoText) {
    if (isBookmarked && memo && memo.trim() !== '') {
      memoText.innerText = memo;
      memoBox.classList.remove('hidden');
    } else {
      memoBox.classList.add('hidden');
    }
  }
}

let bmMultiSelectMode = false;
let bmSelectedIsbns = new Set();
let bmLongPressTimer = null;
let bmLongPressStartX = 0;
let bmLongPressStartY = 0;
let bmLongPressTriggered = false;

function handleBookmarkCardPointerDown(ev, isbn) {
  if (bmMultiSelectMode) return;
  if (ev.target.closest('button')) return;
  bmLongPressTriggered = false;
  bmLongPressStartX = ev.clientX;
  bmLongPressStartY = ev.clientY;
  cancelBookmarkCardLongPress();
  bmLongPressTimer = setTimeout(() => {
    bmLongPressTriggered = true;
    if (navigator.vibrate) { try { navigator.vibrate(20); } catch (e) {} }
    enterBookmarkMultiSelectMode(String(isbn));
  }, 480);
}

function handleBookmarkCardPointerMove(ev) {
  if (!bmLongPressTimer) return;
  if (Math.hypot(ev.clientX - bmLongPressStartX, ev.clientY - bmLongPressStartY) > 8) {
    cancelBookmarkCardLongPress();
  }
}

function cancelBookmarkCardLongPress() {
  if (bmLongPressTimer) {
    clearTimeout(bmLongPressTimer);
    bmLongPressTimer = null;
  }
}

function enterBookmarkMultiSelectMode(initialIsbn) {
  bmMultiSelectMode = true;
  bmSelectedIsbns.clear();
  if (initialIsbn) bmSelectedIsbns.add(String(initialIsbn));
  updateBookmarkMultiSelectBar();
  loadBookmarks(false);
}

function exitBookmarkMultiSelectMode() {
  bmMultiSelectMode = false;
  bmSelectedIsbns.clear();
  updateBookmarkMultiSelectBar();
  loadBookmarks(false);
}

function updateBookmarkMultiSelectBar() {
  const bar = document.getElementById('bmMultiSelectBar');
  const cntEl = document.getElementById('bmMultiSelectCount');
  const allBtn = document.getElementById('bmSelectAllBtn');
  if (!bar) return;
  bar.classList.toggle('hidden', !bmMultiSelectMode);
  if (cntEl) cntEl.textContent = `${bmSelectedIsbns.size}권 선택됨`;
  if (allBtn) {
    const total = getBookmarks().length;
    allBtn.textContent = (total > 0 && bmSelectedIsbns.size >= total) ? '전체해제' : '전체선택';
  }
}

function toggleSelectAllBookmarks() {
  const all = getBookmarks();
  if (all.length > 0 && bmSelectedIsbns.size >= all.length) {
    bmSelectedIsbns.clear();
  } else {
    all.forEach(b => bmSelectedIsbns.add(String(b.isbn)));
  }
  updateBookmarkMultiSelectBar();
  loadBookmarks(false);
}

function batchDeleteSelectedBookmarks() {
  const targets = Array.from(bmSelectedIsbns);
  if (targets.length === 0) return;
  if (!confirm(`선택한 북마크 ${targets.length}권을 삭제할까요?`)) return;
  const current = mergeBookmarksWithMeta(safeReadJson('myBookmarks', []));
  const removedItems = current.filter(b => targets.includes(String(b.isbn)));
  const remaining = current.filter(b => !targets.includes(String(b.isbn)));
  localStorage.setItem('myBookmarks', JSON.stringify(remaining));
  exitBookmarkMultiSelectMode();
  refreshCurrentBookBookmarkUI();
  renderHomeReadingDashboard();
  sendSheetPost({ action: 'removeMany', isbns: targets }).catch(() => {
    targets.forEach(id => sendSheetPost({ action: 'remove', isbn: id }).catch(() => {}));
  });
  showToast(`북마크 ${removedItems.length}권을 해제했습니다.`, '', {
    label: '실행 취소',
    onClick: () => restoreDeletedBookmarks(removedItems)
  });
}

function restoreDeletedBookmarks(items) {
  const list = Array.isArray(items) ? items : [items];
  if (list.length === 0) return;
  let current = mergeBookmarksWithMeta(safeReadJson('myBookmarks', []));
  list.forEach(bk => {
    if (!bk || !bk.isbn) return;
    current = current.filter(x => String(x.isbn) !== String(bk.isbn));
    current.push(bk);
  });
  localStorage.setItem('myBookmarks', JSON.stringify(current));
  loadBookmarks(false);
  refreshCurrentBookBookmarkUI();
  renderHomeReadingDashboard();
  sendSheetPost({ action: 'addMany', books: list }).catch(() => {
    list.forEach(bk => sendSheetPost({ action: 'add', book: bk }).catch(() => {}));
  });
  showToast(list.length > 1 ? `북마크 ${list.length}권을 복원했습니다.` : `'${list[0].title}' 북마크를 복원했습니다.`, 'success');
}

function searchBookmarkByIsbn(isbn) {
  const b = getBookmarks().find(x => String(x.isbn) === String(isbn));
  if (!b) return;
  const cleanTitle = String(b.title || '').split(' =')[0].split(':')[0].trim();
  closeBookmarkModal();
  document.getElementById('searchInput').value = cleanTitle;
  executeSearch(cleanTitle);
}

function moveBookmarkToLibraryByIsbn(isbn) {
  const b = getBookmarks().find(x => String(x.isbn) === String(isbn));
  if (!b) return;
  closeBookmarkModal();
  openMoveBookmarkToLibraryModal(b);
}

function openBookmarkMorePopover(ev, isbn, hasOwned) {
  ev.stopPropagation();
  const b = getBookmarks().find(x => String(x.isbn) === String(isbn));
  if (!b) return;
  const menu = document.getElementById('quickPopoverMenu');
  const backdrop = document.getElementById('quickPopoverBackdrop');
  if (!menu || !backdrop) return;
  const safeIsbn = escapeHtml(String(isbn)).replace(/'/g, "\\'");
  menu.innerHTML = `
    <div class="quick-popover-book-header">
      <img class="quick-popover-book-thumb" src="${escapeHtml(normalizeCoverUrl(b.cover))}" alt="" onerror="this.onerror=null;this.src=NO_COVER_SVG">
      <div class="quick-popover-book-meta">
        <p class="quick-popover-book-title">${escapeHtml(b.title)}</p>
        <p class="quick-popover-book-author">${escapeHtml(formatAuthorText(b.author))}</p>
      </div>
    </div>
    <div class="quick-popover-divider"></div>
    <button type="button" class="quick-popover-item" onclick="closeQuickPopover(); searchBookmarkByIsbn('${safeIsbn}');">
      <i data-lucide="search" size="15" color="#4f46e5"></i><span>책 찾아보기</span>
    </button>
    <button type="button" class="quick-popover-item" onclick="closeQuickPopover(); openMemoModalForIsbn('${safeIsbn}');">
      <i data-lucide="file-plus-2" size="15" color="#d97706"></i><span>${b.memo && b.memo.trim() ? '메모 수정' : '메모 추가'}</span>
    </button>
    ${!hasOwned ? `<button type="button" class="quick-popover-item" onclick="closeQuickPopover(); moveBookmarkToLibraryByIsbn('${safeIsbn}');">
      <i data-lucide="library" size="15" color="#059669"></i><span>내 서재에 추가</span>
    </button>` : ''}
    <div class="quick-popover-divider"></div>
    <button type="button" class="quick-popover-item danger" onclick="closeQuickPopover(); removeBookmark('${safeIsbn}');">
      <i data-lucide="bookmark-x" size="15"></i><span>삭제</span>
    </button>
  `;
  backdrop.classList.remove('hidden');
  positionQuickPopover(ev.currentTarget);
  refreshIcons(menu);
}

function loadBookmarks(shouldEnrich = true) {
  renderBookmarkFollowedAuthors();
  const bookmarks = mergeBookmarksWithMeta(safeReadJson('myBookmarks', []));
  const container = document.getElementById('bookmarkModalContent');
  const badge = document.getElementById('bookmarkBadge');

  badge.innerText = bookmarks.length;
  badge.style.display = bookmarks.length > 0 ? 'flex' : 'none';

  container.innerHTML = '';
  if (bookmarks.length === 0) {
    container.innerHTML = '<p style="color:var(--sec-text); font-size:13px; text-align:center; padding:20px 0; width:100%; grid-column:1/-1;">저장된 북마크가 없습니다.</p>';
    return;
  }

  bookmarks.forEach((book) => {
    const isbnStr = String(book.isbn || '');
    const isSelected = bmMultiSelectMode && bmSelectedIsbns.has(isbnStr);
    const item = document.createElement('div');
    item.className = 'bookmark-item' + (bmMultiSelectMode ? ' is-ms-mode' : '') + (isSelected ? ' is-selected' : '');

    item.addEventListener('pointerdown', (e) => handleBookmarkCardPointerDown(e, isbnStr));
    item.addEventListener('pointermove', (e) => handleBookmarkCardPointerMove(e));
    item.addEventListener('pointerup', () => cancelBookmarkCardLongPress());
    item.addEventListener('pointercancel', () => cancelBookmarkCardLongPress());
    item.addEventListener('contextmenu', (e) => { if (bmMultiSelectMode) e.preventDefault(); });

    const coverWrap = document.createElement('div');
    coverWrap.className = 'bm-cover-wrap';

    const ownedMatch = findOwnedMatch(book);
    if (bmMultiSelectMode) {
      const checkEl = document.createElement('span');
      checkEl.className = 'bm-select-check';
      checkEl.textContent = '✓';
      coverWrap.appendChild(checkEl);
    } else if (ownedMatch) {
      const isEbookOwned = isOwnedEbook(ownedMatch.owned);
      const ownBadge = document.createElement('span');
      ownBadge.className = `cover-badge ${isEbookOwned ? 'ebook' : 'owned'}`;
      ownBadge.innerText = isEbookOwned ? 'e-book 서재' : '서재';
      coverWrap.appendChild(ownBadge);
    }

    const img = document.createElement('img');
    img.src = normalizeCoverUrl(book.cover);
    img.onerror = function () { this.onerror = null; this.src = NO_COVER_SVG; };
    coverWrap.appendChild(img);

    if (!bmMultiSelectMode) {
      const moreBtn = document.createElement('button');
      moreBtn.type = 'button';
      moreBtn.className = 'bm-more-btn';
      moreBtn.title = '북마크 메뉴';
      moreBtn.setAttribute('aria-label', '북마크 메뉴');
      moreBtn.innerHTML = MORE_ICON_SVG_14;
      moreBtn.onclick = (e) => openBookmarkMorePopover(e, isbnStr, !!ownedMatch);
      coverWrap.appendChild(moreBtn);
    }

    // 메모 띠지는 표시만 (클릭 시 메모 수정창 열리지 않음)
    if (book.memo && book.memo.trim()) {
      const memoObi = document.createElement('div');
      memoObi.className = 'bm-memo-obi';
      memoObi.title = book.memo.trim();
      const memoSpan = document.createElement('span');
      memoSpan.className = 'bm-memo-obi-text';
      memoSpan.innerText = book.memo.trim();
      memoObi.appendChild(memoSpan);
      coverWrap.appendChild(memoObi);
    }

    const titleEl = document.createElement('p');
    titleEl.className = 'bookmark-title';
    titleEl.title = book.title;
    titleEl.innerText = book.title;

    const authorText = formatAuthorText(book.author);
    const authorEl = document.createElement('p');
    authorEl.className = 'bookmark-author';
    authorEl.title = authorText;
    authorEl.innerText = authorText;

    item.appendChild(coverWrap);
    item.appendChild(titleEl);
    item.appendChild(authorEl);

    // 표지 클릭 시 검색 이동 삭제 -> 멀티선택 모드일 때만 선택 토글
    item.onclick = () => {
      if (bmLongPressTriggered) {
        bmLongPressTriggered = false;
        return;
      }
      if (!bmMultiSelectMode) return;
      if (bmSelectedIsbns.has(isbnStr)) bmSelectedIsbns.delete(isbnStr);
      else bmSelectedIsbns.add(isbnStr);
      if (bmSelectedIsbns.size === 0) {
        exitBookmarkMultiSelectMode();
        return;
      }
      updateBookmarkMultiSelectBar();
      item.classList.toggle('is-selected', bmSelectedIsbns.has(isbnStr));
    };
    container.appendChild(item);
  });

  if (shouldEnrich) {
    enrichMissingBookmarkMeta();
  }
}

function removeBookmark(isbn, skipConfirm = false) {
  const targetIsbn = String(isbn);
  const current = mergeBookmarksWithMeta(safeReadJson('myBookmarks', []));
  const removed = current.find(b => String(b.isbn) === targetIsbn);
  if (!skipConfirm && removed && !confirm(`'${removed.title || '이 도서'}' 북마크를 삭제할까요?`)) return;
  const next = current.filter(b => String(b.isbn) !== targetIsbn);
  localStorage.setItem('myBookmarks', JSON.stringify(next));
  loadBookmarks(false);
  refreshCurrentBookBookmarkUI();
  renderHomeReadingDashboard();
  sendSheetPost({ action: 'remove', isbn: targetIsbn }).catch(() => {});
  showToast('북마크를 해제했습니다.', '', removed ? {
    label: '실행 취소',
    onClick: () => restoreDeletedBookmarks([removed])
  } : null);
}

 /* =========================================================
 * 관심 작가 팔로우 & 최근 1개월 신간 알림
 * ========================================================= */
 const FOLLOW_HEART_SVG = '<svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M12 21.35l-1.45-1.32C5.4 15.36 2 12.28 2 8.5 2 5.42 4.42 3 7.5 3c1.74 0 3.41.81 4.5 2.09C13.09 3.81 14.76 3 16.5 3 19.58 3 22 5.42 22 8.5c0 3.78-3.4 6.86-8.55 11.54L12 21.35z"/></svg>';
 // PERSON_ICON_SVG is in icons.js
// const _UNUSED_PERSON_SVG = '<svg width="15" height="15" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><circle cx="12" cy="8" r="4.2"/><path d="M4 20c0-3.8 3.6-6.2 8-6.2s8 2.4 8 6.2v1H4v-1z"/></svg>';
 const NEW_RELEASE_CACHE_TTL_MS = 12 * 60 * 60 * 1000; // 12시간 주기 자동 체크
 let cachedNewReleaseItems = [];
 let isCheckingNewReleases = false;

 function getFollowedAuthors() {
   const arr = safeReadJson('followedAuthors', []);
   return Array.isArray(arr) ? arr.map(s => String(s || '').trim()).filter(Boolean) : [];
 }

 function saveFollowedAuthors(list) {
   const uniq = Array.from(new Set((list || []).map(s => String(s || '').trim()).filter(Boolean)));
   try { localStorage.setItem('followedAuthors', JSON.stringify(uniq)); } catch (e) {}
   pushSyncStateToSheet(true);
   return uniq;
 }

 function isAuthorFollowed(authorName) {
   const key = String(authorName || '').trim().toLowerCase().replace(/\s+/g, '');
   if (!key) return false;
   return getFollowedAuthors().some(a => a.toLowerCase().replace(/\s+/g, '') === key);
 }

 function getDismissedNewReleases() {
   const arr = safeReadJson('dismissedNewReleases', []);
   return Array.isArray(arr) ? arr.map(s => String(s || '').trim()).filter(Boolean) : [];
 }

 function dismissNewRelease(isbnOrKey) {
  const k = String(isbnOrKey || '').trim();
  if (!k) return;
  const backupItem = cachedNewReleaseItems.find(it => (normalizeIsbn(it.isbn) || it.title) === k);
  const list = getDismissedNewReleases();
  if (!list.includes(k)) {
    list.push(k);
    try { localStorage.setItem('dismissedNewReleases', JSON.stringify(list.slice(-300))); } catch (e) {}
    pushSyncStateToSheet(true);
  }
  cachedNewReleaseItems = cachedNewReleaseItems.filter(it => (normalizeIsbn(it.isbn) || it.title) !== k);
  renderHomeNewReleaseCard();
  showToast('신간 알림을 숨겼습니다.', '', {
    label: '실행 취소',
    onClick: () => {
      const next = getDismissedNewReleases().filter(x => x !== k);
      try { localStorage.setItem('dismissedNewReleases', JSON.stringify(next)); } catch (e) {}
      if (backupItem) cachedNewReleaseItems.unshift(backupItem);
      pushSyncStateToSheet(true);
      renderHomeNewReleaseCard();
      showToast('신간 알림을 복원했습니다.', 'success');
    }
  });
}

 function updateFollowButtonEl(btnEl, authorName) {
   if (!btnEl) return;
   const clean = String(authorName || '').trim();
   if (!clean || clean === '저자 미상') {
     btnEl.classList.add('hidden');
     btnEl.dataset.author = '';
     return;
   }
   btnEl.dataset.author = clean;
   btnEl.classList.remove('hidden');
   const followed = isAuthorFollowed(clean);
   btnEl.classList.toggle('is-following', followed);
   btnEl.innerHTML = btnEl.id === 'sameAuthorSubBtn' ? (followed ? '✓' : '+') : (followed ? '✓ 구독중' : '+ 구독');
   btnEl.title = followed ? `${clean} 저자 구독 해제` : `${clean} 저자 신간 알림 구독`;
 }

 function toggleFollowAuthorByName(authorName) {
  const clean = String(authorName || '').trim();
  if (!clean || clean === '저자 미상') return;
  const cur = getFollowedAuthors();
  const key = clean.toLowerCase().replace(/\s+/g, '');
  const exists = cur.some(a => a.toLowerCase().replace(/\s+/g, '') === key);
  if (exists) {
    const prev = cur.slice();
    saveFollowedAuthors(cur.filter(a => a.toLowerCase().replace(/\s+/g, '') !== key));
    showToast(`'${clean}' 관심 저자를 해제했습니다.`, '', {
      label: '실행 취소',
      onClick: () => {
        saveFollowedAuthors(prev);
        refreshAllFollowButtonsUI();
        renderHomeNewReleaseCard();
        showToast(`'${clean}' 관심 저자를 복원했습니다.`, 'success');
      }
    });
  } else {
    saveFollowedAuthors([...cur, clean]);
    showToast(`'${clean}' 저자를 구독했습니다.`, 'success');
    checkFollowedAuthorsNewReleases(true);
  }
  refreshAllFollowButtonsUI();
  renderHomeNewReleaseCard();
}

 function toggleSubscribeSameAuthor() {
   const btn = document.getElementById('sameAuthorSubBtn');
   if (btn?.dataset?.author) toggleFollowAuthorByName(btn.dataset.author);
 }

 function updateMetaAuthorMiniSubBtn(authorName) {
   const btn = document.getElementById('ownedMetaAuthorSubBtn');
   if (!btn) return;
   const clean = String(authorName || '').trim();
   if (!clean || clean === '저자 미상') {
     btn.classList.add('hidden');
     btn.dataset.author = '';
     return;
   }
   btn.dataset.author = clean;
   btn.classList.remove('hidden');
   const followed = isAuthorFollowed(clean);
   btn.classList.toggle('is-following', followed);
   btn.textContent = followed ? '✓' : '+';
   btn.title = followed ? `${clean} 저자 구독 해제` : `${clean} 저자 신간 알림 구독`;
 }

 function toggleFollowMetaAuthor() {
   const btn = document.getElementById('ownedMetaAuthorSubBtn');
   const authorName = btn?.dataset?.author || getPrimaryAuthorForModal(document.getElementById('ownedInputAuthor')?.value || '');
   if (authorName) toggleFollowAuthorByName(authorName);
 }

 function toggleFollowModalAuthor() {
   const btn = document.getElementById('ownedModalFollowBtn');
   if (btn?.dataset?.author) toggleFollowAuthorByName(btn.dataset.author);
 }

 function refreshAllFollowButtonsUI() {
   const sameBtn = document.getElementById('sameAuthorSubBtn');
   if (sameBtn && sameBtn.dataset.author) updateFollowButtonEl(sameBtn, sameBtn.dataset.author);
   const modalBtn = document.getElementById('ownedModalFollowBtn');
   if (modalBtn && modalBtn.dataset.author) updateFollowButtonEl(modalBtn, modalBtn.dataset.author);
   const metaBtn = document.getElementById('ownedMetaAuthorSubBtn');
   if (metaBtn && metaBtn.dataset.author) updateMetaAuthorMiniSubBtn(metaBtn.dataset.author);
   renderBookmarkFollowedAuthors();
 }

 const authorPhotoPendingSet = new Set();

 function getCachedAuthorPhoto(authorName) {
  const custom = getCustomAuthorPhoto(authorName);
  if (custom) return custom;
  const key = String(authorName || '').trim().toLowerCase();
  if (!key) return null;
  const val = getApiCache('authorPhoto_v2', key, API_CACHE_TTL_MS);
  return typeof val === 'string' ? val : null;
}

 async function fetchAuthorPhotoUrl(authorName) {
   const clean = String(authorName || '').trim();
   if (!clean) return '';
   const cacheKey = clean.toLowerCase();
   const cached = getCachedAuthorPhoto(clean);
   if (cached !== null) return cached;

   let photoUrl = '';
   // 1) Apps Script 프록시(authorPhoto) 시도
   try {
     const reqUrl = buildSheetGetUrl({ action: 'authorPhoto', author: clean });
     if (reqUrl) {
       const res = await fetchWithTimeout(reqUrl);
       if (res.ok) {
         const data = await res.json();
         if (data && typeof data.photoUrl === 'string' && data.photoUrl) {
           photoUrl = data.photoUrl;
         }
       }
     }
   } catch (e) {}

   // 2) 브라우저에서 한국어 위키백과 + 영어 위키백과(langlinks) CORS API 직접 폴백
   let enTitle = '';
   if (!photoUrl) {
     try {
       const wUrl = `https://ko.wikipedia.org/w/api.php?action=query&titles=${encodeURIComponent(clean)}&prop=pageimages|langlinks&lllang=en&piprop=thumbnail&pithumbsize=160&redirects=1&format=json&origin=*`;
       const wRes = await fetchWithTimeout(wUrl);
       if (wRes.ok) {
         const wData = await wRes.json();
         const pages = wData?.query?.pages ? Object.values(wData.query.pages) : [];
         const hit = pages.find(p => p?.thumbnail?.source);
         if (hit) photoUrl = hit.thumbnail.source;
         else {
           const llPage = pages.find(p => Array.isArray(p?.langlinks) && p.langlinks[0]?.['*']);
           if (llPage) enTitle = llPage.langlinks[0]['*'];
         }
       }
     } catch (e) {}
   }
   if (!photoUrl) {
     for (const qStr of [clean + ' 작가', clean]) {
       try {
         const sUrl = `https://ko.wikipedia.org/w/api.php?action=query&generator=search&gsrsearch=${encodeURIComponent(qStr)}&gsrlimit=5&prop=pageimages|langlinks&lllang=en&piprop=thumbnail&pithumbsize=160&format=json&origin=*`;
         const sRes = await fetchWithTimeout(sUrl);
         if (sRes.ok) {
           const sData = await sRes.json();
           const pages = sData?.query?.pages ? Object.values(sData.query.pages) : [];
           const compactClean = clean.replace(/\s+/g, '').toLowerCase();
           pages.sort((a, b) => (a.index || 99) - (b.index || 99));
           const hit = pages.find(p => p?.thumbnail?.source && String(p.title || '').replace(/\s+/g, '').toLowerCase().includes(compactClean));
           if (hit) { photoUrl = hit.thumbnail.source; break; }
           if (!enTitle) {
             const llHit = pages.find(p => Array.isArray(p?.langlinks) && p.langlinks[0]?.['*'] && String(p.title || '').replace(/\s+/g, '').toLowerCase().includes(compactClean));
             if (llHit) enTitle = llHit.langlinks[0]['*'];
           }
         }
       } catch (e) {}
     }
   }
   if (!photoUrl && enTitle) {
     try {
       const enUrl = `https://en.wikipedia.org/w/api.php?action=query&titles=${encodeURIComponent(enTitle)}&prop=pageimages&piprop=thumbnail&pithumbsize=160&redirects=1&format=json&origin=*`;
       const enRes = await fetchWithTimeout(enUrl);
       if (enRes.ok) {
         const enData = await enRes.json();
         const pages = enData?.query?.pages ? Object.values(enData.query.pages) : [];
         const hit = pages.find(p => p?.thumbnail?.source);
         if (hit) photoUrl = hit.thumbnail.source;
       }
     } catch (e) {}
   }

   if (photoUrl) {
     setApiCache('authorPhoto_v2', cacheKey, photoUrl, 300);
   }
   return photoUrl || '';
 }

 function ensureFollowedAuthorPhotos(authors) {
   (authors || []).forEach(a => {
     const key = String(a || '').trim().toLowerCase();
     if (!key || authorPhotoPendingSet.has(key)) return;
     if (getCachedAuthorPhoto(a) !== null) return;
     authorPhotoPendingSet.add(key);
     fetchAuthorPhotoUrl(a).then(url => {
       authorPhotoPendingSet.delete(key);
       if (url) renderBookmarkFollowedAuthors();
     }).catch(() => {
       authorPhotoPendingSet.delete(key);
     });
   });
 }

 let activePhotoEditAuthor = '';

function promptAddFollowedAuthor() {
  const entered = prompt('관심 저자로 추가할 저자 이름을 입력해 주세요.');
  if (entered === null) return;
  const clean = String(entered || '').trim();
  if (!clean) return;
  const authors = getFollowedAuthors();
  if (authors.some(a => String(a).trim().toLowerCase() === clean.toLowerCase())) {
    showToast(`'${clean}' 저자는 이미 관심 저자에 등록되어 있습니다.`);
    return;
  }
  toggleFollowAuthorByName(clean);
}

function renderBookmarkFollowedAuthors() {
  const box = document.getElementById('bookmarkFollowedAuthorsBox');
  if (!box) return;
  const authors = getFollowedAuthors();
  const cardsHtml = authors.map(a => {
    const safe = escapeHtml(a).replace(/'/g, "\\'");
    const photo = getCachedAuthorPhoto(a);
    const initial = escapeHtml(String(a || '?').trim().charAt(0));
    const photoHtml = photo
      ? `<img class="bm-author-photo" src="${escapeHtml(photo)}" alt="${escapeHtml(a)}" loading="lazy" referrerpolicy="no-referrer" onerror="this.outerHTML='<div class=\'bm-author-photo-fallback\'>${initial}</div>'">`
      : `<div class="bm-author-photo-fallback">${initial}</div>`;
    return `
      <div class="bm-author-card">
        <div class="bm-author-photo-wrap">
          ${photoHtml}
          <button type="button" class="bm-author-more-btn" onclick="openFollowedAuthorMorePopover(event, '${safe}')" title="관심 저자 메뉴" aria-label="관심 저자 메뉴">${MORE_ICON_SVG_14}</button>
        </div>
        <span class="bm-author-name" title="${escapeHtml(a)}">${escapeHtml(a)}</span>
      </div>
    `;
  }).join('');
  const addCardHtml = `
    <div class="bm-author-card bm-author-add-card" onclick="promptAddFollowedAuthor()" title="관심 저자 추가" aria-label="관심 저자 추가">
      <div class="bm-author-photo-wrap bm-author-add-wrap">
        <i data-lucide="plus" size="22" color="#be123c"></i>
      </div>
      <span class="bm-author-name" style="color:#be123c; font-weight:700;">추가</span>
    </div>
  `;
  box.innerHTML = `
    <div class="bm-followed-header">
      <span style="display:inline-flex; align-items:center; gap:5px;">${HEART_FILLED_SVG} 관심 저자 (${authors.length}명)</span>
    </div>
    <div class="bm-followed-cards">${cardsHtml}${addCardHtml}</div>
  `;
  refreshIcons(box);
  if (authors.length > 0) ensureFollowedAuthorPhotos(authors);
}

function openFollowedAuthorMorePopover(ev, authorName) {
  ev.stopPropagation();
  const menu = document.getElementById('quickPopoverMenu');
  const backdrop = document.getElementById('quickPopoverBackdrop');
  if (!menu || !backdrop) return;
  const safe = escapeHtml(authorName).replace(/'/g, "\\'");
  const photo = getCachedAuthorPhoto(authorName);
  const initial = escapeHtml(String(authorName || '?').trim().charAt(0));
  const thumbHtml = photo
    ? `<img class="quick-popover-book-thumb" style="width:32px; height:32px; border-radius:8px; object-position:center top;" src="${escapeHtml(photo)}" alt="" referrerpolicy="no-referrer">`
    : `<div class="bm-author-photo-fallback" style="width:32px; height:32px; border-radius:8px; font-size:13px; background:#ffe4e6;">${initial}</div>`;
  menu.innerHTML = `
    <div class="quick-popover-book-header">
      ${thumbHtml}
      <div class="quick-popover-book-meta">
        <p class="quick-popover-book-title">${escapeHtml(authorName)}</p>
        <p class="quick-popover-book-author">관심 저자</p>
      </div>
    </div>
    <div class="quick-popover-divider"></div>
    <button type="button" class="quick-popover-item" onclick="closeQuickPopover(); searchFollowedAuthorFromBookmark('${safe}');">
      <i data-lucide="search" size="15" color="#4f46e5"></i><span>책 찾아보기</span>
    </button>
    <button type="button" class="quick-popover-item" onclick="closeQuickPopover(); openAuthorPhotoModal('${safe}');">
      <i data-lucide="image" size="15" color="#059669"></i><span>사진 교체하기</span>
    </button>
    <div class="quick-popover-divider"></div>
    <button type="button" class="quick-popover-item danger" onclick="closeQuickPopover(); toggleFollowAuthorByName('${safe}');">
      <i data-lucide="user-minus" size="15"></i><span>구독 해제</span>
    </button>
  `;
  backdrop.classList.remove('hidden');
  positionQuickPopover(ev.currentTarget);
  refreshIcons(menu);
}

function openAuthorPhotoModal(authorName) {
  activePhotoEditAuthor = String(authorName || '').trim();
  if (!activePhotoEditAuthor) return;
  const overlay = document.getElementById('authorPhotoModalOverlay');
  const titleEl = document.getElementById('authorPhotoModalTitle');
  const searchInp = document.getElementById('wikiAuthorSearchInput');
  const urlInp = document.getElementById('customAuthorPhotoUrlInput');
  if (titleEl) titleEl.innerHTML = `<i data-lucide="image" size="17" color="#4f46e5"></i> ${escapeHtml(activePhotoEditAuthor)} 사진 교체`;
  if (searchInp) searchInp.value = activePhotoEditAuthor;
  if (urlInp) urlInp.value = getCustomAuthorPhoto(activePhotoEditAuthor) || '';
  overlay.classList.add('open');
  pushModalHistory('authorPhoto');
  refreshIcons(overlay);
  searchWikiAuthorCandidates();
}

function closeAuthorPhotoModal() {
  document.getElementById('authorPhotoModalOverlay')?.classList.remove('open');
  popModalHistory('authorPhoto');
  activePhotoEditAuthor = '';
}

function isTitleRelevantToQuery(title, query) {
  const norm = (s) => String(s || '').replace(/\([^)]*\)/g, '').replace(/[\s·・.,\-_]+/g, '').toLowerCase();
  const t = norm(title);
  const q = norm(query);
  if (!t || !q) return false;
  if (t.includes(q) || q.includes(t)) return true;
  const tokens = String(query || '').trim().toLowerCase().split(/\s+/).filter(w => w.length >= 2);
  if (tokens.length >= 2) {
    return tokens.every(tok => t.includes(tok.replace(/[\s·・.,\-_]+/g, '')));
  }
  return false;
}

async function fetchWikiPageByTitle(lang, titleStr) {
  const url = `https://${lang}.wikipedia.org/w/api.php?action=query&titles=${encodeURIComponent(titleStr)}&prop=pageimages|description|extracts|langlinks&lllang=en&exintro=1&explaintext=1&exsentences=1&piprop=thumbnail&pithumbsize=240&redirects=1&format=json&origin=*`;
  const res = await fetchWithTimeout(url);
  if (!res.ok) return null;
  const data = await res.json();
  const pages = data?.query?.pages ? Object.values(data.query.pages) : [];
  const p = pages.find(x => x && !x.missing && x.title);
  if (!p) return null;
  return {
    title: String(p.title),
    description: String(p.description || p.extract || '').slice(0, 90),
    photoUrl: p?.thumbnail?.source || '',
    enTitle: Array.isArray(p?.langlinks) && p.langlinks[0]?.['*'] ? String(p.langlinks[0]['*']) : '',
    lang
  };
}

async function fetchWikiTitleCandidates(lang, queryStr, limit = 8) {
  const url = `https://${lang}.wikipedia.org/w/api.php?action=query&generator=search&gsrsearch=${encodeURIComponent('intitle:' + queryStr)}&gsrlimit=${limit}&prop=pageimages|description|extracts|langlinks&lllang=en&exintro=1&explaintext=1&exsentences=1&piprop=thumbnail&pithumbsize=240&format=json&origin=*`;
  const res = await fetchWithTimeout(url);
  if (!res.ok) return [];
  const data = await res.json();
  const pages = data?.query?.pages ? Object.values(data.query.pages) : [];
  pages.sort((a, b) => (a.index || 99) - (b.index || 99));
  return pages
    .filter(p => p && p.title && isTitleRelevantToQuery(p.title, queryStr))
    .map(p => ({
      title: String(p.title),
      description: String(p.description || p.extract || '').slice(0, 90),
      photoUrl: p?.thumbnail?.source || '',
      enTitle: Array.isArray(p?.langlinks) && p.langlinks[0]?.['*'] ? String(p.langlinks[0]['*']) : '',
      lang
    }));
}

async function fetchWikidataAuthorCandidates(queryStr) {
  const isKorean = /[가-힣]/.test(queryStr);
  const lang = isKorean ? 'ko' : 'en';
  const sUrl = `https://www.wikidata.org/w/api.php?action=wbsearchentities&search=${encodeURIComponent(queryStr)}&language=${lang}&limit=6&format=json&origin=*`;
  const res = await fetchWithTimeout(sUrl);
  if (!res.ok) return [];
  const data = await res.json();
  const items = Array.isArray(data?.search) ? data.search : [];
  if (items.length === 0) return [];

  const ids = items.map(x => x.id).filter(Boolean).slice(0, 6);
  const eUrl = `https://www.wikidata.org/w/api.php?action=wbgetentities&ids=${ids.join('|')}&props=sitelinks|labels|descriptions&languages=ko|en&format=json&origin=*`;
  const eRes = await fetchWithTimeout(eUrl);
  if (!eRes.ok) return [];
  const eData = await eRes.json();
  const entities = eData?.entities || {};

  const out = [];
  for (const id of ids) {
    const ent = entities[id];
    if (!ent) continue;
    const koTitle = ent.sitelinks?.kowiki?.title || '';
    const enTitle = ent.sitelinks?.enwiki?.title || '';
    const label = ent.labels?.ko?.value || ent.labels?.en?.value || koTitle || enTitle;
    const desc = ent.descriptions?.ko?.value || ent.descriptions?.en?.value || '';
    if (!koTitle && !enTitle) continue;

    let photoUrl = '';
    let chosenLang = koTitle ? 'ko' : 'en';
    if (koTitle) {
      const pKo = await fetchWikiPageByTitle('ko', koTitle).catch(() => null);
      if (pKo?.photoUrl) photoUrl = pKo.photoUrl;
    }
    if (!photoUrl && enTitle) {
      const pEn = await fetchWikiPageByTitle('en', enTitle).catch(() => null);
      if (pEn?.photoUrl) {
        photoUrl = pEn.photoUrl;
        chosenLang = 'en';
      }
    }
    if (photoUrl) {
      out.push({
        title: label || koTitle || enTitle,
        description: desc,
        photoUrl,
        enTitle: enTitle || '',
        lang: chosenLang
      });
    }
  }
  return out;
}

async function fetchWikimediaCommonsPortraits(nameQuery) {
  const clean = String(nameQuery || '').trim();
  if (!clean) return [];
  const url = `https://commons.wikimedia.org/w/api.php?action=query&generator=search&gsrnamespace=6&gsrsearch=${encodeURIComponent(clean)}&gsrlimit=8&prop=imageinfo&iiprop=url|mime&iiurlwidth=300&format=json&origin=*`;
  const res = await fetchWithTimeout(url);
  if (!res.ok) return [];
  const data = await res.json();
  const pages = data?.query?.pages ? Object.values(data.query.pages) : [];
  pages.sort((a, b) => (a.index || 99) - (b.index || 99));
  const SKIP_RE = /(book|cover|logo|signature|autograph|map|diagram|chart|flag|coat|seal|stamp|icon|poster|flyer|page|scan|pdf|svg)/i;
  const out = [];
  for (const p of pages) {
    const title = String(p?.title || '');
    const info = Array.isArray(p?.imageinfo) ? p.imageinfo[0] : null;
    const mime = String(info?.mime || '').toLowerCase();
    const photoUrl = String(info?.thumburl || info?.url || '').trim();
    if (!photoUrl) continue;
    if (!/^image\/(jpeg|jpg|png|webp)$/.test(mime)) continue;
    if (SKIP_RE.test(title)) continue;
    out.push({
      title: '위키미디어',
      description: '',
      photoUrl,
      lang: 'WIKI'
    });
    if (out.length >= 4) break;
  }
  return out;
}

async function searchWikiAuthorCandidates() {
  const rawQ = (document.getElementById('wikiAuthorSearchInput')?.value || activePhotoEditAuthor || '').trim();
  const statusEl = document.getElementById('wikiAuthorPhotoStatus');
  const gridEl = document.getElementById('wikiAuthorPhotoGrid');
  const googleLinkEl = document.getElementById('googleImgSearchLink');
  if (!rawQ || !statusEl || !gridEl) return;

  const hasCustomHint = /(사진|얼굴|인물|인터뷰|프로필|강연|portrait|photo|face|author|writer)/i.test(rawQ);
  if (googleLinkEl) {
    googleLinkEl.href = `https://store.kyobobook.co.kr/person/search?searchType=001&searchText=${encodeURIComponent(rawQ)}`;
  }

  statusEl.textContent = `'${rawQ}' 인물 사진 검색 중...`;
  gridEl.innerHTML = '<div class="loading-msg" style="padding:14px;">인물 사진 후보를 불러오는 중입니다...</div>';

  try {
    const isKorean = /[가-힣]/.test(rawQ);
    // 1) 위키데이터·위키백과 인물 사진과 영문명 확보 (외국인 저자 얼굴 사진에 가장 정확)
    const wikiPromise = (async () => {
      const [wdRes, exactPage] = await Promise.all([
        fetchWikidataAuthorCandidates(rawQ).catch(() => []),
        isKorean ? fetchWikiPageByTitle('ko', rawQ).catch(() => null) : fetchWikiPageByTitle('en', rawQ).catch(() => null)
      ]);
      const wikiItems = [];
      let detectedEnName = '';
      if (exactPage?.enTitle) detectedEnName = exactPage.enTitle;
      for (const item of wdRes) {
        if (!detectedEnName && item.enTitle) detectedEnName = item.enTitle;
        if (item.photoUrl) wikiItems.push({ ...item, title: item.title || '위키백과' });
      }
      if (exactPage?.photoUrl) {
        wikiItems.unshift({ title: exactPage.title || '위키백과', description: exactPage.description, photoUrl: exactPage.photoUrl, lang: 'WIKI' });
      } else if (exactPage?.enTitle) {
        const enPage = await fetchWikiPageByTitle('en', exactPage.enTitle).catch(() => null);
        if (enPage?.photoUrl) {
          wikiItems.unshift({ title: exactPage.title || enPage.title, description: enPage.description, photoUrl: enPage.photoUrl, lang: 'WIKI' });
        }
      }
      // 영문명이 확보되었거나 영문 검색어면 위키미디어 공용 인물 사진도 추가
      const commonsQuery = detectedEnName || (!isKorean ? rawQ : '');
      if (commonsQuery) {
        const commonsItems = await fetchWikimediaCommonsPortraits(commonsQuery).catch(() => []);
        wikiItems.push(...commonsItems);
      }
      return { wikiItems, detectedEnName };
    })();

    // 2) 카카오 이미지 검색 (서점·책표지 제외, 인터뷰/인물 우선)
    const kakaoBasePromise = (async () => {
      try {
        const reqUrl = buildSheetGetUrl({
          action: 'searchAuthorImages',
          query: rawQ,
          exact: hasCustomHint ? '1' : '0'
        });
        if (!reqUrl) return [];
        const res = await fetchWithTimeout(reqUrl);
        if (!res.ok) return [];
        const data = await res.json();
        return Array.isArray(data?.images) ? data.images : [];
      } catch (e) {
        return [];
      }
    })();

    const [wikiResult, kakaoImages] = await Promise.all([wikiPromise, kakaoBasePromise]);

    // 영문명이 발견되었고 결과가 적으면 영문명으로도 카카오 이미지 추가 검색
    let extraEnImages = [];
    if (wikiResult.detectedEnName && !hasCustomHint && kakaoImages.length < 6) {
      try {
        const enReqUrl = buildSheetGetUrl({
          action: 'searchAuthorImages',
          query: wikiResult.detectedEnName,
          enName: wikiResult.detectedEnName,
          exact: '0'
        });
        if (enReqUrl) {
          const res = await fetchWithTimeout(enReqUrl);
          if (res.ok) {
            const data = await res.json();
            if (Array.isArray(data?.images)) extraEnImages = data.images;
          }
        }
      } catch (e) {}
    }



    const candidates = [];
    const seen = new Set();
    const pushUnique = (list) => {
      (list || []).forEach(item => {
        if (!item?.photoUrl || seen.has(item.photoUrl)) return;
        seen.add(item.photoUrl);
        candidates.push(item);
      });
    };

    // 위키백과·위키미디어 확정 인물 사진을 맨 앞에 배치, 그 다음 필터링된 웹/뉴스 사진
    pushUnique(wikiResult.wikiItems);
    pushUnique(kakaoImages);
    pushUnique(extraEnImages);

    if (candidates.length === 0) {
      statusEl.textContent = '검색 결과가 없습니다. 우측 교보 인물검색에서 찾아 URL을 붙여넣거나 사진을 첨부해 주세요.';
      gridEl.innerHTML = '';
      return;
    }

    statusEl.textContent = `인물 사진 후보 ${candidates.length}건 (원하는 사진을 터치하면 바로 적용됩니다)`;
    gridEl.innerHTML = candidates.map((c, i) => `
      <div class="wiki-photo-card" data-wiki-idx="${i}">
        <img src="${escapeHtml(c.photoUrl)}" alt="${escapeHtml(c.title || rawQ)}" loading="lazy" referrerpolicy="no-referrer" onerror="this.closest('.wiki-photo-card').style.display='none'">
        <span class="wiki-photo-card-title">${escapeHtml(c.title || rawQ)}</span>
      </div>
    `).join('');
    gridEl.querySelectorAll('.wiki-photo-card').forEach(el => {
      const idx = Number(el.getAttribute('data-wiki-idx'));
      el.addEventListener('click', () => {
        const picked = candidates[idx];
        if (!picked || !activePhotoEditAuthor) return;
        saveCustomAuthorPhoto(activePhotoEditAuthor, picked.photoUrl);
        renderBookmarkFollowedAuthors();
        showToast(`'${activePhotoEditAuthor}' 사진을 변경했습니다.`, 'success');
        closeAuthorPhotoModal();
      });
    });
  } catch (e) {
    statusEl.textContent = '이미지 검색 중 오류가 발생했습니다. 교보 인물검색에서 찾아 URL을 붙여넣어 주세요.';
    gridEl.innerHTML = '';
  }
}

function applyCustomAuthorPhotoUrl() {
  if (!activePhotoEditAuthor) return;
  const val = (document.getElementById('customAuthorPhotoUrlInput')?.value || '').trim();
  if (!val || !/^https?:\/\//i.test(val)) {
    showToast('올바른 이미지 URL(http/https)을 입력해 주세요.', 'error');
    return;
  }
  saveCustomAuthorPhoto(activePhotoEditAuthor, val);
  renderBookmarkFollowedAuthors();
  showToast(`'${activePhotoEditAuthor}' 사진을 변경했습니다.`, 'success');
  closeAuthorPhotoModal();
}

function triggerAuthorPhotoFileUpload() {
  const inp = document.getElementById('authorPhotoFileInput');
  if (!inp) return;
  inp.value = '';
  inp.click();
}

async function handleAuthorPhotoFileSelect(event) {
  const file = event?.target?.files?.[0];
  if (!file || !activePhotoEditAuthor) return;
  const authorTarget = activePhotoEditAuthor;
  try {
    const compressed = await compressCoverImageFile(file);
    let finalUrl = compressed;
    try {
      const res = await sendSheetPost({
        action: 'uploadCoverImage',
        imageDataUrl: compressed,
        fileName: 'author_' + authorTarget.slice(0, 20)
      });
      if (res && res.status === 'ok' && res.url) finalUrl = res.url;
    } catch (e) {}
    saveCustomAuthorPhoto(authorTarget, finalUrl);
    renderBookmarkFollowedAuthors();
    showToast(`'${authorTarget}' 사진을 변경했습니다.`, 'success');
    closeAuthorPhotoModal();
  } catch (err) {
    showToast(err?.message || '사진 처리에 실패했습니다.', 'error');
  } finally {
    if (event?.target) event.target.value = '';
  }
}

function resetAuthorPhotoToDefault() {
  if (!activePhotoEditAuthor) return;
  const authorTarget = activePhotoEditAuthor;
  const prevPhoto = getCustomAuthorPhoto(authorTarget);
  saveCustomAuthorPhoto(authorTarget, '');
  renderBookmarkFollowedAuthors();
  closeAuthorPhotoModal();
  showToast(`'${authorTarget}' 사진을 초기화했습니다.`, '', prevPhoto ? {
    label: '실행 취소',
    onClick: () => {
      saveCustomAuthorPhoto(authorTarget, prevPhoto);
      renderBookmarkFollowedAuthors();
      showToast('이전 사진으로 복원했습니다.', 'success');
    }
  } : null);
}

 function searchFollowedAuthorFromBookmark(authorName) {
   closeBookmarkModal();
   document.getElementById('searchInput').value = authorName;
   executeSearch(authorName);
 }


 function parseBookPubDateMs(book) {
   const raw = String(book?.pubDate || book?.datetime || book?.publishDate || '').trim();
   if (raw) {
     const m = raw.match(/(\d{4})[-./]?(\d{2})[-./]?(\d{2})/);
     if (m) return new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3])).getTime();
     const parsed = Date.parse(raw);
     if (!Number.isNaN(parsed)) return parsed;
   }
   return null;
 }

 function isWithinRecentOneMonth(book) {
   const now = new Date();
   const oneMonthAgo = new Date(now.getFullYear(), now.getMonth() - 1, now.getDate()).getTime();
   const maxFuture = now.getTime() + 45 * 24 * 60 * 60 * 1000; // 예약판매 신간 허용
   const ms = parseBookPubDateMs(book);
   if (ms !== null) {
     return ms >= oneMonthAgo && ms <= maxFuture;
   }
   // API가 pubDate 없이 pubYear만 줄 경우: 현재 연도(또는 1월이면 작년) 책만 후보로 허용하지 않고 엄격 판별
   return false;
 }

 async function checkFollowedAuthorsNewReleases(forceRefresh = false) {
   const authors = getFollowedAuthors();
   if (authors.length === 0) {
     cachedNewReleaseItems = [];
     renderHomeNewReleaseCard();
     return;
   }
   if (isCheckingNewReleases) return;

   const cacheObj = safeReadJson('followedNewReleasesCache', null);
   const sig = authors.slice().sort().join('|');
   if (!forceRefresh && cacheObj && cacheObj.sig === sig && cacheObj.ts && (Date.now() - cacheObj.ts < NEW_RELEASE_CACHE_TTL_MS)) {
     cachedNewReleaseItems = Array.isArray(cacheObj.items) ? cacheObj.items : [];
     renderHomeNewReleaseCard();
     return;
   }

   isCheckingNewReleases = true;
   try {
     const found = [];
     const seenKeys = new Set();
     for (const authorName of authors.slice(0, 20)) {
       try {
         const res = await fetchWithTimeout(buildSheetGetUrl({ action: 'authorBooks', author: authorName }));
         if (!res.ok) continue;
         const data = await res.json();
         const books = Array.isArray(data?.books) ? data.books : [];
         const normExactName = (s) => String(s || '').replace(/\([^)]*\)|\[[^\]]*\]/g, '').replace(/[\s·・.,\-_]+/g, '').toLowerCase();
         const targetAuthorKey = normExactName(authorName);
         books.forEach(b => {
           const title = String(b.title || b.bookname || '').trim();
           const pub = String(b.publisher || '').trim();
           if (!title || /체험판|e-?book|전자책|세트|문제집|기출문제|수험서|자격증|워크북|실전모의고사|해설집/i.test(title)) return;
           if (/시대고시|에듀윌|해커스|박문각/i.test(pub)) return;
           const authorTokens = String(b.author || '').split(/[,;\/]+/).map(normExactName).filter(Boolean);
           if (authorTokens.length > 0 && !authorTokens.includes(targetAuthorKey)) return;
           if (!isWithinRecentOneMonth(b)) return;
           const isbn = normalizeIsbn(b.isbn || b.isbn13 || '');
           const key = isbn || normalizeBookTitle(title);
           if (!key || seenKeys.has(key)) return;
           seenKeys.add(key);
           found.push({
             title,
             author: b.author || authorName,
             followedAuthor: authorName,
             publisher: b.publisher || '',
             pubYear: b.pubYear || '',
             pubDate: String(b.pubDate || b.datetime || '').slice(0, 10),
             isbn,
             cover: b.cover || ''
           });
         });
       } catch (e) {}
     }
     found.sort((a, b) => String(b.pubDate || '').localeCompare(String(a.pubDate || '')));
     cachedNewReleaseItems = found;
     try {
       localStorage.setItem('followedNewReleasesCache', JSON.stringify({ ts: Date.now(), sig, items: found }));
     } catch (e) {}
     if (forceRefresh) {
       const activeCnt = getVisibleNewReleaseItems().length;
       showToast(activeCnt > 0 ? `신간 ${activeCnt}권을 발견했어요!` : '최근 1개월 이내 미소장 신간이 없습니다.', activeCnt > 0 ? 'success' : '');
     }
   } finally {
     isCheckingNewReleases = false;
     renderHomeNewReleaseCard();
   }
 }

 function getVisibleNewReleaseItems() {
   const dismissed = new Set(getDismissedNewReleases());
   const followedSet = new Set(getFollowedAuthors().map(a => a.toLowerCase().replace(/\s+/g, '')));
   return (cachedNewReleaseItems || []).filter(it => {
     const authorKey = String(it.followedAuthor || '').toLowerCase().replace(/\s+/g, '');
     if (followedSet.size > 0 && authorKey && !followedSet.has(authorKey)) return false;
     const key = normalizeIsbn(it.isbn) || it.title;
     if (dismissed.has(key)) return false;
     // 내 서재에 이미 보유한 ISBN 또는 도서 제외
     if (it.isbn && myOwnedBooksIndex.byIsbn.has(normalizeIsbn(it.isbn))) return false;
     if (findOwnedMatch({ bookname: it.title, authors: it.author, isbn13: it.isbn })) return false;
     return true;
   });
 }

 function searchNewReleaseBook(idx) {
   const items = getVisibleNewReleaseItems();
   const b = items[idx];
   if (!b) return;
   const kw = b.isbn || extractMainTitleForSearch(b.title) || b.title;
   document.getElementById('searchInput').value = b.title;
   executeSearch(kw);
 }

 function bookmarkNewReleaseBook(idx) {
   const items = getVisibleNewReleaseItems();
   const b = items[idx];
   if (!b) return;
   const isbn = normalizeIsbn(b.isbn) || ('NEW_' + Date.now());
   const bookmarks = mergeBookmarksWithMeta(safeReadJson('myBookmarks', []));
   if (bookmarks.some(x => String(x.isbn) === String(isbn))) {
     showToast('이미 북마크에 저장된 책입니다.');
     return;
   }
   const newBm = {
     title: b.title,
     isbn,
     cover: normalizeCoverUrl(b.cover),
     keyword: b.title,
     author: b.author || b.followedAuthor || '',
     pubYear: b.pubYear || (b.pubDate ? b.pubDate.slice(0, 4) : ''),
     memo: `${b.followedAuthor} 저자 신간`
   };
   bookmarks.push(newBm);
   try { localStorage.setItem('myBookmarks', JSON.stringify(bookmarks)); } catch (e) {}
   loadBookmarks(false);
   sendSheetPost({ action: 'add', book: newBm }).catch(() => {});
   showToast(`'${b.title}' 북마크에 저장했어요.`, 'success');
 }

 function renderHomeNewReleaseCard() {
   const card = document.getElementById('homeNewReleaseCard');
   if (!card) return;
   const items = getVisibleNewReleaseItems();
   if (isSearchActive || items.length === 0) {
     card.classList.add('hidden');
     card.innerHTML = '';
     return;
   }
   card.classList.remove('hidden');
   const firstTitle = items[0].title;
   const previewLine = items.length === 1 ? `『${firstTitle}』` : `『${firstTitle}』 외 ${items.length - 1}권`;

   const rowsHtml = items.slice(0, 6).map((b, idx) => {
     const dismissKey = escapeHtml(normalizeIsbn(b.isbn) || b.title).replace(/'/g, "\\'");
     return `
       <div class="new-rel-row clickable" onclick="searchNewReleaseBook(${idx})">
         <button type="button" class="new-rel-dismiss-x" onclick="event.stopPropagation(); dismissNewRelease('${dismissKey}')" title="숨김" aria-label="숨김"><i data-lucide="x" size="13"></i></button>
         <img class="new-rel-thumb" src="${escapeHtml(normalizeCoverUrl(b.cover))}" alt="" loading="lazy" onerror="this.onerror=null;this.src=NO_COVER_SVG">
         <div class="new-rel-info">
           <p class="new-rel-book-title"><span class="match-pill" style="background:#ffe4e6; color:#e11d38; margin-right:4px;">NEW</span>${escapeHtml(b.title)}</p>
           <p class="new-rel-book-meta">${escapeHtml(b.author || b.followedAuthor)}${b.pubDate ? ' · ' + escapeHtml(b.pubDate) : ''}</p>
         </div>
       </div>
     `;
   }).join('');

   card.innerHTML = `
     <div class="new-rel-header">
       <div class="new-rel-title-wrap">
         <span class="new-rel-bubble" aria-label="관심 저자 신간 ${items.length}권">${PERSON_ICON_SVG}<span>${items.length}</span></span>
         <div class="new-rel-headline">
           <span class="new-rel-headline-main">관심 저자 신간 도착</span>
           <span class="new-rel-headline-sub">${escapeHtml(previewLine)}</span>
         </div>
       </div>
       <div style="display:flex; align-items:center; gap:5px; flex-shrink:0;">
         <button type="button" class="owned-chip-btn" onclick="toggleBookmarkModal()" title="내 북마크에서 관심 저자 보기">구독 ${getFollowedAuthors().length}</button>
       </div>
     </div>

     <div class="new-rel-list">${rowsHtml}</div>
   `;
   refreshIcons(card);
 }