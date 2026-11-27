/* =========================================================
 * All Books 앱 초기화 · 모달 스택 · 토스트 · 제스처 (app.js)
 * ========================================================= */
hydrateEmbeddedAssets();
refreshIcons();

 /* =========================================================
 * 안드로이드 뒤로가기 제스처 모달 닫기 스택
 * ========================================================= */
 const openModalStack = [];
 let isHandlingPopState = false;
 let ignoreNextPopCount = 0;

 function pushModalHistory(modalId, replaceExisting = false) {
 if (!modalId || openModalStack.includes(modalId)) return;
 openModalStack.push(modalId);
 try {
 if (replaceExisting) history.replaceState({ allbooksModal: modalId }, '');
 else history.pushState({ allbooksModal: modalId }, '');
 } catch (e) {}
 }

 function popModalHistory(modalId, skipBack = false) {
 const idx = openModalStack.lastIndexOf(modalId);
 if (idx === -1) return;
 openModalStack.splice(idx, 1);
 if (!skipBack && !isHandlingPopState && history.state && history.state.allbooksModal === modalId) {
 ignoreNextPopCount++;
 try { history.back(); } catch (e) { ignoreNextPopCount = Math.max(0, ignoreNextPopCount - 1); }
 }
 }

 function closeTopModal() {
 if (openModalStack.length === 0) return false;
 const topModal = openModalStack[openModalStack.length - 1];
 if (topModal === 'pinPrompt') closePinPromptModal();
 else if (topModal === 'authorPhoto') closeAuthorPhotoModal();
 else if (topModal === 'dirtyConfirm') cancelDirtyConfirmModal();
 else if (topModal === 'barcode') closeBarcodeScanner();
 else if (topModal === 'ownedEdit') closeOwnedEditModal();
 else if (topModal === 'ratingBreakdown') closeRatingBreakdownModal();
 else if (topModal === 'memo') closeMemoModal();
 else if (topModal === 'myLib') closeMyLibraryModal();
 else if (topModal === 'bookmark') closeBookmarkModal();
 return true;
 }

 window.addEventListener('popstate', () => {
 if (ignoreNextPopCount > 0) {
 ignoreNextPopCount--;
 return;
 }
 if (openModalStack.length === 0) return;
 isHandlingPopState = true;
 try {
 closeTopModal();
 } finally {
 isHandlingPopState = false;
 }
 });

 window.addEventListener('keydown', (e) => {
 if (e.key !== 'Escape') return;
 if (closeTopModal()) {
 e.preventDefault();
 return;
 }
 document.getElementById('recentSearchArea')?.classList.add('hidden');
 
 });

 function showToast(message, type = '', action = null) {
 const el = document.getElementById('toastBanner');
 if (!el) return;
 el.innerHTML = '';
 const msgSpan = document.createElement('span');
 msgSpan.textContent = message;
 el.appendChild(msgSpan);

 if (action && action.label && typeof action.onClick === 'function') {
 const btn = document.createElement('button');
 btn.type = 'button';
 btn.className = 'toast-undo-btn';
 btn.textContent = action.label;
 btn.onclick = (e) => {
 e.stopPropagation();
 el.classList.remove('show');
 if (toastTimer) clearTimeout(toastTimer);
 action.onClick();
 };
 el.appendChild(btn);
 }

 el.className = `toast-banner ${type} show`;
 if (toastTimer) clearTimeout(toastTimer);
 const duration = action ? 6500 : 2800;
 toastTimer = setTimeout(() => {
 el.classList.remove('show');
 }, duration);
 }


(function initModalBackdropClose() {
 let pointerDownOverlay = null;
 const closeMap = {
 closeBookmarkModal,
 closeBarcodeScanner,
 closeMemoModal,
 closeMyLibraryModal,
 closeRatingBreakdownModal,
 closeOwnedEditModal,
 closePinPromptModal,
 closeAuthorPhotoModal,
 cancelDirtyConfirmModal,
 };
 document.querySelectorAll('.memo-modal-overlay[data-close-fn]').forEach(overlay => {
 overlay.addEventListener('pointerdown', (e) => {
 pointerDownOverlay = (e.target === overlay) ? overlay : null;
 });
 overlay.addEventListener('click', (e) => {
 if (e.target === overlay && pointerDownOverlay === overlay) {
 e.preventDefault();
 e.stopPropagation();
 const fnName = overlay.getAttribute('data-close-fn');
 if (typeof closeMap[fnName] === 'function') closeMap[fnName]();
 }
 pointerDownOverlay = null;
 });
 });
 })();

 let lastViewportWidth = window.innerWidth;
 window.addEventListener('resize', () => {
 // 모바일 가상 키보드 열림/닫힘(세로 높이만 변경)에서는 드롭다운을 유지하고,
 // 폴드 접힘↔펼침이나 화면 회전처럼 가로 너비가 바뀔 때만 정리
 if (window.innerWidth !== lastViewportWidth) {
 lastViewportWidth = window.innerWidth;
 document.getElementById('recentSearchArea').classList.add('hidden');
 
 }
 });

(function initMyLibScrollAndPullToRefresh() {
   const listEl = document.getElementById('myLibListContainer');
   if (!listEl) return;

   // 네이티브 window 스크롤 기준 IntersectionObserver로 부드럽게 추가 로드
   let autoLoadBusy = false;
   let loadMoreObserver = null;
   function observeLoadMoreBtn() {
     if (typeof IntersectionObserver === 'undefined') return;
     const btn = listEl.querySelector('.mylib-load-more');
     if (!btn) return;
     if (!loadMoreObserver) {
       loadMoreObserver = new IntersectionObserver((entries) => {
         if (autoLoadBusy || document.body.dataset.tab !== 'library') return;
         if (entries.some(entry => entry.isIntersecting)) {
           autoLoadBusy = true;
           requestAnimationFrame(() => {
             try { loadMoreMyLibrary(); } finally {
               autoLoadBusy = false;
               observeLoadMoreBtn();
             }
           });
         }
       }, { root: null, rootMargin: '700px 0px' });
     }
     loadMoreObserver.disconnect();
     loadMoreObserver.observe(btn);
   }
   if (typeof MutationObserver !== 'undefined') {
     new MutationObserver(() => observeLoadMoreBtn()).observe(listEl, { childList: true });
   }

   // 네이티브 window 스크롤: 내 서재 탭에서 필터창 열린 채 스크롤 내리면 자동 숨김
   window.addEventListener('scroll', () => {
     if (document.body.dataset.tab !== 'library') return;
     isMyLibActivelyScrolling = true;
     if (myLibScrollIdleTimer) clearTimeout(myLibScrollIdleTimer);
     myLibScrollIdleTimer = setTimeout(() => { isMyLibActivelyScrolling = false; }, 140);
     const filterDrawer = document.getElementById('myLibFilterDrawer');
     if (filterDrawer && !filterDrawer.classList.contains('hidden') && window.scrollY > 24) {
       if (typeof toggleMyLibFilterDrawer === 'function') toggleMyLibFilterDrawer(false);
     }
   }, { passive: true });
 })();

/* =========================================================
 * 하단 5탭 네비게이션 제어 (홈 / 검색 / 추가 / 북마크 / 내 서재)
 * ========================================================= */
let currentAppTab = 'home';

function syncBottomNavBadges() {
  const bmSrc = document.getElementById('bookmarkBadge');
  const bmDst = document.getElementById('navBookmarkBadge');
  if (bmSrc && bmDst) {
    const cnt = Number(bmSrc.textContent || '0') || 0;
    bmDst.textContent = cnt > 99 ? '99+' : String(cnt);
    bmDst.classList.toggle('hidden', cnt <= 0);
  }
  const libSrc = document.getElementById('myLibBadge');
  const libDst = document.getElementById('navMyLibBadge');
  if (libSrc && libDst) {
    const cnt = Number(libSrc.textContent || '0') || 0;
    libDst.textContent = cnt > 999 ? '999+' : String(cnt);
    libDst.classList.toggle('hidden', cnt <= 0);
  }
}

(function observeBadgeSync() {
  if (typeof MutationObserver === 'undefined') return;
  ['bookmarkBadge', 'myLibBadge'].forEach(id => {
    const el = document.getElementById(id);
    if (el) new MutationObserver(syncBottomNavBadges).observe(el, { childList: true, characterData: true, subtree: true });
  });
})();

function openAddBookSheet() {
  closeQuickPopover();
  const el = document.getElementById('addBookSheetOverlay');
  if (el) el.classList.add('open');
}

function closeAddBookSheet() {
  const el = document.getElementById('addBookSheetOverlay');
  if (el) el.classList.remove('open');
}

function switchAppTab(tab, opts = {}) {
  const target = ['home', 'search', 'bookmark', 'library'].includes(tab) ? tab : 'home';
  closeQuickPopover();
  closeAddBookSheet();
  if (typeof closeMyLibManageSheet === 'function') closeMyLibManageSheet();

  // 다른 탭으로 이동할 때 멀티 선택 모드 정리
  if (target !== 'library' && typeof myLibMultiSelectMode !== 'undefined' && myLibMultiSelectMode) {
    exitMyLibMultiSelectMode();
  }
  if (target !== 'bookmark' && typeof bmMultiSelectMode !== 'undefined' && bmMultiSelectMode) {
    exitBookmarkMultiSelectMode();
  }

  currentAppTab = target;
  document.body.dataset.tab = target;
  document.querySelectorAll('#appBottomNav .app-nav-btn[data-nav]').forEach(btn => {
    btn.classList.toggle('active', btn.getAttribute('data-nav') === target);
  });

  if (target === 'home') {
    document.getElementById('myLibModalOverlay')?.classList.remove('open');
    document.getElementById('bookmarkModal')?.classList.remove('open');
    if (!opts.skipReset && typeof resetToHomeDashboard === 'function') {
      resetToHomeDashboard(true);
    }
  } else if (target === 'search') {
    document.getElementById('myLibModalOverlay')?.classList.remove('open');
    document.getElementById('bookmarkModal')?.classList.remove('open');
    if (!opts.skipFocus) {
      const inp = document.getElementById('searchInput');
      if (inp && !inp.value.trim()) {
        setTimeout(() => inp.focus(), 40);
      }
    }
  } else if (target === 'bookmark') {
    document.getElementById('myLibModalOverlay')?.classList.remove('open');
    document.getElementById('bookmarkModal')?.classList.add('open');
    if (typeof loadBookmarks === 'function') loadBookmarks(false);
    if (typeof enrichMissingBookmarkMeta === 'function') enrichMissingBookmarkMeta();
  } else if (target === 'library') {
    document.getElementById('bookmarkModal')?.classList.remove('open');
    document.getElementById('myLibModalOverlay')?.classList.add('open');
    if (!opts.fromOpenMyLib && typeof openMyLibraryModal === 'function') {
      openMyLibraryModal(false, null, true);
    }
  }

  if (!opts.keepScroll) {
    window.scrollTo({ top: 0, behavior: 'instant' });
  }
  syncBottomNavBadges();
  refreshIcons();
}

 window.onload = async function () {
 renderApiUsagePill();

 loadBookmarks(false);
 await loadCachedOwnedBooks();
 renderHomeReadingDashboard();
 syncBottomNavBadges();
 await syncAllFromSheet(false);
 checkFollowedAuthorsNewReleases(false);
 };

 if ('serviceWorker' in navigator) {
 window.addEventListener('load', () => {
 const hadController = !!navigator.serviceWorker.controller;
 navigator.serviceWorker.register('./sw.js')
 .then(registration => console.log('ServiceWorker 등록 성공: ', registration.scope))
 .catch(err => console.log('ServiceWorker 등록 실패: ', err));
 navigator.serviceWorker.addEventListener('controllerchange', () => {
 if (!hadController) return;
 showToast('새 버전이 적용되었습니다.', 'success', {
 label: '새로고침',
 onClick: () => window.location.reload()
 });
 });
 });
 }
 


/* =========================================================
 * 홈 화면 상단 우측 전체화면 토글
 * ========================================================= */
function updateFullscreenBtnIcon() {
  const btn = document.getElementById('fullscreenToggleBtn');
  if (!btn) return;
  const isFs = !!(document.fullscreenElement || document.webkitFullscreenElement);
  btn.innerHTML = `<i data-lucide="${isFs ? 'minimize' : 'maximize'}" size="17"></i>`;
  btn.title = isFs ? '전체화면 종료' : '전체화면 전환';
  btn.setAttribute('aria-label', isFs ? '전체화면 종료' : '전체화면 전환');
  refreshIcons(btn);
}

function toggleAppFullscreen() {
  const docEl = document.documentElement;
  const isFs = !!(document.fullscreenElement || document.webkitFullscreenElement);
  if (!isFs) {
    const req = docEl.requestFullscreen || docEl.webkitRequestFullscreen;
    if (typeof req === 'function') {
      Promise.resolve(req.call(docEl)).catch(() => {
        showToast('이 브라우저에서는 전체화면 전환을 지원하지 않습니다.', 'error');
      });
    } else {
      showToast('이 브라우저에서는 전체화면 전환을 지원하지 않습니다.', 'error');
    }
  } else {
    const exit = document.exitFullscreen || document.webkitExitFullscreen;
    if (typeof exit === 'function') {
      Promise.resolve(exit.call(document)).catch(() => {});
    }
  }
}

document.addEventListener('fullscreenchange', updateFullscreenBtnIcon);
document.addEventListener('webkitfullscreenchange', updateFullscreenBtnIcon);


/* =========================================================
 * 폴더블(Z 폴드7) 접기/펼치기 화면 전환 대응
 * ========================================================= */
let lastFoldViewportW = window.innerWidth;
let foldResizeRaf = 0;
window.addEventListener('resize', () => {
  if (foldResizeRaf) cancelAnimationFrame(foldResizeRaf);
  foldResizeRaf = requestAnimationFrame(() => {
    foldResizeRaf = 0;
    const curW = window.innerWidth;
    if (Math.abs(curW - lastFoldViewportW) >= 24) {
      lastFoldViewportW = curW;
      if (typeof closeQuickPopover === 'function') closeQuickPopover();
      const rev = document.getElementById('ownedInputReview');
      if (rev && typeof autoResizeTextarea === 'function') autoResizeTextarea(rev);
    }
  });
}, { passive: true });
