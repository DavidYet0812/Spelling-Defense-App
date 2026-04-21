// api.js

// GAS 佈署網址（已設定完成）
const GAS_URL = "https://script.google.com/macros/s/AKfycby3haV2YSqrnmCFNdbCkiojOLuCnY2HbkqbTgxbtAnZoRthvl6nmvtGO3tDqOVzJViH4Q/exec"; 

// 預設題庫 (當 GAS 尚未設定或讀取失敗時使用)
const fallbackVocab = [
    { word: "apple", translation: "蘋果" },
    { word: "banana", translation: "香蕉" },
    { word: "tiger", translation: "老虎" },
    { word: "elephant", translation: "大象" },
    { word: "computer", translation: "電腦" },
    { word: "student", translation: "學生" }
];

async function fetchVocab() {
    try {
        // 若尚未設定 GAS 網址，使用預設題庫
        if (!GAS_URL || GAS_URL === "YOUR_GAS_URL") {
            console.log("尚未設定 GAS，使用內建預設單字庫");
            return fallbackVocab;
        }
        console.log("正在從 GAS 取得單字庫...");
        const response = await fetch(GAS_URL);
        const data = await response.json();
        console.log(`成功取得 ${data.length} 筆單字`);
        return data.length > 0 ? data : fallbackVocab;
    } catch (error) {
        console.error("單字讀取失敗，使用預設題庫", error);
        return fallbackVocab;
    }
}

async function uploadScore(name, score) {
    // 若尚未設定 GAS 網址，略過上傳
    if (!GAS_URL || GAS_URL === "YOUR_GAS_URL") {
        console.warn("尚未設定 GAS，無法上傳分數");
        return;
    }
    try {
        console.log(`正在上傳分數... 玩家: ${name}, 分數: ${score}`);
        const response = await fetch(GAS_URL, {
            method: "POST",
            body: JSON.stringify({ 
                action: "submitScore",
                userName: name, 
                score: score 
            })
        });
        const result = await response.json();
        console.log("分數上傳結果:", result);
    } catch (error) {
        console.error("分數上傳失敗", error);
    }
}