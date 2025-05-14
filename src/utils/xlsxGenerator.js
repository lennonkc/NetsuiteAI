/**
 * Node.js 脚本示例：合并不同数据源到一个 XLSX 文件
 *
 * 功能：
 * 1. 从 vendorID_json 和 recordSources_json 两个 JSON 文件中读取数据，并各自输出到 XLSX 不同 Sheet。
 * 2. 从 merge_html 和 vendorReport_html 两个 HTML 文件中解析表格数据，并各自输出到 XLSX 的不同 Sheet。
 * 3. 最终形成一个包含 4 个工作表的 Excel 文件（output.xlsx）。
 *
 * 依赖：
 *   - xlsx  (npm install xlsx)
 *   - cheerio (npm install cheerio)
 *
 * 注意：
 *   - 如果需要更多表格格式设置或单元格样式，可以根据 xlsx 库的文档进行扩展。
 *   - 如果 HTML 中存在多个 <table>，请根据实际需求修改解析逻辑。
 */
const fs = require("fs");
const xlsx = require("xlsx");
const cheerio = require("cheerio");

const merge_html = "private/2025May/mergedTableMay_14.html";
const vendorReport_html = "private/2025May/vendorHtmlTableMay_14.html";
const ptDefine_csv = "private/PaymentTerm_define.csv";
const paid_csv = "private/2025May/paidPOMay9.csv";
const vendorID_json = "private/2025May/VendorID_May_14.json";
const recordSources_json = "private/2025May/PurchaseOrderMay14.json";
const finaljson_path = "private/2025May/final_May_14.json";

// 获取当前时间并格式化为 Month_Day
function getCurrentTime() {
  const now = new Date();
  const month = now.toLocaleString("en-US", { month: "short" });
  const day = now.getDate();
  return `${month}_${day}`;
}

/**
 * 从 HTML 文件中提取 <table> 的数据，并返回 AOA (Array of Arrays) 格式。
 * 仅解析第一个 <table>。
 * 规则：
 *  - 如果单元格中存在 <input>，读取 input 的 value 作为单元格值；
 *  - 否则读取单元格文本。
 */
function parseHtmlFileToAoA(htmlFilePath) {
  // 1. 读取 HTML 内容
  const rawHtml = fs.readFileSync(htmlFilePath, "utf8");

  // 2. 使用 cheerio 解析
  const $ = cheerio.load(rawHtml);

  // 3. 只解析第一个 table
  const table = $("table").first();
  if (!table || table.length === 0) {
    // 若找不到 table，就返回空数组
    return [];
  }

  const aoa = [];
  // 4. 遍历行 <tr>
  table.find("tr").each((_, tr) => {
    const rowData = [];
    // 对该行中的所有 <th> 或 <td> 进行解析
    $(tr)
      .find("th, td")
      .each((__, cell) => {
        const $cell = $(cell);
        // 如果有 <input>，则读取其 value 属性
        const $input = $cell.find("input");
        if ($input.length > 0) {
          // 若 input 存在，则取其 value
          rowData.push($input.attr("value") || "");
        } else {
          // 否则取单元格文本
          const cellText = $cell.text().trim();
          rowData.push(cellText);
        }
      });
    aoa.push(rowData);
  });

  return aoa;
}

/**
 * 将 vendorID_json 转换为适合 xlsx.utils.aoa_to_sheet 的二维数组
 * 要求：
 *  - 第一行: ["count", <countValue>]
 *  - 第二行: ["companyname","entityid","id","term_name","terms"]
 *  - 第三行开始: 按 items 数组逐行填充
 */
function buildVendorIdSheetData(vendorData) {
  const result = [];
  // 第一行
  result.push(["count", vendorData.count]);

  // 第二行（固定列名）
  const headers = ["companyname", "entityid", "id", "term_name", "terms"];
  result.push(headers);

  // 第三行开始：items 中的每个对象
  vendorData.items.forEach((item) => {
    result.push([
      item.companyname || "",
      item.entityid || "",
      item.id || "",
      item.term_name || "",
      item.terms || "",
    ]);
  });
  return result;
}

/**
 * 将 recordSources_json 转换为二维数组
 * 要求：
 *  - 第一行: ["totalRecords", <totalRecordsValue>]
 *  - 第二行: data 数组中所有对象 key 的集合
 *  - 第三行开始: data 中每个对象对应一行
 */
function buildRecordSourcesSheetData(recordData) {
  const result = [];
  // 第一行
  result.push(["totalRecords", recordData.totalRecords]);

  // 将 data 数组中所有对象的 key 取并集
  const allKeys = new Set();
  recordData.data.forEach((obj) => {
    Object.keys(obj).forEach((k) => allKeys.add(k));
  });
  const headerArr = Array.from(allKeys);
  // 第二行 - 列名
  result.push(headerArr);

  // 第三行开始 - data 内容
  recordData.data.forEach((obj) => {
    const row = headerArr.map((col) => obj[col] || "");
    result.push(row);
  });

  return result;
}

/**
 * 简单的 CSV 转 AOA (Array of Arrays) 函数
 * 根据逗号拆分为二维数组，如果需要更高级的解析可以使用 csv-parse 等库
 */
function parseCsvToAoA(csvFilePath) {
    const csvString = fs.readFileSync(csvFilePath, 'utf8');
    // 将每行拆分为数组，再按逗号拆分列
    return csvString
      .split(/\r?\n/)
      .map(line => line.split(','));
  }

/**
 * 构建 finalJSON 对应的二维数组 (AOA)，并返回
 * 其中:
 *  第一行是合并多列的列名 (大标题行)：
 *     - "PO Data" 合并 Supplier~ID 这10列
 *     - "Payment Terms Define" 合并 term_name~Net_Days 这4列
 *     - "Balance Data" 合并 Unpaid_Vaule~Unpaid $ Due 这5列
 *     - "Deposit Data" 合并 Deposit_Date~Deposit $ Due 这4列
 *     - "Prepay Data" 合并 Prepay Date~Prepay $ Due 这4列
 *  第二行是各字段的具体列名
 *  第三行及之后是 data 数组中的逐行数据
 */
/**
 * 根据新的数据结构，构建适合导出至 XLSX 的二维数组 (AOA)。
 * 1) 第一行是大标题行，带合并单元格，用于分组。
 * 2) 第二行是字段名（共30列）。
 * 3) 第三行起是 data 数组的逐条记录。
 */
function buildFinalSheetAoa(finalDataArray) {
  // =========== 第一行: 大标题行, 带合并 ===========
  // 共 30 列: 0..9 => "PO Data", 10..13 => "Payment Terms Define",
  //           14..15 => "Line Data", 16 => "paid",
  //           17..21 => "Unpaid Data", 22..25 => "Deposit Data",
  //           26..29 => "Prepay Data"
  const headerRow1 = [
    "PO Data", null, null, null, null, null, null, null, null, null,    // cols 0..9
    "Payment Terms Define", null, null, null,                           // cols 10..13
    "Line Data", null,                                                  // cols 14..15
    "paid",                                                             // col 16 (无合并)
    "Unpaid Data", null, null, null, null,                              // cols 17..21
    "Deposit Data", null, null, null,                                   // cols 22..25
    "Prepay Data", null, null, null                                     // cols 26..29
  ];

  // =========== 第二行: 具体字段列名 (30列) ===========
  const headerRow2 = [
    "Supplier",                     // 0
    "Status",                       // 1
    "PO #",                         // 2
    "Date Entered",                 // 3
    "PO Line No.",                  // 4
    "ASIN",                         // 5
    "Quantity",                     // 6
    "Cost in USD",                  // 7
    "Estimated Ready Date / ERD",   // 8
    "ID",                           // 9

    "term_name",                    // 10
    "Deposit_Required",             // 11
    "Prepay_H",                     // 12
    "Net_Days",                     // 13

    "Line_Values",                  // 14
    "Line_ratio",                   // 15

    "paid",                         // 16

    "Unpaid_Vaule",                 // 17
    "Unpaid Date",                  // 18
    "Unpaid % Due",                 // 19
    "Unpaid anchor",                // 20
    "Unpaid $ Due",                 // 21

    "Deposit_Date",                 // 22
    "Deposit % Due",               // 23
    "Deposit anchor",               // 24
    "Deposit $ Due",               // 25

    "Prepay Date",                  // 26
    "Prepay % Due",                 // 27
    "Prepay anchor",                // 28
    "Prepay $ Due"                  // 29
  ];

  // 存放最终表格数据的二维数组
  const aoa = [];
  aoa.push(headerRow1);
  aoa.push(headerRow2);

  // =========== 第三行开始: 填写 data 中的每个元素 ===========
  finalDataArray.forEach(item => {
    const row = [
      item.Supplier || "",
      item.Status || "",
      item["PO #"] || "",
      item["Date Entered"] || "",
      item["PO Line No."] || "",
      item.ASIN || "",
      item.Quantity || "",
      item["Cost in USD"] || "",
      item["Estimated Ready Date / ERD"] || "",
      item.ID || "",

      item.term_name || "",
      item.Deposit_Required || "",
      item.Prepay_H || "",
      item.Net_Days || "",

      // 新数据中常见字段: Line_Values, Line_ratio
      item.Line_Values !== undefined ? item.Line_Values : "",
      item.Line_ratio !== undefined ? item.Line_ratio : "",

      // paid
      item.paid !== undefined ? item.paid : "",

      // Unpaid 相关
      item.Unpaid?.value !== undefined ? item.Unpaid.value : "",
      item.Unpaid?.["Unpaid Date"] || "",
      item.Unpaid?.["Unpaid % Due"] || "",
      item.Unpaid?.["Unpaid anchor"] || "",
      item.Unpaid?.["Unpaid $ Due"] !== undefined ? item.Unpaid["Unpaid $ Due"] : "",

      // Deposit
      item.Deposit?.["Deposit Date"] || "",
      item.Deposit?.["Deposit % Due"] || "",
      item.Deposit?.["Deposit anchor"] || "",
      item.Deposit?.["Deposit $ Due"] !== undefined ? item.Deposit["Deposit $ Due"] : "",

      // Prepay
      item.Prepay?.["Prepay Date"] || "",
      item.Prepay?.["Prepay % Due"] || "",
      item.Prepay?.["Prepay anchor"] || "",
      item.Prepay?.["Prepay $ Due"] !== undefined ? item.Prepay["Prepay $ Due"] : ""
    ];
    aoa.push(row);
  });

  return aoa;
}

  
(function main() {
  try {
    // 1. 读取 JSON 文件的数据
    const vendorIDData = JSON.parse(fs.readFileSync(vendorID_json, "utf8"));
    const recordSourcesData = JSON.parse(
      fs.readFileSync(recordSources_json, "utf8")
    );

    // 2. 生成 Vendor ID sheet 的 AOA 数据
    const vendorSheetAoa = buildVendorIdSheetData(vendorIDData);
    // 3. 生成 full Records Source sheet 的 AOA 数据
    const recordsSheetAoa = buildRecordSourcesSheetData(recordSourcesData);

    // 4. 解析 HTML 文件得到 AOA
    const mergeBudgetAoa = parseHtmlFileToAoA(merge_html); // "Merge Budget"
    const vendorPayPlanAoa = parseHtmlFileToAoA(vendorReport_html); // "Vendor Pay Plan"

    // 5. 创建工作簿并依次添加表格
    const workbook = xlsx.utils.book_new();

    // Merge Budget
    if (mergeBudgetAoa.length > 0) {
      const mergeBudgetWS = xlsx.utils.aoa_to_sheet(mergeBudgetAoa);
      xlsx.utils.book_append_sheet(workbook, mergeBudgetWS, "Merge Budget");
    }

    // Vendor Pay Plan
    if (vendorPayPlanAoa.length > 0) {
      const vendorPayPlanWS = xlsx.utils.aoa_to_sheet(vendorPayPlanAoa);
      xlsx.utils.book_append_sheet(
        workbook,
        vendorPayPlanWS,
        "Vendor Pay Plan"
      );
    }

    // vendor ID
    const vendorWS = xlsx.utils.aoa_to_sheet(vendorSheetAoa);
    xlsx.utils.book_append_sheet(workbook, vendorWS, "vendor ID");

    // full Records Source
    const recordsWS = xlsx.utils.aoa_to_sheet(recordsSheetAoa);
    xlsx.utils.book_append_sheet(workbook, recordsWS, "full Open POs Records ");

    /* Final Calculator 数据转换*/
     // 读取 final_Mar_16.json 的数据
    const finalJsonRaw = JSON.parse(fs.readFileSync(finaljson_path, 'utf8'));
    // 这里只需 "data" 数组部分
    const finalJsonDataArray = finalJsonRaw.data || [];

    // 将其转换为二维数组 (AOA)
    const finalSheetAoa = buildFinalSheetAoa(finalJsonDataArray);

    // 先把二维数组转成 Worksheet
    const finalWS = xlsx.utils.aoa_to_sheet(finalSheetAoa);

    // 设置首行单元格合并
    // 注意：以 {s:{r,c}, e:{r,c}} 表示起点(行,列)到终点(行,列)（从 0 开始计数）
    finalWS["!merges"] = [
      // "PO Data" => columns 0..9
      { s: {r: 0, c: 0},  e: {r: 0, c: 9} },
      // "Payment Terms Define" => columns 10..13
      { s: {r: 0, c: 10}, e: {r: 0, c: 13} },
      // "Line Data" => columns 14..15
      { s: {r: 0, c: 14}, e: {r: 0, c: 15} },
      // paid => column 16 (无需合并, 只有1列, 可不设)
      // "Unpaid Data" => columns 17..21
      { s: {r: 0, c: 17}, e: {r: 0, c: 21} },
      // "Deposit Data" => columns 22..25
      { s: {r: 0, c: 22}, e: {r: 0, c: 25} },
      // "Prepay Data" => columns 26..29
      { s: {r: 0, c: 26}, e: {r: 0, c: 29} }
    ];

    // 将 Worksheet 添加到工作簿
    xlsx.utils.book_append_sheet(workbook, finalWS, "Calculator Records"); 

    /* CSV 文件转化 */
    // 读取并解析 CSV -> AOA
    const ptDefineData = parseCsvToAoA(ptDefine_csv);
    const paidData = parseCsvToAoA(paid_csv);

    // 转为 Worksheet 并附加到 Workbook
    const ptDefineWS = xlsx.utils.aoa_to_sheet(ptDefineData);
    xlsx.utils.book_append_sheet(workbook, ptDefineWS, "PT Define");

    const paidWS = xlsx.utils.aoa_to_sheet(paidData);
    xlsx.utils.book_append_sheet(workbook, paidWS, "Paid Data From Nick");
    // 6. 写出到 XLSX 文件
    const outputFile = `private/2025Apr/output${getCurrentTime()}.xlsx`;
    xlsx.writeFile(workbook, outputFile);

    console.log(`Excel 文件已成功生成: ${outputFile}`);
  } catch (err) {
    console.error("生成 XLSX 过程中出现错误:", err);
  }
})();
