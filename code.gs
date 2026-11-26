/**
 * All BOOKs 통합 Google Apps Script (Code.gs)
 *
 * [시트 1: 전체_도서_리스트 — 22개 열 정렬 구성]
 *  - 기본 서지 (A~I): A:책 제목, B:저자, C:저자 외, D:출판사, E:출간연도, F:ISBN, G:분류, H:시리즈, I:시리즈 넘버(숫자만)
 *  - 소장/대여 (J~M): J:소장/대여, K:e-book, L:소장처/대여처, M:반납예정일
 *  - 독서 기록 (N~T): N:독서 상태, O:평점, P:시작일, Q:완독일, R:태그, S:한줄평, T:메모
 *  - 자동 메타 (U~V): U:표지URL, V:줄거리
 *
 * [시트 2: 북마크] (A:isbn, B:title, C:cover, D:keyword, E:memo, F:author, G:pubYear)
 * [시트 3: 앱_동기화] (A:key, B:value, C:updatedAt)
 *
 */

const COVER_FOLDER_NAME = 'AllBooks_Covers';
const LIBRARY_SHEET_NAME = '전체_도서_리스트';
const BOOKMARK_SHEET_NAME = '북마크';
const SYNC_SHEET_NAME = '앱_동기화';

const LIBRARY_HEADERS = [
  '책 제목', '저자', '저자 외', '출판사', '출간연도', 'ISBN', '분류', '시리즈', '시리즈 넘버',
  '소장/대여', 'e-book', '소장처/대여처', '반납예정일',
  '독서 상태', '평점', '시작일', '완독일', '태그', '한줄평', '메모',
  '표지URL', '줄거리'
];
const BOOKMARK_HEADERS = ['isbn', 'title', 'cover', 'keyword', 'memo', 'author', 'pubYear'];
const SYNC_HEADERS = ['key', 'value', 'updatedAt'];

function getSecret_(key) {
  return String(PropertiesService.getScriptProperties().getProperty(key) || '').trim();
}

function isPinAuthorized_(providedPin) {
  const configuredPin = getSecret_('WRITE_PIN');
  if (!configuredPin) return true;
  return String(providedPin || '').trim() === configuredPin;
}

function jsonResponse(obj) {
  return ContentService
    .createTextOutput(JSON.stringify(obj))
    .setMimeType(ContentService.MimeType.JSON);
}

function getOrCreateSheet(ss, name, headers) {
  let sheet = ss.getSheetByName(name);
  if (!sheet) {
    sheet = ss.insertSheet(name);
    sheet.appendRow(headers);
  }
  return sheet;
}

function ensureLibraryHeaders(sheet) {
  const headerRange = sheet.getRange(1, 1, 1, LIBRARY_HEADERS.length);
  const current = headerRange.getValues()[0];
  // 아직 구버전(A열=ISBN) 구조라면 1행 헤더를 덮어쓰지 않고 보호
  if (String(current[0] || '').trim().toUpperCase() === 'ISBN') return;
  let changed = false;
  for (let i = 0; i < LIBRARY_HEADERS.length; i++) {
    if (!String(current[i] || '').trim()) {
      current[i] = LIBRARY_HEADERS[i];
      changed = true;
    }
  }
  if (changed) headerRange.setValues([current]);
}

function formatDateCell(val) {
  if (!val) return '';
  if (val instanceof Date && !isNaN(val.getTime())) {
    return Utilities.formatDate(val, Session.getScriptTimeZone(), 'yyyy-MM-dd');
  }
  return String(val).trim();
}

function sanitizeSeriesNumber_(val) {
  const m = String(val || '').match(/\d+/);
  return m ? m[0] : '';
}

function normalizeIsbnServer_(raw) {
  return String(raw || '').replace(/[^0-9Xx]/g, '').toUpperCase();
}

function normalizeTitleForDup(title) {
  return String(title || '')
    .toLowerCase()
    .replace(/^\d{1,3}\s+(?=\D)/, '')
    .split(/\s*=\s*|[:：]|\s+[-–—―]\s+/)[0]
    .replace(/\([^)]*\)|\[[^\]]*\]/g, '')
    .replace(/[\s·・.,!?'"~()\[\]{}\-_/:;：–—―]+/g, '');
}

function hasAuthorOverlapServer_(a, b) {
  const clean = s => String(s || '').toLowerCase().replace(/[^a-z0-9가-힣]/g, '');
  const ca = clean(a);
  const cb = clean(b);
  return !!(ca && cb && (ca.includes(cb) || cb.includes(ca)));
}

function stripHtmlServer_(raw) {
  return String(raw || '')
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/gi, ' ')
    .replace(/&lt;/gi, '<')
    .replace(/&gt;/gi, '>')
    .replace(/&amp;/gi, '&')
    .replace(/&quot;/gi, '"')
    .replace(/&#39;/gi, "'")
    .replace(/[ \t]+/g, ' ')
    .replace(/\n\s*\n+/g, '\n\n')
    .trim();
}

function parseEbookFlag(rawVal, tags, series, memo, title) {
  const v = String(rawVal || '').trim().toLowerCase();
  if (['y', 'true', '전자책', 'ebook', '1'].includes(v)) return true;
  if (['n', 'false', '종이책', '0'].includes(v)) return false;
  const legacy = `${tags || ''} ${series || ''} ${memo || ''} ${title || ''}`.toLowerCase();
  return legacy.includes('전자책') || legacy.includes('ebook') || legacy.includes('e-book');
}

function rowArrayToBookObject_(r, rowNum) {
  const title = String(r[0] || '').trim();
  const author = String(r[1] || '').trim();
  const translator = String(r[2] || '').trim();
  const publisher = String(r[3] || '').trim();
  const pubYear = String(r[4] || '').trim();
  const isbn = String(r[5] || '').replace(/[\r\n\s]+/g, '').trim();
  const kdc = String(r[6] || '').trim();
  const series = String(r[7] || '').trim();
  const vol = sanitizeSeriesNumber_(r[8]);

  const ownRaw = String(r[9] || '').trim();
  const ownLow = ownRaw.toLowerCase();
  const isSold = ownLow === '판매' || ownLow === 'sold';
  const isReturned = ownLow === '반납' || ownLow === 'returned';
  const isBorrowed = !!ownLow && !['n', 'false', '0', '소장', '아니오', '판매', 'sold', '반납', 'returned'].includes(ownLow);

  const tags = String(r[17] || '').trim();
  const memo = String(r[19] || '').trim();
  const isEbook = parseEbookFlag(r[10], tags, series, memo, title);

  const srcCol = String(r[11] || '').trim();
  const source = srcCol || (
    (!ownRaw || ['y', 'true', '대여', '대여중', '1', 'n', 'false', '0', '소장', '아니오', '판매', 'sold', '반납', 'returned'].includes(ownLow))
      ? ''
      : ownRaw
  );

  return {
    row: rowNum,
    title: title,
    author: author,
    translator: translator,
    publisher: publisher,
    pubYear: pubYear,
    isbn: isbn,
    kdc: kdc,
    series: series,
    vol: vol,
    isSold: isSold,
    isReturned: isReturned,
    isBorrowed: isBorrowed,
    isEbook: isEbook,
    source: source,
    dueDate: formatDateCell(r[12]),
    status: String(r[13] || '').trim(),
    rating: String(r[14] || '').trim(),
    startDate: formatDateCell(r[15]),
    finishDate: formatDateCell(r[16]),
    tags: tags,
    review: String(r[18] || '').trim(),
    memo: memo,
    cover: String(r[20] || '').trim(),
    description: String(r[21] || '').trim()
  };
}

function buildLibraryRowArray(book) {
  return [
    String(book.title || '').trim(),
    String(book.author || '').trim(),
    String(book.translator || '').trim(),
    String(book.publisher || '').trim(),
    String(book.pubYear || '').trim(),
    String(book.isbn || '').trim(),
    String(book.kdc || '').trim(),
    String(book.series || book.note || '').trim(),
    sanitizeSeriesNumber_(book.vol),
    book.isSold ? '판매' : (book.isReturned ? '반납' : (book.isBorrowed ? '대여중' : '')),
    book.isEbook ? 'Y' : '',
    String(book.source || book.borrowSource || '').trim(),
    String(book.dueDate || '').trim(),
    String(book.status || '').trim(),
    String(book.rating || '').trim(),
    String(book.startDate || '').trim(),
    String(book.finishDate || '').trim(),
    String(book.tags || '').trim(),
    String(book.review || '').trim(),
    String(book.memo || '').trim(),
    String(book.cover || '').trim(),
    String(book.description || '').trim()
  ];
}

function readSingleLibraryBook_(sheet, rowNum) {
  const r = sheet.getRange(rowNum, 1, 1, LIBRARY_HEADERS.length).getValues()[0];
  return rowArrayToBookObject_(r, rowNum);
}

function readLibraryBooks(ss) {
  const sheet = getOrCreateSheet(ss, LIBRARY_SHEET_NAME, LIBRARY_HEADERS);
  ensureLibraryHeaders(sheet);
  const lastRow = sheet.getLastRow();
  if (lastRow < 2) return [];

  const values = sheet.getRange(2, 1, lastRow - 1, LIBRARY_HEADERS.length).getValues();
  const books = [];
  for (let i = 0; i < values.length; i++) {
    const r = values[i];
    if (!String(r[0] || '').trim() && !String(r[5] || '').trim()) continue;
    books.push(rowArrayToBookObject_(r, i + 2));
  }
  return books;
}

function readBookmarks(ss) {
  const sheet = getOrCreateSheet(ss, BOOKMARK_SHEET_NAME, BOOKMARK_HEADERS);
  const lastRow = sheet.getLastRow();
  if (lastRow < 2) return [];

  const values = sheet.getRange(2, 1, lastRow - 1, 7).getValues();
  const bookmarks = [];
  for (let i = 0; i < values.length; i++) {
    const r = values[i];
    const isbn = String(r[0] || '').trim();
    if (!isbn) continue;
    bookmarks.push({
      isbn: isbn,
      title: String(r[1] || '').trim(),
      cover: String(r[2] || '').trim(),
      keyword: String(r[3] || '').trim(),
      memo: String(r[4] || '').trim(),
      author: String(r[5] || '').trim(),
      pubYear: String(r[6] || '').trim()
    });
  }
  return bookmarks;
}

function readSyncState(ss) {
  const sheet = getOrCreateSheet(ss, SYNC_SHEET_NAME, SYNC_HEADERS);
  const lastRow = sheet.getLastRow();
  const state = {
    ignoredDuplicates: [],
    recentBooks: [],
    apiUsage: null,
    fixedTargetLibCodes: {},
    followedAuthors: [],
    dismissedNewReleases: [],
    authorPhotos: {}
  };
  if (lastRow < 2) return state;

  const values = sheet.getRange(2, 1, lastRow - 1, 2).getValues();
  for (let i = 0; i < values.length; i++) {
    const key = String(values[i][0] || '').trim();
    const raw = String(values[i][1] || '').trim();
    if (!key || !raw) continue;
    try {
      const parsed = JSON.parse(raw);
      if (key === 'ignoredDuplicates' && Array.isArray(parsed)) state.ignoredDuplicates = parsed;
      else if (key === 'recentBooks' && Array.isArray(parsed)) state.recentBooks = parsed;
      else if (key === 'apiUsage' && parsed && typeof parsed === 'object') state.apiUsage = parsed;
      else if (key === 'fixedTargetLibCodes' && parsed && typeof parsed === 'object') state.fixedTargetLibCodes = parsed;
      else if (key === 'followedAuthors' && Array.isArray(parsed)) state.followedAuthors = parsed;
      else if (key === 'dismissedNewReleases' && Array.isArray(parsed)) state.dismissedNewReleases = parsed;
      else if (key === 'authorPhotos' && parsed && typeof parsed === 'object') state.authorPhotos = parsed;
    } catch (e) {}
  }
  return state;
}

function writeSyncState(ss, incoming) {
  if (!incoming || typeof incoming !== 'object') return readSyncState(ss);
  const sheet = getOrCreateSheet(ss, SYNC_SHEET_NAME, SYNC_HEADERS);
  const current = readSyncState(ss);

  const mergedFixedLibs = Object.assign(
    {},
    current.fixedTargetLibCodes || {},
    (incoming.fixedTargetLibCodes && typeof incoming.fixedTargetLibCodes === 'object') ? incoming.fixedTargetLibCodes : {}
  );

  const mergedAuthorPhotos = Object.assign(
    {},
    current.authorPhotos || {},
    (incoming.authorPhotos && typeof incoming.authorPhotos === 'object') ? incoming.authorPhotos : {}
  );
  Object.keys(mergedAuthorPhotos).forEach(k => {
    if (!mergedAuthorPhotos[k]) delete mergedAuthorPhotos[k];
  });

  const next = {
    ignoredDuplicates: Array.isArray(incoming.ignoredDuplicates) ? incoming.ignoredDuplicates : current.ignoredDuplicates,
    recentBooks: Array.isArray(incoming.recentBooks) ? incoming.recentBooks.slice(0, 10) : current.recentBooks,
    apiUsage: current.apiUsage,
    fixedTargetLibCodes: mergedFixedLibs,
    followedAuthors: Array.isArray(incoming.followedAuthors) ? incoming.followedAuthors : current.followedAuthors,
    dismissedNewReleases: Array.isArray(incoming.dismissedNewReleases) ? incoming.dismissedNewReleases.slice(-300) : current.dismissedNewReleases,
    authorPhotos: mergedAuthorPhotos
  };

  if (incoming.apiUsage && incoming.apiUsage.date && typeof incoming.apiUsage.count === 'number') {
    if (current.apiUsage && current.apiUsage.date === incoming.apiUsage.date) {
      next.apiUsage = {
        date: incoming.apiUsage.date,
        count: Math.max(Number(current.apiUsage.count) || 0, Number(incoming.apiUsage.count) || 0)
      };
    } else {
      next.apiUsage = { date: String(incoming.apiUsage.date), count: Number(incoming.apiUsage.count) || 0 };
    }
  }

  const nowStr = Utilities.formatDate(new Date(), Session.getScriptTimeZone(), 'yyyy-MM-dd HH:mm:ss');
  const rows = [
    ['ignoredDuplicates', JSON.stringify(next.ignoredDuplicates || []), nowStr],
    ['recentBooks', JSON.stringify(next.recentBooks || []), nowStr],
    ['apiUsage', JSON.stringify(next.apiUsage || {}), nowStr],
    ['fixedTargetLibCodes', JSON.stringify(next.fixedTargetLibCodes || {}), nowStr],
    ['followedAuthors', JSON.stringify(next.followedAuthors || []), nowStr],
    ['dismissedNewReleases', JSON.stringify(next.dismissedNewReleases || []), nowStr],
    ['authorPhotos', JSON.stringify(next.authorPhotos || {}), nowStr]
  ];
  const range = sheet.getRange(2, 1, rows.length, 3);
  range.setNumberFormat('@');
  range.setValues(rows);
  return next;
}

function findLibraryRow(sheet, rowHint, origTitle, origAuthor, origIsbn, origIsEbook) {
  const lastRow = sheet.getLastRow();
  if (lastRow < 2) return -1;

  if (rowHint && rowHint >= 2 && rowHint <= lastRow) {
    const checkTitle = String(sheet.getRange(rowHint, 1).getValue() || '').trim();
    if (!origTitle || checkTitle === String(origTitle).trim()) return rowHint;
  }

  const values = sheet.getRange(2, 1, lastRow - 1, LIBRARY_HEADERS.length).getValues();
  const targetTitle = String(origTitle || '').trim();
  const targetAuthor = String(origAuthor || '').trim();
  const targetIsbn = normalizeIsbnServer_(origIsbn);
  const hasEbookHint = (typeof origIsEbook === 'boolean');

  let bestRow = -1;
  let bestScore = -1;
  for (let i = 0; i < values.length; i++) {
    const r = values[i];
    if (String(r[0] || '').trim() !== targetTitle) continue;
    if (targetAuthor && String(r[1] || '').trim() !== targetAuthor) continue;

    let score = 1;
    const rowIsbn = normalizeIsbnServer_(r[5]);
    if (targetIsbn && rowIsbn && rowIsbn === targetIsbn) score += 4;
    if (hasEbookHint) {
      const rowEbook = parseEbookFlag(r[10], r[17], r[7], r[19], r[0]);
      if (rowEbook === origIsEbook) score += 2;
    }
    if (score > bestScore) {
      bestScore = score;
      bestRow = i + 2;
    }
  }
  return bestRow;
}

function syncSiblingBooksFields_(sheet, excludeRow, book) {
  const normTitle = normalizeTitleForDup(book.title);
  if (!normTitle) return [];
  const lastRow = sheet.getLastRow();
  if (lastRow < 2) return [];

  const values = sheet.getRange(2, 1, lastRow - 1, LIBRARY_HEADERS.length).getValues();
  const authorStr = String(book.author || '').trim();
  const ratingVal = String(book.rating || '').trim();
  const reviewVal = String(book.review || '').trim();
  const memoVal = String(book.memo || '').trim();
  const updatedBooks = [];

  for (let i = 0; i < values.length; i++) {
    const rowNum = i + 2;
    if (rowNum === excludeRow) continue;
    const r = values[i];
    const rowTitle = String(r[0] || '').trim();
    if (!rowTitle || normalizeTitleForDup(rowTitle) !== normTitle) continue;
    const rowAuthor = String(r[1] || '').trim();
    if (authorStr && rowAuthor && !hasAuthorOverlapServer_(authorStr, rowAuthor)) continue;

    sheet.getRange(rowNum, 15).setValue(ratingVal); // O열: 평점
    sheet.getRange(rowNum, 19).setValue(reviewVal); // S열: 한줄평
    sheet.getRange(rowNum, 20).setValue(memoVal);   // T열: 메모

    r[14] = ratingVal;
    r[18] = reviewVal;
    r[19] = memoVal;
    updatedBooks.push(rowArrayToBookObject_(r, rowNum));
  }
  return updatedBooks;
}

function removeBookmarkByIsbn(ss, isbn) {
  const sheet = getOrCreateSheet(ss, BOOKMARK_SHEET_NAME, BOOKMARK_HEADERS);
  const lastRow = sheet.getLastRow();
  if (lastRow < 2) return;
  const target = String(isbn || '').trim();
  const values = sheet.getRange(2, 1, lastRow - 1, 1).getValues();
  for (let i = values.length - 1; i >= 0; i--) {
    if (String(values[i][0] || '').trim() === target) sheet.deleteRow(i + 2);
  }
}

/* =========================================================
 * 외부 도서 API (카카오 공통 헬퍼 · 다음 상세 · 국립중앙도서관 · 정보나루 프록시)
 * ========================================================= */
function fetchKakaoApi_(queryParams) {
  const kakaoKey = getSecret_('KAKAO_REST_API_KEY');
  if (!kakaoKey) return [];
  const url = 'https://dapi.kakao.com/v3/search/book?' + queryParams;
  try {
    const res = UrlFetchApp.fetch(url, {
      method: 'get',
      headers: { Authorization: 'KakaoAK ' + kakaoKey },
      muteHttpExceptions: true
    });
    if (res.getResponseCode() !== 200) return [];
    const data = JSON.parse(res.getContentText() || '{}');
    return Array.isArray(data.documents) ? data.documents : [];
  } catch (e) {
    return [];
  }
}

function parseKakaoDocBase_(d, fallbackIsbn) {
  const isbnParts = String(d.isbn || '').trim().split(/\s+/).filter(Boolean);
  const isbn13 = isbnParts.find(x => normalizeIsbnServer_(x).length === 13) || isbnParts[isbnParts.length - 1] || fallbackIsbn || '';
  const dt = String(d.datetime || '').trim();
  const rawTr = Array.isArray(d.translators) ? d.translators.filter(Boolean).join(', ') : String(d.translators || '').trim();
  const translator = rawTr
    ? (/(?:옮김|감수|편집|엮음|그림|기획|해설)$/.test(rawTr) ? rawTr : rawTr + ' 옮김')
    : '';
  return {
    title: String(d.title || '').trim(),
    author: Array.isArray(d.authors) ? d.authors.filter(Boolean).join(', ') : String(d.authors || '').trim(),
    translator: translator,
    publisher: String(d.publisher || '').trim(),
    isbn: normalizeIsbnServer_(isbn13),
    pubYear: dt.length >= 4 ? dt.slice(0, 4) : '',
    pubDate: dt.length >= 10 ? dt.slice(0, 10) : '',
    cover: String(d.thumbnail || '').trim().replace(/^http:\/\//i, 'https://'),
    url: String(d.url || '').trim(),
    description: String(d.contents || '').trim().slice(0, 5000)
  };
}

function fetchDaumBookDetailExtras_(daumUrl) {
  const out = { description: '', authorBio: '' };
  if (!daumUrl || daumUrl.indexOf('http') !== 0) return out;
  try {
    const res = UrlFetchApp.fetch(daumUrl, {
      method: 'get',
      muteHttpExceptions: true,
      followRedirects: true,
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
      }
    });
    if (res.getResponseCode() !== 200) return out;
    const html = res.getContentText('UTF-8') || '';

    const descPatterns = [
      /<h[234][^>]*>\s*책\s*소개\s*<\/h[234]>[\s\S]{0,400}?<p[^>]*class="[^"]*desc[^"]*"[^>]*>([\s\S]*?)<\/p>/i,
      /<div[^>]*id="[^"]*bookIntro[^"]*"[^>]*>([\s\S]*?)<\/div>/i,
      /"description"\s*:\s*"([^"]{80,5000})"/i
    ];
    for (let i = 0; i < descPatterns.length; i++) {
      const m = html.match(descPatterns[i]);
      if (m && m[1]) {
        const cleaned = stripHtmlServer_(m[1].replace(/\\n/g, '\n').replace(/\\"/g, '"'));
        if (cleaned.length > out.description.length) out.description = cleaned;
      }
    }

    const bioPatterns = [
      /<h[234][^>]*>\s*(?:저자\s*소개|작가\s*소개|지은이\s*소개)\s*<\/h[234]>[\s\S]{0,400}?<p[^>]*class="[^"]*desc[^"]*"[^>]*>([\s\S]*?)<\/p>/i,
      /<div[^>]*id="[^"]*authorIntro[^"]*"[^>]*>([\s\S]*?)<\/div>/i
    ];
    for (let i = 0; i < bioPatterns.length; i++) {
      const m = html.match(bioPatterns[i]);
      if (m && m[1]) {
        const cleaned = stripHtmlServer_(m[1]);
        if (cleaned.length >= 15) {
          out.authorBio = cleaned;
          break;
        }
      }
    }
  } catch (e) {}
  return out;
}

function lookupBookFromKakao_(isbn, title, author) {
  const cleanIsbn = normalizeIsbnServer_(isbn);
  const cleanTitle = String(title || '').replace(/^\d{1,3}\s+(?=\D)/, '').replace(/\([^)]*\)/g, '').trim();
  if (!cleanIsbn && !cleanTitle) return null;

  const docs = fetchKakaoApi_('target=' + (cleanIsbn ? 'isbn' : 'title') + '&size=10&query=' + encodeURIComponent(cleanIsbn || cleanTitle));
  if (docs.length === 0) return null;

  const picked = cleanIsbn
    ? docs[0]
    : (author
        ? (docs.find(d => hasAuthorOverlapServer_(Array.isArray(d.authors) ? d.authors.join(', ') : String(d.authors || ''), author)) || null)
        : docs[0]);
  if (!picked) return null;

  const base = parseKakaoDocBase_(picked, cleanIsbn);
  const needsExtra = !base.description || base.description.length < 150 || /([.]{3}|…)\s*$/.test(base.description);
  const extras = needsExtra ? fetchDaumBookDetailExtras_(base.url) : { description: '', authorBio: '' };
  if (extras.description && extras.description.length > base.description.length) {
    base.description = extras.description.slice(0, 5000);
  }
  return Object.assign(base, {
    source: 'kakao',
    authorBio: extras.authorBio ? extras.authorBio.slice(0, 1200) : '',
    series: '',
    vol: '',
    kdc: ''
  });
}

function splitNlAuthorRoles_(rawAuthor) {
  const s = String(rawAuthor || '').trim();
  if (!s) return { author: '', others: '' };
  const parts = s.split(/\s*[;|\/]\s*/).map(p => p.trim()).filter(Boolean);
  const authors = [];
  const others = [];
  const otherRoleRe = /(옮김|옮긴이|역자|번역|감수|감역|엮음|엮은이|편저|편집|엮어|그림|그린이|일러스트|해설|기획|감수자|공역|역)/;
  const authorPrefixRe = /^(?:지은이|저자|글쓴이|글|원작|원저)\s*[:：]\s*/;
  const authorSuffixRe = /\s*(?:지음|저|글|원작|원저|공저)$/;
  parts.forEach(p => {
    if (otherRoleRe.test(p)) {
      others.push(p.replace(/\s+/g, ' ').trim());
    } else {
      const cleaned = p.replace(authorPrefixRe, '').replace(authorSuffixRe, '').trim();
      if (cleaned) authors.push(cleaned);
    }
  });
  return {
    author: authors.join(', ') || (others.length === 0 ? s : ''),
    others: others.join(', ')
  };
}

function mergeOtherContributors_(a, b) {
  const list = [];
  const seen = {};
  [a, b].forEach(chunk => {
    String(chunk || '').split(/\s*,\s*/).map(x => x.trim()).filter(Boolean).forEach(item => {
      const key = item.replace(/\s+/g, '').toLowerCase();
      if (!seen[key]) {
        seen[key] = true;
        list.push(item);
      }
    });
  });
  return list.join(', ');
}

function lookupBookFromNL_(isbn, title, author) {
  const nlKey = getSecret_('NL_API_KEY');
  if (!nlKey) return null;
  const cleanIsbn = normalizeIsbnServer_(isbn);
  const cleanTitle = String(title || '').replace(/^\d{1,3}\s+(?=\D)/, '').replace(/\([^)]*\)/g, '').trim();
  if (!cleanIsbn && !cleanTitle) return null;

  const param = cleanIsbn ? ('isbn=' + encodeURIComponent(cleanIsbn)) : ('title=' + encodeURIComponent(cleanTitle));
  const url = 'https://www.nl.go.kr/seoji/SearchApi.do?cert_key=' + encodeURIComponent(nlKey) + '&result_style=json&page_no=1&page_size=5&' + param;
  try {
    const res = UrlFetchApp.fetch(url, { method: 'get', muteHttpExceptions: true });
    if (res.getResponseCode() !== 200) return null;
    const docs = (JSON.parse(res.getContentText() || '{}').docs) || [];
    if (docs.length === 0) return null;

    const picked = cleanIsbn
      ? docs[0]
      : (author ? (docs.find(d => hasAuthorOverlapServer_(d.AUTHOR || '', author)) || null) : docs[0]);
    if (!picked) return null;

    const rawDate = String(picked.PUBLISH_PREDATE || picked.REAL_PUBLISH_DATE || '').replace(/[^0-9]/g, '');
    const KDC_MAP = { '0': '총류', '1': '철학', '2': '종교', '3': '사회과학', '4': '자연과학', '5': '기술과학', '6': '예술', '7': '언어', '8': '문학', '9': '역사' };
    const kdcCode = String(picked.KDC || '').trim();
    let subj = String(picked.SUBJECT || '').trim();
    if (/^[0-9]$/.test(subj) && KDC_MAP[subj]) subj = KDC_MAP[subj];
    if (!subj && kdcCode && KDC_MAP[kdcCode.charAt(0)]) subj = KDC_MAP[kdcCode.charAt(0)];

    const parsedRoles = splitNlAuthorRoles_(picked.AUTHOR || '');
    return {
      source: 'nl',
      title: String(picked.TITLE || '').trim(),
      author: parsedRoles.author,
      translator: parsedRoles.others,
      publisher: String(picked.PUBLISHER || '').trim(),
      isbn: normalizeIsbnServer_(picked.EA_ISBN || picked.SET_ISBN || cleanIsbn),
      pubYear: rawDate.length >= 4 ? rawDate.slice(0, 4) : '',
      cover: '',
      description: '',
      series: String(picked.SERIES_TITLE || '').trim(),
      vol: sanitizeSeriesNumber_(picked.VOL),
      kdc: subj || ''
    };
  } catch (e) {
    return null;
  }
}

function lookupBookCombined_(isbn, title, author) {
  const rawIsbn = normalizeIsbnServer_(isbn);
  const validIsbn = (/^\d{10}$/.test(rawIsbn) || /^\d{13}$/.test(rawIsbn)) ? rawIsbn : '';
  const cleanTitle = String(title || '').trim();

  // 1순위: 유효한 ISBN으로 카카오 조회 → 실패 시 제목+저자로 2차 카카오 조회 (전자책 ISBN 대응)
  let kakaoBook = validIsbn ? lookupBookFromKakao_(validIsbn, '', author) : null;
  if (!kakaoBook && cleanTitle) {
    kakaoBook = lookupBookFromKakao_('', cleanTitle, author);
  }

  if (kakaoBook) {
    const nlIsbn = normalizeIsbnServer_(kakaoBook.isbn || validIsbn);
    if (!kakaoBook.kdc || !kakaoBook.series || !kakaoBook.vol || !kakaoBook.translator) {
      let nlSup = (/^\d{10}$/.test(nlIsbn) || /^\d{13}$/.test(nlIsbn)) ? lookupBookFromNL_(nlIsbn, '', '') : null;
      if (!nlSup && cleanTitle) nlSup = lookupBookFromNL_('', cleanTitle, author);
      if (nlSup) {
        if (!kakaoBook.kdc && nlSup.kdc) kakaoBook.kdc = nlSup.kdc;
        if (!kakaoBook.series && nlSup.series) kakaoBook.series = nlSup.series;
        if (!kakaoBook.vol && nlSup.vol) kakaoBook.vol = sanitizeSeriesNumber_(nlSup.vol);
        if (nlSup.translator) kakaoBook.translator = mergeOtherContributors_(kakaoBook.translator, nlSup.translator);
      }
    }
    return kakaoBook;
  }

  // 2순위: 국립중앙도서관 ISBN 조회 → 실패 시 제목+저자 조회
  let nlBook = validIsbn ? lookupBookFromNL_(validIsbn, '', author) : null;
  if (!nlBook && cleanTitle) nlBook = lookupBookFromNL_('', cleanTitle, author);
  return nlBook;
}

function lookupAuthorBooksFromKakao_(author) {
  const cleanAuthor = String(author || '').trim();
  if (!cleanAuthor) return [];
  const normPerson = (s) => String(s || '')
    .replace(/\([^)]*\)|\[[^\]]*\]/g, '')
    .replace(/(지은이|저자|지음|글|그림|옮김|옮긴이|감수|엮음)\s*[:：]?/g, '')
    .replace(/[\s·・.,\-_]+/g, '')
    .toLowerCase()
    .trim();
  const targetKey = normPerson(cleanAuthor);
  const docs = fetchKakaoApi_('target=person&size=30&sort=latest&query=' + encodeURIComponent(cleanAuthor));
  const seen = {};
  const out = [];
  docs.forEach(d => {
    const rawAuthors = Array.isArray(d.authors) ? d.authors : [String(d.authors || '')];
    // 주 저자(authors) 배열에 정확히 일치하는 이름이 있는 경우만 허용 (역자·부분일치·동명이인 오탐 축소)
    const exactMatch = rawAuthors.some(a => normPerson(a) === targetKey);
    if (!exactMatch) return;
    const base = parseKakaoDocBase_(d, '');
    if (!base.title) return;
    const key = normalizeTitleForDup(base.title);
    if (key && seen[key]) return;
    if (key) seen[key] = true;
    out.push(base);
  });
  return out.slice(0, 20);
}


function lookupAuthorPhoto_(authorName) {
  const clean = String(authorName || '')
    .replace(/\([^)]*\)|\[[^\]]*\]/g, ' ')
    .replace(/(지은이|저자|지음|글|그림|옮김|옮긴이|감수|엮음)\s*[:：]?/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
  if (!clean) return '';

  const fetchWikiThumb = (baseUrl, qs) => {
    try {
      const res = UrlFetchApp.fetch(baseUrl + '?' + qs, { method: 'get', muteHttpExceptions: true });
      if (res.getResponseCode() !== 200) return '';
      const data = JSON.parse(res.getContentText() || '{}');
      const pages = data && data.query && data.query.pages ? Object.values(data.query.pages) : [];
      for (let i = 0; i < pages.length; i++) {
        const p = pages[i];
        if (p && p.thumbnail && p.thumbnail.source) {
          return String(p.thumbnail.source);
        }
      }
    } catch (e) {}
    return '';
  };

  const koBase = 'https://ko.wikipedia.org/w/api.php';
  // 1) 한국어 위키백과 정확 제목 매칭
  let photo = fetchWikiThumb(
    koBase,
    'action=query&titles=' + encodeURIComponent(clean) + '&prop=pageimages&piprop=thumbnail&pithumbsize=160&redirects=1&format=json'
  );
  if (photo) return photo;

  // 2) 동명이인/직업 괄호 문서 검색 (예: '한강 (소설가)', '장대익 (과학철학자)')
  try {
    const res = UrlFetchApp.fetch(
      koBase + '?action=query&generator=search&gsrsearch=' + encodeURIComponent(clean + ' 작가') + '&gsrlimit=4&prop=pageimages&piprop=thumbnail&pithumbsize=160&format=json',
      { method: 'get', muteHttpExceptions: true }
    );
    if (res.getResponseCode() === 200) {
      const data = JSON.parse(res.getContentText() || '{}');
      const pages = data && data.query && data.query.pages ? Object.values(data.query.pages) : [];
      const compactClean = clean.replace(/\s+/g, '').toLowerCase();
      pages.sort((a, b) => (a.index || 99) - (b.index || 99));
      for (let i = 0; i < pages.length; i++) {
        const p = pages[i];
        const t = String((p && p.title) || '').replace(/\s+/g, '').toLowerCase();
        if (p && p.thumbnail && p.thumbnail.source && t.indexOf(compactClean) !== -1) {
          return String(p.thumbnail.source);
        }
      }
    }
  } catch (e) {}

  // 3) 일반 검색 폴백
  try {
    const res = UrlFetchApp.fetch(
      koBase + '?action=query&generator=search&gsrsearch=' + encodeURIComponent(clean) + '&gsrlimit=3&prop=pageimages&piprop=thumbnail&pithumbsize=160&format=json',
      { method: 'get', muteHttpExceptions: true }
    );
    if (res.getResponseCode() === 200) {
      const data = JSON.parse(res.getContentText() || '{}');
      const pages = data && data.query && data.query.pages ? Object.values(data.query.pages) : [];
      const compactClean = clean.replace(/\s+/g, '').toLowerCase();
      pages.sort((a, b) => (a.index || 99) - (b.index || 99));
      for (let i = 0; i < pages.length; i++) {
        const p = pages[i];
        const t = String((p && p.title) || '').replace(/\s+/g, '').toLowerCase();
        if (p && p.thumbnail && p.thumbnail.source && t.indexOf(compactClean) === 0) {
          return String(p.thumbnail.source);
        }
      }
    }
  } catch (e) {}

  return '';
}

function lookupAuthorPhotoCandidates_(authorName) {
  const clean = String(authorName || '')
    .replace(/\([^)]*\)|\[[^\]]*\]/g, ' ')
    .replace(/(지은이|저자|지음|글|그림|옮김|옮긴이|감수|엮음)\s*[:：]?/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
  if (!clean) return [];

  const results = [];
  const seen = {};

  const queryWiki = (lang, queryStr, limit) => {
    const base = 'https://' + lang + '.wikipedia.org/w/api.php';
    const url = base + '?action=query&generator=search&gsrsearch=' + encodeURIComponent(queryStr) +
      '&gsrlimit=' + limit + '&prop=pageimages|description|extracts&exintro=1&explaintext=1&exsentences=1&piprop=thumbnail&pithumbsize=240&format=json';
    try {
      const res = UrlFetchApp.fetch(url, { method: 'get', muteHttpExceptions: true });
      if (res.getResponseCode() !== 200) return;
      const data = JSON.parse(res.getContentText() || '{}');
      const pages = data && data.query && data.query.pages ? Object.values(data.query.pages) : [];
      pages.sort((a, b) => (a.index || 99) - (b.index || 99));
      pages.forEach(p => {
        if (!p || !p.title) return;
        const key = lang + ':' + p.title;
        if (seen[key]) return;
        seen[key] = true;
        results.push({
          title: String(p.title),
          description: String(p.description || p.extract || '').slice(0, 90),
          photoUrl: (p.thumbnail && p.thumbnail.source) ? String(p.thumbnail.source) : '',
          lang: lang,
          pageUrl: 'https://' + lang + '.wikipedia.org/wiki/' + encodeURIComponent(String(p.title).replace(/ /g, '_'))
        });
      });
    } catch (e) {}
  };

  queryWiki('ko', clean, 8);
  if (results.filter(r => r.photoUrl).length < 4) {
    queryWiki('ko', clean + ' 작가', 5);
  }
  return results.slice(0, 12);
}

function searchBooksFromKakao_(query) {
  const cleanQ = String(query || '').trim();
  if (!cleanQ) return [];
  const seen = {};
  const out = [];
  const appendDocs = (docs) => {
    (docs || []).forEach(d => {
      const b = parseKakaoDocBase_(d, '');
      if (!b || !b.title) return;
      const key = b.isbn || (b.title + '|' + b.publisher + '|' + b.pubYear);
      if (seen[key]) return;
      seen[key] = true;
      out.push(b);
    });
  };

  // 1) 제목 우선 검색 (최대 25권)
  appendDocs(fetchKakaoApi_('target=title&size=25&query=' + encodeURIComponent(cleanQ)));

  // 2) 결과가 적으면 통합 검색 보강
  if (out.length < 10) {
    appendDocs(fetchKakaoApi_('size=25&query=' + encodeURIComponent(cleanQ)));
  }

  // 3) 띄어쓰기 차이(예: '셜록 홈즈의 귀환' vs '셜록홈즈의 귀환')로 누락되는 판본 보강
  if (out.length < 10 && /\s+/.test(cleanQ)) {
    const compactQ = cleanQ.replace(/\s+/g, '');
    if (compactQ.length >= 2) {
      appendDocs(fetchKakaoApi_('size=25&query=' + encodeURIComponent(compactQ)));
    }
  }

  return out.slice(0, 30);
}

function handleData4LibProxy_(params) {
  const d4lKey = getSecret_('DATA4LIB_API_KEY');
  if (!d4lKey) return jsonResponse({ status: 'error', message: '스크립트 속성에 DATA4LIB_API_KEY가 설정되지 않았습니다.' });
  const allowed = ['srchBooks', 'srchDtlList', 'recommandList', 'libSrch', 'bookExist', 'keywordList'];
  const endpoint = String(params.endpoint || '').trim();
  if (allowed.indexOf(endpoint) === -1) return jsonResponse({ status: 'error', message: '허용되지 않은 정보나루 엔드포인트입니다.' });

  const qs = ['authKey=' + encodeURIComponent(d4lKey), 'format=json'];
  const skip = { action: true, endpoint: true, authKey: true, format: true, pin: true };
  Object.keys(params).forEach(k => {
    if (skip[k]) return;
    const v = String(params[k] || '').trim();
    if (v !== '') qs.push(encodeURIComponent(k) + '=' + encodeURIComponent(v));
  });
  try {
    const res = UrlFetchApp.fetch('https://data4library.kr/api/' + endpoint + '?' + qs.join('&'), { method: 'get', muteHttpExceptions: true });
    return ContentService.createTextOutput(res.getContentText() || '{}').setMimeType(ContentService.MimeType.JSON);
  } catch (err) {
    return jsonResponse({ status: 'error', message: String(err) });
  }
}

function uploadCoverImageToDrive_(imageDataUrl, fileName) {
  const match = String(imageDataUrl || '').trim().match(/^data:(image\/[a-zA-Z0-9.+-]+);base64,(.+)$/);
  if (!match) throw new Error('올바른 이미지 데이터 형식이 아닙니다.');
  const bytes = Utilities.base64Decode(match[2]);
  const safeName = (String(fileName || 'cover').replace(/[^a-zA-Z0-9가-힣._-]/g, '_') || 'cover') + '_' + Date.now() + '.jpg';
  const blob = Utilities.newBlob(bytes, match[1], safeName);

  const folders = DriveApp.getFoldersByName(COVER_FOLDER_NAME);
  const folder = folders.hasNext() ? folders.next() : DriveApp.createFolder(COVER_FOLDER_NAME);
  const file = folder.createFile(blob);
  file.setSharing(DriveApp.Access.ANYONE_WITH_LINK, DriveApp.Permission.VIEW);
  return 'https://lh3.googleusercontent.com/d/' + file.getId() + '=w400';
}

/* =========================================================
 * Web App 엔드포인트 (doGet / doPost)
 * ========================================================= */
function doGet(e) {
  const params = (e && e.parameter) ? e.parameter : {};
  if (!isPinAuthorized_(params.pin)) {
    return jsonResponse({ status: 'unauthorized', message: 'PIN이 일치하지 않습니다.' });
  }

  const action = params.action ? String(params.action).trim() : '';
  if (action === 'd4lProxy') return handleData4LibProxy_(params);
  if (action === 'searchBooks') return jsonResponse({ status: 'ok', source: 'kakao', books: searchBooksFromKakao_(params.query || '') });
  if (action === 'authorBooks') return jsonResponse({ status: 'ok', source: 'kakao', books: lookupAuthorBooksFromKakao_(params.author || '') });
  if (action === 'authorPhoto') return jsonResponse({ status: 'ok', photoUrl: lookupAuthorPhoto_(params.author || '') });
  if (action === 'authorPhotoCandidates') return jsonResponse({ status: 'ok', candidates: lookupAuthorPhotoCandidates_(params.author || '') });
  if (action === 'lookupBook') {
    const book = lookupBookCombined_(params.isbn || '', params.title || '', params.author || '');
    return jsonResponse({ status: 'ok', source: book ? book.source : 'none', book: book });
  }

  const ss = SpreadsheetApp.getActiveSpreadsheet();
  return jsonResponse({
    status: 'ok',
    books: readLibraryBooks(ss),
    bookmarks: readBookmarks(ss),
    syncState: readSyncState(ss)
  });
}

function doPost(e) {
  const lock = LockService.getScriptLock();
  lock.waitLock(15000);
  try {
    const payload = JSON.parse(e.postData.contents || '{}');
    if (!isPinAuthorized_(payload.pin)) {
      return jsonResponse({ status: 'unauthorized', message: 'PIN이 일치하지 않습니다.' });
    }

    const ss = SpreadsheetApp.getActiveSpreadsheet();
    const action = payload.action;

    if (action === 'uploadCoverImage') {
      return jsonResponse({ status: 'ok', url: uploadCoverImageToDrive_(payload.imageDataUrl, payload.fileName) });
    }
    if (action === 'saveSyncState') {
      return jsonResponse({ status: 'ok', syncState: writeSyncState(ss, payload.syncState || {}) });
    }

    if (action === 'lib_patch_meta') {
      const sheet = ss.getSheetByName(LIBRARY_SHEET_NAME);
      ensureLibraryHeaders(sheet);
      const targetRow = findLibraryRow(sheet, payload.row, payload.origTitle, payload.origAuthor, payload.origIsbn, payload.origIsEbook);
      if (targetRow === -1) return jsonResponse({ status: 'error', message: '보강할 도서 행을 찾지 못했습니다.' });

      if (payload.translator) sheet.getRange(targetRow, 3).setValue(String(payload.translator).trim());
      if (payload.pubYear) { const c = sheet.getRange(targetRow, 5); c.setNumberFormat('@'); c.setValue(String(payload.pubYear).trim()); }
      if (payload.kdc) sheet.getRange(targetRow, 7).setValue(String(payload.kdc).trim());
      if (payload.vol) { const v = sheet.getRange(targetRow, 9); v.setNumberFormat('@'); v.setValue(sanitizeSeriesNumber_(payload.vol)); }
      if (payload.cover) sheet.getRange(targetRow, 21).setValue(String(payload.cover).trim());
      if (payload.description) sheet.getRange(targetRow, 22).setValue(String(payload.description).trim());

      return jsonResponse({ status: 'ok', updatedBook: readSingleLibraryBook_(sheet, targetRow) });
    }

    if (action === 'lib_add' || action === 'moveBookmarkToLibrary') {
      const sheet = getOrCreateSheet(ss, LIBRARY_SHEET_NAME, LIBRARY_HEADERS);
      ensureLibraryHeaders(sheet);
      const book = payload.book || {};
      const normNew = normalizeTitleForDup(book.title);

      if (!payload.force && normNew) {
        const existing = readLibraryBooks(ss);
        if (existing.some(b => normalizeTitleForDup(b.title) === normNew)) {
          return jsonResponse({ status: 'duplicate', message: '비슷한 제목의 도서가 이미 존재합니다.' });
        }
      }

      const nextRow = sheet.getLastRow() + 1;
      const range = sheet.getRange(nextRow, 1, 1, LIBRARY_HEADERS.length);
      range.setNumberFormat('@');
      range.setValues([buildLibraryRowArray(book)]);

      const addedBook = readSingleLibraryBook_(sheet, nextRow);
      const syncedSiblings = payload.syncSiblings ? syncSiblingBooksFields_(sheet, nextRow, book) : [];
      if (action === 'moveBookmarkToLibrary' && payload.removeBookmark && payload.isbn) {
        removeBookmarkByIsbn(ss, payload.isbn);
      }

      const resObj = { status: 'ok', addedBook: addedBook, updatedBooks: syncedSiblings };
      if (action === 'moveBookmarkToLibrary') resObj.bookmarks = readBookmarks(ss);
      return jsonResponse(resObj);
    }

    if (action === 'lib_update') {
      const sheet = ss.getSheetByName(LIBRARY_SHEET_NAME);
      ensureLibraryHeaders(sheet);
      const targetRow = findLibraryRow(sheet, payload.row, payload.origTitle, payload.origAuthor, payload.origIsbn, payload.origIsEbook);
      if (targetRow === -1) return jsonResponse({ status: 'error', message: '수정할 도서 행을 찾지 못했습니다.' });

      const book = payload.book || {};
      const range = sheet.getRange(targetRow, 1, 1, LIBRARY_HEADERS.length);
      [5, 6, 9, 13, 16, 17].forEach(col => sheet.getRange(targetRow, col).setNumberFormat('@'));
      range.setValues([buildLibraryRowArray(book)]);

      const updatedBook = readSingleLibraryBook_(sheet, targetRow);
      const syncedSiblings = payload.syncSiblings ? syncSiblingBooksFields_(sheet, targetRow, book) : [];
      return jsonResponse({ status: 'ok', updatedBook: updatedBook, updatedBooks: syncedSiblings });
    }

    if (action === 'lib_delete') {
      const sheet = ss.getSheetByName(LIBRARY_SHEET_NAME);
      const targetRow = findLibraryRow(sheet, payload.row, payload.origTitle, payload.origAuthor, payload.origIsbn, payload.origIsEbook);
      if (targetRow === -1) return jsonResponse({ status: 'error', message: '삭제할 도서 행을 찾지 못했습니다.' });
      sheet.deleteRow(targetRow);
      return jsonResponse({ status: 'ok', deletedRow: targetRow });
    }

    const bmSheet = getOrCreateSheet(ss, BOOKMARK_SHEET_NAME, BOOKMARK_HEADERS);
    if (action === 'add') {
      const b = payload.book || {};
      removeBookmarkByIsbn(ss, b.isbn);
      const nextRow = bmSheet.getLastRow() + 1;
      bmSheet.getRange(nextRow, 1).setNumberFormat('@');
      bmSheet.getRange(nextRow, 1, 1, 7).setValues([[
        String(b.isbn || '').trim(), String(b.title || '').trim(), String(b.cover || '').trim(),
        String(b.keyword || '').trim(), String(b.memo || '').trim(), String(b.author || '').trim(), String(b.pubYear || '').trim()
      ]]);
      return jsonResponse({ status: 'ok', bookmarks: readBookmarks(ss) });
    }

    if (action === 'updateMemo') {
      const lastRow = bmSheet.getLastRow();
      const target = String(payload.isbn || '').trim();
      if (lastRow >= 2) {
        const vals = bmSheet.getRange(2, 1, lastRow - 1, 7).getValues();
        for (let i = 0; i < vals.length; i++) {
          if (String(vals[i][0] || '').trim() === target) {
            bmSheet.getRange(i + 2, 5).setValue(String(payload.memo || ''));
            if (payload.author) bmSheet.getRange(i + 2, 6).setValue(String(payload.author));
            if (payload.pubYear) bmSheet.getRange(i + 2, 7).setValue(String(payload.pubYear));
          }
        }
      }
      return jsonResponse({ status: 'ok', bookmarks: readBookmarks(ss) });
    }

    if (action === 'updateMeta') {
      const items = Array.isArray(payload.items) ? payload.items : [];
      const lastRow = bmSheet.getLastRow();
      if (lastRow >= 2 && items.length > 0) {
        const map = {};
        items.forEach(it => { map[String(it.isbn || '').trim()] = it; });
        const vals = bmSheet.getRange(2, 1, lastRow - 1, 7).getValues();
        for (let i = 0; i < vals.length; i++) {
          const hit = map[String(vals[i][0] || '').trim()];
          if (hit) {
            if (hit.cover) bmSheet.getRange(i + 2, 3).setValue(String(hit.cover));
            if (hit.author) bmSheet.getRange(i + 2, 6).setValue(String(hit.author));
            if (hit.pubYear) bmSheet.getRange(i + 2, 7).setValue(String(hit.pubYear));
          }
        }
      }
      return jsonResponse({ status: 'ok', bookmarks: readBookmarks(ss) });
    }

    if (action === 'remove') {
      removeBookmarkByIsbn(ss, payload.isbn);
      return jsonResponse({ status: 'ok', bookmarks: readBookmarks(ss) });
    }

    if (action === 'removeMany') {
      const isbns = Array.isArray(payload.isbns) ? payload.isbns : [];
      isbns.forEach(id => removeBookmarkByIsbn(ss, id));
      return jsonResponse({ status: 'ok', bookmarks: readBookmarks(ss) });
    }

    if (action === 'addMany') {
      const books = Array.isArray(payload.books) ? payload.books : [];
      books.forEach(b => {
        if (!b || !b.isbn) return;
        removeBookmarkByIsbn(ss, b.isbn);
        const nextRow = bmSheet.getLastRow() + 1;
        bmSheet.getRange(nextRow, 1).setNumberFormat('@');
        bmSheet.getRange(nextRow, 1, 1, 7).setValues([[
          String(b.isbn || '').trim(), String(b.title || '').trim(), String(b.cover || '').trim(),
          String(b.keyword || '').trim(), String(b.memo || '').trim(), String(b.author || '').trim(), String(b.pubYear || '').trim()
        ]]);
      });
      return jsonResponse({ status: 'ok', bookmarks: readBookmarks(ss) });
    }

    return jsonResponse({ status: 'error', message: '알 수 없는 요청입니다.' });
  } catch (err) {
    return jsonResponse({ status: 'error', message: String(err) });
  } finally {
    lock.releaseLock();
  }
}

/* =========================================================
 * 매일 밤 도서관 정보나루 자동 보강 배치 (23:00 · 23:15 · 23:30 3회 분할)
 * - 방법 A (srchDtlList): G열 세부 분류(class_nm) + V열 풀 줄거리(description)
 * - 방법 B (keywordList): R열 핵심 키워드 태그(상위 5개)
 * - 하루 총 한도 500회 중 여유분 20회를 남긴 480회 기준으로,
 *   오늘 앱에서 이미 사용한 횟수 + 이전 배치 사용 횟수를 차감한 남은 한도만 자동 사용
 * - 1회 실행당 최대 180회(약 90권) 또는 4분 30초 경과 시 안전하게 커서 저장 후 종료
 *
 * [최초 1회 설치 / 시간 변경 시]
 *  Apps Script 편집기 상단에서 'installDailyEnrichTrigger' 선택 후 ▶ 실행
 * [처음(2행)부터 다시 돌리고 싶을 때]
 *  'resetDailyEnrichCursor' 선택 후 ▶ 실행
 * ========================================================= */
const DAILY_ENRICH_TOTAL_LIMIT = 480;       // 일일 500회 한도 중 안전 여유분 20회 확보
const DAILY_ENRICH_PER_RUN_MAX = 180;       // 1회 실행당 최대 API 호출(약 90권)
const DAILY_ENRICH_MAX_RUNTIME_MS = 270000; // 4분 30초 (6분 타임아웃 전 안전 종료)
const DAILY_ENRICH_CURSOR_KEY = 'D4L_ENRICH_LAST_ROW';
const DAILY_ENRICH_USAGE_KEY = 'D4L_ENRICH_DAILY_USAGE';

function installDailyEnrichTrigger() {
  const fnName = 'runDailyData4LibEnrich';
  ScriptApp.getProjectTriggers().forEach(t => {
    if (t.getHandlerFunction() === fnName) ScriptApp.deleteTrigger(t);
  });
  [0, 15, 30].forEach(minute => {
    ScriptApp.newTrigger(fnName)
      .timeBased()
      .everyDays(1)
      .atHour(23)
      .nearMinute(minute)
      .inTimezone('Asia/Seoul')
      .create();
  });
  Logger.log('매일 23:00 · 23:15 · 23:30(Asia/Seoul) 정보나루 자동 보강 트리거 3개가 설치되었습니다.');
}

function resetDailyEnrichCursor() {
  PropertiesService.getScriptProperties().setProperty(DAILY_ENRICH_CURSOR_KEY, '1');
  Logger.log('자동 보강 시작 위치를 2행으로 초기화했습니다.');
}

function fetchData4LibJsonServer_(endpoint, paramsObj) {
  const d4lKey = getSecret_('DATA4LIB_API_KEY');
  if (!d4lKey) throw new Error('DATA4LIB_API_KEY가 설정되지 않았습니다.');
  const qs = ['authKey=' + encodeURIComponent(d4lKey), 'format=json'];
  Object.keys(paramsObj || {}).forEach(k => {
    const v = String(paramsObj[k] || '').trim();
    if (v !== '') qs.push(encodeURIComponent(k) + '=' + encodeURIComponent(v));
  });
  const url = 'https://data4library.kr/api/' + endpoint + '?' + qs.join('&');
  const res = UrlFetchApp.fetch(url, { method: 'get', muteHttpExceptions: true });
  if (res.getResponseCode() !== 200) return null;
  try {
    return JSON.parse(res.getContentText() || '{}');
  } catch (e) {
    return null;
  }
}

function cleanKdcCategoryServer_(raw) {
  const s = String(raw || '').trim();
  if (!s) return '';
  return s.replace(/^(?:KDC\s*)?[0-9]+(?:\.[0-9]+)?\s*(?:[·•:|\-/]\s*)?/i, '').trim();
}

function getTodayBatchUsage_(props, todayStr) {
  try {
    const raw = props.getProperty(DAILY_ENRICH_USAGE_KEY);
    if (raw) {
      const obj = JSON.parse(raw);
      if (obj && obj.date === todayStr && typeof obj.count === 'number') return obj.count;
    }
  } catch (e) {}
  return 0;
}

function runDailyData4LibEnrich() {
  const startedAt = Date.now();
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const sheet = ss.getSheetByName(LIBRARY_SHEET_NAME);
  if (!sheet) return;

  const lastRow = sheet.getLastRow();
  if (lastRow < 2) return;

  const props = PropertiesService.getScriptProperties();
  let startRow = Number(props.getProperty(DAILY_ENRICH_CURSOR_KEY) || '1') + 1;
  if (startRow < 2 || startRow > lastRow) {
    Logger.log('모든 행 처리가 이미 완료되었습니다. 처음부터 다시 실행하려면 resetDailyEnrichCursor()를 실행하세요.');
    return;
  }

  // 오늘 이미 사용한 API 호출 수 계산 (앱 사용량 + 오늘 이전 배치 사용량)
  const todayStr = Utilities.formatDate(new Date(), 'Asia/Seoul', 'yyyy-MM-dd');
  let appUsedToday = 0;
  try {
    const syncState = readSyncState(ss);
    if (syncState && syncState.apiUsage && syncState.apiUsage.date === todayStr && typeof syncState.apiUsage.count === 'number') {
      appUsedToday = syncState.apiUsage.count;
    }
  } catch (e) {}
  const batchUsedToday = getTodayBatchUsage_(props, todayStr);
  const remainingDailyBudget = Math.max(0, DAILY_ENRICH_TOTAL_LIMIT - appUsedToday - batchUsedToday);
  const runBudget = Math.min(DAILY_ENRICH_PER_RUN_MAX, remainingDailyBudget);

  if (runBudget < 2) {
    Logger.log('오늘 정보나루 남은 한도가 부족해 보강을 건너뜁니다. (앱=' + appUsedToday + ', 배치=' + batchUsedToday + ', 총한도=' + DAILY_ENRICH_TOTAL_LIMIT + ')');
    return;
  }

  const values = sheet.getRange(startRow, 1, lastRow - startRow + 1, LIBRARY_HEADERS.length).getValues();
  let apiCalls = 0;
  let updatedCount = 0;
  let lastProcessedRow = startRow - 1;
  let stoppedByTime = false;

  for (let i = 0; i < values.length; i++) {
    if (apiCalls + 2 > runBudget) break;
    if (Date.now() - startedAt >= DAILY_ENRICH_MAX_RUNTIME_MS) {
      stoppedByTime = true;
      break;
    }
    const rowNum = startRow + i;
    const r = values[i];
    const isbn = normalizeIsbnServer_(r[5]); // F열: ISBN
    lastProcessedRow = rowNum;

    if (isbn.length !== 10 && isbn.length !== 13) continue;

    // 방법 A: srchDtlList -> 세부 분류(G열) + 풀 줄거리(V열)
    let newKdc = '';
    let newDesc = '';
    try {
      const dtl = fetchData4LibJsonServer_('srchDtlList', { isbn13: isbn, loaninfoYN: 'N' });
      apiCalls++;
      const bk = dtl && dtl.response && dtl.response.detail && dtl.response.detail[0] && dtl.response.detail[0].book;
      if (bk) {
        newKdc = cleanKdcCategoryServer_(bk.class_nm || '');
        newDesc = stripHtmlServer_(bk.description || '').slice(0, 4500);
      }
    } catch (e) {}

    // 방법 B: keywordList -> 핵심 키워드 태그(R열, 상위 5개)
    let newTags = '';
    try {
      const kwData = fetchData4LibJsonServer_('keywordList', { isbn13: isbn, additionalYN: 'N' });
      apiCalls++;
      const items = kwData && kwData.response && kwData.response.items;
      if (Array.isArray(items) && items.length > 0) {
        const words = [];
        for (let w = 0; w < items.length && words.length < 5; w++) {
          const word = String(items[w] && items[w].item && items[w].item.word || '').trim();
          if (word && words.indexOf(word) === -1) words.push(word);
        }
        newTags = words.join(', ');
      }
    } catch (e) {}

    let rowChanged = false;
    if (newKdc) {
      sheet.getRange(rowNum, 7).setValue(newKdc); // G열: 분류
      rowChanged = true;
    }
    if (newTags) {
      sheet.getRange(rowNum, 18).setValue(newTags); // R열: 태그
      rowChanged = true;
    }
    if (newDesc) {
      sheet.getRange(rowNum, 22).setValue(newDesc); // V열: 줄거리
      rowChanged = true;
    }
    if (rowChanged) updatedCount++;

    Utilities.sleep(150);
  }

  props.setProperty(DAILY_ENRICH_CURSOR_KEY, String(lastProcessedRow));
  props.setProperty(DAILY_ENRICH_USAGE_KEY, JSON.stringify({ date: todayStr, count: batchUsedToday + apiCalls }));
  Logger.log(
    '정보나루 자동 보강 완료: 마지막 행=' + lastProcessedRow + '/' + lastRow +
    ', 갱신=' + updatedCount + '권, 이번 호출=' + apiCalls + '회 (오늘 누적 앱=' + appUsedToday + '+배치=' + (batchUsedToday + apiCalls) + '/' + DAILY_ENRICH_TOTAL_LIMIT + ')' +
    (stoppedByTime ? ' [4분30초 안전종료]' : '')
  );
}
