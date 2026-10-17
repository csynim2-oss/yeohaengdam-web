import { parseDate, validRange, inTrip, tripDays, dayNumber, monthCells, shiftMonth, addDays, todayISO, koreanDate, titlesForDate, validatePacking, newItem } from './trip-model.mjs';
import { TOOLS_CSS } from './styles.mjs';

const escapeHTML = value => String(value ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const editIcon = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="m16 3 5 5-12 12-6 1 1-6Z M14 5l5 5"/></svg>';
const deleteIcon = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 7h16 M9 7V4h6v3 M6 7l1 14h10l1-14 M10 10v7 M14 10v7"/></svg>';

/** 독립적인 Shadow DOM을 사용해 기존 앱의 레이아웃/모달 CSS를 변경하지 않습니다. */
export class YeohaengdamTripTools extends HTMLElement {
  static observedAttributes = ['view'];
  constructor() {
    super();
    this.attachShadow({mode:'open'});
    this._trip = null; this._itinerary = []; this._session = null;
    this._draft = ''; this._filter = 'all'; this._editing = null; this._editText = ''; this._undo = null;
    this._bulk = false; this._bulkText = ''; this._formError = ''; this._month = todayISO().slice(0,7); this._selected = todayISO();
    this.shadowRoot.addEventListener('click', e => this._click(e));
    this.shadowRoot.addEventListener('change', e => this._change(e));
    this.shadowRoot.addEventListener('input', e => this._input(e));
    this.shadowRoot.addEventListener('submit', e => this._submit(e));
    this.shadowRoot.addEventListener('keydown', e => this._key(e));
  }
  connectedCallback() { this._render(); }
  attributeChangedCallback() { this._render(); }
  get view() { return this.getAttribute('view') === 'calendar' ? 'calendar' : 'packing'; }
  set view(value) { this.setAttribute('view', value); }
  /** host가 계정 및 여행 ID와 저장 API를 넘겨야 합니다. 이메일·인증키를 하드코딩하지 않습니다. */
  async configure({trip, itinerary = [], scope, storage}) {
    if (!trip || typeof trip.id !== 'string' || !trip.id || typeof scope !== 'string' || !scope || !storage || typeof storage.load !== 'function' || typeof storage.save !== 'function') throw new Error('trip.id, scope, storage.load/save가 필요합니다.');
    const key = JSON.stringify([scope, trip.id]);
    const fresh = !this._session || this._session.key !== key || this._session.storage !== storage;
    const rangeChanged = !this._trip || this._trip.startDate !== trip.startDate || this._trip.endDate !== trip.endDate;
    this._trip = {...trip}; this._itinerary = Array.isArray(itinerary) ? itinerary.map(x => ({...x})) : [];
    if (fresh || (rangeChanged && !inTrip(this._selected, trip))) {
      this._selected = validRange(trip) ? trip.startDate : todayISO();
      this._month = this._selected.slice(0,7);
    }
    if (!fresh) { this._render(); return; }
    this._draft=''; this._filter='all'; this._editing=null; this._undo=null; this._bulk=false; this._bulkText=''; this._formError='';
    const session = {key, tripId:trip.id, storage, items:[], status:'loading', error:'', version:0, tail:Promise.resolve()};
    this._session = session; this._render();
    await this._load(session);
  }
  async _load(session) {
    session.status='loading'; session.error='';
    if (this._session === session) this._render();
    try { session.items=validatePacking(await session.storage.load(session.tripId)); session.status='saved'; }
    catch (error) { session.status='load-error'; session.error=error?.message || '준비물을 불러오지 못했습니다.'; }
    if (this._session === session) this._render();
  }
  _save() {
    const s=this._session;
    if (!s || ['loading','load-error'].includes(s.status)) return;
    const snapshot=s.items.map(x=>({...x})), version=++s.version;
    s.status='saving';s.error='';this._render();
    s.tail = s.tail.catch(()=>{}).then(()=>s.storage.save(s.tripId, snapshot)).then(()=>{
      if(s.version===version){s.status='saved';s.error='';}
    }).catch(error=>{
      if(s.version===version){s.status='save-error';s.error=error?.message||'저장하지 못했습니다.';}
    }).finally(()=>{if(this._session===s)this._render();});
    this.dispatchEvent(new CustomEvent('packing-change',{detail:{tripId:s.tripId,items:snapshot},bubbles:true,composed:true}));
  }
  _focus(selector) { this.shadowRoot.querySelector(selector)?.focus({preventScroll:true}); }
  _input(e) {
    if(e.target.id==='packing-add')this._draft=e.target.value;
    if(e.target.id==='packing-edit')this._editText=e.target.value;
    if(e.target.id==='packing-bulk')this._bulkText=e.target.value;
  }
  _change(e) {
    if(e.target.matches('input[data-check]')) {
      const item=this._session?.items.find(x=>x.id===e.target.dataset.check);
      if(!item || ['loading','load-error'].includes(this._session.status))return;
      item.checked=e.target.checked;this._save();
      this._focus(`input[data-check="${CSS.escape(item.id)}"]`);
    }
  }
  _submit(e) {
    const form=e.target.closest('form[data-form]');if(!form)return;e.preventDefault();
    const s=this._session;if(!s||['loading','load-error'].includes(s.status))return;
    this._formError='';
    try{
      if(form.dataset.form==='add') {
        const item=newItem(this._draft);if(s.items.length>=1000)throw new Error('한 여행에 최대 1,000개까지 적을 수 있습니다.');
        s.items=[...s.items,item];this._draft='';this._filter='all';this._save();this._focus('#packing-add');
      }else if(form.dataset.form==='edit'){
        const item=s.items.find(x=>x.id===this._editing);if(!item)return;
        item.text=newItem(this._editText).text;this._editing=null;this._save();
      }else if(form.dataset.form==='bulk'){
        const lines=this._bulkText.split(/\r?\n/).map(x=>x.trim()).filter(Boolean);
        if(!lines.length)throw new Error('준비물을 한 줄에 하나씩 적어 주세요.');
        const added=lines.map(newItem);if(s.items.length+added.length>1000)throw new Error('한 여행에 최대 1,000개까지 적을 수 있습니다.');
        s.items=[...s.items,...added];this._bulkText='';this._bulk=false;this._filter='all';this._save();
      }
    }catch(error){this._formError=error.message;this._render();}
  }
  _click(e){
    const btn=e.target.closest('button');if(!btn||btn.disabled)return;
    const action=btn.dataset.action, id=btn.dataset.id, s=this._session;
    if(btn.dataset.filter){this._filter=btn.dataset.filter;this._render();return;}
    if(btn.dataset.date){this._select(btn.dataset.date);return;}
    if(action==='previous'||action==='next'){this._month=shiftMonth(this._month,action==='next'?1:-1);this._render();return;}
    if(action==='start-month'){this._select(validRange(this._trip)?this._trip.startDate:todayISO());return;}
    if(action==='today'){this._select(todayISO());return;}
    if(!s)return;
    if(action==='retry-load'){this._load(s);return;}
    if(action==='retry-save'){this._save();return;}
    if(['loading','load-error'].includes(s.status))return;
    if(action==='edit'){const item=s.items.find(x=>x.id===id);if(item){this._editing=id;this._editText=item.text;this._render();this._focus('#packing-edit');}}
    if(action==='cancel-edit'){this._editing=null;this._render();}
    if(action==='delete'){
      const index=s.items.findIndex(x=>x.id===id);if(index<0)return;
      this._undo={item:{...s.items[index]},index};s.items=s.items.filter(x=>x.id!==id);this._save();
    }
    if(action==='undo'&&this._undo){
      if(s.items.length>=1000){this._formError='목록이 가득 차서 복원할 수 없습니다.';this._render();return;}
      s.items.splice(Math.min(this._undo.index,s.items.length),0,this._undo.item);this._undo=null;this._save();
    }
    if(action==='bulk'){this._bulk=!this._bulk;this._render();if(this._bulk)this._focus('#packing-bulk');}
  }
  _select(date, focus=false){
    if(!parseDate(date))return;this._selected=date;this._month=date.slice(0,7);this._render();
    if(focus)this._focus(`[data-date="${date}"]`);
    this.dispatchEvent(new CustomEvent('trip-date-select',{detail:{tripId:this._trip?.id,date,titles:titlesForDate(this._itinerary,date)},bubbles:true,composed:true}));
  }
  _key(e){
    const date=e.target.dataset?.date;if(!date||!parseDate(date))return;
    let target;const delta={ArrowLeft:-1,ArrowRight:1,ArrowUp:-7,ArrowDown:7}[e.key];
    if(delta)target=addDays(date,delta);
    if(e.key==='Home')target=addDays(date,-parseDate(date).getUTCDay());
    if(e.key==='End')target=addDays(date,6-parseDate(date).getUTCDay());
    if(e.key==='PageUp'||e.key==='PageDown')target=shiftMonth(date.slice(0,7),e.key==='PageDown'?1:-1)+'-01';
    if(target){e.preventDefault();this._select(target,true);}
  }
  _status(){
    const s=this._session;if(!s)return '';
    if(s.status==='loading')return '<div class="status" role="status">준비물 목록을 불러오는 중입니다…</div>';
    if(s.status==='load-error')return `<div class="status error" role="alert">불러오기 실패: ${escapeHTML(s.error)}<br>기존 데이터를 보호하기 위해 편집을 잠시 막았습니다. <button class="text-button" data-action="retry-load">다시 불러오기</button></div>`;
    if(s.status==='save-error')return `<div class="status error" role="alert">아직 저장되지 않았습니다. ${escapeHTML(s.error)}<br>현재 입력은 화면에 남아 있습니다. 창을 닫기 전에 <button class="text-button" data-action="retry-save">다시 저장</button>해 주세요.</div>`;
    return `<div class="status" role="status">${s.status==='saving'?'저장 중…':`✓ ${escapeHTML(s.storage.label||'저장됨')}`}</div>`;
  }
  _packing(){
    const s=this._session, items=s.items, checked=items.filter(x=>x.checked).length, disabled=['loading','load-error'].includes(s.status)?'disabled':'';
    const list=items.filter(x=>this._filter==='all'||(this._filter==='checked'?x.checked:!x.checked));
    return `<div class="heading"><p class="eyebrow">BEFORE THE JOURNEY</p><h2>준비물 챙기기</h2><p class="description">챙길 물건을 직접 적고, 가방에 넣었다면 체크하세요.</p><div class="trip-chip">${escapeHTML(this._trip.title||'나의 여행')} · 여행별 준비물</div></div>
      <section class="panel" aria-label="준비 현황"><div class="row between"><div><h3 class="section-title">가벼운 마음으로 떠나요.</h3><span class="muted">${items.length?`${items.length-checked}개만 더 챙기면 준비 끝`:'나에게 필요한 준비물을 적어보세요'}</span></div><div class="count">${checked}<small> / ${items.length}개</small></div></div><div class="progress" role="progressbar" aria-label="준비물 완료율" aria-valuemin="0" aria-valuemax="100" aria-valuenow="${items.length?Math.round(checked/items.length*100):0}"><span style="width:${items.length?checked/items.length*100:0}%"></span></div>${this._status()}</section>
      <section class="panel" aria-label="준비물 목록"><form data-form="add"><label class="label" for="packing-add">어떤 준비물을 챙길까요?</label><div class="add-row"><input id="packing-add" type="text" maxlength="120" value="${escapeHTML(this._draft)}" placeholder="예: 충전기, 여벌 옷, 우산" autocomplete="off" ${disabled}><button class="button primary" type="submit" ${disabled}>＋ 추가</button></div></form><div class="form-footer"><span class="muted" style="font-size:11px">직접 적은 항목만 저장됩니다.</span><button class="text-button" data-action="bulk" ${disabled}>여러 개 한 번에 적기</button></div>
      ${this._bulk?`<form class="bulk" data-form="bulk"><label class="label" for="packing-bulk">한 줄에 하나씩 적어 주세요</label><textarea id="packing-bulk" maxlength="120000" placeholder="충전기&#10;여벌 옷&#10;우산">${escapeHTML(this._bulkText)}</textarea><div class="bulk-actions"><button class="button" type="button" data-action="bulk">취소</button><button class="button primary" type="submit">목록에 추가</button></div></form>`:''}
      ${this._formError?`<div class="error-text" role="alert">${escapeHTML(this._formError)}</div>`:''}
      <div class="filters" aria-label="준비물 보기">${[['all','전체',items.length],['unchecked','아직 안 챙김',items.length-checked],['checked','챙김 완료',checked]].map(([key,text,n])=>`<button class="filter ${this._filter===key?'active':''}" data-filter="${key}" aria-pressed="${this._filter===key}">${text} ${n}</button>`).join('')}</div>
      <ul class="packing-list">${list.map(item=>this._editing===item.id?`<li class="packing-row"><form class="edit-form" data-form="edit"><label class="sr-only" for="packing-edit">준비물 이름 수정</label><input id="packing-edit" type="text" maxlength="120" value="${escapeHTML(this._editText)}"><button class="button small primary" type="submit">저장</button><button class="text-button" type="button" data-action="cancel-edit">취소</button></form></li>`:`<li class="packing-row ${item.checked?'checked':''}"><label class="item-check"><input type="checkbox" data-check="${escapeHTML(item.id)}" ${item.checked?'checked':''} ${disabled}><span class="item-text">${escapeHTML(item.text)}</span></label><div class="item-actions"><button class="icon-button" data-action="edit" data-id="${escapeHTML(item.id)}" aria-label="${escapeHTML(item.text)} 수정" ${disabled}>${editIcon}</button><button class="icon-button" data-action="delete" data-id="${escapeHTML(item.id)}" aria-label="${escapeHTML(item.text)} 삭제" ${disabled}>${deleteIcon}</button></div></li>`).join('')}</ul>
      ${!list.length?`<div class="empty"><div class="empty-mark" aria-hidden="true">✓</div><strong>${items.length?'해당하는 준비물이 없습니다.':'아직 적은 준비물이 없어요.'}</strong>${items.length?'위의 다른 분류를 눌러보세요.':'위 입력창에 한 가지씩 적어보세요.<br>준비한 물건은 체크로 표시할 수 있어요.'}</div>`:''}
      ${this._undo?`<div class="undo"><span>“${escapeHTML(this._undo.item.text)}” 삭제됨</span><button class="text-button" data-action="undo">삭제 취소</button></div>`:''}</section>`;
  }
  _calendar(){
    const trip=this._trip, valid=validRange(trip), cells=monthCells(this._month), titles=inTrip(this._selected,trip)?titlesForDate(this._itinerary,this._selected):[];
    const [year,month]=this._month.split('-').map(Number), number=dayNumber(this._selected,trip);
    const selectedInMonth=this._selected.slice(0,7)===this._month;
    return `<div class="heading"><p class="eyebrow">YOUR DAYS, AT A GLANCE</p><h2>여행 달력</h2><p class="description">여행하는 날을 한눈에 보고, 날짜를 눌러 코스를 확인하세요.</p><div class="trip-chip">${valid?`${koreanDate(trip.startDate)} — ${koreanDate(trip.endDate)} · ${tripDays(trip)}일`:'여행 기간을 먼저 설정해 주세요'}</div></div>
      ${!valid?'<div class="warn">여행 계획에서 올바른 출발일과 마지막 날을 입력하면 해당 기간이 달력에 강조됩니다.</div>':''}
      <section class="panel" aria-label="여행 기간 달력"><div class="calendar-head"><h3 class="month-title" aria-live="polite">${year}년 ${month}월</h3><div class="month-controls"><button class="month-btn" data-action="previous" aria-label="이전 달" ${this._month==='1900-01'?'disabled':''}>‹</button><button class="month-btn" data-action="next" aria-label="다음 달" ${this._month==='2199-12'?'disabled':''}>›</button></div></div><div class="cal-links"><button class="text-button" data-action="start-month">여행 시작월로</button><button class="text-button" data-action="today">오늘</button></div><div class="legend" style="margin-bottom:16px"><span><i class="swatch"></i>여행 기간</span><span><i class="swatch selected"></i>선택한 날짜</span><span>• 일정 있음</span></div>
      <div class="week-head" aria-hidden="true">${['일','월','화','수','목','금','토'].map(x=>`<div>${x}</div>`).join('')}</div>
      <div class="calendar-grid" role="group" aria-label="${year}년 ${month}월 날짜, 방향키로 이동">${cells.map(c=>{
        const active=c.iso===this._selected, isTrip=inTrip(c.iso,trip), count=titlesForDate(this._itinerary,c.iso).length;
        return `<button class="date-btn ${!c.currentMonth?'other':''} ${c.weekday===0?'sunday':''} ${isTrip?'trip':''} ${active?'selected':''} ${c.iso===todayISO()?'today':''}" data-date="${c.iso}" ${parseDate(c.iso)?'':'disabled'} aria-pressed="${active}" aria-label="${koreanDate(c.iso,true)}${isTrip?', 여행 기간':''}${isTrip&&count?`, 주요 일정 ${count}개`:''}" ${c.iso===todayISO()?'aria-current="date"':''} tabindex="${active||(!selectedInMonth&&c.day===1&&c.currentMonth)?'0':'-1'}"><span>${c.day}</span><span class="dot ${isTrip&&count?'':'no'}" aria-hidden="true"></span></button>`;
      }).join('')}</div><p class="cal-footnote">출발일부터 마지막 날까지 모두 표시합니다. 기간을 바꾸면 달력도 함께 바뀝니다.</p></section>
      <section class="panel summary" aria-live="polite" aria-atomic="true" aria-label="선택한 날짜의 주요 일정"><p class="eyebrow">SELECTED DAY</p><h3 class="summary-date">${koreanDate(this._selected,true)}</h3>${number?`<span class="day-chip">DAY ${String(number).padStart(2,'0')} · 여행 ${number}일차</span>`:''}<p class="section-title">이날의 주요 일정</p>
      ${titles.length?`<ol class="title-list">${titles.map(x=>`<li>${escapeHTML(x)}</li>`).join('')}</ol>`:`<div class="no-schedule">${number?'아직 등록된 일정이 없습니다.':'선택한 날짜는 여행 기간에 포함되지 않습니다.'}</div>`}
      <p class="sync-note">여행 계획의 대표 일정과 자동으로 연동됩니다. 주소·시간·긴 설명 없이 제목만 보여드립니다.</p></section>`;
  }
  _render(){
    if(!this.shadowRoot)return;
    // 비동기 저장 상태 변경이 입력 중인 커서/포커스를 빼앗지 않도록 보존합니다.
    const focused=this.shadowRoot.activeElement;
    const focusId=focused?.id, selection=focused&&typeof focused.selectionStart==='number'?[focused.selectionStart,focused.selectionEnd]:null;
    const focusDate=focused?.dataset?.date, focusCheck=focused?.dataset?.check;
    this.shadowRoot.innerHTML=`<style>${TOOLS_CSS}</style>${this._trip&&this._session?(this.view==='calendar'?this._calendar():this._packing()):'<div class="context-empty">먼저 여행을 선택해 주세요.</div>'}`;
    let restore=focusId?this.shadowRoot.getElementById(focusId):focusDate?this.shadowRoot.querySelector(`[data-date="${focusDate}"]`):focusCheck?this.shadowRoot.querySelector(`input[data-check="${CSS.escape(focusCheck)}"]`):null;
    if(restore){restore.focus({preventScroll:true});if(selection&&typeof restore.setSelectionRange==='function')restore.setSelectionRange(...selection);}
  }
}
if(!customElements.get('yeohaengdam-trip-tools')) customElements.define('yeohaengdam-trip-tools',YeohaengdamTripTools);
