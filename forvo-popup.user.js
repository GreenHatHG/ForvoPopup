// ==UserScript==
// @name         Forvo发音弹窗
// @namespace    http://tampermonkey.net/
// @version      2.3
// @description  选中单词后弹窗显示Forvo发音页面，支持英语和日语自动识别，可合并下载所有音频（通过严格的区块限定和优化的逻辑，确保只捕获主词条发音，彻底杜绝相关短语干扰）
// @author       Jooooody
// @match        *://*/*
// @grant        GM_xmlhttpRequest
// @connect      audio12.forvo.com
// @run-at       document-end
// ==/UserScript==

(function() {
'use strict';

let forvoButton = null;

function isMobileDevice() {
    return (typeof window.orientation !== "undefined") || (navigator.userAgent.indexOf('IEMobile') !== -1) || (window.innerWidth <= 768);
}

function containsJapanese(text) {
    const japaneseRegex = /[\u3040-\u309F\u30A0-\u30FF\u4E00-\u9FAF\u3000-\u303F\uFF00-\uFF9F]/;
    return japaneseRegex.test(text);
}

function detectLanguage(text) {
    return containsJapanese(text) ? 'ja' : 'en';
}

function buildForvoUrl(word, language) {
    const encodedWord = encodeURIComponent(word.trim());
    return `https://forvo.com/word/${encodedWord}/#${language}`;
}

function trimChars(str, c) {
    var re = new RegExp("^[" + c + "]+|[" + c + "]+$", "g");
    return str.replace(re,"");
}

function isNull(x) {
    const nul = [null, undefined, ''];
    return nul.includes(x);
}

function base64Decode(base64) {
    const binString = atob(base64);
    const bytesU8 = Uint8Array.from(binString, (m) => m.codePointAt(0));
    return new TextDecoder().decode(bytesU8);
}

function scrapeSound(b, c, e, f) {
    b = trimChars(b, '\''); c = trimChars(c, '\''); e = trimChars(e, '\''); f = trimChars(f, '\'');
    const _AUDIO_HTTP_HOST = "audio12.forvo.com";
    const defaultProtocol = "https:";
    if(!isNull(b)) b = defaultProtocol + '//' + _AUDIO_HTTP_HOST + '/mp3/' + base64Decode(b);
    if(!isNull(c)) c = defaultProtocol + '//' + _AUDIO_HTTP_HOST + '/ogg/' + base64Decode(c);
    if(!isNull(e)) e = defaultProtocol + '//' + _AUDIO_HTTP_HOST + '/audios/mp3/' + base64Decode(e);
    if(!isNull(f)) f = defaultProtocol + '//' + _AUDIO_HTTP_HOST + '/audios/ogg/' + base64Decode(f);
    return [b, c, e, f];
}

function getTargetLanguageFromUrl() {
    const hash = window.location.hash;
    if (hash && hash.length > 1) return hash.substring(1);
    const langAttr = document.documentElement.lang;
    if (langAttr) return langAttr;
    return 'en';
}

async function getAllAudioUrls(targetWord) {
    const audioUrls = new Set();
    const targetLanguage = getTargetLanguageFromUrl();
    console.log(`开始精确查找 '${targetWord}' 的发音 (含例句，排除同义词)，目标语言: ${targetLanguage}`);

    // 步骤 1: 定位总语言容器，我们的所有操作都将在此范围内进行，以避免跨语言干扰。
    const languageContainer = document.getElementById(`language-container-${targetLanguage}`);

    if (!languageContainer) {
        console.error(`查找失败：页面上不存在ID为 'language-container-${targetLanguage}' 的总语言区块。`);
        return [];
    }
    console.log(`成功定位到 '${targetLanguage}' 的总语言区块。`);

    // 步骤 2: 构建一个组合选择器，精确地只选择“主发音”和“例句”两个区域内的播放按钮。
    // - `#language-${targetLanguage} .play`: 选取主词条发音。
    // - `[id^="section-phrases-lang-"] .play`: 选取例句发音。`id^=` 表示“id以...开头”。
    // 这个组合确保了我们不会选到 "definitions/synonyms" 区块里的任何东西。
    const selector = `#language-${targetLanguage} .play, [id^="section-phrases-lang-"] .play`;

    // 步骤 3: 在总语言容器内执行这个精确的选择器。
    const desiredPlayButtons = languageContainer.querySelectorAll(selector);

    if (desiredPlayButtons.length === 0) {
        console.warn(`在主发音和例句区内未找到任何播放按钮。`);
        return [];
    }

    console.log(`精确筛选后，找到 ${desiredPlayButtons.length} 个相关播放按钮。开始提取URL...`);
    for (const play of desiredPlayButtons) {
        const args = /\(\s*([^)]+?)\s*\)/.exec(play.getAttribute('onclick'));
        if (args && args[1]) {
            const argArray = args[1].split(/\s*,\s*/);
            const scrape = scrapeSound(argArray[1], argArray[2], argArray[4], argArray[5]);
            const mp3Url = scrape.find(url => !isNull(url) && url.includes('.mp3'));
            if (mp3Url) {
                audioUrls.add(mp3Url);
            }
        }
    }

    const finalUrls = Array.from(audioUrls);
    console.log(`[最终结果] 成功获取 ${finalUrls.length} 个 '${targetLanguage}' 语言的音频URL (含例句，已排除无关内容)。`);
    return finalUrls;
}

async function downloadAudio(url) {
    return new Promise((resolve) => {
        if (typeof GM_xmlhttpRequest !== 'undefined') {
            GM_xmlhttpRequest({
                method: 'GET',
                url: url,
                responseType: 'arraybuffer',
                timeout: 15000,
                onload: function(response) {
                    if (response.status === 200) resolve(response.response);
                    else { console.error('下载音频失败:', url, 'Status:', response.status); resolve(null); }
                },
                onerror: function(error) { console.error('下载音频失败:', url, error); resolve(null); },
                ontimeout: function() { console.error('下载音频超时:', url); resolve(null); }
            });
        } else {
            console.warn('GM_xmlhttpRequest不可用，降级为单个下载。');
            const link = document.createElement('a');
            link.href = url;
            link.download = url.split('/').pop();
            document.body.appendChild(link);
            link.click();
            document.body.removeChild(link);
            resolve(null);
        }
    });
}

async function mergeAudioFiles(audioBuffers, word) {
    if (audioBuffers.length === 0) {
        alert('没有有效的音频文件可以合并。');
        return;
    }
    const audioContext = new (window.AudioContext || window.webkitAudioContext)();
    const decodedBuffers = [];

    for (const buffer of audioBuffers) {
        if (buffer) {
            try {
                decodedBuffers.push(await audioContext.decodeAudioData(buffer.slice()));
            } catch (error) { console.error('解码音频失败:', error); }
        }
    }

    if (decodedBuffers.length === 0) {
        alert('所有音频文件解码失败。');
        return;
    }

    const silenceDuration = 0.5;
    const sampleRate = decodedBuffers[0].sampleRate;
    const silenceSamples = Math.floor(silenceDuration * sampleRate);
    let totalLength = decodedBuffers.reduce((len, buf) => len + buf.length + silenceSamples, 0);

    const mergedBuffer = audioContext.createBuffer(1, totalLength, sampleRate);
    const mergedData = mergedBuffer.getChannelData(0);
    let offset = 0;
    for (const buffer of decodedBuffers) {
        mergedData.set(buffer.getChannelData(0), offset);
        offset += buffer.length + silenceSamples;
    }

    const wavBuffer = audioBufferToWav(mergedBuffer);
    const blob = new Blob([wavBuffer], { type: 'audio/wav' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${word}_${getTargetLanguageFromUrl()}.wav`;
    a.click();
    URL.revokeObjectURL(url);
    audioContext.close();
}

function audioBufferToWav(buffer) {
    const numOfChan = buffer.numberOfChannels,
          length = buffer.length * numOfChan * 2 + 44,
          bufferArr = new ArrayBuffer(length),
          view = new DataView(bufferArr),
          channels = [],
          sampleRate = buffer.sampleRate;
    let offset = 0,
        pos = 0;

    const setUint16 = (data) => { view.setUint16(pos, data, true); pos += 2; };
    const setUint32 = (data) => { view.setUint32(pos, data, true); pos += 4; };

    setUint32(0x46464952); // "RIFF"
    setUint32(length - 8);
    setUint32(0x45564157); // "WAVE"
    setUint32(0x20746d66); // "fmt "
    setUint32(16);
    setUint16(1);
    setUint16(numOfChan);
    setUint32(sampleRate);
    setUint32(sampleRate * 2 * numOfChan);
    setUint16(numOfChan * 2);
    setUint16(16);
    setUint32(0x61746164); // "data"
    setUint32(length - pos - 4);

    for(let i=0; i<buffer.numberOfChannels; i++) channels.push(buffer.getChannelData(i));

    while(pos < length) {
        for(let i=0; i<numOfChan; i++) {
            let sample = Math.max(-1, Math.min(1, channels[i][offset]));
            view.setInt16(pos, sample < 0 ? sample * 0x8000 : sample * 0x7FFF, true);
            pos += 2;
        }
        offset++;
    }
    return bufferArr;
}


async function downloadMergedAudio(word) {
    const loadingDiv = document.createElement('div');
    loadingDiv.id = 'forvo-loading';
    const targetLanguage = getTargetLanguageFromUrl();
    loadingDiv.innerHTML = `正在严格筛选并获取${targetLanguage}语言的音频...`;
    loadingDiv.style.cssText = `position:fixed;top:50%;left:50%;transform:translate(-50%,-50%);background:rgba(0,0,0,0.8);color:white;padding:20px;border-radius:10px;z-index:10000001;font-size:16px;text-align:center;`;
    document.body.appendChild(loadingDiv);

    try {
        const audioUrls = await getAllAudioUrls(word);
        if (audioUrls.length === 0) {
            alert(`在'${word}'页面上未能找到任何'${targetLanguage}'语言的主词条音频。请确认页面上是否有该语言的发音，且脚本规则未失效。`);
            return;
        }

        if (typeof GM_xmlhttpRequest === 'undefined') {
            loadingDiv.innerHTML = `权限受限，将为您批量下载 ${audioUrls.length} 个文件。`;
            for (let i = 0; i < audioUrls.length; i++) {
                setTimeout(() => downloadAudio(audioUrls[i]), i * 500);
            }
            return;
        }

        loadingDiv.innerHTML = `正在下载 ${audioUrls.length} 个音频...`;
        const audioBuffers = [];
        for (let i = 0; i < audioUrls.length; i++) {
            loadingDiv.innerHTML = `正在下载音频 ${i + 1}/${audioUrls.length}...`;
            const buffer = await downloadAudio(audioUrls[i]);
            if (buffer) audioBuffers.push(buffer);
        }

        if (audioBuffers.length === 0) {
            alert('所有音频下载失败。');
            return;
        }

        loadingDiv.innerHTML = `下载完成，正在合并...`;
        await mergeAudioFiles(audioBuffers, word);
        loadingDiv.innerHTML = '✅ 合并完成！';

    } catch (error) {
        console.error('下载合并音频时出错:', error);
        alert('下载合并音频时出错: ' + error.message);
    } finally {
        setTimeout(() => loadingDiv.remove(), 2000);
    }
}

function createForvoPopup(url, word) {
    const width = 800, height = 600;
    const left = (screen.width - width) / 2;
    const top = (screen.height - height) / 2;
    window.open(url, 'forvo_popup', `width=${width},height=${height},left=${left},top=${top},scrollbars=yes,resizable=yes`);
}

function getSelectedText() {
    return window.getSelection().toString().trim();
}

function handleKeyDown(e) {
    if (e.ctrlKey && e.altKey) {
        const text = getSelectedText();
        if (text && text.length > 0 && text.length <= 50) {
            e.preventDefault();
            const language = detectLanguage(text);
            const forvoUrl = buildForvoUrl(text, language);
            createForvoPopup(forvoUrl, text);
        }
    }
}

function isForvoWordPage() {
    return window.location.hostname.includes('forvo.com') && window.location.pathname.startsWith('/word/');
}

if (!isMobileDevice()) {
    document.addEventListener('keydown', handleKeyDown);
}

if (isForvoWordPage()) {
    window.addEventListener('load', () => {
        setTimeout(() => {
            if (document.getElementsByClassName("play").length > 0 && !document.getElementById('forvo-download-btn')) {
                const getWordFromUrl = () => {
                    const path = window.location.pathname;
                    const match = path.match(/\/word\/([^\/]+)/);
                    if (match && match[1]) {
                        return decodeURIComponent(match[1].replace(/_/g, ' '));
                    }
                    const title = document.title;
                    const titleMatch = title.match(/^Pronunciation of ([^:]+)/i) || title.match(/^How to pronounce ([^:]+)/i);
                    return titleMatch ? titleMatch[1].trim() : 'word';
                };

                const downloadBtn = document.createElement('button');
                downloadBtn.id = 'forvo-download-btn';
                const targetLanguage = getTargetLanguageFromUrl();
                downloadBtn.innerHTML = `📥 下载合并音频 (${targetLanguage})`;
                downloadBtn.style.cssText = `position:fixed;top:10px;right:10px;z-index:9999999;background:#28a745;color:white;border:none;padding:10px 15px;border-radius:5px;cursor:pointer;font-size:14px;box-shadow:0 2px 10px rgba(0,0,0,0.3);`;

                downloadBtn.onclick = async () => {
                    const word = getWordFromUrl();
                    await downloadMergedAudio(word);
                };
                document.body.appendChild(downloadBtn);
            }
        }, 2000);
    });
}

console.log('Forvo发音弹窗已加载。');

})();