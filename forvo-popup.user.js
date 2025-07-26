// ==UserScript==
// @name         Forvo发音弹窗
// @namespace    http://tampermonkey.net/
// @version      1.0
// @description  选中单词后弹窗显示Forvo发音页面，支持英语和日语自动识别
// @author       Jooooody
// @match        *://*/*
// @grant        none
// @run-at       document-end
// ==/UserScript==

(function() {
    'use strict';



    // 检测文本是否包含日语字符
    function containsJapanese(text) {
        // 日语Unicode范围：
        // 3040-309F: 平假名
        // 30A0-30FF: 片假名  
        // 4E00-9FAF: 汉字(CJK统一表意文字)
        // 3000-303F: 日式标点符号
        // FF00-FF9F: 全角字符
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

    // 创建Forvo弹窗
    function createForvoPopup(url) {
        // 直接打开新窗口，设置为响应式弹窗样式
        const screenWidth = window.screen.width;
        const screenHeight = window.screen.height;

        // 响应式尺寸计算
        let popupWidth, popupHeight;
        if (screenWidth <= 768) {
            // 移动设备
            popupWidth = Math.min(screenWidth * 0.95, 400);
            popupHeight = Math.min(screenHeight * 0.8, 600);
        } else if (screenWidth <= 1024) {
            // 平板设备
            popupWidth = Math.min(screenWidth * 0.8, 600);
            popupHeight = Math.min(screenHeight * 0.8, 700);
        } else {
            // 桌面设备
            popupWidth = Math.min(screenWidth * 0.6, 800);
            popupHeight = Math.min(screenHeight * 0.8, 800);
        }

        // 计算居中位置
        const left = (screenWidth - popupWidth) / 2;
        const top = (screenHeight - popupHeight) / 2;

        const windowFeatures = `width=${popupWidth},height=${popupHeight},left=${left},top=${top},scrollbars=yes,resizable=yes,toolbar=no,menubar=no,location=no,status=no`;

        window.open(url, 'forvo_popup', windowFeatures);
    }



    // 获取选中的文本
    function getSelectedText() {
        const selection = window.getSelection();
        return selection.toString().trim();
    }



    // 处理Ctrl+Alt组合键
    function handleKeyDown(e) {
        // 检查是否按下了Ctrl+Alt组合键
        if (e.ctrlKey && e.altKey) {
            const text = getSelectedText();

            if (text && text.length > 0 && text.length <= 50) {
                e.preventDefault();
                const language = detectLanguage(text);
                const forvoUrl = buildForvoUrl(text, language);
                createForvoPopup(forvoUrl);
            }
        }
    }

    // 添加事件监听器
    document.addEventListener('keydown', handleKeyDown);

    // 添加样式，防止与网站样式冲突
    const style = document.createElement('style');
    style.textContent = `
        #forvo-popup-overlay * {
            box-sizing: border-box;
            font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
        }

        @keyframes popupFadeIn {
            from {
                opacity: 0;
                transform: scale(0.9) translateY(-20px);
            }
            to {
                opacity: 1;
                transform: scale(1) translateY(0);
            }
        }
    `;
    document.head.appendChild(style);

    console.log('Forvo发音弹窗脚本已加载');
})();
