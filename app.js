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
   const ptrEl = document.getElementById('myLibPtrIndicator');
   if (!scrollEl) return;

   // 스크롤 하단 도달 시 자동 더 보기 (무한 스크롤)
   let autoLoadBusy = false;
   scrollEl.addEventListener('scroll', () => {
     if (autoLoadBusy) return;
     if (scrollEl.scrollTop + scrollEl.clientHeight >= scrollEl.scrollHeight - 180) {
       const loadMoreBtn = document.querySelector('#myLibListContainer .mylib-load-more');
       if (loadMoreBtn) {
         autoLoadBusy = true;
         loadMoreMyLibrary();
         requestAnimationFrame(() => { autoLoadBusy = false; });
       }
     }
   }, { passive: true });

   // 최상단에서 아래로 끌어내려 시트 자동 동기화 (Pull-to-Refresh)
   let ptrStartY = 0;
   let ptrPulling = false;
   let ptrTriggered = false;
   let ptrSyncing = false;

   scrollEl.addEventListener('touchstart', (e) => {
     if (ptrSyncing || scrollEl.scrollTop > 0 || e.touches.length !== 1) return;
     ptrStartY = e.touches[0].clientY;
     ptrPulling = true;
     ptrTriggered = false;
   }, { passive: true });

   scrollEl.addEventListener('touchmove', (e) => {
     if (!ptrPulling || ptrSyncing) return;
     if (scrollEl.scrollTop > 0) {
       ptrPulling = false;
       if (ptrEl) { ptrEl.style.height = '0px'; ptrEl.classList.remove('visible'); }
       return;
     }
     const dy = e.touches[0].clientY - ptrStartY;
     if (dy > 28 && ptrEl) {
       const h = Math.min(46, Math.round((dy - 28) * 0.55));
       ptrEl.style.height = h + 'px';
       ptrEl.classList.add('visible');
       if (dy >= 72) {
         ptrTriggered = true;
         ptrEl.textContent = '놓아서 시트 동기화';
       } else {
         ptrTriggered = false;
         ptrEl.textContent = '당겨서 시트 동기화';
       }
     }
   }, { passive: true });

   scrollEl.addEventListener('touchend', async () => {
     if (!ptrPulling) return;
     ptrPulling = false;
     if (ptrTriggered && !ptrSyncing) {
       ptrSyncing = true;
       if (ptrEl) {
         ptrEl.style.height = '38px';
         ptrEl.classList.add('visible');
         ptrEl.textContent = '시트 동기화 중...';
       }
       try { await syncAllFromSheet(true); } finally {
         ptrSyncing = false;
         if (ptrEl) {
           ptrEl.style.height = '0px';
           ptrEl.classList.remove('visible');
         }
       }
     } else if (ptrEl) {
       ptrEl.style.height = '0px';
       ptrEl.classList.remove('visible');
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
 
