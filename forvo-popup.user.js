// ==UserScript==
// @name         Forvo发音弹窗
// @namespace    http://tampermonkey.net/
// @version      1.1
// @description  选中单词后弹窗显示Forvo发音页面，支持英语和日语自动识别
// @author       Jooooody
// @match        *://*/*
// @grant        none
// @run-at       document-end
// ==/UserScript==

(function() {
    'use strict';

    let forvoButton = null; // 新增：用于存储浮动按钮的引用

    // 新增：一个简单的移动设备检测函数
    function isMobileDevice() {
        return (typeof window.orientation !== "undefined") || (navigator.userAgent.indexOf('IEMobile') !== -1) || (window.innerWidth <= 768);
    }

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

    function createForvoMobileButton() {
        if (forvoButton) return; 

        forvoButton = document.createElement('div');
        forvoButton.id = 'forvo-mobile-button';
        forvoButton.innerHTML = `<svg viewBox="0 0 24 24"><path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm-1.5 5h3v1.5h-3V7zm3 9.5h-3V15h3v1.5zm-3-3.5h3v-1.5h-3V13zm-3.5-2.5h10v-1.5H8.5V10.5z"></path></svg>`;

        // --- 核心事件处理逻辑修改开始 ---
        const handleButtonClick = function(e) {
            // 1. 立即阻止默认行为和事件传播，这是成功的关键！
            e.preventDefault();
            e.stopPropagation();

            const text = getSelectedText();
            if (text && text.length > 0 && text.length <= 50) {
                const language = detectLanguage(text);
                const forvoUrl = buildForvoUrl(text, language);
                window.open(forvoUrl, '_blank');
            }
            // 2. 手动移除按钮，因为它不会再因为selectionchange而移除了
            removeForvoMobileButton(); 
        };

        // 3. 同时监听 mousedown 和 touchstart 以实现最大兼容性
        forvoButton.addEventListener('mousedown', handleButtonClick);
        forvoButton.addEventListener('touchstart', handleButtonClick);
        // --- 核心事件处理逻辑修改结束 ---

        document.body.appendChild(forvoButton);
    }

    // 新增：移除浮动按钮的函数
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
            // 有文本被选中: 创建按钮并使其可见
            if (!forvoButton) {
                createForvoMobileButton();
            }
            // 延迟一帧确保元素已创建，再添加class以触发动画
            requestAnimationFrame(() => {
                if(forvoButton) forvoButton.classList.add('visible');
            });
        } else {
            // 没有文本被选中: 使按钮不可见
            if (forvoButton) {
                forvoButton.classList.remove('visible');
            }
        }
    }

    // --- 总的启动逻辑 ---
    // 修改：替换掉旧的事件监听器
    if (isMobileDevice()) {
        // 如果是移动设备，使用基于选择的触发器
        document.addEventListener('selectionchange', handleSelectionChange);
        // 在点击页面其他地方时也移除按钮
        document.addEventListener('click', removeForvoMobileButton);
    } else {
        // 如果是桌面设备，保留旧的键盘快捷键触发器
        document.addEventListener('keydown', handleKeyDown);
    }

    // 添加样式，防止与网站样式冲突
    const style = document.createElement('style');
    // 修改：替换为新的样式
        // 修改：替换为这个新的样式
    style.textContent = `
        #forvo-mobile-button {
            position: fixed; /* 关键：相对于屏幕视口定位 */
            z-index: 9999999;
            width: 48px;  /* 稍微增大尺寸，更易点击 */
            height: 48px;
            right: 20px;  /* 距离屏幕右边缘20px */
            bottom: 20px; /* 距离屏幕下边缘20px */
            background-color: #007bff;
            border-radius: 50%;
            display: flex;
            align-items: center;
            justify-content: center;
            cursor: pointer;
            box-shadow: 0 4px 12px rgba(0,0,0,0.25);
            transition: opacity 0.2s ease-out, transform 0.2s ease-out; /* 增加过渡动画 */
            opacity: 0; /* 初始状态为透明 */
            transform: scale(0.8); /* 初始状态为缩小 */
            pointer-events: none; /* 隐藏时不可点击 */
        }
        #forvo-mobile-button.visible {
            opacity: 1;
            transform: scale(1);
            pointer-events: auto; /* 显示时可点击 */
        }
        #forvo-mobile-button svg {
            width: 28px;
            height: 28px;
            fill: white;
        }
    `;
    document.head.appendChild(style);

    console.log('Forvo发音弹窗脚本已加载');
})();
