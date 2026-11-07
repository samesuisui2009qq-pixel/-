// ==UserScript==
// @name         鸟类术语翻译助手 (Bird Term Translator)
// @namespace    https://local/bird-terms
// @version      1.0.0
// @description  在浏览器整页翻译前把鸟类英文名替换为占位符，翻译后还原为《懂鸟/郑四版》中文名；学名与 ad./juv. 等缩写受保护。配合 Chrome/Edge 自带翻译，全程免费。
// @author       local
// @match        *://*/*
// @grant        GM_getValue
// @grant        GM_setValue
// @grant        GM_registerMenuCommand
// @grant        GM_xmlhttpRequest
// @connect      *
// @run-at       document-idle
// @noframes
// ==/UserScript==

(function () {
  'use strict';

  const A = 'Zq', B = 'Qz';              // 占位符边界，纯字母数字，机翻不易破坏
  const TOKEN_RE = /Zq\s?([0-9a-z]{1,7})\s?Qz/gi;

  const DEFAULTS = {
    enabled: true,
    glossaryUrl: '',
    protectItalicLatin: true,
    minLen: 4,
  };
  const cfg = { ...DEFAULTS };
  try {
    Object.assign(cfg, JSON.parse(GM_getValue('birdcfg', '{}')));
  } catch (e) {}
  const saveCfg = () => GM_setValue('birdcfg', JSON.stringify(cfg));

  // ---------- 保护词（不翻译，原样保留） ----------
  const PROTECT = new Set([
    'ad.', 'juv.', 'imm.', 'subad.', 'ad', 'juv', 'imm',
    '1st-w.', '2nd-w.', '3rd-w.', '1st-winter', '2nd-winter', '3rd-winter',
    '1st-summer', '2nd-summer', '1st-year', '2nd-year',
    'sp.', 'ssp.', 'cf.', 'aff.', 'nom.', 'spp.', 'ex.', 'sensu', 'auct.',
    '♂', '♀', 'l.', 'w.', 'ws.', 'cm', 'mm', 'km', 'g',
  ]);

  // ---------- 词库 ----------
  let GLOSS = {};        // lower english -> chinese
  let INDEX = new Map(); // first word lower -> [name...]
  let NAME_RE = null;
  let tokens = new Map(); // id -> {zh, keep}
  let seq = 1;

  function buildIndex() {
    INDEX = new Map();
    const names = Object.keys(GLOSS).filter(n => n.length >= cfg.minLen);
    names.sort((a, b) => b.length - a.length);
    for (const n of names) {
      const m = n.match(/^[a-z][a-z'’-]*/);
      const first = m ? m[0] : n;
      if (!INDEX.has(first)) INDEX.set(first, []);
      INDEX.get(first).push(n);
    }
  }

  function loadGlossary(obj) {
    GLOSS = {};
    for (const k of Object.keys(obj || {})) {
      const kk = k.trim().toLowerCase();
      const vv = String(obj[k] || '').trim();
      if (kk.length >= 2 && vv) GLOSS[kk] = vv;
    }
    buildIndex();
    GM_setValue('birdgloss', JSON.stringify(GLOSS));
    toast(`词库已载入：${Object.keys(GLOSS).length} 条`);
  }

  function initGlossary() {
    const raw = GM_getValue('birdgloss', '');
    if (raw) {
      try { GLOSS = JSON.parse(raw); buildIndex(); } catch (e) {}
    }
    if (!Object.keys(GLOSS).length) {
      toast('未载入词库：请用右上角菜单「导入词库 JSON」', 6000);
    }
    if (cfg.glossaryUrl && !raw) fetchGlossary(cfg.glossaryUrl);
  }

  function fetchGlossary(url) {
    GM_xmlhttpRequest({
      method: 'GET', url,
      onload: r => {
        try { loadGlossary(JSON.parse(r.responseText)); } catch (e) { toast('词库下载失败'); }
      },
      onerror: () => toast('词库下载失败'),
    });
  }

  // ---------- 占位 ----------
  function tokenFor(text, keep) {
    const id = (seq++).toString(36);
    tokens.set(id, { zh: text, keep: !!keep });
    return A + id + B;
  }

  function isLatinBinom(s) {
    return /^[A-Z][a-z]+(?:\s+[a-z][a-z-]+){1,2}$/.test(s.trim());
  }

  function tokenizeText(txt, inItalic) {
    if (!txt || txt.length < 3 || !/[A-Za-z]/.test(txt)) return txt;
    if (txt.indexOf(A) !== -1 && txt.indexOf(B) !== -1) return txt; // 已处理

    let out = '', i = 0;
    const wordRe = /[A-Za-z][A-Za-z'’-]*/g;
    let m;
    while ((m = wordRe.exec(txt)) !== null) {
      const start = m.index, word = m[0];
      if (start < i) continue;
      const lower = word.toLowerCase();

      // 保护缩写/符号
      const tail = txt.slice(start, start + 12).toLowerCase();
      let prot = null;
      for (const p of PROTECT) {
        if (tail.startsWith(p)) {
          const after = txt[start + p.length];
          if (!after || !/[A-Za-z0-9]/.test(after)) { prot = p; break; }
        }
      }
      if (prot) {
        out += txt.slice(i, start) + tokenFor(txt.slice(start, start + prot.length), true);
        i = start + prot.length;
        continue;
      }

      // 词库最长匹配
      const cands = INDEX.get(lower);
      let matched = false;
      if (cands) {
        const sliceL = txt.slice(start, start + 60).toLowerCase();
        for (const c of cands) {
          if (sliceL.startsWith(c)) {
            const end = start + c.length;
            const after = txt[end];
            const before = start === 0 ? '' : txt[start - 1];
            if (after && /[A-Za-z]/.test(after)) continue;
            if (before && /[A-Za-z]/.test(before)) continue;
            out += txt.slice(i, start) + tokenFor(GLOSS[c], false);
            i = end;
            wordRe.lastIndex = end;
            matched = true;
            break;
          }
        }
      }
      if (matched) continue;

      // 拉丁学名（<i> 内）保护
      if (cfg.protectItalicLatin && inItalic) {
        const big = txt.slice(start, start + 40);
        const mm = big.match(/^[A-Z][a-z]+(?:\s+[a-z][a-z-]+){1,2}/);
        if (mm && isLatinBinom(mm[0])) {
          const end = start + mm[0].length;
          out += txt.slice(i, start) + tokenFor(mm[0], true);
          i = end;
          wordRe.lastIndex = end;
          continue;
        }
      }
    }
    out += txt.slice(i);
    return out;
  }

  function restoreText(txt) {
    if (!txt || txt.indexOf(A) === -1) return txt;
    return txt.replace(TOKEN_RE, (all, id) => {
      const t = tokens.get(id);
      return t ? t.zh : all;
    });
  }

  const SKIP = { SCRIPT: 1, STYLE: 1, NOSCRIPT: 1, TEXTAREA: 1, INPUT: 1, CODE: 1, PRE: 1, KBD: 1, SVG: 1, MATH: 1 };
  const touched = new WeakSet();

  function walk(root, fn) {
    const tw = document.createTreeWalker(root, NodeFilter.SHOW_TEXT, {
      acceptNode(n) {
        const p = n.parentElement;
        if (!p || SKIP[p.tagName] || p.isContentEditable) return NodeFilter.FILTER_REJECT;
        return NodeFilter.FILTER_ACCEPT;
      },
    });
    const list = [];
    let n;
    while ((n = tw.nextNode())) list.push(n);
    list.forEach(fn);
  }

  function tokenizePage(root) {
    if (!cfg.enabled || !Object.keys(GLOSS).length) return;
    walk(root || document.body, node => {
      if (touched.has(node)) return;
      const pel = node.parentElement;
      const ital = !!pel && (pel.tagName === 'I' || pel.tagName === 'EM');
      const nt = tokenizeText(node.nodeValue, ital);
      if (nt !== node.nodeValue) { node.nodeValue = nt; touched.add(node); }
    });
  }

  let restoring = false;
  function restorePage() {
    if (restoring) return;
    restoring = true;
    try {
      walk(document.body, node => {
        if (node.nodeValue && node.nodeValue.indexOf(A) !== -1) {
          const nt = restoreText(node.nodeValue);
          if (nt !== node.nodeValue) node.nodeValue = nt;
        }
      });
    } finally { restoring = false; }
  }

  // ---------- 观察 ----------
  let timer = null;
  function schedule() {
    clearTimeout(timer);
    timer = setTimeout(() => { restorePage(); }, 400);
  }

  function boot() {
    const mo = new MutationObserver(() => schedule());
    mo.observe(document.documentElement, { childList: true, subtree: true, characterData: true });
    setInterval(restorePage, 1500); // 兜底
    window.addEventListener('load', () => { tokenizePage(); schedule(); });
    document.addEventListener('visibilitychange', () => { if (!document.hidden) schedule(); });
  }

  // ---------- UI ----------
  let toastEl = null;
  function toast(msg, ms = 3000) {
    if (typeof document === 'undefined') return;
    if (!toastEl) {
      toastEl = document.createElement('div');
      toastEl.style.cssText = 'position:fixed;right:16px;bottom:16px;z-index:2147483647;background:#1f2937;color:#fff;font:13px/1.6 system-ui;padding:10px 14px;border-radius:8px;box-shadow:0 4px 16px rgba(0,0,0,.3);max-width:320px';
      document.documentElement.appendChild(toastEl);
    }
    toastEl.textContent = msg;
    toastEl.style.display = 'block';
    clearTimeout(toastEl._t);
    toastEl._t = setTimeout(() => { toastEl.style.display = 'none'; }, ms);
  }

  function importFile() {
    const inp = document.createElement('input');
    inp.type = 'file';
    inp.accept = '.json,application/json';
    inp.onchange = () => {
      const f = inp.files[0];
      if (!f) return;
      const rd = new FileReader();
      rd.onload = () => {
        try { loadGlossary(JSON.parse(rd.result)); tokenizePage(); }
        catch (e) { toast('JSON 解析失败'); }
      };
      rd.readAsText(f, 'utf-8');
    };
    inp.click();
  }

  function menu() {
    GM_registerMenuCommand('① 导入词库 JSON', importFile);
    GM_registerMenuCommand('② 设置词库 URL', () => {
      const u = prompt('词库 JSON 的网址（留空则清除）：', cfg.glossaryUrl || '');
      if (u === null) return;
      cfg.glossaryUrl = u.trim(); saveCfg();
      if (cfg.glossaryUrl) fetchGlossary(cfg.glossaryUrl);
    });
    GM_registerMenuCommand(`③ ${cfg.enabled ? '停用' : '启用'}术语替换`, () => {
      cfg.enabled = !cfg.enabled; saveCfg();
      toast(cfg.enabled ? '已启用' : '已停用');
      if (cfg.enabled) tokenizePage();
    });
    GM_registerMenuCommand('④ 重新扫描本页', () => { tokenizePage(); toast('已重新扫描'); });
    GM_registerMenuCommand('⑤ 查看状态', () => {
      toast(`术语条数：${Object.keys(GLOSS).length}\n已生成占位：${tokens.size}\n状态：${cfg.enabled ? '启用' : '停用'}`, 5000);
    });
  }

  try {
    globalThis.__BIRD_CORE__ = {
      tokenizeText, restoreText, loadGlossary, buildIndex,
      setCfg: o => Object.assign(cfg, o),
      getGloss: () => GLOSS,
    };
  } catch (e) {}

  if (typeof document !== 'undefined' && document.body) {
    initGlossary();
    menu();
    boot();
    tokenizePage();
    setTimeout(restorePage, 1200);
  }
})();
