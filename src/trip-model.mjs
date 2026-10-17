/** 여행 날짜는 시각이 아닌 YYYY-MM-DD로 보관합니다. */
export function parseDate(value) {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return null;
  const [y, m, d] = value.split('-').map(Number);
  if (y < 1900 || y > 2199) return null;
  const date = new Date(Date.UTC(y, m - 1, d));
  return date.getUTCFullYear() === y && date.getUTCMonth() === m - 1 && date.getUTCDate() === d ? date : null;
}
export function isoDate(date) { return date.toISOString().slice(0, 10); }
export function addDays(value, amount) {
  const date = parseDate(value);
  if (!date || !Number.isInteger(amount)) return null;
  date.setUTCDate(date.getUTCDate() + amount);
  return isoDate(date);
}
export function validRange(trip) {
  return !!(trip && parseDate(trip.startDate) && parseDate(trip.endDate) && trip.endDate >= trip.startDate);
}
export function inTrip(date, trip) {
  return !!(parseDate(date) && validRange(trip) && date >= trip.startDate && date <= trip.endDate);
}
export function tripDays(trip) {
  return validRange(trip) ? Math.round((parseDate(trip.endDate) - parseDate(trip.startDate)) / 86400000) + 1 : 0;
}
export function dayNumber(date, trip) {
  return inTrip(date, trip) ? Math.round((parseDate(date) - parseDate(trip.startDate)) / 86400000) + 1 : null;
}
export function monthCells(month) {
  const first = parseDate(month + '-01');
  if (!first) return [];
  const start = new Date(first);
  start.setUTCDate(start.getUTCDate() - start.getUTCDay());
  return Array.from({ length: 42 }, (_, index) => {
    const cellDate = new Date(start);
    cellDate.setUTCDate(cellDate.getUTCDate() + index);
    const iso = isoDate(cellDate);
    return { iso, day: Number(iso.slice(-2)), currentMonth: iso.slice(0, 7) === month, weekday: index % 7 };
  });
}
export function shiftMonth(month, delta) {
  const date = parseDate(month + '-01');
  if (!date) return null;
  date.setUTCMonth(date.getUTCMonth() + delta);
  return date.getUTCFullYear() >= 1900 && date.getUTCFullYear() <= 2199 ? isoDate(date).slice(0, 7) : month;
}
export function todayISO() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;
}
export function koreanDate(iso, year = false) {
  const d = parseDate(iso);
  if (!d) return '날짜 미정';
  const days = ['일','월','화','수','목','금','토'];
  return `${year ? d.getUTCFullYear()+'년 ' : ''}${d.getUTCMonth()+1}월 ${d.getUTCDate()}일 (${days[d.getUTCDay()]})`;
}
/** 대표 일정이 지정된 날짜는 대표 항목만, 미지정 날짜는 모든 일정의 제목을 방문 순서로 반환. */
export function titlesForDate(itinerary, date) {
  const items = (Array.isArray(itinerary) ? itinerary : []).filter(x => x && x.date === date && typeof x.title === 'string' && x.title.trim() && x.cancelled !== true);
  const featured = items.filter(x => x.isFeatured === true);
  const chosen = featured.length ? featured : items;
  const sorted = [...chosen].sort((a,b) => {
    const oa = Number.isFinite(a.order) ? a.order : Infinity;
    const ob = Number.isFinite(b.order) ? b.order : Infinity;
    if (oa !== ob) return oa - ob;
    return String(a.startTime || '99:99').localeCompare(String(b.startTime || '99:99'), 'en');
  });
  const seen = new Set();
  return sorted.map(x => x.title.trim()).filter(x => !seen.has(x) && seen.add(x));
}
export function validatePacking(items) {
  if (!Array.isArray(items)) throw new Error('준비물 목록 형식이 올바르지 않습니다.');
  if (items.length > 1000) throw new Error('준비물은 여행별로 최대 1,000개까지 저장할 수 있습니다.');
  const seen = new Set();
  return items.map(x => {
    if (!x || typeof x.id !== 'string' || !x.id || seen.has(x.id) || typeof x.text !== 'string' || !x.text.trim() || x.text.trim().length > 120 || typeof x.checked !== 'boolean') throw new Error('저장된 준비물 항목을 읽을 수 없습니다. 원본 저장 데이터는 변경하지 않았습니다.');
    seen.add(x.id);
    return { id:x.id, text:x.text.trim(), checked:x.checked };
  });
}
export function newItem(text) {
  if (typeof text !== 'string' || !text.trim() || text.trim().length > 120) throw new Error('준비물 이름을 1~120자로 적어 주세요.');
  return { id: globalThis.crypto?.randomUUID?.() || `item-${Date.now()}-${Math.random().toString(36).slice(2)}`, text:text.trim(), checked:false };
}
export function storageKey(scope, id) {
  if (typeof scope !== 'string' || !scope || typeof id !== 'string' || !id) throw new Error('사용자 구분값과 여행 ID가 필요합니다.');
  return `yeohaengdam:packing:v1:${encodeURIComponent(scope)}:${encodeURIComponent(id)}`;
}
/** 미리보기용. 실제 앱은 로그인한 사용자의 서버 저장 어댑터로 바꾸세요. */
export function createLocalPackingStorage(scope, store = globalThis.localStorage) {
  return {
    label: '이 브라우저에 저장',
    async load(tripId) {
      const raw = store.getItem(storageKey(scope, tripId));
      return raw ? validatePacking(JSON.parse(raw)) : [];
    },
    async save(tripId, items) {
      const clean = validatePacking(items);
      store.setItem(storageKey(scope, tripId), JSON.stringify(clean));
    }
  };
}
