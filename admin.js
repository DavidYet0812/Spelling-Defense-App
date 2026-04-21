// admin.js

const fileInput = document.getElementById('csvFile');
const uploadBtn = document.getElementById('uploadBtn');
const previewTable = document.getElementById('previewTable');
const statusMsg = document.getElementById('statusMsg');

let parsedValidData = []; // 暫存通過驗證的資料

// 1. 監聽檔案上傳事件
fileInput.addEventListener('change', (e) => {
    const file = e.target.files[0];
    if (!file) return;

    // 使用 HTML5 FileReader 讀取本地檔案
    const reader = new FileReader();
    reader.onload = (event) => {
        const csvText = event.target.result;
        processCSV(csvText);
    };
    reader.readAsText(file);
});

// 2. 解析 CSV 並生成預覽表
function processCSV(text) {
    // 依斷行分割，並過濾掉空白行
    const rows = text.split('\n').map(row => row.trim()).filter(row => row.length > 0);
    
    parsedValidData = [];
    let errorCount = 0;
    
    // 初始化表格標題
    let tableHTML = '<tr><th>英文單字 (必填)</th><th>中文翻譯 (必填)</th><th>分類標籤</th><th>難度 (1-5)</th><th>系統檢查狀態</th></tr>';

    // 假設第一行是標題，從 i = 1 開始跑迴圈；若您的 CSV 沒有標題，請改為 i = 0
    const startIndex = (rows[0].includes('單字') || rows[0].includes('word')) ? 1 : 0;

    for (let i = startIndex; i < rows.length; i++) {
        // 處理包含逗號的特殊情況，這裡使用最基礎的 split 解析
        const cols = rows[i].split(',');
        
        const word = (cols[0] || '').trim();
        const translation = (cols[1] || '').trim();
        const category = (cols[2] || '未分類').trim();
        const difficulty = (cols[3] || '1').trim();

        let rowStatus = '<span style="color: green;">✔ 格式正確</span>';
        let rowClass = '';

        // 防呆驗證：單字與翻譯不能為空
        if (!word || !translation) {
            rowStatus = '✖ 錯誤：缺少必填欄位';
            rowClass = 'error-row';
            errorCount++;
        } else {
            parsedValidData.push({
                word: word,
                translation: translation,
                category: category,
                difficulty: parseInt(difficulty) || 1
            });
        }

        // 渲染每一列
        tableHTML += `<tr class="${rowClass}">
            <td><strong>${word}</strong></td>
            <td>${translation}</td>
            <td><span style="background:#e9ecef; padding:2px 8px; border-radius:12px; font-size:0.85em;">${category}</span></td>
            <td>${difficulty}</td>
            <td>${rowStatus}</td>
        </tr>`;
    }

    previewTable.innerHTML = tableHTML;
    
    // 更新狀態訊息與按鈕顯示
    const validCount = parsedValidData.length;
    if (validCount > 0) {
        statusMsg.innerHTML = `✅ 檔案解析完成。共載入 <strong>${validCount}</strong> 筆有效單字，發現 <strong>${errorCount}</strong> 筆錯誤（系統將自動略過錯誤資料）。`;
        uploadBtn.style.display = 'block';
    } else {
        statusMsg.innerHTML = `❌ 找不到任何有效的單字資料，請檢查 CSV 格式。`;
        uploadBtn.style.display = 'none';
    }
}

// 3. 提交資料至 GAS 後端
uploadBtn.addEventListener('click', async () => {
    if (parsedValidData.length === 0) return;

    if (typeof GAS_URL === 'undefined' || GAS_URL === "YOUR_GAS_URL") {
        alert("尚未設定後端 API！請先至 api.js 填入您的 Google Apps Script 網址。");
        return;
    }

    // 鎖定按鈕避免重複點擊
    uploadBtn.disabled = true;
    uploadBtn.innerText = "⏳ 資料匯入中，請稍候...";

    try {
        const response = await fetch(GAS_URL, {
            method: 'POST',
            body: JSON.stringify({
                action: 'bulkImport',
                data: parsedValidData
            })
        });

        const result = await response.json();

        if (result.status === 'success') {
            alert(`🎉 恭喜！成功將 ${result.importedCount} 筆單字匯入至資料庫。`);
            // 重置介面
            fileInput.value = '';
            previewTable.innerHTML = '';
            statusMsg.innerHTML = '';
            uploadBtn.style.display = 'none';
            parsedValidData = [];
        } else {
            alert(`匯入失敗：${result.msg}`);
        }
    } catch (error) {
        console.error(error);
        alert('網路連線異常或跨網域錯誤 (CORS)，請檢查 GAS 發布設定是否為「所有人」。');
    } finally {
        // 恢復按鈕狀態
        uploadBtn.disabled = false;
        uploadBtn.innerText = "確認匯入無誤，開始上傳";
    }
});

// --- 4. 側邊欄導航與分頁切換 ---
const navItems = {
    dashboard: document.getElementById('nav-dashboard'),
    vocab: document.getElementById('nav-vocab'),
    leaderboard: document.getElementById('nav-leaderboard')
};

const sections = {
    dashboard: document.getElementById('section-dashboard'),
    vocab: document.getElementById('section-vocab'),
    leaderboard: document.getElementById('section-leaderboard')
};

function switchTab(tabName) {
    // 更新選單樣式
    Object.values(navItems).forEach(nav => nav.classList.remove('active'));
    Object.values(sections).forEach(sec => sec.classList.remove('active'));
    
    navItems[tabName].classList.add('active');
    sections[tabName].classList.add('active');

    // 載入對應資料
    if (tabName === 'dashboard') loadDashboard();
    if (tabName === 'leaderboard') loadLeaderboard();
}

navItems.dashboard.addEventListener('click', () => switchTab('dashboard'));
navItems.vocab.addEventListener('click', () => switchTab('vocab'));
navItems.leaderboard.addEventListener('click', () => switchTab('leaderboard'));

// --- 5. 載入儀表板資料 ---
async function loadDashboard() {
    try {
        const stats = await fetchStats(); // api.js 提供
        document.getElementById('stat-vocab').innerText = stats.totalVocab;
        document.getElementById('stat-category').innerText = stats.categories;
        document.getElementById('stat-highest').innerText = stats.highestScore;
        document.getElementById('stat-players').innerText = stats.totalPlayers;
    } catch(e) {
        console.error("Dashboard Error:", e);
    }
}

// --- 6. 載入排行榜資料 ---
async function loadLeaderboard() {
    try {
        const tbody = document.getElementById('leaderboard-tbody');
        tbody.innerHTML = '<tr><td colspan="4" style="text-align: center;">資料載入中...</td></tr>';
        
        const list = await fetchLeaderboard(); // api.js 提供
        
        if (!list || list.length === 0) {
            tbody.innerHTML = '<tr><td colspan="4" style="text-align: center;">尚無排行榜資料</td></tr>';
            return;
        }
        
        let html = '';
        list.sort((a,b) => b.score - a.score).forEach((item, index) => {
            let rankIcon = index + 1;
            if(index === 0) rankIcon = '🥇 1';
            if(index === 1) rankIcon = '🥈 2';
            if(index === 2) rankIcon = '🥉 3';
            
            // 防禦模式打榜處理 (防呆確保資料結構正確)
            const dateStr = item.date || new Date().toISOString().split('T')[0];
            
            html += `<tr>
                <td><strong>${rankIcon}</strong></td>
                <td>${item.name || '匿名玩家'}</td>
                <td style="color:#28a745; font-weight:bold;">${item.score}</td>
                <td style="color:#6c757d; font-size:0.9em;">${dateStr}</td>
            </tr>`;
        });
        
        tbody.innerHTML = html;
        
    } catch(e) {
        console.error("Leaderboard Error:", e);
        document.getElementById('leaderboard-tbody').innerHTML = '<tr><td colspan="4" style="text-align: center; color:red;">伺服器連線失敗</td></tr>';
    }
}