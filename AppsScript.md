1.確定名稱為Code.gs

2.貼上以下程式碼

// Code.gs

// 處理 GET 請求：讀取單字庫或排行榜
function doGet(e) {
  const action = e.parameter.action;
  const ss = SpreadsheetApp.getActiveSpreadsheet();

  if (action === "getLeaderboard") {
    const sheet = ss.getSheetByName("Leaderboard");
    if (!sheet) return ContentService.createTextOutput(JSON.stringify([])).setMimeType(ContentService.MimeType.JSON);
    const data = sheet.getDataRange().getValues();
    data.shift(); // 移除標題
    const sortedData = data.sort((a, b) => b[1] - a[1]).slice(0, 10).map(row => ({ name: row[0], score: row[1] }));
    return ContentService.createTextOutput(JSON.stringify(sortedData)).setMimeType(ContentService.MimeType.JSON);
  } 
  
  // 預設行為：回傳單字庫
  const sheet = ss.getSheetByName("Vocab_Database");
  if (!sheet) return ContentService.createTextOutput(JSON.stringify([])).setMimeType(ContentService.MimeType.JSON);
  const data = sheet.getDataRange().getValues();
  const headers = data.shift();
  const result = data.map(row => {
    let obj = {};
    headers.forEach((header, i) => obj[header] = row[i]);
    return obj;
  });
  
  return ContentService.createTextOutput(JSON.stringify(result)).setMimeType(ContentService.MimeType.JSON);
}

// 處理所有的 POST 請求
function doPost(e) {
  try {
    const params = JSON.parse(e.postData.contents);
    
    // 路由判定：根據前端傳來的 action 決定執行哪個功能
    if (params.action === "bulkImport") {
      return handleBulkImport(params.data);
    } else {
      return handleScoreUpload(params);
    }
  } catch (error) {
    return ContentService.createTextOutput(JSON.stringify({ status: "error", msg: error.toString() }))
      .setMimeType(ContentService.MimeType.JSON);
  }
}

// 處理：老師大量匯入單字
function handleBulkImport(dataArray) {
  const sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName("Vocab_Database");
  const lastRow = Math.max(sheet.getLastRow(), 1); 
  
  // 取得最後一個單字的 ID，以便遞增
  let lastId = 0;
  if (lastRow > 1) {
    const idValue = sheet.getRange(lastRow, 1).getValue();
    lastId = isNaN(idValue) ? 0 : parseInt(idValue);
  }

  const rowsToInsert = [];
  dataArray.forEach(item => {
    lastId++;
    rowsToInsert.push([
      lastId, 
      item.word, 
      item.translation, 
      item.category, 
      item.difficulty || 1
    ]);
  });

  // 效能最佳化：一次性寫入所有資料
  if (rowsToInsert.length > 0) {
    sheet.getRange(lastRow + 1, 1, rowsToInsert.length, rowsToInsert[0].length).setValues(rowsToInsert);
  }
  return ContentService.createTextOutput(JSON.stringify({ status: "success", importedCount: rowsToInsert.length }))
    .setMimeType(ContentService.MimeType.JSON);
}

// 處理：學生上傳遊戲分數 (保留原本的邏輯)
function handleScoreUpload(params) {
  const sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName("Leaderboard");
  const data = sheet.getDataRange().getValues();
  const name = params.userName;
  const newScore = params.score;
  
  let userRow = -1;
  for (let i = 1; i < data.length; i++) {
    if (data[i][0] === name) {
      userRow = i + 1;
      break;
    }
  }

  if (userRow > 0) {
    const currentHighScore = sheet.getRange(userRow, 2).getValue();
    if (newScore > currentHighScore) {
      sheet.getRange(userRow, 2).setValue(newScore);
      sheet.getRange(userRow, 3).setValue(new Date());
    }
  } else {
    sheet.appendRow([name, newScore, new Date()]);
  }
  return ContentService.createTextOutput(JSON.stringify({ status: "success" }))
    .setMimeType(ContentService.MimeType.JSON);
}

3.部署
新增部署作業>網頁應用程式>誰可以存取選擇所有人

