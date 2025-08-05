// ==UserScript==
// @name         Forvo发音弹窗
// @namespace    http://tampermonkey.net/
// @version      2.6
// @description  选中单词后弹窗显示Forvo发音页面，支持英语和日语自动识别，可合并下载所有音频（通过严格的区块限定和优化的逻辑，确保只捕获主词条发音，彻底杜绝相关短语干扰）。智能音量标准化：自动将低音量mp3提升至标准音量，高音量mp3降至标准音量。新增：并发下载优化，显著提升下载速度
// @author       Jooooody
// @match        *://*/*
// @grant        GM_xmlhttpRequest
// @connect      audio12.forvo.com
// @run-at       document-end
// ==/UserScript==

(function () {
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
        return str.replace(re, "");
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
        if (!isNull(b)) b = defaultProtocol + '//' + _AUDIO_HTTP_HOST + '/mp3/' + base64Decode(b);
        if (!isNull(c)) c = defaultProtocol + '//' + _AUDIO_HTTP_HOST + '/ogg/' + base64Decode(c);
        if (!isNull(e)) e = defaultProtocol + '//' + _AUDIO_HTTP_HOST + '/audios/mp3/' + base64Decode(e);
        if (!isNull(f)) f = defaultProtocol + '//' + _AUDIO_HTTP_HOST + '/audios/ogg/' + base64Decode(f);
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
        console.log('=== getAllAudioUrls 开始执行 ===');
        const audioUrls = new Set();
        const targetLanguage = getTargetLanguageFromUrl();
        console.log(`开始精确查找 '${targetWord}' 的发音 (含例句，排除同义词)，目标语言: ${targetLanguage}`);

        // 步骤 1: 定位总语言容器，我们的所有操作都将在此范围内进行，以避免跨语言干扰。
        console.log('步骤1: 查找语言容器...');
        const languageContainer = document.getElementById(`language-container-${targetLanguage}`);

        if (!languageContainer) {
            console.error(`查找失败：页面上不存在ID为 'language-container-${targetLanguage}' 的总语言区块。`);
            console.log('尝试查找所有可能的语言容器...');
            const allContainers = document.querySelectorAll('[id^="language-container-"]');
            console.log('找到的语言容器:', Array.from(allContainers).map(c => c.id));
            return [];
        }
        console.log(`成功定位到 '${targetLanguage}' 的总语言区块。`);

        // 步骤 2: 构建一个组合选择器，精确地只选择“主发音”和“例句”两个区域内的播放按钮。
        // - `#language-${targetLanguage} .play`: 选取主词条发音。
        // - `[id^="section-phrases-lang-"] .play`: 选取例句发音。`id^=` 表示“id以...开头”。
        // 这个组合确保了我们不会选到 "definitions/synonyms" 区块里的任何东西。
        const selector = `#language-${targetLanguage} .play, [id^="section-phrases-lang-"] .play`;
        console.log('使用选择器:', selector);

        // 步骤 3: 在总语言容器内执行这个精确的选择器。
        console.log('步骤3: 查找播放按钮...');
        const desiredPlayButtons = languageContainer.querySelectorAll(selector);
        console.log('找到播放按钮数量:', desiredPlayButtons.length);

        if (desiredPlayButtons.length === 0) {
            console.warn(`在主发音和例句区内未找到任何播放按钮。`);
            console.log('尝试查找所有播放按钮...');
            const allPlayButtons = document.querySelectorAll('.play');
            console.log('页面上所有播放按钮数量:', allPlayButtons.length);
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

    async function downloadAudio(url, retries = 2) {
        return new Promise((resolve) => {
            const attemptDownload = (remainingRetries) => {
                if (typeof GM_xmlhttpRequest !== 'undefined') {
                    GM_xmlhttpRequest({
                        method: 'GET',
                        url: url,
                        responseType: 'arraybuffer',
                        timeout: 10000, // 减少单次超时时间，依靠重试机制
                        onload: function (response) {
                            if (response.status === 200) {
                                resolve(response.response);
                            } else {
                                console.error(`下载音频失败: ${url}, Status: ${response.status}`);
                                if (remainingRetries > 0) {
                                    console.log(`重试下载: ${url}, 剩余重试次数: ${remainingRetries}`);
                                    setTimeout(() => attemptDownload(remainingRetries - 1), 1000);
                                } else {
                                    resolve(null);
                                }
                            }
                        },
                        onerror: function (error) {
                            console.error(`下载音频失败: ${url}`, error);
                            if (remainingRetries > 0) {
                                console.log(`重试下载: ${url}, 剩余重试次数: ${remainingRetries}`);
                                setTimeout(() => attemptDownload(remainingRetries - 1), 1000);
                            } else {
                                resolve(null);
                            }
                        },
                        ontimeout: function () {
                            console.error(`下载音频超时: ${url}`);
                            if (remainingRetries > 0) {
                                console.log(`重试下载: ${url}, 剩余重试次数: ${remainingRetries}`);
                                setTimeout(() => attemptDownload(remainingRetries - 1), 1000);
                            } else {
                                resolve(null);
                            }
                        }
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
            };

            attemptDownload(retries);
        });
    }

    // 并发控制函数 - 分批处理，支持进度回调
    async function downloadWithConcurrencyLimit(urls, maxConcurrency = 4, progressCallback = null) {
        const results = [];
        let completedCount = 0;

        // 将URL分成批次
        for (let i = 0; i < urls.length; i += maxConcurrency) {
            const batch = urls.slice(i, i + maxConcurrency);

            // 并发下载当前批次
            const batchPromises = batch.map((url, batchIndex) =>
                downloadAudio(url).then(buffer => {
                    completedCount++;
                    if (progressCallback) {
                        progressCallback(completedCount, urls.length);
                    }
                    return {
                        buffer,
                        index: i + batchIndex,
                        url
                    };
                })
            );

            // 等待当前批次完成
            const batchResults = await Promise.allSettled(batchPromises);
            results.push(...batchResults);
        }

        return results;
    }

    // 全局音频上下文管理
    let globalAudioContext = null;

    async function ensureAudioContextRunning(audioContext) {
        if (audioContext.state === 'suspended') {
            try {
                // 尝试多次恢复
                for (let i = 0; i < 3; i++) {
                    await audioContext.resume();
                    if (audioContext.state === 'running') {
                        console.log(`音频上下文在第${i + 1}次尝试后恢复成功`);
                        break;
                    }
                    await new Promise(resolve => setTimeout(resolve, 100));
                }
            } catch (error) {
                console.error('恢复音频上下文失败:', error);
                throw new Error('无法启动音频播放，请确保已允许网站播放音频');
            }
        }

        if (audioContext.state !== 'running') {
            throw new Error('音频上下文未运行，请先与页面进行交互');
        }
    }

    function createInteractionPrompt() {
        return new Promise((resolve) => {
            const promptDiv = document.createElement('div');
            promptDiv.style.cssText = `
                position: fixed; top: 50%; left: 50%; transform: translate(-50%, -50%);
                background: rgba(0,0,0,0.9); color: white; padding: 30px;
                border-radius: 10px; z-index: 10000002; text-align: center;
                font-size: 16px; box-shadow: 0 4px 20px rgba(0,0,0,0.5);
            `;

            promptDiv.innerHTML = `
                <div style="margin-bottom: 20px;">
                    🔊 浏览器需要用户交互才能播放音频
                </div>
                <button id="enable-audio-btn" style="
                    background: #007bff; color: white; border: none;
                    padding: 12px 24px; border-radius: 5px; cursor: pointer;
                    font-size: 16px;
                ">点击启用音频播放</button>
            `;

            document.body.appendChild(promptDiv);

            document.getElementById('enable-audio-btn').onclick = () => {
                promptDiv.remove();
                resolve();
            };
        });
    }

    async function getAudioContext() {
        if (!globalAudioContext || globalAudioContext.state === 'closed') {
            globalAudioContext = new (window.AudioContext || window.webkitAudioContext)();
        }

        if (globalAudioContext.state === 'suspended') {
            // 尝试直接恢复音频上下文
            try {
                await globalAudioContext.resume();
            } catch (error) {
                // 如果失败，提示用户交互
                await createInteractionPrompt();
                await globalAudioContext.resume();
            }
        }

        return globalAudioContext;
    }

    async function mergeAudioFiles(audioBuffers, word, playOnly = false, progressCallback = null) {
        if (audioBuffers.length === 0) {
            alert('没有有效的音频文件可以合并。');
            return;
        }

        const audioContext = await getAudioContext();

        // 确保音频上下文处于运行状态
        await ensureAudioContextRunning(audioContext);

        const decodedBuffers = [];

        console.log(`开始解码 ${audioBuffers.length} 个音频文件...`);
        for (let i = 0; i < audioBuffers.length; i++) {
            const buffer = audioBuffers[i];
            if (buffer) {
                try {
                    console.log(`正在解码音频 ${i + 1}/${audioBuffers.length}...`);

                    // 添加解码超时处理，增加超时时间
                    const decodePromise = audioContext.decodeAudioData(buffer.slice());
                    const timeoutPromise = new Promise((_, reject) => {
                        setTimeout(() => reject(new Error('音频解码超时')), 15000); // 增加到15秒超时
                    });

                    const decodedBuffer = await Promise.race([decodePromise, timeoutPromise]);
                    decodedBuffers.push(decodedBuffer);
                    console.log(`音频 ${i + 1} 解码成功，时长: ${decodedBuffer.duration.toFixed(2)}秒`);

                    // 更新进度
                    if (progressCallback) {
                        progressCallback(i + 1, `正在解码音频 ${i + 1}/${audioBuffers.length}`);
                    }
                } catch (error) {
                    console.error(`解码音频 ${i + 1} 失败:`, error);
                }
            }
        }

        if (decodedBuffers.length === 0) {
            console.error('所有音频文件解码失败');
            alert('所有音频文件解码失败。');
            audioContext.close();
            return;
        }

        console.log(`成功解码 ${decodedBuffers.length} 个音频文件`);

        // 计算所有音频的音量标准化增益
        console.log('开始计算音量标准化增益...');
        if (progressCallback) {
            progressCallback(audioBuffers.length + 1, '正在计算音量标准化增益...');
        }

        const volumeGains = calculateNormalizedGains(decodedBuffers);
        console.log('音频标准化增益:', volumeGains);

        // 智能循环重复逻辑：当发音数量较少时，自动重复播放
        let repeatCount = 1;
        if (decodedBuffers.length === 1) {
            repeatCount = 3; // 只有1个发音时，重复3次
        } else if (decodedBuffers.length === 2) {
            repeatCount = 2; // 只有2个发音时，重复2次
        }

        console.log(`发音数量: ${decodedBuffers.length}, 重复次数: ${repeatCount}`);

        const silenceDuration = 0.5;
        const sampleRate = decodedBuffers[0].sampleRate;
        const silenceSamples = Math.floor(silenceDuration * sampleRate);

        // 计算总长度时考虑重复次数
        const singleRoundLength = decodedBuffers.reduce((len, buf) => len + buf.length + silenceSamples, 0);
        const betweenRoundsSilence = Math.floor(1.0 * sampleRate); // 每轮之间1秒间隔
        let totalLength = singleRoundLength * repeatCount + betweenRoundsSilence * (repeatCount - 1);

        console.log(`创建合并缓冲区，总长度: ${totalLength} 样本，约 ${(totalLength / sampleRate).toFixed(2)} 秒`);
        const mergedBuffer = audioContext.createBuffer(1, totalLength, sampleRate);
        const mergedData = mergedBuffer.getChannelData(0);
        let offset = 0;

        // 重复播放多轮
        console.log('开始合并音频数据...');
        if (progressCallback) {
            progressCallback(audioBuffers.length + 2, '正在合并音频数据...');
        }
        for (let round = 0; round < repeatCount; round++) {
            console.log(`处理第 ${round + 1}/${repeatCount} 轮...`);
            for (let i = 0; i < decodedBuffers.length; i++) {
                const buffer = decodedBuffers[i];
                const gain = volumeGains[i];
                const sourceData = buffer.getChannelData(0);

                console.log(`合并音频 ${i + 1}，增益: ${gain.toFixed(2)}, 长度: ${sourceData.length} 样本`);

                // 应用音频增益并复制数据
                for (let j = 0; j < sourceData.length; j++) {
                    mergedData[offset + j] = Math.max(-1, Math.min(1, sourceData[j] * gain));
                }

                offset += buffer.length + silenceSamples;
            }

            // 在每轮之间添加较长的静音间隔（除了最后一轮）
            if (round < repeatCount - 1) {
                offset += betweenRoundsSilence;
            }
        }
        console.log('音频数据合并完成');

        if (playOnly) {
            // 直接播放，不下载
            try {
                console.log('准备播放音频...');
                console.log('音频上下文状态:', audioContext.state);
                console.log('合并后的音频时长:', mergedBuffer.duration.toFixed(2), '秒');
                console.log('音频采样率:', mergedBuffer.sampleRate);
                console.log('音频通道数:', mergedBuffer.numberOfChannels);

                const source = audioContext.createBufferSource();
                source.buffer = mergedBuffer;
                source.connect(audioContext.destination);

                console.log('开始播放音频...');
                if (progressCallback) {
                    progressCallback(audioBuffers.length + 3, '正在播放音频...');
                }
                source.start(0);

                // 播放完成后不立即关闭全局音频上下文，保持可用状态
                source.onended = () => {
                    console.log('音频播放完成');
                    // 不关闭全局音频上下文，保持可用状态以便后续播放
                };

                // 添加错误处理
                source.onerror = (error) => {
                    console.error('音频播放出错:', error);
                    // 发生错误时也不关闭全局音频上下文
                };

                console.log('音频播放已启动');

            } catch (error) {
                console.error('创建音频源失败:', error);
                alert('音频播放失败: ' + error.message);
                // 不关闭全局音频上下文，保持可用状态
                throw error;
            }
            return;
        }

        // 原有的下载逻辑
        const wavBuffer = audioBufferToWav(mergedBuffer);
        const blob = new Blob([wavBuffer], { type: 'audio/wav' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `${word}_${getTargetLanguageFromUrl()}_x${repeatCount}.wav`;
        a.click();
        URL.revokeObjectURL(url);
        // 不关闭全局音频上下文，保持可用状态
    }

    function calculateAudioStats(buffer) {
        const data = buffer.getChannelData(0);
        let maxAmplitude = 0;
        let rmsSum = 0;
        let activeSamples = 0;

        // 计算最大振幅和RMS值，忽略静音部分
        const silenceThreshold = 0.001; // 静音阈值

        for (let i = 0; i < data.length; i++) {
            const sample = Math.abs(data[i]);
            maxAmplitude = Math.max(maxAmplitude, sample);

            // 只计算非静音部分的RMS
            if (sample > silenceThreshold) {
                rmsSum += sample * sample;
                activeSamples++;
            }
        }

        // 如果全是静音，使用全部样本计算
        if (activeSamples === 0) {
            activeSamples = data.length;
            for (let i = 0; i < data.length; i++) {
                const sample = Math.abs(data[i]);
                rmsSum += sample * sample;
            }
        }

        const rms = Math.sqrt(rmsSum / activeSamples);
        return { rms, maxAmplitude, activeSamples, totalSamples: data.length };
    }

    function calculateNormalizedGains(buffers) {
        // 计算所有音频的统计信息
        const audioStats = buffers.map(buffer => calculateAudioStats(buffer));

        // 设定标准音量目标
        const TARGET_RMS = 0.12;  // 降低目标音量，更容易达到

        console.log('=== 音频标准化处理 ===');

        // 为每个音频单独计算标准化增益
        return audioStats.map((stats, index) => {
            if (stats.rms <= 0 || stats.maxAmplitude <= 0) {
                console.log(`音频${index + 1}: 静音或无效，跳过处理`);
                return 1.0;
            }

            // 直接计算达到目标音量所需的增益
            const targetGain = TARGET_RMS / stats.rms;

            // 大幅提高增益限制，处理极低音量音频
            const MAX_GAIN = 25.0;  // 最大增益25倍
            const MIN_GAIN = 0.1;   // 最小增益0.1倍

            const finalGain = Math.min(Math.max(targetGain, MIN_GAIN), MAX_GAIN);

            const resultRMS = stats.rms * finalGain;
            const resultPeak = stats.maxAmplitude * finalGain;

            console.log(`音频${index + 1}: 原RMS=${stats.rms.toFixed(3)} -> 增益=${finalGain.toFixed(2)}x -> 结果RMS=${resultRMS.toFixed(3)}, Peak=${resultPeak.toFixed(3)}`);

            return finalGain;
        });
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

        for (let i = 0; i < buffer.numberOfChannels; i++) channels.push(buffer.getChannelData(i));

        while (pos < length) {
            for (let i = 0; i < numOfChan; i++) {
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

            loadingDiv.innerHTML = `正在并发下载 ${audioUrls.length} 个音频 (最多4个并发)...`;

            const audioBuffers = [];

            // 使用并发控制下载，带进度回调
            const results = await downloadWithConcurrencyLimit(audioUrls, 4, (completed, total) => {
                loadingDiv.innerHTML = `下载进度: ${completed}/${total}`;
            });

            results.forEach((result, index) => {
                if (result.status === 'fulfilled' && result.value.buffer) {
                    audioBuffers.push(result.value.buffer);
                } else {
                    console.error(`音频 ${index + 1} 下载失败:`, result.reason || '未知错误');
                }
            });

            if (audioBuffers.length === 0) {
                alert('所有音频下载失败。');
                return;
            }

            // 计算重复次数用于提示
            let repeatCount = 1;
            if (audioBuffers.length === 1) {
                repeatCount = 3;
            } else if (audioBuffers.length === 2) {
                repeatCount = 2;
            }

            const repeatInfo = repeatCount > 1 ? ` (将重复${repeatCount}次)` : '';
            loadingDiv.innerHTML = `下载完成，正在标准化音量并合并${repeatInfo}...`;
            await mergeAudioFiles(audioBuffers, word);
            loadingDiv.innerHTML = '✅ 合并完成！';

        } catch (error) {
            console.error('下载合并音频时出错:', error);
            alert('下载合并音频时出错: ' + error.message);
        } finally {
            setTimeout(() => loadingDiv.remove(), 2000);
        }
    }



    async function playMergedAudio(word) {
        const loadingDiv = document.createElement('div');
        loadingDiv.id = 'forvo-loading-play';
        const targetLanguage = getTargetLanguageFromUrl();

        loadingDiv.innerHTML = `正在准备播放${targetLanguage}语言的音频...`;
        loadingDiv.style.cssText = `position:fixed;top:50%;left:50%;transform:translate(-50%,-50%);background:rgba(0,0,0,0.8);color:white;padding:20px;border-radius:10px;z-index:10000001;font-size:16px;text-align:center;`;
        document.body.appendChild(loadingDiv);

        try {
            console.log('开始获取音频URL，目标单词:', word);
            const audioUrls = await getAllAudioUrls(word);
            console.log('获取到音频URL数量:', audioUrls.length, '具体URL:', audioUrls);

            if (audioUrls.length === 0) {
                console.log('未找到音频URL，显示警告');
                alert(`在'${word}'页面上未能找到任何'${targetLanguage}'语言的主词条音频。请确认页面上是否有该语言的发音，且脚本规则未失效。`);
                return;
            }

            if (typeof GM_xmlhttpRequest === 'undefined') {
                alert('权限受限，无法播放合并音频。请使用下载功能。');
                return;
            }

            loadingDiv.innerHTML = `正在并发下载 ${audioUrls.length} 个音频 (最多4个并发)...`;

            const audioBuffers = [];

            // 使用并发控制下载，带进度回调
            const results = await downloadWithConcurrencyLimit(audioUrls, 4, (completed, total) => {
                loadingDiv.innerHTML = `下载进度: ${completed}/${total}`;
            });

            results.forEach((result, index) => {
                if (result.status === 'fulfilled' && result.value.buffer) {
                    audioBuffers.push(result.value.buffer);
                } else {
                    console.error(`音频 ${index + 1} 下载失败:`, result.reason || '未知错误');
                }
            });

            if (audioBuffers.length === 0) {
                alert('所有音频下载失败。');
                return;
            }

            // 计算重复次数用于提示
            let repeatCount = 1;
            if (audioBuffers.length === 1) {
                repeatCount = 3;
            } else if (audioBuffers.length === 2) {
                repeatCount = 2;
            }

            const repeatInfo = repeatCount > 1 ? ` (将重复${repeatCount}次)` : '';
            loadingDiv.innerHTML = `正在合并并播放音频${repeatInfo}...`;

            // 创建进度更新函数
            let progressStep = 0;
            const totalSteps = audioBuffers.length + 3; // 解码 + 计算增益 + 合并 + 播放
            const updateProgress = (step, message) => {
                progressStep = step;
                const percent = Math.round((progressStep / totalSteps) * 100);
                loadingDiv.innerHTML = `${message} (${percent}%)`;
            };

            // 添加音频播放前的检查
            console.log(`准备播放 ${audioBuffers.length} 个音频文件`);

            try {
                // 为整个合并过程添加超时处理，增加超时时间
                const mergePromise = mergeAudioFiles(audioBuffers, word, true, updateProgress);
                const timeoutPromise = new Promise((_, reject) => {
                    setTimeout(() => reject(new Error('音频合并超时')), 60000); // 增加到60秒超时
                });

                await Promise.race([mergePromise, timeoutPromise]);
                loadingDiv.innerHTML = '🔊 正在播放...';

                // 播放开始后，延迟移除提示
                setTimeout(() => {
                    if (document.getElementById('forvo-loading-play')) {
                        loadingDiv.remove();
                    }
                }, 2000);

            } catch (mergeError) {
                console.error('合并音频时出错:', mergeError);

                loadingDiv.innerHTML = '❌ 播放失败: ' + mergeError.message;
                setTimeout(() => loadingDiv.remove(), 3000);
                throw mergeError;
            }

            // 播放完成后自动关闭提示
            setTimeout(() => {
                if (document.getElementById('forvo-loading-play')) {
                    loadingDiv.remove();
                }
            }, 5000); // 延长显示时间

        } catch (error) {
            console.error('播放合并音频时出错:', error);
            alert('播放合并音频时出错: ' + error.message);
        } finally {
            setTimeout(() => {
                if (document.getElementById('forvo-loading-play')) {
                    loadingDiv.remove();
                }
            }, 5000);
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
                if (document.getElementsByClassName("play").length > 0) {
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

                    const targetLanguage = getTargetLanguageFromUrl();



                    // 播放按钮
                    const playBtn = document.createElement('button');
                    playBtn.id = 'forvo-play-btn';
                    playBtn.innerHTML = `🔊 播放合并音频 (${targetLanguage})`;
                    playBtn.style.cssText = `position:fixed;top:60px;right:10px;z-index:9999999;background:#007bff;color:white;border:none;padding:10px 15px;border-radius:5px;cursor:pointer;font-size:14px;box-shadow:0 2px 10px rgba(0,0,0,0.3);`;

                    playBtn.onclick = async () => {
                        const word = getWordFromUrl();
                        await playMergedAudio(word);
                    };
                    document.body.appendChild(playBtn);

                    // 下载按钮
                    const downloadBtn = document.createElement('button');
                    downloadBtn.id = 'forvo-download-btn';
                    downloadBtn.innerHTML = `📥 下载合并音频 (${targetLanguage})`;
                    downloadBtn.style.cssText = `position:fixed;top:110px;right:10px;z-index:9999999;background:#28a745;color:white;border:none;padding:10px 15px;border-radius:5px;cursor:pointer;font-size:14px;box-shadow:0 2px 10px rgba(0,0,0,0.3);`;

                    downloadBtn.onclick = async () => {
                        const word = getWordFromUrl();
                        await downloadMergedAudio(word);
                    };
                    document.body.appendChild(downloadBtn);




                }
            }, 2000);
        });
    }

    // 阻止登录弹窗出现
    function blockLoginPopup() {
        // 移除登录弹窗
        const loginPopup = document.querySelector('.mfp-content .login-register-popup');
        if (loginPopup) {
            const popupContainer = loginPopup.closest('.mfp-content');
            if (popupContainer) {
                popupContainer.remove();
                console.log('已移除登录弹窗');
            }
        }

        // 移除弹窗背景遮罩
        const overlay = document.querySelector('.mfp-bg');
        if (overlay) {
            overlay.remove();
        }

        // 移除可能的弹窗容器
        const mfpWrap = document.querySelector('.mfp-wrap');
        if (mfpWrap) {
            mfpWrap.remove();
        }

        // 恢复页面滚动
        document.body.style.overflow = '';
        document.documentElement.style.overflow = '';
    }

    // 页面加载完成后立即检查并移除弹窗
    if (isForvoWordPage()) {
        // 立即执行一次
        blockLoginPopup();

        // 使用 MutationObserver 监听DOM变化，防止弹窗动态加载
        const observer = new MutationObserver((mutations) => {
            mutations.forEach((mutation) => {
                mutation.addedNodes.forEach((node) => {
                    if (node.nodeType === 1) { // 元素节点
                        // 检查新添加的节点是否包含登录弹窗
                        if (node.classList && (node.classList.contains('mfp-content') ||
                            node.classList.contains('mfp-bg') ||
                            node.classList.contains('mfp-wrap'))) {
                            setTimeout(blockLoginPopup, 100);
                        }

                        // 检查子节点中是否有登录弹窗
                        const loginPopup = node.querySelector && node.querySelector('.login-register-popup');
                        if (loginPopup) {
                            setTimeout(blockLoginPopup, 100);
                        }
                    }
                });
            });
        });

        // 开始监听
        observer.observe(document.body, {
            childList: true,
            subtree: true
        });

        // 定期检查（作为备用方案）
        setInterval(blockLoginPopup, 1000);
    }

    console.log('Forvo发音弹窗已加载，登录弹窗拦截功能已启用。');

})();