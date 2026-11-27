/* =========================================================
 * All BOOKs 앱 초기화 · 모달 스택 · 토스트 · 제스처 (app.js)
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
   const scrollEl = document.getElementById('myLibScrollBody');
   const listEl = document.getElementById('myLibListContainer');
   const ptrEl = document.getElementById('myLibPtrIndicator');
   if (!scrollEl) return;

   // 스크롤 중 강제 레이아웃(scrollHeight) 계산을 제거하고 IntersectionObserver로 부드럽게 추가 로드
   let autoLoadBusy = false;
   let loadMoreObserver = null;
   function observeLoadMoreBtn() {
     if (!listEl || typeof IntersectionObserver === 'undefined') return;
     const btn = listEl.querySelector('.mylib-load-more');
     if (!btn) return;
     if (!loadMoreObserver) {
       loadMoreObserver = new IntersectionObserver((entries) => {
         if (autoLoadBusy) return;
         if (entries.some(entry => entry.isIntersecting)) {
           autoLoadBusy = true;
           requestAnimationFrame(() => {
             try { loadMoreMyLibrary(); } finally {
               autoLoadBusy = false;
               observeLoadMoreBtn();
             }
           });
         }
       }, { root: scrollEl, rootMargin: '700px 0px' });
     }
     loadMoreObserver.disconnect();
     loadMoreObserver.observe(btn);
   }
   if (listEl && typeof MutationObserver !== 'undefined') {
     new MutationObserver(() => observeLoadMoreBtn()).observe(listEl, { childList: true });
   }

   // 스크롤 상태 갱신 + 필터창 열린 상태로 아래로 스크롤 시 자동 숨김
   scrollEl.addEventListener('scroll', () => {
     isMyLibActivelyScrolling = true;
     if (myLibScrollIdleTimer) clearTimeout(myLibScrollIdleTimer);
     myLibScrollIdleTimer = setTimeout(() => { isMyLibActivelyScrolling = false; }, 140);
     const filterDrawer = document.getElementById('myLibFilterDrawer');
     if (filterDrawer && !filterDrawer.classList.contains('hidden') && scrollEl.scrollTop > 20) {
       if (typeof toggleMyLibFilterDrawer === 'function') toggleMyLibFilterDrawer(false);
     }
   }, { passive: true });

   // 최상단 Pull-to-Refresh: 세로 당김이 확실할 때만 동작 + touchcancel 정리 + rAF 배치
   let ptrStartX = 0;
   let ptrStartY = 0;
   let ptrPulling = false;
   let ptrTriggered = false;
   let ptrSyncing = false;
   let ptrRaf = 0;

   function resetPtrUI() {
     ptrPulling = false;
     ptrTriggered = false;
     if (ptrRaf) { cancelAnimationFrame(ptrRaf); ptrRaf = 0; }
     if (ptrEl) { ptrEl.style.height = '0px'; ptrEl.classList.remove('visible'); }
   }

   scrollEl.addEventListener('touchstart', (e) => {
     if (ptrSyncing || scrollEl.scrollTop > 0 || e.touches.length !== 1) return;
     ptrStartX = e.touches[0].clientX;
     ptrStartY = e.touches[0].clientY;
     ptrPulling = true;
     ptrTriggered = false;
   }, { passive: true });

   scrollEl.addEventListener('touchmove', (e) => {
     if (!ptrPulling || ptrSyncing || e.touches.length !== 1) return;
     if (scrollEl.scrollTop > 0) {
       resetPtrUI();
       return;
     }
     const dx = Math.abs(e.touches[0].clientX - ptrStartX);
     const dy = e.touches[0].clientY - ptrStartY;
     if (dy <= 0) {
       resetPtrUI();
       return;
     }
     // 대각선/가로 제스처가 섞이면 PTR 즉시 해제해 일반 스크롤 방해 금지
     if (dx > 18 && dy < dx * 1.6) {
       resetPtrUI();
       return;
     }
     if (dy > 36 && ptrEl) {
       const h = Math.min(46, Math.round((dy - 36) * 0.55));
       const ready = dy >= 82;
       ptrTriggered = ready;
       if (!ptrRaf) {
         ptrRaf = requestAnimationFrame(() => {
           ptrRaf = 0;
           if (!ptrPulling || !ptrEl) return;
           ptrEl.style.height = h + 'px';
           ptrEl.classList.add('visible');
           ptrEl.textContent = ready ? '놓아서 시트 동기화' : '당겨서 시트 동기화';
         });
       }
     }
   }, { passive: true });

   scrollEl.addEventListener('touchcancel', () => {
     if (!ptrSyncing) resetPtrUI();
   }, { passive: true });

   scrollEl.addEventListener('touchend', async () => {
     if (!ptrPulling) return;
     const shouldSync = ptrTriggered && !ptrSyncing;
     ptrPulling = false;
     if (ptrRaf) { cancelAnimationFrame(ptrRaf); ptrRaf = 0; }
     if (shouldSync) {
       ptrSyncing = true;
       if (ptrEl) {
         ptrEl.style.height = '38px';
         ptrEl.classList.add('visible');
         ptrEl.textContent = '시트 동기화 중...';
       }
       try { await syncAllFromSheet(true); } finally {
         ptrSyncing = false;
         resetPtrUI();
       }
     } else {
       resetPtrUI();
     }
   }, { passive: true });
 })();

 window.onload = async function () {
 renderApiUsagePill();

 loadBookmarks(false);
 await loadCachedOwnedBooks();
 renderHomeReadingDashboard();
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
