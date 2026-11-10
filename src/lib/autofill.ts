// 자동입력 코드(클립보드용)와 북마클릿.
// 북마클릿은 교사의 브라우저에서 대학 페이지 위에 직접 실행되며, 외부로 아무것도 전송하지 않습니다.

export const AUTOFILL_PREFIX = 'ADMCHK1:';

export interface AutofillPayload {
  e: string; // 수험번호
  n: string; // 이름
  b: string; // 생년월일 YYYYMMDD
  p: string; // 핸드폰 숫자
}

export function encodePayload(p: AutofillPayload): string {
  const bytes = new TextEncoder().encode(JSON.stringify(p));
  let bin = '';
  bytes.forEach((x) => (bin += String.fromCharCode(x)));
  return AUTOFILL_PREFIX + btoa(bin);
}

/* eslint-disable @typescript-eslint/no-explicit-any */
// ⚠️ 이 함수는 toString() 으로 북마클릿이 되므로 바깥 변수/모듈을 참조하면 안 됩니다.
function admchkAutofill() {
  var PREFIX = 'ADMCHK1:';
  var LABEL: Record<string, string> = { e: '수험번호', n: '이름', b: '생년월일', p: '핸드폰' };

  function toast(html: string, ok: boolean) {
    var old = document.getElementById('admchk-toast');
    if (old) old.remove();
    var box = document.createElement('div');
    box.id = 'admchk-toast';
    box.setAttribute(
      'style',
      'position:fixed;z-index:2147483647;top:16px;right:16px;max-width:360px;padding:14px 16px;border-radius:12px;' +
        'font:14px/1.5 system-ui,sans-serif;color:#fff;box-shadow:0 8px 24px rgba(0,0,0,.25);background:' +
        (ok ? '#1e40af' : '#b91c1c'),
    );
    box.innerHTML = html + '<div style="margin-top:6px;opacity:.75;font-size:12px">클릭하면 닫힙니다</div>';
    box.onclick = function () {
      box.remove();
    };
    document.body.appendChild(box);
    setTimeout(function () {
      box.remove();
    }, 9000);
  }

  function decode(t: string | null): any {
    t = (t || '').trim();
    if (t.indexOf(PREFIX) !== 0) return null;
    try {
      var bin = atob(t.slice(PREFIX.length));
      var bytes = new Uint8Array(bin.length);
      for (var i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
      return JSON.parse(new TextDecoder().decode(bytes));
    } catch (_) {
      return null;
    }
  }

  function txt(el: Element | null | undefined): string {
    return el ? (el.textContent || '').replace(/\s+/g, '') : '';
  }

  function classifyText(t: string): string | null {
    t = (t || '').toLowerCase();
    if (!t) return null;
    if (/검색|search|query|보호자|학부모|부모|아이디|userid|login|captcha|보안문자|인증번호/.test(t)) return 'x';
    if (/수험|접수번호|exam|suhum|suheom|soohum|rcpt|applno|applyno/.test(t)) return 'e';
    if (/생년|생일|birth|brth|jumin|주민/.test(t)) return 'b';
    if (/휴대|핸드폰|전화|연락처|phone|mobile|cellno|(^|[^a-z])(hp|tel)/.test(t)) return 'p';
    if (/성명|이름|name|(^|[^a-z])nm($|[^a-z])|kornm/.test(t)) return 'n';
    return null;
  }

  function sources(el: any): string[] {
    var out: string[] = [];
    out.push([el.name, el.id, el.placeholder, el.title, el.getAttribute('aria-label')].join(' '));
    if (el.id) {
      try {
        out.push(txt(el.ownerDocument.querySelector('label[for="' + el.id.replace(/"/g, '') + '"]')));
      } catch (_) {
        /* 무시 */
      }
    }
    out.push(txt(el.closest('label')));
    var prev = el.previousElementSibling;
    if (prev && /^(LABEL|SPAN|STRONG|B|EM|DT|P)$/.test(prev.tagName)) out.push(txt(prev));
    var cell = el.closest('td,th,dd,li,div');
    if (cell) {
      var ps = cell.previousElementSibling;
      if (ps) out.push(txt(ps));
    }
    var tr = el.closest('tr');
    if (tr) out.push(txt(tr.querySelector('th')));
    return out;
  }

  function classify(el: any): string | null {
    var s = sources(el);
    for (var i = 0; i < s.length; i++) {
      var c = classifyText(s[i]);
      if (c) return c === 'x' ? null : c;
    }
    return null;
  }

  function visible(el: any) {
    return !!(el.offsetWidth || el.offsetHeight || el.getClientRects().length) && !el.disabled && !el.readOnly;
  }

  function collect(doc: Document, out: any[]) {
    var list = doc.querySelectorAll('input,select');
    for (var i = 0; i < list.length; i++) {
      var el: any = list[i];
      var type = (el.type || '').toLowerCase();
      if (el.tagName === 'INPUT' && ['', 'text', 'tel', 'number', 'password', 'search'].indexOf(type) < 0) continue;
      if (visible(el)) out.push(el);
    }
    var frames = doc.querySelectorAll('iframe,frame');
    for (var j = 0; j < frames.length; j++) {
      try {
        var d = (frames[j] as HTMLIFrameElement).contentDocument;
        if (d) collect(d, out);
      } catch (_) {
        /* 다른 도메인 프레임은 건너뜀 */
      }
    }
  }

  function setVal(el: any, v: string) {
    var win = el.ownerDocument.defaultView || window;
    var proto = el.tagName === 'SELECT' ? win.HTMLSelectElement.prototype : win.HTMLInputElement.prototype;
    var desc = Object.getOwnPropertyDescriptor(proto, 'value');
    if (desc && desc.set) desc.set.call(el, v);
    else el.value = v;
    el.dispatchEvent(new Event('input', { bubbles: true }));
    el.dispatchEvent(new Event('change', { bubbles: true }));
    el.style.outline = '3px solid #3b82f6';
    el.style.outlineOffset = '1px';
  }

  function fill(el: any, v: string): boolean {
    if (!v) return false;
    if (el.tagName === 'SELECT') {
      var norm = function (s: string) {
        return (s || '').replace(/\D/g, '').replace(/^0+/, '');
      };
      for (var i = 0; i < el.options.length; i++) {
        var o = el.options[i];
        if (o.value === v || norm(o.value) === norm(v) || norm(o.text) === norm(v)) {
          setVal(el, o.value);
          return true;
        }
      }
      return false;
    }
    var max = el.maxLength > 0 ? el.maxLength : 999;
    if (v.length > max) v = v.slice(0, max);
    setVal(el, v);
    return true;
  }

  function hint(el: any): string {
    return [el.placeholder, el.title, sources(el).join(' ')].join(' ').toLowerCase();
  }

  function run(text: string | null) {
    var d = decode(text);
    if (!d) {
      toast('자동입력 코드를 찾지 못했습니다.<br>조회 도우미에서 <b>[조회]</b> 또는 <b>[자동입력]</b> 버튼을 누른 뒤 다시 시도해 주세요.', false);
      return;
    }
    var els: any[] = [];
    collect(document, els);
    var g: Record<string, any[]> = { e: [], n: [], b: [], p: [] };
    els.forEach(function (el) {
      var c = classify(el);
      if (c && g[c]) g[c].push(el);
    });
    var done: Record<string, boolean> = {};

    if (g.e[0]) done.e = fill(g.e[0], d.e);
    if (g.n[0]) done.n = fill(g.n[0], d.n);

    var b: string = d.b || '';
    if (g.b.length >= 3 && b.length === 8) {
      done.b = fill(g.b[0], b.slice(0, 4)) && fill(g.b[1], b.slice(4, 6)) && fill(g.b[2], b.slice(6));
    } else if (g.b[0]) {
      var el = g.b[0];
      var h = hint(el);
      var eight = el.maxLength >= 8 || /yyyymmdd|8자리|\d{8}|\d{4}[-.]\d{2}/.test(h);
      if (/\d{4}-\d{2}-\d{2}|yyyy-mm-dd/.test(h) && b.length === 8) done.b = fill(el, b.slice(0, 4) + '-' + b.slice(4, 6) + '-' + b.slice(6));
      else done.b = fill(el, b.length === 8 && !eight ? b.slice(2) : b);
    }

    var p: string = d.p || '';
    if (p && g.p.length) {
      var parts = [p.slice(0, 3), p.slice(3, p.length - 4), p.slice(p.length - 4)];
      if (g.p.length >= 3) {
        done.p = fill(g.p[0], parts[0]) && fill(g.p[1], parts[1]) && fill(g.p[2], parts[2]);
      } else if (g.p.length === 2) {
        var first = g.p[0];
        if (first.tagName === 'SELECT' || first.maxLength === 3) done.p = fill(first, parts[0]) && fill(g.p[1], parts[1] + parts[2]);
        else done.p = fill(first, parts[1]) && fill(g.p[1], parts[2]);
      } else {
        var pe = g.p[0];
        var withDash = pe.maxLength === 13 || /-/.test(pe.placeholder || '');
        done.p = fill(pe, withDash ? parts.join('-') : p);
      }
    }

    // 개인정보가 클립보드에 남지 않도록 비웁니다.
    try {
      navigator.clipboard.writeText('').catch(function () {});
    } catch (_) {
      /* 무시 */
    }

    var keys = ['e', 'n', 'b', 'p'];
    var any = false;
    var lines = keys
      .filter(function (k) {
        return (k !== 'p' || p) && (k !== 'b' || b);
      })
      .map(function (k) {
        if (done[k]) any = true;
        return (done[k] ? '✅ ' : '⬜ ') + LABEL[k] + (done[k] ? '' : ' — 직접 입력');
      });
    toast(
      '<b>' +
        d.n.replace(/[<>&]/g, '') +
        ' 자동입력</b><br>' +
        lines.join('<br>') +
        '<br><span style="font-size:12px">입력값을 확인한 뒤 조회 버튼은 직접 눌러 주세요.</span>',
      any,
    );
  }

  function ask() {
    run(window.prompt('조회 도우미에서 복사한 자동입력 코드를 붙여넣어 주세요 (Ctrl+V)'));
  }

  try {
    if (navigator.clipboard && navigator.clipboard.readText) {
      navigator.clipboard.readText().then(function (t) {
        if (decode(t)) run(t);
        else ask();
      }, ask);
    } else ask();
  } catch (_) {
    ask();
  }
}

export const BOOKMARKLET_HREF = 'javascript:' + encodeURIComponent('(' + admchkAutofill.toString() + ')();void 0');
