/* =========================================================
 * All BOOKs 통합 검색 · 선택 도서 · 대출 현황 · 최근 검색어 (search.js)
 * ========================================================= */
let postSearchOwnedMatches = [];
let postSearchOwnedFilter = 'all'; // 'all' | 'exact' | 'same_author'
let isMainBookPlotExpanded = false;

function renderPostSearchOwnedPanel(keyword, extraAuthorStrings = []) {
  const card = document.getElementById('postSearchOwnedCard');
  const titleEl = document.getElementById('postSearchOwnedTitle');
  const pillsEl = document.getElementById('postSearchOwnedPills');
  const bodyEl = document.getElementById('postSearchOwnedBody');
  if (!card || !titleEl || !pillsEl || !bodyEl) return;

  const matches = findOwnedMatchesForSearch(keyword, extraAuthorStrings);
  postSearchOwnedMatches = matches;
  postSearchOwnedFilter = 'all';

  if (matches.length === 0) {
    card.classList.add('hidden');
    card.classList.remove('is-open');
    bodyEl.classList.add('hidden');
    return;
  }

  card.classList.remove('hidden');
  // 상시 접힘 상태로 시작
  card.classList.remove('is-open');
  bodyEl.classList.add('hidden');

  titleEl.textContent = `내 서재에 관련 도서 ${matches.length}권`;

  const exactCount = matches.filter(m => m.kind === 'exact').length;
  const sameAuthorCount = matches.filter(m => m.kind === 'same_author').length;
  const relatedCount = matches.filter(m => m.kind !== 'exact' && m.kind !== 'same_author').length;

  const pillBtns = [];
  if (exactCount > 0) {
    pillBtns.push(`<button type="button" class="post-search-filter-pill" data-ps-filter="exact" onclick="filterPostSearchOwned('exact')">일치 ${exactCount}권</button>`);
  }
  if (sameAuthorCount > 0) {
    pillBtns.push(`<button type="button" class="post-search-filter-pill same-author" data-ps-filter="same_author" onclick="filterPostSearchOwned('same_author')">동일 저자 ${sameAuthorCount}권</button>`);
  }
  if (exactCount === 0 && sameAuthorCount === 0 && relatedCount > 0) {
    pillBtns.push(`<button type="button" class="post-search-filter-pill same-author" data-ps-filter="related" onclick="filterPostSearchOwned('related')">관련 ${relatedCount}권</button>`);
  }
  pillsEl.innerHTML = pillBtns.join('');

  renderPostSearchOwnedItems();
  refreshIcons(card);
}

function togglePostSearchOwnedPanel(forceOpen) {
  const card = document.getElementById('postSearchOwnedCard');
  const bodyEl = document.getElementById('postSearchOwnedBody');
  if (!card || !bodyEl) return;
  const willOpen = typeof forceOpen === 'boolean' ? forceOpen : bodyEl.classList.contains('hidden');
  bodyEl.classList.toggle('hidden', !willOpen);
  card.classList.toggle('is-open', willOpen);
}

function filterPostSearchOwned(kind) {
  const bodyEl = document.getElementById('postSearchOwnedBody');
  const wasOpen = bodyEl && !bodyEl.classList.contains('hidden');
  if (postSearchOwnedFilter === kind && wasOpen) {
    postSearchOwnedFilter = 'all';
  } else {
    postSearchOwnedFilter = kind;
    togglePostSearchOwnedPanel(true);
  }
  document.querySelectorAll('#postSearchOwnedPills .post-search-filter-pill').forEach(btn => {
    btn.classList.toggle('active', btn.getAttribute('data-ps-filter') === postSearchOwnedFilter);
  });
  renderPostSearchOwnedItems();
}

function renderPostSearchOwnedItems() {
  const listEl = document.getElementById('postSearchOwnedList');
  if (!listEl) return;
  const filtered = postSearchOwnedFilter === 'all'
    ? postSearchOwnedMatches
    : postSearchOwnedMatches.filter(m =>
        postSearchOwnedFilter === 'related'
          ? (m.kind !== 'exact' && m.kind !== 'same_author')
          : m.kind === postSearchOwnedFilter
      );
  const cache = getBookCoverCache();
  listEl.innerHTML = filtered.slice(0, 20).map(({ book: b, kind }) => {
    const idx = myOwnedBooks.indexOf(b);
    const kindPillHtml = kind === 'exact'
      ? '<span class="match-pill">일치</span>'
      : (kind === 'same_author'
        ? '<span class="match-pill similar">동일 저자</span>'
        : '<span class="match-pill similar">관련</span>');
    return buildMyLibCardHtml(b, idx, cache, { isPostSearch: true, kindPillHtml });
  }).join('') + (filtered.length > 20 ? `<div style="grid-column:1/-1; text-align:center; font-size:11.5px; color:#047857; padding:4px;">외 ${filtered.length - 20}권 더 있음</div>` : '');
}

function toggleMainBookPlot() {
  const plotEl = document.getElementById('mainBookPlot');
  if (!plotEl) return;
  isMainBookPlotExpanded = !isMainBookPlotExpanded;
  plotEl.classList.toggle('is-expanded', isMainBookPlotExpanded);
}

function updateMainBookPlotToggleBtn() {
  const plotEl = document.getElementById('mainBookPlot');
  if (!plotEl) return;
  isMainBookPlotExpanded = false;
  plotEl.classList.remove('is-expanded');
}

 function renderMainBookOwnedBar(book) {
 const mbWrap = document.getElementById('mainBookCoverWrap');
 const mbBadge = document.getElementById('mainBookCoverBadge');
 const mbObi = document.getElementById('mainBookCoverObi');
 const mbRating = document.getElementById('mainBookCoverRating');

 const matched = (book && myOwnedBooks.length > 0) ? findOwnedMatch(book) : null;
 if (matched && matched.owned) {
 const owned = matched.owned;
 const ownedIdx = myOwnedBooks.indexOf(owned);
 if (mbWrap) {
 mbWrap.classList.remove('cover-status-planned', 'cover-status-reading', 'cover-status-done', 'cover-status-stop');
 const stCls = getCoverStatusBorderCls(owned);
 if (stCls) mbWrap.classList.add(stCls);
 }
 if (mbBadge) {
 const ebFlag = isOwnedEbook(owned);
 mbBadge.className = `cover-badge cover-badge-btn ${ebFlag ? 'ebook' : 'owned'}`;
 mbBadge.textContent = ebFlag ? 'e-book' : '서재';
 mbBadge.title = '내 서재 기록 열기';
 mbBadge.onclick = (e) => { e.stopPropagation(); if (ownedIdx > -1) openOwnedEditModalByIndex(ownedIdx); };
 }
 if (mbObi) {
 if (isOwnedSold(owned)) { mbObi.className = 'cover-own-obi red-tag'; mbObi.textContent = '판매'; }
 else if (isOwnedReturned(owned)) { mbObi.className = 'cover-own-obi red-tag'; mbObi.textContent = '반납'; }
 else if (isOwnedBorrowed(owned)) {
 const diffDays = getDueDaysDiff(owned.dueDate);
 if (diffDays !== null && diffDays < 180) {
 mbObi.className = 'cover-own-obi ' + (diffDays <= 3 ? 'due-urgent' : 'due-tag');
 mbObi.textContent = diffDays < 0 ? `D+${Math.abs(diffDays)}` : (diffDays === 0 ? '오늘반납' : `D-${diffDays}`);
 } else { mbObi.className = 'cover-own-obi hidden'; mbObi.textContent = ''; }
 } else { mbObi.className = 'cover-own-obi hidden'; mbObi.textContent = ''; }
 }
 const mbSt = normalizeReadingStatus(owned.status);
 document.getElementById('mainBookCoverDoneStamp')?.classList.toggle('hidden', mbSt !== '완독');
 document.getElementById('mainBookCoverStopStamp')?.classList.toggle('hidden', mbSt !== '중단' && mbSt !== '중지');
 if (mbRating) {
 const rShort = formatRatingShort(owned.rating);
 mbRating.textContent = rShort;
 mbRating.classList.toggle('hidden', !rShort);
 }
 } else {
 if (mbWrap) mbWrap.classList.remove('cover-status-planned', 'cover-status-reading', 'cover-status-done', 'cover-status-stop');
 if (mbBadge) {
 mbBadge.className = 'cover-badge cover-badge-btn add-lib';
 mbBadge.textContent = '+추가';
 mbBadge.title = '내 서재에 추가';
 mbBadge.onclick = (e) => { e.stopPropagation(); openOwnedAddModalForCurrent(); };
 }
 if (mbObi) { mbObi.className = 'cover-own-obi hidden'; mbObi.textContent = ''; }
 document.getElementById('mainBookCoverDoneStamp')?.classList.add('hidden');
 document.getElementById('mainBookCoverStopStamp')?.classList.add('hidden');
 if (mbRating) { mbRating.textContent = ''; mbRating.classList.add('hidden'); }
 }
 }

 function refreshOwnedUIEverywhere() {
 const currentKw = document.getElementById('searchInput').value.trim();
 if (isSearchActive && currentKw) {
 const topA = currentSelectedBook?.authors ? [currentSelectedBook.authors] : (currentBooksList[0]?.doc?.authors ? [currentBooksList[0].doc.authors] : []);
 renderPostSearchOwnedPanel(currentKw, topA);
 }
 if (currentBooksList.length > 0) {
 renderSearchResultCards();
 if (currentSelectedBook) {
 const activeIdx = currentBooksList.findIndex(item => item.doc === currentSelectedBook);
 if (activeIdx > -1) {
 const el = document.getElementById(`book-item-${activeIdx}`);
 if (el) el.classList.add('active');
 }
 renderMainBookOwnedBar(currentSelectedBook);
 
 }
 } else if (!document.getElementById('mainBookResultCard').classList.contains('hidden') && currentKw) {
 renderMainBookOwnedBar({ bookname: currentKw, authors: '', publisher: '', isbn13: '' });
 }

 loadBookmarks(false);

 if (document.getElementById('myLibModalOverlay').classList.contains('open')) {
 renderMyLibStatsBar();
 populateMyLibFilters();
 renderMyLibraryList(false);
 }
 if (document.getElementById('ratingBreakdownModalOverlay')?.classList.contains('open')) {
 renderRatingBreakdownModal();
 }
 }


 /* =========================================================
 * 검색창 이벤트 (클릭: 최근검색 / 타이핑: 내 서재 자동완성)
 * ========================================================= */
 const searchInputEl = document.getElementById('searchInput');

 function updateSearchClearBtn() {
 const clearBtn = document.getElementById('searchClearBtn');
 if (!clearBtn || !searchInputEl) return;
 clearBtn.classList.toggle('hidden', !searchInputEl.value);
 }

 function clearSearchInput() {
  if (!searchInputEl) return;
  searchInputEl.value = '';
  updateSearchClearBtn();
  loadRecentSearches('');
  document.getElementById('recentSearchArea').classList.remove('hidden');
  searchInputEl.focus();
}

searchInputEl.addEventListener('click', function (event) {
  event.stopPropagation();
  const val = this.value.trim();
  loadRecentSearches(val);
  document.getElementById('recentSearchArea').classList.remove('hidden');
});

searchInputEl.addEventListener('input', function () {
  updateSearchClearBtn();
  const val = this.value.trim();
  loadRecentSearches(val);
  document.getElementById('recentSearchArea').classList.remove('hidden');
});

 // 검색 드롭다운이 열려 있을 때 바깥(버튼 포함)을 누르면 버튼이 실행되지 않고 드롭다운만 닫히도록 차단
 document.addEventListener('click', function (event) {
 const recentArea = document.getElementById('recentSearchArea');
 const isDropdownOpen = !!(recentArea && !recentArea.classList.contains('hidden'));
 if (!isDropdownOpen) return;

 const searchBox = document.getElementById('searchSection');
 if (searchBox && !searchBox.contains(event.target)) {
 event.preventDefault();
 event.stopPropagation();
 recentArea?.classList.add('hidden');
 
 }
 }, true);

 


 function updateDynamicLinks(keyword) {
 const cleanKw = extractMainTitleForSearch(keyword) || keyword;
 const encodedKeyword = encodeURIComponent(cleanKw);
 document.querySelectorAll('.dynamic-link').forEach(link => {
 const template = link.getAttribute('data-template');
 if (template) {
 link.href = template.replace(/\{kw\}/g, encodedKeyword);
 }
 });
 }

 function renderSearchResultCards() {
 let listHtml = '';
 currentBooksList.forEach((item, index) => {
 const book = item.doc;
 const titleEsc = escapeHtml(book.bookname);
 const authorDisplay = formatAuthorText(book.authors);
 const authorEsc = escapeHtml(authorDisplay);
 const yearDisplay = formatPubYearText(book.publication_year);
 const yearEsc = escapeHtml(yearDisplay);

 const ownedMatch = findOwnedMatch(book);
 const ownedObj = ownedMatch ? ownedMatch.owned : null;
 const ownedIdx = ownedObj ? myOwnedBooks.indexOf(ownedObj) : -1;

 const isEbookResult = ownedObj ? isOwnedEbook(ownedObj) : /e-?book|전자책|체험판/i.test(`${book.bookname || ''} ${book.publisher || ''}`);
 const fmtPillHtml = isEbookResult
 ? '<span class="search-fmt-pill ebook">e-book</span>'
 : '<span class="search-fmt-pill paper">종이책</span>';
 const coverBadgeHtml = ownedObj
 ? `<button type="button" class="cover-badge cover-badge-btn ${isOwnedEbook(ownedObj) ? 'ebook' : 'owned'}" onclick="event.stopPropagation(); openOwnedEditModalByIndex(${ownedIdx})" title="내 서재 기록 열기">${isOwnedEbook(ownedObj) ? 'e-book' : '서재'}</button>`
 : `<button type="button" class="cover-badge cover-badge-btn add-lib" onclick="event.stopPropagation(); openOwnedAddModalForSearchIndex(${index})" title="내 서재에 추가">+추가</button>`;
 listHtml += `
 <div class="search-result-item" id="book-item-${index}" onclick="selectBook(${index})">
 <div class="cover-wrap ${ownedObj ? getCoverStatusBorderCls(ownedObj) : ''}" style="border-radius:8px; overflow:hidden;">
 ${coverBadgeHtml}
 ${ownedObj ? getCoverOwnershipObiHtml(ownedObj) : ''}
 ${ownedObj ? getCoverDoneStampHtml(ownedObj) : ''}
 <img src="${escapeHtml(normalizeCoverUrl(book.bookImageURL))}" onerror="this.onerror=null;this.src=NO_COVER_SVG">
 </div>
 <p class="result-title" title="${titleEsc}">${titleEsc}</p>
 <p class="result-author" title="${authorEsc}">${authorEsc}</p>
 <p class="result-year" title="출간일: ${yearEsc}">${yearEsc}</p>
 ${fmtPillHtml}
 </div>
 `;
 });
 document.getElementById('searchResultsList').innerHTML = listHtml;
 }

 function executeSearch(clickedKeyword = null, options = {}) {
  const keyword = clickedKeyword || document.getElementById('searchInput').value.trim();
  if (!keyword) { showToast('검색어를 입력해 주세요.', 'error'); return; }

  lastSearchFromBarcode = !!(options && options.fromBarcode);
  const seq = ++latestSearchSeq;
  isSearchActive = true;
  document.getElementById('homeReadingDashboard').classList.add('hidden');
  document.getElementById('recentSearchArea').classList.add('hidden');
  document.getElementById('postSearchOwnedCard')?.classList.add('hidden');
 

 // 사용자 설정 유지: 검색어 자동 클립보드 복사
 navigator.clipboard.writeText(keyword).catch(() => {});
 document.getElementById('searchInput').value = keyword;
 updateSearchClearBtn();

 let searches = safeReadJson('recentBooks', []);
 searches = searches.filter(item => item !== keyword);
 searches.unshift(keyword);
 if (searches.length > 10) searches.pop();
 localStorage.setItem('recentBooks', JSON.stringify(searches));
 pushSyncStateToSheet(false);

 document.getElementById('searchResultsCard').classList.remove('hidden');

 updateDynamicLinks(keyword);
 

 document.getElementById('mainBookResultCard').classList.add('hidden');
 document.getElementById('linksCard').classList.add('hidden');
 document.getElementById('apiSameAuthorBox').classList.add('hidden');
 document.getElementById('apiRecommendBox').classList.add('hidden');
 document.getElementById('apiLibraryBox').classList.add('hidden');

 document.getElementById('searchResultCountText').innerText = `'${keyword}' 검색 결과 가져오는 중...`;
 document.getElementById('searchResultsList').innerHTML = "<div class='loading-msg'>도서 정보를 스마트 검색 중입니다...</div>";

 fetchBookListApi(keyword, seq);
 }

 async function fetchBookListApi(keyword, seq) {
 try {
 const originalKw = keyword.trim();
 const spacelessKw = originalKw.replace(/\s+/g, '');
 const cacheKey = originalKw.toLowerCase();
 const numericIsbn = normalizeIsbn(originalKw);
 const aladinSearchUrl = `https://www.aladin.co.kr/m/msearch.aspx?SearchWord=${encodeURIComponent(originalKw)}&SearchTarget=All&start=h_keyword`;

 // 1) 90일 브라우저 캐시 확인 (카카오 기반 v3 키)
 const searchCacheKey = `v4:${(spacelessKw || originalKw).toLowerCase()}`;
 const cachedDocs = getApiCache('search', searchCacheKey, API_CACHE_TTL_MS);
 let combinedDocs = [];

 if (Array.isArray(cachedDocs)) {
 combinedDocs = cachedDocs.map(doc => ({ doc }));
 } else {
 const seenIsbns = new Set();
 const pushKakaoBook = (bk) => {
 if (!bk || !bk.title) return;
 const isbn = normalizeIsbn(bk.isbn || '');
 const dedupKey = isbn || `${bk.title}|${bk.author || ''}`;
 if (seenIsbns.has(dedupKey)) return;
 seenIsbns.add(dedupKey);
 const authorsFull = [bk.author, bk.translator].filter(Boolean).join(' ; ');
 combinedDocs.push({
 doc: compactBookDoc({
 bookname: bk.title || '',
 authors: authorsFull || bk.author || '',
 publisher: bk.publisher || '',
 publication_year: bk.pubYear || '',
 isbn13: isbn,
 bookImageURL: bk.cover || '',
 description: bk.description || '',
 class_nm: bk.kdc || '',
 vol: bk.vol || ''
 })
 });
 };

 // ISBN 직접 검색(스캔 포함) 시 카카오+국립중앙도서관 통합 조회
 if (/^\d{10,13}$/.test(numericIsbn)) {
 const dtlRes = await fetchD4lDetailCached(numericIsbn, false).catch(() => null);
 if (seq !== latestSearchSeq) return;
 const dtlBook = dtlRes?.response?.detail?.[0]?.book;
 if (dtlBook) {
 combinedDocs.push({ doc: compactBookDoc(dtlBook) });
 seenIsbns.add(normalizeIsbn(dtlBook.isbn13 || numericIsbn));
 }
 }

 const mainTitleKw = extractMainTitleForSearch(originalKw);
 const hasMarcDelimiter = /=|\//.test(originalKw);
 const primaryTitleKw = (hasMarcDelimiter && mainTitleKw.length >= 2) ? mainTitleKw : originalKw;

 const runKakaoSearch = async (q) => {
 const reqUrl = buildSheetGetUrl({ action: 'searchBooks', query: q });
 if (!reqUrl) return [];
 const res = await fetch(reqUrl);
 if (!res.ok) return [];
 const data = await res.json();
 return Array.isArray(data?.books) ? data.books : [];
 };

 if (combinedDocs.length === 0) {
 const books1 = await runKakaoSearch(primaryTitleKw).catch(() => []);
 if (seq !== latestSearchSeq) return;
 books1.forEach(pushKakaoBook);
 }

 if (combinedDocs.length === 0 && mainTitleKw && mainTitleKw !== primaryTitleKw && mainTitleKw.length >= 2) {
 const books2 = await runKakaoSearch(mainTitleKw).catch(() => []);
 if (seq !== latestSearchSeq) return;
 books2.forEach(pushKakaoBook);
 }

 // 검색어 일치도 + 종이책 판본 우선 정렬 (도서관 대출 조회 정확도 향상)
 if (combinedDocs.length > 1) {
 const normKw = normalizeBookTitle(originalKw);
 const lowKw = originalKw.toLowerCase();
 const isLikelyEbookDoc = (d) => /e-?book|전자책|체험판|무료/i.test(String(d.bookname || ''));
 const scoreDoc = (d) => {
 const normT = normalizeBookTitle(d.bookname || '');
 const lowT = String(d.bookname || '').toLowerCase();
 const lowA = String(d.authors || '').toLowerCase();
 let base = 5;
 if (normKw && normT === normKw) base = 0;
 else if (normKw && normT.startsWith(normKw)) base = 1;
 else if (normKw && normT.includes(normKw)) base = 2;
 else if (lowT.includes(lowKw)) base = 3;
 else if (lowA.includes(lowKw)) base = 4;
 return base * 2 + (isLikelyEbookDoc(d) ? 1 : 0);
 };
 combinedDocs.sort((a, b) => scoreDoc(a.doc) - scoreDoc(b.doc));
 }

 if (combinedDocs.length > 0) {
 setApiCache('search', searchCacheKey, combinedDocs.slice(0, 50).map(i => i.doc), 400);
 }
 }

 if (seq !== latestSearchSeq) return;

 if (combinedDocs.length === 0) {
    currentBooksList = [];
    document.getElementById('searchResultCountText').innerText = `통합 검색 결과 (0건)`;
    document.getElementById('searchResultsList').innerHTML = `
      <div class='loading-msg' style='display:flex; flex-direction:column; align-items:center; gap:10px; width: 100%;'>
        <span>도서관 DB에 등록되지 않은 도서/작가입니다. 아래 사이트에서 바로 검색해 보세요.</span>
      </div>
    `;
    refreshIcons();
    renderPostSearchOwnedPanel(originalKw, []);
    showEmptyBookState(keyword);
    if (lastSearchFromBarcode) {
      lastSearchFromBarcode = false;
      showToast('바코드 도서를 찾지 못했습니다. 다시 스캔해 주세요.', 'error');
      setTimeout(() => openBarcodeScanner('search'), 450);
    }
    return;
  }
  lastSearchFromBarcode = false;

 currentBooksList = combinedDocs.slice(0, 50);
 currentBooksList.forEach(it => {
 const id = normalizeIsbn(it.doc.isbn13 || it.doc.isbn);
 if (id && it.doc.bookImageURL) saveBookCoverCache(id, it.doc.bookImageURL);
 });

 document.getElementById('searchResultCountText').innerText = `통합 검색 결과 (${currentBooksList.length}건)`;

 renderSearchResultCards();

 updateDynamicLinks(originalKw);
 document.getElementById('linksCard').classList.remove('hidden');

 const topDocAuthors = currentBooksList[0]?.doc?.authors ? [currentBooksList[0].doc.authors] : [];
 renderPostSearchOwnedPanel(originalKw, topDocAuthors);
 currentSelectedBook = null;
 } catch (e) {
 if (seq !== latestSearchSeq) return;
 console.error(e);
 document.getElementById('searchResultsList').innerHTML = "<div class='loading-msg'>데이터를 불러오는 중 에러가 발생했습니다.</div>";
 }
 }

 function showEmptyBookState(keyword) {
 document.getElementById('mainBookResultCard').classList.remove('hidden');
 document.getElementById('linksCard').classList.remove('hidden');

 document.getElementById('mainBookTitle').innerText = `'${keyword}'`;
 document.getElementById('mainBookAuthor').innerText = "도서관 정보나루에 데이터가 없습니다.";
 document.getElementById('mainBookCover').src = NO_COVER_SVG;
 document.getElementById('mainBookPlot').innerText = "도서관 대출 데이터가 제공되지 않는 책입니다. 하단의 페이지 링크를 이용해 검색해보세요!";
  updateMainBookPlotToggleBtn();

 updateDynamicLinks(keyword);

 currentSelectedBook = null;
 updateBookmarkBtnUI(false, '');
 renderMainBookOwnedBar({ bookname: keyword, authors: '', publisher: '', isbn13: '' });
 
 }

 function selectBook(index, isAuto = false) {
 if (!currentBooksList[index]) return;
 const book = currentBooksList[index].doc;
 currentSelectedBook = book;
 const isbn = String(book.isbn13 || book.isbn || '');
 if (isbn) {
 saveBookMetaCache(isbn, book.authors || '', book.publication_year || '');
 if (book.bookImageURL) saveBookCoverCache(isbn, book.bookImageURL);
 }

 document.querySelectorAll('.search-result-item').forEach(el => el.classList.remove('active'));
 const itemEl = document.getElementById(`book-item-${index}`);
 if (itemEl) itemEl.classList.add('active');

 document.getElementById('mainBookResultCard').classList.remove('hidden');
 document.getElementById('linksCard').classList.remove('hidden');
 document.getElementById('apiLibraryBox').classList.remove('hidden');
 document.getElementById('apiSameAuthorBox').classList.remove('hidden');
 document.getElementById('apiRecommendBox').classList.remove('hidden');

 document.getElementById('mainBookTitle').innerText = book.bookname;

 const pubYear = book.publication_year ? ` (${book.publication_year}년)` : '';
 const mainAuthorEl = document.getElementById('mainBookAuthor');
 if (mainAuthorEl) {
   const authorText = String(book.authors || '').trim();
   const pubPart = `${book.publisher ? ' / ' + escapeHtml(book.publisher) : ''}${escapeHtml(pubYear)}`;
   if (authorText) {
     const roleEntries = extractPersonRoleEntries(authorText, '저자');
     const authorNames = roleEntries.filter(p => p.role === '저자').map(p => p.name);
     const extraRoles = roleEntries.filter(p => p.role !== '저자');
     if (authorNames.length > 0 && extraRoles.length > 0) {
       const extraText = extraRoles.map(p => `${p.name} ${p.role}`).join(', ');
       mainAuthorEl.innerHTML = `<button type="button" class="main-author-jump-btn" onclick="scrollToSameAuthorSection()" title="저자의 다른 도서로 바로 이동">${escapeHtml(authorNames.join(', '))}</button><span style="color:var(--sec-text); font-weight:500;"> · ${escapeHtml(extraText)}</span>${pubPart}`;
     } else {
       const cleanAuthorOnly = authorText.replace(/\s*[;,]?\s*[^,;]*(옮김|옮긴이|역|번역|그림|감수|편역|해설)[^,;]*/g, '').trim();
       const trailingExtra = cleanAuthorOnly && cleanAuthorOnly !== authorText ? authorText.slice(cleanAuthorOnly.length) : '';
       const linkTarget = cleanAuthorOnly || authorText;
       mainAuthorEl.innerHTML = `<button type="button" class="main-author-jump-btn" onclick="scrollToSameAuthorSection()" title="저자의 다른 도서로 바로 이동">${escapeHtml(linkTarget)}</button>${trailingExtra ? `<span style="color:var(--sec-text); font-weight:500;">${escapeHtml(trailingExtra)}</span>` : ''}${pubPart}`;
     }
   } else {
     mainAuthorEl.innerText = `${book.publisher || ''}${pubYear}`;
   }
 }

 document.getElementById('mainBookCover').src = normalizeCoverUrl(book.bookImageURL);
 document.getElementById('libBoxTitle').innerText = `'${book.bookname}' 대출 현황`;

 if (book.description && book.description.trim() !== '') {
 const tempDiv = document.createElement("div");
 tempDiv.innerHTML = book.description;
 document.getElementById('mainBookPlot').innerText = tempDiv.textContent || tempDiv.innerText || "줄거리 정보가 없습니다.";
 } else {
 document.getElementById('mainBookPlot').innerText = "이 도서는 줄거리 요약 정보가 제공되지 않습니다.";
  }
  updateMainBookPlotToggleBtn();

 renderMainBookOwnedBar(book);
 

 // 선택 도서 정보: ISBN · 분류 배지 및 우측 상단 다음/교보/알라딘 바로가기
 const ownedForMeta = findOwnedMatch(book)?.owned || null;
 const metaChipsEl = document.getElementById('mainBookMetaChips');
 if (metaChipsEl) {
   const chips = [];
   const cleanIsbnStr = normalizeIsbn(isbn);
   const kdcText = cleanCategoryDisplay(book.class_nm || ownedForMeta?.kdc || '');
   if (cleanIsbnStr) chips.push(`<span class="mylib-badge">ISBN ${escapeHtml(cleanIsbnStr)}</span>`);
   if (kdcText) chips.push(`<span class="mylib-badge series">${escapeHtml(kdcText)}</span>`);
   metaChipsEl.innerHTML = chips.join('');
   if (cleanIsbnStr && !kdcText) {
     fetchDetailedKdcFromData4Lib(cleanIsbnStr, false).then(fetchedKdc => {
       if (!fetchedKdc || !currentSelectedBook || normalizeIsbn(currentSelectedBook.isbn13 || currentSelectedBook.isbn) !== cleanIsbnStr) return;
       book.class_nm = fetchedKdc;
       metaChipsEl.innerHTML = `<span class="mylib-badge">ISBN ${escapeHtml(cleanIsbnStr)}</span><span class="mylib-badge series">${escapeHtml(fetchedKdc)}</span>`;
     }).catch(() => {});
   }
 }
 const mainStoreLinks = document.getElementById('mainBookStoreLinks');
 const mainKakao = document.getElementById('mainKakaoIconLink');
 const mainKyobo = document.getElementById('mainKyoboIconLink');
 const mainAladin = document.getElementById('mainAladinIconLink');
 if (mainStoreLinks && mainKakao && mainKyobo && mainAladin) {
   const cleanIsbnStr = normalizeIsbn(isbn);
   const qKey = cleanIsbnStr || extractMainTitleForSearch(book.bookname || '') || book.bookname || '';
   if (qKey) {
     mainKakao.href = book.url || `https://search.daum.net/search?w=book&q=${encodeURIComponent(qKey)}`;
     mainKyobo.href = `https://search.kyobobook.co.kr/search?keyword=${encodeURIComponent(qKey)}`;
     mainAladin.href = (cleanIsbnStr.length === 10 || cleanIsbnStr.length === 13)
       ? `https://www.aladin.co.kr/shop/wproduct.aspx?ISBN=${encodeURIComponent(cleanIsbnStr)}`
       : `https://www.aladin.co.kr/m/msearch.aspx?SearchWord=${encodeURIComponent(qKey)}&SearchTarget=All&start=h_keyword`;
     mainStoreLinks.classList.remove('hidden');
   } else {
     mainStoreLinks.classList.add('hidden');
   }
 }

 if (!isAuto) {
 let cleanTitle = book.bookname.split(' =')[0].split(':')[0].trim();
 updateDynamicLinks(cleanTitle);
 }

 const bookmarks = safeReadJson('myBookmarks', []);
 const savedBook = bookmarks.find(b => String(b.isbn) === isbn);
 updateBookmarkBtnUI(!!savedBook, savedBook ? (savedBook.memo || '') : '');

 prepareSameAuthorSection(book);

 if (isbn) {
 prepareRecommendationsSection(isbn);

 const savedLib = getSavedLibraryStatus(isbn);
 if (savedLib) {
 renderLibraryStatusResults(isbn, book.bookname || '', savedLib.results, savedLib.ts, savedLib.remainingKeys || [], savedLib.matchedMeta || null);
 } else {
 fetchRealTimeLibraryStatus(isbn, book.bookname || '', false);
 }
 } else {
 document.getElementById('recommendScroll').innerHTML = "<div class='loading-msg'>ISBN 정보가 없어 추천 도서를 불러올 수 없습니다.</div>";

 document.getElementById('libraryList').innerHTML = `<li class="library-item" style="color:#b91c1c; font-weight:bold;">ISBN 코드가 없어 대출 여부를 확인할 수 없습니다.</li>`;
 }
 }

 function fetchRealTimeLibraryStatusForCurrent(forceRefresh = true) {
 if (!currentSelectedBook) return;
 const isbn = String(currentSelectedBook.isbn13 || currentSelectedBook.isbn || '');
 if (!isbn) return;
 fetchRealTimeLibraryStatus(isbn, currentSelectedBook.bookname || '', forceRefresh);
 }


 function renderBookStripCards(books, clickHandlerName) {
 let html = '';
 books.forEach((b, idx) => {
 const ownedMatch = findOwnedMatch(b);
 let badgeHtml = '';
 let displayTitle = b.bookname;
 if (ownedMatch) {
 const ebook = isOwnedEbook(ownedMatch.owned);
 badgeHtml = `<span class="cover-badge ${ebook ? 'ebook' : 'owned'}">${ebook ? 'e-book' : '서재'}</span>`;

 }

 html += `
 <div class="recommend-card" onclick="${clickHandlerName}(${idx})">
 ${badgeHtml}
 <img loading="lazy" src="${escapeHtml(normalizeCoverUrl(b.bookImageURL))}" onerror="this.onerror=null;this.src=NO_COVER_SVG">
 <p title="${escapeHtml(displayTitle)}">${escapeHtml(displayTitle)}</p>
 </div>
 `;
 });
 return html;
 }

 function renderSameAuthorStrip() {
 const container = document.getElementById('sameAuthorScroll');
 const titleEl = document.getElementById('sameAuthorApiTitle');
 const { authorName } = sameAuthorPager;

 if (titleEl) {
 titleEl.innerText = '저자의 다른 도서';
 }

 if (currentSameAuthorBooks.length === 0) {
 container.innerHTML = `<div class="loading-msg">'${escapeHtml(authorName)}' 저자의 다른 등록 도서가 없습니다.</div>`;
 return;
 }

 container.innerHTML = renderBookStripCards(currentSameAuthorBooks, 'searchSameAuthorBook');
 }

 function scrollToSameAuthorSection() {
 const box = document.getElementById('apiSameAuthorBox');
 if (!box || box.classList.contains('hidden')) return;
 box.scrollIntoView({ behavior: 'smooth', block: 'center' });
 box.classList.remove('same-author-pulse');
 void box.offsetWidth;
 box.classList.add('same-author-pulse');
 }

 function buildAladinAuthorSearchUrl(authorName) {
 const clean = String(authorName || '').trim();
 if (!clean) return '#';
 return `https://www.aladin.co.kr/search/wsearchresult.aspx?SearchTarget=Book&KeyAuthor=${encodeURIComponent(clean)}&BranchType=1`;
 }

 async function prepareSameAuthorSection(selectedBook) {
 const container = document.getElementById('sameAuthorScroll');
 const titleEl = document.getElementById('sameAuthorApiTitle');
 const aladinLinkEl = document.getElementById('sameAuthorAladinLink');
 const people = extractPersonRoleEntries(selectedBook?.authors || '', '저자');
 const primary = people.find(p => p.role === '저자') || people[0];

 if (!primary || !primary.name) {
 currentSameAuthorBooks = [];
 if (titleEl) titleEl.innerText = '저자의 다른 도서';
 if (aladinLinkEl) aladinLinkEl.classList.add('hidden');
 updateFollowButtonEl(document.getElementById('sameAuthorSubBtn'), '');
 container.innerHTML = '<div class="loading-msg">저자 정보가 없어 다른 도서를 조회할 수 없습니다.</div>';
 return;
 }

 const authorName = primary.name;
 const currentIsbn = normalizeIsbn(selectedBook?.isbn13 || selectedBook?.isbn);
 const currentNormTitle = normalizeBookTitle(selectedBook?.bookname || '');
 const seenTitles = new Set();
 if (currentNormTitle) seenTitles.add(currentNormTitle);

 currentSameAuthorBooks = [];
 sameAuthorPager = { authorName, pageNo: 1, numFound: 0, seenTitles, currentIsbn };
 if (titleEl) titleEl.innerText = '저자의 다른 도서';
 if (aladinLinkEl) {
   aladinLinkEl.href = buildAladinAuthorSearchUrl(authorName);
   aladinLinkEl.title = `'${authorName}' 알라딘 국내도서 전체 검색`;
   aladinLinkEl.classList.remove('hidden');
 }
 updateFollowButtonEl(document.getElementById('sameAuthorSubBtn'), authorName);

 const applyKakaoBooks = (rawBooks) => {
 const list = [];
 (rawBooks || []).forEach(b => {
 const bIsbn = normalizeIsbn(b.isbn || b.isbn13);
 if (currentIsbn && bIsbn && bIsbn === currentIsbn) return;
 const title = b.title || b.bookname || '';
 const normT = normalizeBookTitle(title);
 if (!title || (normT && seenTitles.has(normT))) return;
 if (normT) seenTitles.add(normT);
 list.push({
 bookname: title,
 authors: b.author || b.authors || authorName,
 publisher: b.publisher || '',
 publication_year: b.pubYear || b.publication_year || '',
 isbn13: bIsbn,
 bookImageURL: b.cover || b.bookImageURL || ''
 });
 });
 currentSameAuthorBooks = list;
 renderSameAuthorStrip();
 };

 const cacheKey = 'v2:' + authorName.toLowerCase();
 const cached = getApiCache('kakaoAuthor', cacheKey, API_CACHE_TTL_MS);
 if (Array.isArray(cached)) {
 applyKakaoBooks(cached);
 return;
 }

 container.innerHTML = '<div class="loading-msg">카카오에서 동일 저자의 다른 도서를 불러오는 중입니다...</div>';
 try {
 const res = await fetch(buildSheetGetUrl({ action: 'authorBooks', author: authorName }));
 if (!res.ok) throw new Error(`HTTP ${res.status}`);
 const data = await res.json();
 if (sameAuthorPager.authorName !== authorName) return;
 const books = Array.isArray(data?.books) ? data.books : [];
 setApiCache('kakaoAuthor', cacheKey, books, 250);
 applyKakaoBooks(books);
 } catch (e) {
 if (sameAuthorPager.authorName !== authorName) return;
 container.innerHTML = '<div class="loading-msg">동일 저자의 도서를 불러오지 못했습니다.</div>';
 }
 }

 function prepareRecommendationsSection(isbn) {
 const container = document.getElementById('recommendScroll');
 const cached = getApiCache('rec', String(isbn), API_CACHE_TTL_MS);
 if (Array.isArray(cached)) {
 currentRecommendBooks = cached;
 if (cached.length === 0) {
 container.innerHTML = '<div class="loading-msg">추천 도서가 없습니다.</div>';
 } else {
 container.innerHTML = renderBookStripCards(currentRecommendBooks, 'searchRecommendedBook');
 }
 return;
 }

 currentRecommendBooks = [];
 fetchRecommendations(isbn);
 }

 async function fetchRecommendations(isbn) {
 const container = document.getElementById('recommendScroll');
 container.innerHTML = '<div class="loading-msg">추천 도서를 불러오는 중입니다...</div>';
 try {
 const data = await data4LibProxyFetch('recommandList', { isbn13: isbn });
 const books = (data?.response?.docs || []).slice(0, 10).map(item => compactBookDoc(item.book)).filter(Boolean);

 setApiCache('rec', String(isbn), books, 300);
 if (!currentSelectedBook || String(currentSelectedBook.isbn13 || currentSelectedBook.isbn || '') !== String(isbn)) {
 return;
 }
 currentRecommendBooks = books;

 if (books.length === 0) {
 container.innerHTML = '<div class="loading-msg">추천 도서가 없습니다.</div>';
 return;
 }
 container.innerHTML = renderBookStripCards(currentRecommendBooks, 'searchRecommendedBook');
 } catch (e) {
 if (!currentSelectedBook || String(currentSelectedBook.isbn13 || currentSelectedBook.isbn || '') !== String(isbn)) {
 return;
 }
 container.innerHTML = '<div class="loading-msg">추천 데이터를 불러오지 못했습니다.</div>';
 }
 }

 function searchSameAuthorBook(idx) {
 const b = currentSameAuthorBooks[idx];
 if (!b || !b.bookname) return;
 const ownedMatch = findOwnedMatch(b);
 if (ownedMatch && ownedMatch.owned) {
 const ownedIdx = myOwnedBooks.indexOf(ownedMatch.owned);
 if (ownedIdx > -1) {
 openOwnedEditModalByIndex(ownedIdx);
 return;
 }
 }
 const cleanTitle = extractMainTitleForSearch(b.bookname);
 document.getElementById('searchInput').value = cleanTitle;
 executeSearch(cleanTitle);
 }

 function searchRecommendedBook(idx) {
 const b = currentRecommendBooks[idx];
 if (!b || !b.bookname) return;
 const ownedMatch = findOwnedMatch(b);
 if (ownedMatch && ownedMatch.owned) {
 const ownedIdx = myOwnedBooks.indexOf(ownedMatch.owned);
 if (ownedIdx > -1) {
 openOwnedEditModalByIndex(ownedIdx);
 return;
 }
 }
 const cleanTitle = extractMainTitleForSearch(b.bookname);
 document.getElementById('searchInput').value = cleanTitle;
 executeSearch(cleanTitle);
 }

 /* =========================================================
 * 실시간 도서관 대출 조회 + 10분 세션 캐시 + 직접 검색 연결
 * ========================================================= */
 function getTargetLibraryInfo(libName, regionType) {
 const cleanName = (libName || '').replace(/\s+/g, '');
 if (regionType === 'yongsan' && cleanName.includes('꿈나무')) return { priority: 1, isInterlibrary: false, libKey: 'dream' };
 if (regionType === 'yongsan' && cleanName.includes('청파')) return { priority: 2, isInterlibrary: true, libKey: 'cheongpa' };
 if (regionType === 'yongsan' && cleanName.includes('남산도서관')) return { priority: 3, isInterlibrary: false, libKey: 'namsan' };
 if (regionType === 'mapo' && (cleanName.includes('아현분관') || (cleanName.includes('마포') && cleanName.includes('아현')))) {
 return { priority: 4, isInterlibrary: false, libKey: 'ahyon' };
 }
 return { priority: 999, isInterlibrary: false, libKey: '' };
 }

 function getLibraryDirectSearchUrl(libKey, encodedTitle, libName) {
 if (libKey === 'dream') {
 return `https://www.yslibrary.or.kr/dream/menu/10102/program/30037/searchResultList.do?searchType=SIMPLE&searchCategory=ALL&searchKey=ALL&searchKeyword=${encodedTitle}&searchLibrary=&searchLibraryArr=MA`;
 }
 if (libKey === 'cheongpa') {
 return `https://www.yslibrary.or.kr/dream/menu/10102/program/30037/searchResultList.do?searchType=SIMPLE&searchCategory=ALL&searchKey=ALL&searchKeyword=${encodedTitle}&searchLibrary=ALL`;
 }
 if (libKey === 'namsan') {
 return `https://nslib.sen.go.kr/nslib/intro/search/index.do?menu_idx=4&locExquery=111010&editMode=normal&officeNm=%EB%82%A8%EC%82%B0%EB%8F%84%EC%84%9C%EA%B4%80&lectureNm=&mainSearchType=on&search_text=${encodedTitle}`;
 }
 if (libKey === 'ahyon') {
 return `https://ahyon.sen.go.kr/ahyon/intro/search/index.do?menu_idx=4&search_type=L_TITLE&search_text=${encodedTitle}`;
 }
 return `https://search.naver.com/search.naver?query=${encodeURIComponent(libName)}`;
 }

 const TARGET_LIB_ORDER = ['dream', 'cheongpa', 'namsan'];
 const TARGET_LIB_LABELS = {
 dream: '용산꿈나무',
 cheongpa: '청파',
 namsan: '남산'
 };

 async function resolveTargetLibraries(isbn) {
 const fixedMap = getFixedTargetLibCodes();
 const allFourFixed = TARGET_LIB_ORDER.every(k => fixedMap[k] && fixedMap[k].libCode);

 if (allFourFixed) {
 return {
 allFourFixed: true,
 targetLibs: TARGET_LIB_ORDER.map(k => ({
 lib: { libCode: fixedMap[k].libCode, libName: fixedMap[k].name },
 priority: fixedMap[k].priority,
 isInterlibrary: fixedMap[k].isInterlibrary,
 libKey: k
 })).sort((a, b) => a.priority - b.priority)
 };
 }

 const needYongsan = !fixedMap.dream?.libCode || !fixedMap.cheongpa?.libCode || !fixedMap.namsan?.libCode;
 const needMapo = false;

 const [mapoData, yongsanData] = await Promise.all([
 needMapo ? data4LibProxyFetch('libSrch', { region: 11, dtl_region: 11140, pageSize: 100 }).catch(() => null) : Promise.resolve(null),
 needYongsan ? data4LibProxyFetch('libSrch', { region: 11, dtl_region: 11030, pageSize: 100 }).catch(() => null) : Promise.resolve(null)
 ]);

 if (yongsanData?.response?.libs) {
 yongsanData.response.libs.forEach(item => {
 const info = getTargetLibraryInfo(item.lib.libName, 'yongsan');
 if (info.priority < 999) {
 saveFixedTargetLibCode(info.libKey, { libCode: item.lib.libCode, name: item.lib.libName, ...info });
 }
 });
 }

 if (mapoData?.response?.libs) {
 mapoData.response.libs.forEach(item => {
 const info = getTargetLibraryInfo(item.lib.libName, 'mapo');
 if (info.priority < 999) {
 saveFixedTargetLibCode(info.libKey, { libCode: item.lib.libCode, name: item.lib.libName, ...info });
 }
 });
 }

 const updatedMap = getFixedTargetLibCodes();
 const targetLibs = TARGET_LIB_ORDER
 .filter(k => updatedMap[k] && updatedMap[k].libCode)
 .map(k => ({
 lib: { libCode: updatedMap[k].libCode, libName: updatedMap[k].name },
 priority: updatedMap[k].priority,
 isInterlibrary: updatedMap[k].isInterlibrary,
 libKey: k
 }))
 .sort((a, b) => a.priority - b.priority);

 return { allFourFixed: true, targetLibs };
 }

 async function querySingleLibraryExist(item, isbn, filterNotOwned) {
 const libCode = item.lib.libCode;
 try {
 const existData = await data4LibProxyFetch('bookExist', { libCode, isbn13: isbn });
 const resultObj = existData?.response?.result;
 if (filterNotOwned && resultObj?.hasBook !== 'Y') return null;
 return {
 name: item.lib.libName,
 libCode,
 loanAvailable: resultObj?.loanAvailable || 'E',
 isInterlibrary: item.isInterlibrary,
 libKey: item.libKey
 };
 } catch (e) {
 return filterNotOwned ? null : { name: item.lib.libName, loanAvailable: 'E', isInterlibrary: item.isInterlibrary, libKey: item.libKey };
 }
 }

 async function queryLibraryStatusWithCache(isbn, forceRefresh = false, onlyRemaining = false) {
 const saved = getSavedLibraryStatus(isbn);
 if (!forceRefresh && !onlyRemaining && saved) {
 return { results: saved.results, remainingKeys: saved.remainingKeys || [] };
 }

 const { allFourFixed, targetLibs } = await resolveTargetLibraries(isbn);

 // 나머지 도서관 마저 조회 모드
 if (onlyRemaining && saved && Array.isArray(saved.remainingKeys) && saved.remainingKeys.length > 0) {
 const merged = Array.isArray(saved.results) ? saved.results.slice() : [];
 const seenKeys = new Set(merged.map(r => r.libKey));
 const remainingLibs = targetLibs.filter(item => saved.remainingKeys.includes(item.libKey));
 for (const item of remainingLibs) {
 const res = await querySingleLibraryExist(item, isbn, allFourFixed);
 if (res && !seenKeys.has(res.libKey)) {
 seenKeys.add(res.libKey);
 merged.push(res);
 }
 }
 saveLibraryStatusToStorage(isbn, merged, []);
 return { results: merged, remainingKeys: [] };
 }

 // 우선순위 순차 조회: 꿈나무 → 청파 → 남산 → 아현 (대출/상호대차 가능 나오면 즉시 중단)
 const results = [];
 let remainingKeys = [];
 for (let i = 0; i < targetLibs.length; i++) {
 const item = targetLibs[i];
 const res = await querySingleLibraryExist(item, isbn, allFourFixed);
 if (res) {
 results.push(res);
 if (res.loanAvailable === 'Y') {
 remainingKeys = targetLibs.slice(i + 1).map(x => x.libKey).filter(Boolean);
 break;
 }
 }
 }

 saveLibraryStatusToStorage(isbn, results, remainingKeys);
 return { results, remainingKeys };
 }

 function renderLibraryStatusResults(isbn, bookName, results, checkedTs, remainingKeys = [], matchedMeta = null) {
 const container = document.getElementById('libraryList');
 if (!container) return;

 const cleanIsbnLabel = normalizeIsbn((matchedMeta && matchedMeta.isbn) || isbn);
 const altBannerHtml = (matchedMeta && matchedMeta.isbn)
    ? `<li class="alt-edition-banner"><i data-lucide="info" size="13" style="flex-shrink:0;"></i><span>다른 판본(${matchedMeta.pubYear ? escapeHtml(matchedMeta.pubYear) + '년' : '구판'})으로 조회했어요</span></li>`
    : '';
 const tsLabel = checkedTs ? `저장됨 · ${formatShortTimestamp(checkedTs)}` : '방금 조회됨';
 const hasRemaining = Array.isArray(remainingKeys) && remainingKeys.length > 0;
 const remainingNames = (remainingKeys || []).map(k => TARGET_LIB_LABELS[k] || k).join('·');
 const remainingBtnHtml = hasRemaining
 ? `<button type="button" class="lib-more-inline-btn" onclick="event.stopPropagation(); fetchRemainingLibrariesForCurrent();" title="${escapeHtml(remainingNames)} 추가 조회">다른 도서관도 조회</button>`
 : '';

 const footerHtml = `
 <div class="lib-cache-footer">
 <div class="lib-cache-meta">
 <span>${tsLabel}</span>
 <button type="button" class="lib-icon-refresh-btn" onclick="fetchRealTimeLibraryStatusForCurrent(true)" title="대출 현황 다시 조회" aria-label="대출 현황 다시 조회"><i data-lucide="refresh-cw" size="10"></i></button>
 </div>
 ${remainingBtnHtml}
 </div>
 `;

 if (!results || results.length === 0) {
 container.innerHTML = `<li class="library-item" style="color:var(--sec-text); font-weight:700; justify-content:center; flex-direction:column;"><span>소장 중인 관심 도서관이 없습니다.</span></li>${footerHtml}`;
 refreshIcons(container);
 return;
 }

 const cleanTitle = (bookName || '').split(' =')[0].split(':')[0].trim();
 const encodedTitle = encodeURIComponent(cleanTitle).replace(/'/g, '%27');

 let html = '';
 results.forEach((lib) => {
 let badgeHtml = '';
 if (lib.loanAvailable === 'Y') {
 badgeHtml = lib.isInterlibrary
 ? '<span class="status-interlibrary">상호대차 가능</span>'
 : '<span class="status-available">대출 가능</span>';
 } else if (lib.loanAvailable === 'N') {
 badgeHtml = '<span class="status-unavailable">대출 중</span>';
 } else {
 badgeHtml = '<span class="status-normal">확인 불가</span>';
 }

 const targetUrl = getLibraryDirectSearchUrl(lib.libKey, encodedTitle, lib.name);
 const itemClass = lib.isInterlibrary ? 'library-item fav-item interlibrary-item' : 'library-item fav-item';
 const textClass = lib.isInterlibrary ? 'fav-lib-text interlibrary-text' : 'fav-lib-text';
 const iconName = lib.isInterlibrary ? 'arrow-left-right' : 'map-pin';
 const subTextHtml = lib.isInterlibrary
 ? '<span class="interlibrary-sub">용산구립 상호대차</span>'
 : '';

 html += `
 <li class="${itemClass}" style="flex-direction:column; align-items:stretch;">
 <a href="${escapeHtml(targetUrl)}" target="_blank" rel="noopener" class="library-item-link">
 <div class="fav-lib-wrap">
 <span class="${textClass}"><i data-lucide="${iconName}" size="14"></i> ${escapeHtml(lib.name)}</span>
 ${subTextHtml}
 </div>
 ${badgeHtml}
 </a>
 </li>
 `;
 });

 container.innerHTML = altBannerHtml + html + footerHtml;
 refreshIcons();
 }

 function findAlternatePaperEditionCandidates(selectedBook) {
 if (!selectedBook || !Array.isArray(currentBooksList) || currentBooksList.length <= 1) return [];
 const curIsbn = normalizeIsbn(selectedBook.isbn13 || selectedBook.isbn);
 const curTitle = normalizeBookTitle(selectedBook.bookname);
 if (!curTitle) return [];
 const curAuthor = selectedBook.authors || '';
 const seen = new Set(curIsbn ? [curIsbn] : []);
 const alts = [];
 for (const item of currentBooksList) {
 const doc = item?.doc;
 if (!doc) continue;
 const altIsbn = normalizeIsbn(doc.isbn13 || doc.isbn);
 if (!altIsbn || altIsbn.length < 10 || seen.has(altIsbn)) continue;
 if (/e-?book|전자책|체험판/i.test(`${doc.bookname || ''} ${doc.publisher || ''}`)) continue;
 if (normalizeBookTitle(doc.bookname) !== curTitle) continue;
 if (curAuthor && doc.authors && !hasAuthorOverlap(curAuthor, doc.authors)) continue;
 seen.add(altIsbn);
 alts.push({ isbn: altIsbn, pubYear: String(doc.publication_year || '').trim() });
 if (alts.length >= 2) break;
 }
 return alts;
 }

 async function fetchRealTimeLibraryStatus(isbn, bookName, forceRefresh = false, onlyRemaining = false) {
 const container = document.getElementById('libraryList');
 container.innerHTML = `
  <li class="skeleton-lib-item"><div class="skeleton-bar" style="width:58%;"></div><div class="skeleton-bar" style="width:22%; height:22px; border-radius:999px;"></div></li>
  <li class="skeleton-lib-item"><div class="skeleton-bar" style="width:46%;"></div><div class="skeleton-bar" style="width:22%; height:22px; border-radius:999px;"></div></li>
  <li style="text-align:center; font-size:11.5px; color:var(--sec-text); padding:2px 0 6px 0;">${onlyRemaining ? '나머지 도서관 대출 여부를 확인 중...' : '가까운 도서관 대출 여부를 확인 중...'}</li>
`;

 try {
 const savedBefore = getSavedLibraryStatus(isbn);
 const effectiveIsbn = (onlyRemaining && savedBefore?.matchedMeta?.isbn) ? savedBefore.matchedMeta.isbn : isbn;
 let { results, remainingKeys } = await queryLibraryStatusWithCache(effectiveIsbn, forceRefresh, onlyRemaining);
 let matchedMeta = (onlyRemaining && savedBefore?.matchedMeta) ? savedBefore.matchedMeta : null;

 // 선택한 판본이 관심 도서관에 미소장일 경우, 검색 결과의 같은 책 다른 종이책 판본(최대 2개) 자동 추가 확인
 if (!onlyRemaining && (!results || results.length === 0) && currentSelectedBook) {
 const altCandidates = findAlternatePaperEditionCandidates(currentSelectedBook);
 for (const alt of altCandidates) {
 if (!currentSelectedBook || String(currentSelectedBook.isbn13 || currentSelectedBook.isbn || '') !== String(isbn)) return;
 container.innerHTML = `<li class='loading-msg'>선택 판본 미소장 · 같은 책 다른 종이책 판본(${alt.pubYear ? escapeHtml(alt.pubYear) + '년' : '다른 판본'})도 확인 중...</li>`;
 const altRes = await queryLibraryStatusWithCache(alt.isbn, forceRefresh, false);
 if (altRes.results && altRes.results.length > 0) {
 results = altRes.results;
 remainingKeys = altRes.remainingKeys || [];
 matchedMeta = { isbn: alt.isbn, pubYear: alt.pubYear };
 saveLibraryStatusToStorage(isbn, results, remainingKeys, matchedMeta);
 break;
 }
 }
 } else if (onlyRemaining && matchedMeta) {
 saveLibraryStatusToStorage(isbn, results, remainingKeys, matchedMeta);
 }

 // 현재 선택된 도서가 바뀌었으면 렌더링 중단
 if (!currentSelectedBook || String(currentSelectedBook.isbn13 || currentSelectedBook.isbn || '') !== String(isbn)) {
 return;
 }

 const saved = getSavedLibraryStatus(isbn);
 renderLibraryStatusResults(isbn, bookName, results, saved?.ts || Date.now(), remainingKeys, matchedMeta);
 } catch (e) {
 container.innerHTML = '<li class="library-item">도서관 정보를 실시간으로 불러오지 못했습니다. 잠시 후 다시 시도해 주세요.</li>';
 }
 }

 function fetchRemainingLibrariesForCurrent() {
 if (!currentSelectedBook) return;
 const isbn = String(currentSelectedBook.isbn13 || currentSelectedBook.isbn || '');
 if (!isbn) return;
 fetchRealTimeLibraryStatus(isbn, currentSelectedBook.bookname || '', false, true);
 }

function loadRecentSearches(filterText = '') {
  const searches = safeReadJson('recentBooks', []);
  const container = document.getElementById('recent-tags-container');
  if (!container) return;
  container.innerHTML = '';

  const q = String(filterText || '').trim();
  const qLow = q.toLowerCase();
  const qCompact = qLow.replace(/\s+/g, '');

  if (q) {
    const matched = searches.filter(kw => {
      const kLow = String(kw || '').toLowerCase();
      return kLow.includes(qLow) || (qCompact.length >= 1 && kLow.replace(/\s+/g, '').includes(qCompact));
    });

    if (matched.length === 0) {
      document.getElementById('recentSearchArea')?.classList.add('hidden');
      return;
    }

    container.className = 'recent-match-list';
    matched.forEach(keyword => {
      const row = document.createElement('div');
      row.className = 'recent-match-item';
      const idx = keyword.toLowerCase().indexOf(qLow);
      let highlighted = escapeHtml(keyword);
      if (idx > -1) {
        highlighted = escapeHtml(keyword.slice(0, idx)) + '<mark>' + escapeHtml(keyword.slice(idx, idx + q.length)) + '</mark>' + escapeHtml(keyword.slice(idx + q.length));
      }
      row.innerHTML = `<span class="recent-match-left"><i data-lucide="clock" size="14" color="var(--primary)"></i><span class="recent-match-text">${highlighted}</span></span>`;
      const delBtn = document.createElement('span');
      delBtn.style.cssText = 'display:inline-flex; align-items:center; color:#94a3b8; padding:2px;';
      delBtn.innerHTML = CLOSE_ICON_SVG_14;
      delBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        deleteSearch(keyword);
      });
      row.appendChild(delBtn);
      row.addEventListener('click', () => executeSearch(keyword));
      container.appendChild(row);
    });
    refreshIcons(document.getElementById('recentSearchArea'));
    return;
  }

  container.className = 'recent-tags';

  if (searches.length === 0) {
    container.innerHTML = '<span class="recent-inline-clock" title="최근 검색어"><i data-lucide="clock" size="14"></i></span><p style="color:var(--sec-text); font-size:13px; margin:0; align-self:center;">최근 검색 기록이 없습니다.</p>';
    refreshIcons(document.getElementById('recentSearchArea'));
    return;
  }

  const clockBadge = document.createElement('span');
  clockBadge.className = 'recent-inline-clock';
  clockBadge.title = '최근 검색어';
  clockBadge.innerHTML = '<i data-lucide="clock" size="14"></i>';
  container.appendChild(clockBadge);

  searches.forEach(keyword => {
    const tag = document.createElement('div');
    tag.className = 'recent-tag';
    const labelSpan = document.createElement('span');
    labelSpan.textContent = keyword;
    const delSpan = document.createElement('span');
    delSpan.style.display = 'inline-flex';
    delSpan.style.alignItems = 'center';
    delSpan.style.color = '#818cf8';
    delSpan.innerHTML = CLOSE_ICON_SVG_14;
    delSpan.addEventListener('click', (e) => {
      e.stopPropagation();
      deleteSearch(keyword);
    });
    tag.appendChild(labelSpan);
    tag.appendChild(delSpan);
    tag.addEventListener('click', () => executeSearch(keyword));
    container.appendChild(tag);
  });

  const delAllInline = document.createElement('button');
  delAllInline.type = 'button';
  delAllInline.className = 'recent-inline-delall';
  delAllInline.title = '최근 검색어 전체 삭제';
  delAllInline.setAttribute('aria-label', '최근 검색어 전체 삭제');
  delAllInline.innerHTML = '<i data-lucide="trash-2" size="13"></i>';
  delAllInline.onclick = (e) => { e.stopPropagation(); deleteAllSearches(); };
  container.appendChild(delAllInline);

  refreshIcons(document.getElementById('recentSearchArea'));
}

function deleteSearch(keyword) {
  const prev = safeReadJson('recentBooks', []);
  const next = prev.filter(item => item !== keyword);
  localStorage.setItem('recentBooks', JSON.stringify(next));
  loadRecentSearches(document.getElementById('searchInput')?.value || '');
  pushSyncStateToSheet(true);
  showToast(`'${keyword}' 검색어를 삭제했습니다.`, '', {
    label: '실행 취소',
    onClick: () => {
      localStorage.setItem('recentBooks', JSON.stringify(prev));
      loadRecentSearches(document.getElementById('searchInput')?.value || '');
      pushSyncStateToSheet(true);
      showToast('검색어를 복원했습니다.', 'success');
    }
  });
}

function deleteAllSearches() {
  const prev = safeReadJson('recentBooks', []);
  if (prev.length === 0) return;
  localStorage.removeItem('recentBooks');
  loadRecentSearches('');
  pushSyncStateToSheet(true);
  showToast('최근 검색어를 모두 삭제했습니다.', '', {
    label: '실행 취소',
    onClick: () => {
      localStorage.setItem('recentBooks', JSON.stringify(prev));
      loadRecentSearches('');
      pushSyncStateToSheet(true);
      showToast('최근 검색어를 복원했습니다.', 'success');
    }
  });
}
