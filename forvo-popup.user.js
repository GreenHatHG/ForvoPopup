// ==UserScript==
// @name         Forvo发音弹窗增强版
// @namespace    http://tampermonkey.net/
// @version      2.2
// @description  选中单词后弹窗显示Forvo发音页面，支持英语和日语自动识别，可合并下载所有音频（仅主词条）
// @author       Jooooody
// @match        *://*/*
// @grant        GM_xmlhttpRequest
// @connect      audio12.forvo.com
// @run-at       document-end
// ==/UserScript==

(function() {
'use strict';

let forvoButton = null; // 用于存储浮动按钮的引用

// 一个简单的移动设备检测函数
function isMobileDevice() {
    return (typeof window.orientation !== "undefined") || (navigator.userAgent.indexOf('IEMobile') !== -1) || (window.innerWidth <= 768);
}

// 检测文本是否包含日语字符
function containsJapanese(text) {
    const japaneseRegex = /[\u3040-\u309F\u30A0-\u30FF\u4E00-\u9FAF\u3000-\u303F\uFF00-\uFF9F]/;
    return japaneseRegex.test(text);
}

// 检测语言并返回语言代码
function detectLanguage(text) {
    return containsJapanese(text) ? 'ja' : 'en';
}

// 构造Forvo URL
function buildForvoUrl(word, language) {
    const encodedWord = encodeURIComponent(word.trim());
    return `https://forvo.com/word/${encodedWord}/#${language}`;
}

// === 新增：音频获取和合并功能 ===

// 工具函数
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
    b = trimChars(b, '\'');
    c = trimChars(c, '\'');
    e = trimChars(e, '\'');
    f = trimChars(f, '\'');

    const _AUDIO_HTTP_HOST = "audio12.forvo.com";
    const defaultProtocol = "https:";

    if(!isNull(b)) {
        b = defaultProtocol + '//' + _AUDIO_HTTP_HOST + '/mp3/' + base64Decode(b);
    }
    if(!isNull(c)) {
        c = defaultProtocol + '//' + _AUDIO_HTTP_HOST + '/ogg/' + base64Decode(c);
    }
    if(!isNull(e)) {
        e = defaultProtocol + '//' + _AUDIO_HTTP_HOST + '/audios/mp3/' + base64Decode(e);
    }
    if(!isNull(f)) {
        f = defaultProtocol + '//' + _AUDIO_HTTP_HOST + '/audios/ogg/' + base64Decode(f);
    }

    return [b, c, e, f];
}

// 获取主词条的音频URL（排除同义词）
async function getAllAudioUrls(targetWord) {
    const audioUrls = [];

    // 方法1：通过DOM结构筛选 - 只获取主词条区域的音频
    const wordHeaderPronunciations = document.querySelector('.word_header_pronunciations');
    if (wordHeaderPronunciations) {
        const plays = wordHeaderPronunciations.getElementsByClassName("play");
        console.log(`在主词条区域找到 ${plays.length} 个发音`);

        for(const play of plays) {
            const args = /\(\s*([^)]+?)\s*\)/.exec(play.attributes.onclick.textContent);
            if (args[1]) {
                const argArray = args[1].split(/\s*,\s*/);
                const scrape = scrapeSound(argArray[1], argArray[2], argArray[4], argArray[5]);

                // 优先使用MP3格式
                for(const url of scrape) {
                    if(!isNull(url) && url.includes('.mp3')) {
                        audioUrls.push(url);
                        break;
                    }
                }
            }
        }
    }

    // 方法2：如果方法1没找到，使用备用方案 - 通过词条名称过滤
    if (audioUrls.length === 0) {
        console.log('主词条区域未找到发音，尝试备用方案...');

        const allPlays = document.getElementsByClassName("play");
        const normalizedTargetWord = targetWord.toLowerCase().trim();

        for(const play of allPlays) {
            // 找到包含play按钮的父级元素
            let pronunciationItem = play.closest('.pronunciation-item, .play_w, [class*="pronunciation"], li');

            if (pronunciationItem) {
                // 获取这个发音项的文本内容
                const itemText = pronunciationItem.textContent.toLowerCase();

                // 检查是否包含目标单词且不包含同义词标识符
                const containsTarget = itemText.includes(normalizedTargetWord);
                const isSynonym = itemText.includes('synonym') ||
                                itemText.includes('definition') ||
                                itemText.includes('related') ||
                                pronunciationItem.closest('.synonyms, .definitions, .related-words');

                // 额外检查：确保不是在同义词列表中
                const isInSynonymSection = pronunciationItem.closest('div[class*="synonym"]') ||
                                         pronunciationItem.closest('section[class*="synonym"]') ||
                                         pronunciationItem.closest('[id*="synonym"]');

                if (containsTarget && !isSynonym && !isInSynonymSection) {
                    const args = /\(\s*([^)]+?)\s*\)/.exec(play.attributes.onclick.textContent);
                    if (args[1]) {
                        const argArray = args[1].split(/\s*,\s*/);
                        const scrape = scrapeSound(argArray[1], argArray[2], argArray[4], argArray[5]);

                        // 优先使用MP3格式
                        for(const url of scrape) {
                            if(!isNull(url) && url.includes('.mp3')) {
                                audioUrls.push(url);
                                break;
                            }
                        }
                    }
                }
            }
        }
    }

    // 方法3：最后的备用方案 - 只获取页面顶部的发音
    if (audioUrls.length === 0) {
        console.log('备用方案也未找到，使用最后方案...');

        const allPlays = document.getElementsByClassName("play");
        // 只取前几个play元素，通常主词条的发音在页面顶部
        const maxPlays = Math.min(5, allPlays.length); // 最多取前5个

        for(let i = 0; i < maxPlays; i++) {
            const play = allPlays[i];
            const args = /\(\s*([^)]+?)\s*\)/.exec(play.attributes.onclick.textContent);
            if (args[1]) {
                const argArray = args[1].split(/\s*,\s*/);
                const scrape = scrapeSound(argArray[1], argArray[2], argArray[4], argArray[5]);

                // 优先使用MP3格式
                for(const url of scrape) {
                    if(!isNull(url) && url.includes('.mp3')) {
                        audioUrls.push(url);
                        break;
                    }
                }
            }
        }
    }

    console.log(`最终获取到 ${audioUrls.length} 个主词条音频URL`);
    return audioUrls;
}

// 下载音频文件 - 使用GM_xmlhttpRequest绕过CORS限制
async function downloadAudio(url) {
    return new Promise((resolve) => {
        // 检查是否支持GM_xmlhttpRequest
        if (typeof GM_xmlhttpRequest !== 'undefined') {
            GM_xmlhttpRequest({
                method: 'GET',
                url: url,
                responseType: 'arraybuffer',
                timeout: 15000,
                onload: function(response) {
                    if (response.status === 200) {
                        resolve(response.response);
                    } else {
                        console.error('下载音频失败:', url, 'Status:', response.status);
                        resolve(null);
                    }
                },
                onerror: function(error) {
                    console.error('下载音频失败:', url, error);
                    resolve(null);
                },
                ontimeout: function() {
                    console.error('下载音频超时:', url);
                    resolve(null);
                }
            });
        } else {
            // 降级方案：创建隐藏的音频元素并尝试播放
            console.warn('GM_xmlhttpRequest不可用，使用降级方案');

            // 对于不支持GM_xmlhttpRequest的情况，我们改为创建下载链接
            const link = document.createElement('a');
            link.href = url;
            link.download = url.split('/').pop();
            link.style.display = 'none';
            document.body.appendChild(link);
            link.click();
            document.body.removeChild(link);

            resolve(null); // 无法获取音频数据进行合并
        }
    });
}

// 合并音频文件
async function mergeAudioFiles(audioBuffers, word) {
    const audioContext = new (window.AudioContext || window.webkitAudioContext)();
    const decodedBuffers = [];

    // 解码所有音频
    for (const buffer of audioBuffers) {
        if (buffer) {
            try {
                const decoded = await audioContext.decodeAudioData(buffer.slice());
                decodedBuffers.push(decoded);
            } catch (error) {
                console.error('解码音频失败:', error);
            }
        }
    }

    if (decodedBuffers.length === 0) {
        alert('没有有效的音频文件可以合并');
        return;
    }

    // 计算总长度（包括间隔和结尾空白）
    const silenceDuration = 0.5; // 0.5秒间隔
    const sampleRate = decodedBuffers[0].sampleRate;
    const silenceSamples = Math.floor(silenceDuration * sampleRate);

    let totalLength = 0;
    for (const buffer of decodedBuffers) {
        totalLength += buffer.length + silenceSamples;
    }
    // 最后保留0.5秒空白（不减去最后的silenceSamples）

    // 创建合并后的音频缓冲区
    const mergedBuffer = audioContext.createBuffer(1, totalLength, sampleRate);
    const mergedData = mergedBuffer.getChannelData(0);

    let offset = 0;
    for (let i = 0; i < decodedBuffers.length; i++) {
        const buffer = decodedBuffers[i];
        const channelData = buffer.getChannelData(0);

        // 复制音频数据
        mergedData.set(channelData, offset);
        offset += buffer.length;

        // 添加间隔（每个音频后都加，包括最后一个）
        offset += silenceSamples;
    }

    // 将音频缓冲区转换为WAV格式
    const wavBuffer = audioBufferToWav(mergedBuffer);

    // 下载文件
    const blob = new Blob([wavBuffer], { type: 'audio/wav' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${word}.wav`;
    a.click();
    URL.revokeObjectURL(url);

    audioContext.close();
}

// 将AudioBuffer转换为WAV格式
function audioBufferToWav(buffer) {
    const length = buffer.length;
    const sampleRate = buffer.sampleRate;
    const arrayBuffer = new ArrayBuffer(44 + length * 2);
    const view = new DataView(arrayBuffer);
    const channelData = buffer.getChannelData(0);

    // WAV文件头
    const writeString = (offset, string) => {
        for (let i = 0; i < string.length; i++) {
            view.setUint8(offset + i, string.charCodeAt(i));
        }
    };

    writeString(0, 'RIFF');
    view.setUint32(4, 36 + length * 2, true);
    writeString(8, 'WAVE');
    writeString(12, 'fmt ');
    view.setUint32(16, 16, true);
    view.setUint16(20, 1, true);
    view.setUint16(22, 1, true);
    view.setUint32(24, sampleRate, true);
    view.setUint32(28, sampleRate * 2, true);
    view.setUint16(32, 2, true);
    view.setUint16(34, 16, true);
    writeString(36, 'data');
    view.setUint32(40, length * 2, true);

    // 音频数据
    let offset = 44;
    for (let i = 0; i < length; i++) {
        const sample = Math.max(-1, Math.min(1, channelData[i]));
        view.setInt16(offset, sample * 0x7FFF, true);
        offset += 2;
    }

    return arrayBuffer;
}

// 下载合并音频的主函数
async function downloadMergedAudio(word) {
    // 显示加载提示
    const loadingDiv = document.createElement('div');
    loadingDiv.id = 'forvo-loading';
    loadingDiv.innerHTML = '正在获取音频文件，请稍候...';
    loadingDiv.style.cssText = `
        position: fixed;
        top: 50%;
        left: 50%;
        transform: translate(-50%, -50%);
        background: rgba(0,0,0,0.8);
        color: white;
        padding: 20px;
        border-radius: 10px;
        z-index: 10000000;
        font-size: 16px;
        max-width: 300px;
        text-align: center;
    `;
    document.body.appendChild(loadingDiv);

    try {
        const audioUrls = await getAllAudioUrls(word);

        if (audioUrls.length === 0) {
            alert('页面中没有找到主词条的音频文件');
            return;
        }

        // 检查是否支持GM_xmlhttpRequest
        if (typeof GM_xmlhttpRequest === 'undefined') {
            // 降级方案：批量下载单个文件
            loadingDiv.innerHTML = `检测到权限限制，将为您批量下载 ${audioUrls.length} 个音频文件`;

            for (let i = 0; i < audioUrls.length; i++) {
                setTimeout(() => {
                    const link = document.createElement('a');
                    link.href = audioUrls[i];
                    link.download = `${word}_${i + 1}.mp3`;
                    link.style.display = 'none';
                    document.body.appendChild(link);
                    link.click();
                    document.body.removeChild(link);
                }, i * 500); // 间隔500ms下载，避免浏览器阻止
            }

            setTimeout(() => {
                alert(`已开始下载 ${audioUrls.length} 个音频文件，请检查浏览器下载区域`);
            }, 1000);

            return;
        }

        loadingDiv.innerHTML = `正在下载 ${audioUrls.length} 个音频文件...`;

        // 下载所有音频
        const audioBuffers = [];
        for (let i = 0; i < audioUrls.length; i++) {
            loadingDiv.innerHTML = `正在下载音频 ${i + 1}/${audioUrls.length}...<br><small>${audioUrls[i].split('/').pop()}</small>`;
            const buffer = await downloadAudio(audioUrls[i]);
            if (buffer) {
                audioBuffers.push(buffer);
            }
        }

        if (audioBuffers.length === 0) {
            alert('所有音频下载失败，请检查网络连接或稍后重试');
            return;
        }

        loadingDiv.innerHTML = `成功下载 ${audioBuffers.length}/${audioUrls.length} 个音频<br>正在合并音频文件...`;

        // 合并音频
        await mergeAudioFiles(audioBuffers, word);

        loadingDiv.innerHTML = '✅ 音频合并完成！';
        setTimeout(() => {}, 1000);

    } catch (error) {
        console.error('下载合并音频时出错:', error);
        alert('下载合并音频时出错: ' + error.message);
    } finally {
        setTimeout(() => {
            if (loadingDiv.parentNode) {
                loadingDiv.remove();
            }
        }, 2000);
    }
}

// === 原有功能继续 ===

// 创建Forvo弹窗
function createForvoPopup(url, word) {
    const screenWidth = window.screen.width;
    const screenHeight = window.screen.height;

    let popupWidth, popupHeight;
    if (screenWidth <= 768) {
        popupWidth = Math.min(screenWidth * 0.95, 400);
        popupHeight = Math.min(screenHeight * 0.8, 600);
    } else if (screenWidth <= 1024) {
        popupWidth = Math.min(screenWidth * 0.8, 600);
        popupHeight = Math.min(screenHeight * 0.8, 700);
    } else {
        popupWidth = Math.min(screenWidth * 0.6, 800);
        popupHeight = Math.min(screenHeight * 0.8, 800);
    }

    const left = (screenWidth - popupWidth) / 2;
    const top = (screenHeight - popupHeight) / 2;

    const windowFeatures = `width=${popupWidth},height=${popupHeight},left=${left},top=${top},scrollbars=yes,resizable=yes,toolbar=no,menubar=no,location=no,status=no`;

    const popup = window.open(url, 'forvo_popup', windowFeatures);

    // 在弹窗中注入下载按钮
    popup.addEventListener('load', () => {
        setTimeout(() => {
            injectDownloadButton(popup, word);
        }, 2000);
    });
}

// 在Forvo页面注入下载按钮
function injectDownloadButton(popup, word) {
    try {
        const doc = popup.document;

        // 检查页面是否加载完成且有音频
        const plays = doc.getElementsByClassName("play");
        if (plays.length === 0) {
            setTimeout(() => injectDownloadButton(popup, word), 1000);
            return;
        }

        // 从弹窗URL中提取真实的查询单词
        const getActualWord = () => {
            const url = popup.location.href;
            const match = url.match(/\/word\/([^\/\#]+)/);
            if (match) {
                return decodeURIComponent(match[1]);
            }
            return word; // 降级使用传入的word
        };

        const actualWord = getActualWord();

        // 创建下载按钮
        const downloadBtn = doc.createElement('button');
        downloadBtn.innerHTML = '📥 下载合并音频';
        downloadBtn.style.cssText = `
            position: fixed;
            top: 10px;
            right: 10px;
            z-index: 9999999;
            background: #28a745;
            color: white;
            border: none;
            padding: 10px 15px;
            border-radius: 5px;
            cursor: pointer;
            font-size: 14px;
            box-shadow: 0 2px 10px rgba(0,0,0,0.3);
        `;

        downloadBtn.onclick = async () => {
            downloadBtn.disabled = true;
            downloadBtn.innerHTML = '正在处理...';

            try {
                // 直接在弹窗页面执行下载逻辑
                const audioUrls = await getAllAudioUrls(actualWord);

                if (audioUrls.length === 0) {
                    alert('没有找到主词条的音频文件');
                    downloadBtn.disabled = false;
                    downloadBtn.innerHTML = '📥 下载合并音频';
                    return;
                }

                // 检查主窗口是否支持GM_xmlhttpRequest
                if (typeof window.opener.GM_xmlhttpRequest === 'undefined') {
                    // 降级方案：批量下载
                    for (let i = 0; i < audioUrls.length; i++) {
                        setTimeout(() => {
                            const link = doc.createElement('a');
                            link.href = audioUrls[i];
                            link.download = `${actualWord}_${i + 1}.mp3`;
                            link.style.display = 'none';
                            doc.body.appendChild(link);
                            link.click();
                            doc.body.removeChild(link);
                        }, i * 500);
                    }
                    alert(`开始下载 ${audioUrls.length} 个音频文件`);
                } else {
                    // 发送数据回主窗口进行合并处理
                    window.opener.postMessage({
                        type: 'forvo-download-request',
                        urls: audioUrls,
                        word: actualWord
                    }, '*');
                }

            } catch (error) {
                console.error('执行下载脚本失败:', error);
                alert('下载失败: ' + error.message);
            }

            downloadBtn.disabled = false;
            downloadBtn.innerHTML = '📥 下载合并音频';
        };

        doc.body.appendChild(downloadBtn);

    } catch (error) {
        console.error('注入下载按钮失败:', error);
        setTimeout(() => injectDownloadButton(popup, word), 1000);
    }
}

// 监听来自弹窗的消息
window.addEventListener('message', async (event) => {
    if (event.data.type === 'forvo-audio-data') {
        try {
            await mergeAudioFiles(event.data.buffers, event.data.word);
        } catch (error) {
            console.error('合并音频失败:', error);
            alert('合并音频失败: ' + error.message);
        }
    } else if (event.data.type === 'forvo-download-request') {
        // 处理来自弹窗的下载请求
        try {
            const { urls, word } = event.data;

            if (typeof GM_xmlhttpRequest === 'undefined') {
                // 降级方案
                for (let i = 0; i < urls.length; i++) {
                    setTimeout(() => {
                        const link = document.createElement('a');
                        link.href = urls[i];
                        link.download = `${word}_${i + 1}.mp3`;
                        link.style.display = 'none';
                        document.body.appendChild(link);
                        link.click();
                        document.body.removeChild(link);
                    }, i * 500);
                }
                alert(`开始下载 ${urls.length} 个音频文件到本地`);
                return;
            }

            // 显示进度
            const loadingDiv = document.createElement('div');
            loadingDiv.id = 'forvo-loading-main';
            loadingDiv.innerHTML = '正在下载音频文件...';
            loadingDiv.style.cssText = `
                position: fixed;
                top: 50%;
                left: 50%;
                transform: translate(-50%, -50%);
                background: rgba(0,0,0,0.8);
                color: white;
                padding: 20px;
                border-radius: 10px;
                z-index: 10000000;
                font-size: 16px;
                max-width: 300px;
                text-align: center;
            `;
            document.body.appendChild(loadingDiv);

            // 下载音频
            const audioBuffers = [];
            for (let i = 0; i < urls.length; i++) {
                loadingDiv.innerHTML = `正在下载音频 ${i + 1}/${urls.length}...<br><small>${urls[i].split('/').pop()}</small>`;
                const buffer = await downloadAudio(urls[i]);
                if (buffer) {
                    audioBuffers.push(buffer);
                }
            }

            if (audioBuffers.length > 0) {
                loadingDiv.innerHTML = `成功下载 ${audioBuffers.length}/${urls.length} 个音频<br>正在合并...`;
                await mergeAudioFiles(audioBuffers, word);
                loadingDiv.innerHTML = '✅ 完成！';
            } else {
                loadingDiv.innerHTML = '❌ 下载失败';
                alert('所有音频下载失败，请稍后重试');
            }

            setTimeout(() => {
                if (loadingDiv.parentNode) {
                    loadingDiv.remove();
                }
            }, 2000);

        } catch (error) {
            console.error('处理下载请求失败:', error);
            alert('处理下载请求失败: ' + error.message);
        }
    }
});

// 获取选中的文本
function getSelectedText() {
    const selection = window.getSelection();
    return selection.toString().trim();
}

// 处理Ctrl+Alt组合键
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

function createForvoMobileButton() {
    if (forvoButton) return;

    forvoButton = document.createElement('div');
    forvoButton.id = 'forvo-mobile-button';
    forvoButton.innerHTML = `<svg viewBox="0 0 24 24"><path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm-1.5 5h3v1.5h-3V7zm3 9.5h-3V15h3v1.5zm-3-3.5h3v-1.5h-3V13zm-3.5-2.5h10v-1.5H8.5V10.5z"></path></svg>`;

    const handleButtonClick = function(e) {
        e.preventDefault();
        e.stopPropagation();

        const text = getSelectedText();
        if (text && text.length > 0 && text.length <= 50) {
            const language = detectLanguage(text);
            const forvoUrl = buildForvoUrl(text, language);
            createForvoPopup(forvoUrl, text);
        }
        removeForvoMobileButton();
    };

    forvoButton.addEventListener('mousedown', handleButtonClick);
    forvoButton.addEventListener('touchstart', handleButtonClick);

    document.body.appendChild(forvoButton);
}

function removeForvoMobileButton() {
    if (forvoButton) {
        forvoButton.remove();
        forvoButton = null;
    }
}

function handleSelectionChange() {
    const selection = window.getSelection();
    const text = selection.toString().trim();

    if (text && text.length > 0 && text.length <= 50) {
        if (!forvoButton) {
            createForvoMobileButton();
        }
        requestAnimationFrame(() => {
            if(forvoButton) forvoButton.classList.add('visible');
        });
    } else {
        if (forvoButton) {
            forvoButton.classList.remove('visible');
        }
    }
}

// 主要逻辑
if (isMobileDevice()) {
    document.addEventListener('selectionchange', handleSelectionChange);
    document.addEventListener('click', removeForvoMobileButton);
} else {
    document.addEventListener('keydown', handleKeyDown);
}

// 如果当前页面是Forvo页面，直接注入功能
if (window.location.hostname === 'forvo.com') {
    setTimeout(() => {
        const plays = document.getElementsByClassName("play");
        if (plays.length > 0) {
            // 从URL中提取单词
            const getWordFromUrl = () => {
                const path = window.location.pathname;
                const match = path.match(/\/word\/([^\/]+)/);
                if (match) {
                    return decodeURIComponent(match[1]);
                }
                // 备用方案：从页面标题获取
                const title = document.title;
                const titleMatch = title.match(/^([^-]+)/);
                return titleMatch ? titleMatch[1].trim() : 'word';
            };

            // 创建下载按钮
            const downloadBtn = document.createElement('button');
            downloadBtn.innerHTML = '📥 下载合并音频（仅主词条）';
            downloadBtn.style.cssText = `
                position: fixed;
                top: 10px;
                right: 10px;
                z-index: 9999999;
                background: #28a745;
                color: white;
                border: none;
                padding: 10px 15px;
                border-radius: 5px;
                cursor: pointer;
                font-size: 14px;
                box-shadow: 0 2px 10px rgba(0,0,0,0.3);
            `;

            downloadBtn.onclick = async () => {
                const word = getWordFromUrl();
                await downloadMergedAudio(word);
            };

            document.body.appendChild(downloadBtn);
        }
    }, 2000);
}

// 添加样式
const style = document.createElement('style');
style.textContent = `
    #forvo-mobile-button {
        position: fixed;
        z-index: 9999999;
        width: 48px;
        height: 48px;
        right: 20px;
        bottom: 20px;
        background-color: #007bff;
        border-radius: 50%;
        display: flex;
        align-items: center;
        justify-content: center;
        cursor: pointer;
        box-shadow: 0 4px 12px rgba(0,0,0,0.25);
        transition: opacity 0.2s ease-out, transform 0.2s ease-out;
        opacity: 0;
        transform: scale(0.8);
        pointer-events: none;
    }
    #forvo-mobile-button.visible {
        opacity: 1;
        transform: scale(1);
        pointer-events: auto;
    }
    #forvo-mobile-button svg {
        width: 28px;
        height: 28px;
        fill: white;
    }
`;
document.head.appendChild(style);

console.log('Forvo发音弹窗增强版脚本已加载 - 仅下载主词条发音');

})();