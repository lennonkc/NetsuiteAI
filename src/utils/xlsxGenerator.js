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

const merge_html = "./public/html/mergedTableMar_16.html";
const vendorReport_html = "./public/html/vendorHtmlTableMar_16.html";
const ptDefine_csv = "private/PaymentTerm_define.csv";
const paid_csv = "private/paid_Feb25.csv";
const vendorID_json = "private/VendorID_Mar_16.json";
const recordSources_json = "private/Record_Mar_16.json";

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

(function main() {
  try {
    // 1. 读取 JSON 文件
    const vendorID_jsonPath = vendorID_json;
    const recordSources_jsonPath = recordSources_json;

    const vendorIDData = JSON.parse(fs.readFileSync(vendorID_jsonPath, "utf8"));
    const recordSourcesData = JSON.parse(
      fs.readFileSync(recordSources_jsonPath, "utf8")
    );

    // 2. 生成 Vendor ID sheet 的 AOA 数据
    const vendorSheetAoa = buildVendorIdSheetData(vendorIDData);
    // 3. 生成 full Records Source sheet 的 AOA 数据
    const recordsSheetAoa = buildRecordSourcesSheetData(recordSourcesData);

    // 4. 解析 HTML 文件得到 AOA
    const merge_htmlPath = merge_html;
    const vendorReport_htmlPath = vendorReport_html;

    const mergeBudgetAoa = parseHtmlFileToAoA(merge_htmlPath); // "Merge Budget"
    const vendorPayPlanAoa = parseHtmlFileToAoA(vendorReport_htmlPath); // "Vendor Pay Plan"

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
    xlsx.utils.book_append_sheet(workbook, recordsWS, "full Records Source");

    // 6. 写出到 XLSX 文件
    const outputFile = `public/output${getCurrentTime()}.xlsx`;
    xlsx.writeFile(workbook, outputFile);

    console.log(`Excel 文件已成功生成: ${outputFile}`);
  } catch (err) {
    console.error("生成 XLSX 过程中出现错误:", err);
  }
})();
