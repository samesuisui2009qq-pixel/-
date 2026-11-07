// Node 侧逻辑自测：加载 userscript 的纯函数部分，验证占位与还原。
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const src = fs.readFileSync(path.join(__dirname, 'bird-translate.user.js'), 'utf8');

const store = {};
const sandbox = {
  console,
  setTimeout, clearTimeout, setInterval: () => 0,
  GM_getValue: (k, d) => (k in store ? store[k] : d),
  GM_setValue: (k, v) => { store[k] = v; },
  GM_registerMenuCommand: () => {},
  GM_xmlhttpRequest: () => {},
  prompt: () => null,
};
sandbox.globalThis = sandbox;
vm.createContext(sandbox);
vm.runInContext(src, sandbox);

const core = sandbox.__BIRD_CORE__;
if (!core) { console.error('FAIL: core not exposed'); process.exit(1); }

core.loadGlossary({
  "brown shrike": "红尾伯劳",
  "red-backed shrike": "红背伯劳",
  "northern waterthrush": "黄眉灶莺",
  "louisiana waterthrush": "白眉灶莺",
  "willow ptarmigan": "柳雷鸟",
  "common loon": "普通潜鸟",
});

const cases = [
  ["This is a Brown Shrike, not a Red-backed Shrike.",
   "This is a 红尾伯劳, not a 红背伯劳."],
  ["The Northern Waterthrush and Louisiana Waterthrush differ in supercilium shape.",
   "The 黄眉灶莺 and 白眉灶莺 differ in supercilium shape."],
  ["A juvenile (juv.) Willow Ptarmigan with 1st-w. plumage; cf. Common Loon.",
   "A juvenile (juv.) 柳雷鸟 with 1st-w. plumage; cf. 普通潜鸟."],
  ["Parkesia motacilla is the Louisiana Waterthrush.",
   "Parkesia motacilla is the 白眉灶莺."],
  ["No bird names here, just plain text about migration.",
   "No bird names here, just plain text about migration."],
];

let ok = true;
for (const [input, expect] of cases) {
  const tok = core.tokenizeText(input, false);
  const back = core.restoreText(tok);
  const pass = back === expect;
  if (!pass) ok = false;
  console.log((pass ? "PASS" : "FAIL"), "|", back);
  if (!pass) console.log("      expect:", expect);
}

// 拉丁学名（斜体上下文）应原样保留
const t = core.tokenizeText("Parkesia motacilla and Brown Shrike", true);
const r = core.restoreText(t);
console.log(r === "Parkesia motacilla and 红尾伯劳" ? "PASS" : "FAIL", "| italic latin:", r);

process.exit(ok ? 0 : 1);
