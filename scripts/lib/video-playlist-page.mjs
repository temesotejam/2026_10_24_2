/** A native MP4 player that advances through a complete edited series. */
export function playlistPage({ title, outputs, collection, totalLength, notes = [] }) {
  const escape = (value) =>
    String(value).replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll('"', "&quot;");
  const data = JSON.stringify(
    outputs.map(({ url, title, duration }) => ({ url, title, duration })),
  ).replaceAll("<", "\\u003c");
  return `<!doctype html>
<html lang="ja"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${escape(title)}</title><style>
body{margin:0;background:#171b22;color:#eee;font:17px/1.7 system-ui,sans-serif}main{max-width:1100px;margin:auto;padding:24px}a{color:#9ed2ff}video{display:block;width:100%;background:#000;aspect-ratio:16/9}button{font:inherit;padding:8px 14px;cursor:pointer}nav{display:flex;flex-wrap:wrap;gap:12px;align-items:center;margin:16px 0}ol{padding-left:28px}li{margin:12px 0}li button{background:#263342;color:#eee;border:1px solid #8393a5;border-radius:6px;text-align:left}li button[aria-current=true]{background:#315574;border-color:#9ed2ff}#media-error{color:#ffcca3}
</style></head><body><main><h1>${escape(title)}</h1>
<p>所持品ゼロからドラゴン討伐・卵の入手・生還まで、合計${escape(totalLength)}。日本語の字幕実況・三人称・720pです。ダウンロードせず、このページで全章を連続再生できます。実況は字幕です（音声なし）。</p>
<video controls playsinline preload="metadata" src="${escape(outputs[0].url)}"></video>
<p id="current-chapter" aria-live="polite">1 / ${outputs.length}：${escape(outputs[0].title)}</p><p id="media-error" hidden>動画を読み込めませんでした。再生ボタンで再試行するか、下のMP4リンクをご利用ください。</p>
<nav><button data-time="0">本編を最初から再生</button><button id="previous">前の章</button><button id="next">次の章</button><label><input type="checkbox" id="repeat" checked> 全編をループ再生</label></nav>
<ol>${outputs.map((item, i) => `<li><button data-chapter="${i}" aria-current="${i === 0}">${i + 1}. ${escape(item.title)}</button> <a href="${escape(item.url)}">MP4を保存</a></li>`).join("\n")}</ol>
<p>${notes.map(escape).join("<br>")}</p>
<p><a href="https://github.com/temesotejam/2026_10_24_2/blob/main/downloads/${collection}/README.md">GitHubのループプレビュー・ダウンロード一覧</a> / <a href="./${collection}-proof.json">編集とクリアの記録</a> / <a href="../?seed=20261029&amp;mode=survival&amp;view=third-person">ゲームを遊ぶ</a></p>
</main><script>
const chapters=${data};
const video=document.querySelector('video'),error=document.querySelector('#media-error');
let current=0;
async function selectChapter(index){
current=(index+chapters.length)%chapters.length;
video.src=chapters[current].url;video.load();error.hidden=true;
document.querySelector('#current-chapter').textContent=(current+1)+' / '+chapters.length+'：'+chapters[current].title;
for(const button of document.querySelectorAll('[data-chapter]'))button.setAttribute('aria-current',String(Number(button.dataset.chapter)===current));
try{await video.play();}catch{error.hidden=false;}
}
document.querySelector('[data-time="0"]').addEventListener('click',()=>selectChapter(0));
document.querySelector('#previous').addEventListener('click',()=>selectChapter(current-1));
document.querySelector('#next').addEventListener('click',()=>selectChapter(current+1));
for(const button of document.querySelectorAll('[data-chapter]'))button.addEventListener('click',()=>selectChapter(Number(button.dataset.chapter)));
video.addEventListener('ended',()=>{if(current+1<chapters.length)void selectChapter(current+1);else if(document.querySelector('#repeat').checked)void selectChapter(0);});
video.addEventListener('error',()=>{error.hidden=false;});
</script></body></html>`;
}
