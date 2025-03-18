// services/fullSourcing.js

const fs = require("fs");
const path = require("path");
const csv = require("csv-parser");

/**
 * @description 获取当前时间，格式为 "Mon_Day" (例如 "Mar_5")
 */
function getCurrentTime() {
  const now = new Date();
  const month = now.toLocaleString("en-US", { month: "short" }); // 获取英文缩写月份，如 "Mar"
  const day = now.getDate(); // 获取日期，如 5
  return `${month}_${day}`;
}

//--------------------------------------------------------------------
// 1) 解析 ptDefine.csv
//--------------------------------------------------------------------
/**
 * @description 从 CSV 中解析支付条款定义（ptDefine.csv），返回映射对象
 * @param {string} filePath CSV 文件路径
 * @returns {Promise<object>} 形如 { [TermName]: { "Deposit Required": string, "Prepay H": string, "Net Days": string } }
 */
function parseWowTrackingCSV(filePath) {
  return new Promise((resolve, reject) => {
    const results = {};
    fs.createReadStream(filePath)
      .pipe(csv())
      .on("data", (row) => {
        // 这里取PT_Define 的Term Name作为result对象主键
        const vendorTermName = (row["Term Name"] || "").trim();
        results[vendorTermName] = {
          "Deposit Required": row["Deposit Required"] || "",
          "Prepay H": row["Prepay % (Due <= ERD)"] || "",
          "Net Days": row["Net Days (Due post ERD)"] || "",
        };
      })
      .on("end", () => resolve(results))
      .on("error", reject);
  });
}

//--------------------------------------------------------------------
// 2) 解析 paid_Feb25.csv
//--------------------------------------------------------------------
/**
 * @description 从 CSV 文件中解析各个 PO 的付款金额信息
 * @param {string} filePath CSV 文件路径
 * @returns {Promise<object>} 形如 { [poNumber]: number }，表示每个 PO 对应的已付金额
 */
function parsePaidCSV(filePath) {
  return new Promise((resolve, reject) => {
    const results = {};
    fs.createReadStream(filePath)
      .pipe(csv())
      .on("data", (row) => {
        // row.PO, row["Debit Amount"]
        const poNumber = (row["PO"] || "").trim();
        const debitAmount = parseFloat(row["Debit Amount"] || "0");
        results[poNumber] = isNaN(debitAmount) ? 0 : debitAmount;
      })
      .on("end", () => resolve(results))
      .on("error", reject);
  });
}

//--------------------------------------------------------------------
// 常用日期/百分比处理函数
//--------------------------------------------------------------------

/**
 * @description 解析类似 "3/4/2025" 或 "3/4/2025 7:58 am" 格式的日期字符串
 */
function parseDateMDY(str) {
  if (!str) return null;
  const datePart = str.split(" ")[0]; // "3/4/2025"
  const [m, d, y] = datePart.split("/");
  if (!m || !d || !y) return null;
  return new Date(Number(y), Number(m) - 1, Number(d));
}

/**
 * @description 将 Date 对象格式化为 "M/D/YYYY" 字符串
 */
function formatDateMDY(date) {
  if (!date) return "";
  const month = date.getMonth() + 1;
  const day = date.getDate();
  const year = date.getFullYear();
  return `${month}/${day}/${year}`;
}

/**
 * @description 给日期对象增加指定天数，返回新的日期对象
 */
function addDays(date, days) {
  if (!date) return null;
  const newDate = new Date(date.getTime());
  newDate.setDate(newDate.getDate() + days);
  return newDate;
}

/**
 * @description 将类似 "50%" 的字符串转换为 0.5，小数形式
 */
function parsePct(pctStr) {
  if (!pctStr) return 0;
  const val = parseFloat(pctStr.replace("%", "").trim());
  if (isNaN(val)) return 0;
  return val / 100;
}

/**
 * @description 根据给定日期返回 "Past Due" 或该日期对应的月份缩写
 */
const monthNames = [
  "Jan","Feb","Mar","Apr","May","Jun",
  "Jul","Aug","Sep","Oct","Nov","Dec"
];
function getAnchor(date) {
  if (!date) return "";
  const now = new Date();
  return date.getMonth() < now.getMonth() ? "Past Due" : monthNames[date.getMonth()];
}

//--------------------------------------------------------------------
// 主处理流程包装成一个函数
//--------------------------------------------------------------------
/**
 * @description 主处理流程：读取 Record + Vendor + CSVs，合并并输出最终 JSON
 * @param {string} sourceFile 采购订单 JSON 文件路径
 * @param {string} vendorFile 供应商 JSON 文件路径
 * @param {string} wowCsvFile ptDefine.csv 文件路径，用来定义支付条款
 * @param {string} paidCsvFile paid_Feb25.csv 文件路径，用来定义已付金额
 * @returns {Promise<string>} 返回输出的 final JSON 文件路径
 */
async function processFullSourcing(sourceFile, vendorFile, wowCsvFile, paidCsvFile) {
  try {
    // outputFile 动态生成
    const outputFile = `private/final_${getCurrentTime()}.json`;

    // ============ 1) 读取采购订单 JSON 数据 ============
    const sourceDataRaw = fs.readFileSync(sourceFile, "utf8");
    const sourceData = JSON.parse(sourceDataRaw);

    // ============ 2) 读取供应商 JSON 数据 ============
    const vendorDataRaw = fs.readFileSync(vendorFile, "utf8");
    const vendorData = JSON.parse(vendorDataRaw);

    // 验证结构
    if (!sourceData.success || !Array.isArray(sourceData.data)) {
      throw new Error("采购订单 JSON 结构无效");
    }
    if (!Array.isArray(vendorData.items)) {
      throw new Error("供应商 JSON 结构无效");
    }

    // ============ 3) 解析 WowTracking.csv (支付条款) ============
    console.log("📂 解析 WowTracking.csv...");
    const wowData = await parseWowTrackingCSV(wowCsvFile);

    // ============ 4) 建立 entityid -> term_name / terms 映射 ============
    const vendorMap = {};
    vendorData.items.forEach((vendor) => {
      vendorMap[vendor.entityid] = {
        term_name: vendor.term_name || "",
        terms: vendor.terms || "",
      };
    });
    console.log("✅ 已建立 Vendor ID -> term_name 的映射");

    // 用于记录在 ptDefine.csv 中未匹配到定义的供应商
    const undefinePT_vendor = new Set();
    const undefinePT_PO = new Set();

    // ============ 5) 合并来源：Record + vendorMap + wowData ============
    //    此时还不做 Lines 合并，每条 line 都保留
    let updatedData = sourceData.data.map((item) => {
      const vendorID = item.ID; // Record 中的 ID => vendor.entityid
      const vendorInfo = vendorMap[vendorID] || { term_name: "", terms: "" };
      const vendorTermName = vendorInfo.term_name; // 供应商的 term_name
      // 从 wowData 中根据 term_name 查找支付条款定义
      const wowInfo = wowData[vendorTermName] || {
        "Deposit Required": "",
        "Prepay H": "",
        "Net Days": "",
      };

      // 如果有 term_name，但在 csv 中找不到对应条款，则记录
      if (
        vendorInfo.term_name &&
        !wowInfo["Deposit Required"] &&
        !wowInfo["Prepay H"] &&
        !wowInfo["Net Days"]
      ) {
        undefinePT_vendor.add(item["Supplier"] + "(" + vendorInfo.term_name + ")");
        undefinePT_PO.add(item["PO #"] + "(" + vendorInfo.term_name + ")");
      }

      // 计算每行的初始 Balance = QTY * Cost in USD
      // 在后面会改名为 "Line_Values"
      const quantity = parseFloat(item["Quantity"] || "0") || 0;
      const costUSD = parseFloat(item["Cost in USD"] || "0") || 0;
      const initialBalance = (quantity * costUSD).toFixed(2);

      return {
        ...item,
        // 支付条款相关
        term_name: vendorInfo.term_name,
        Deposit_Required: wowInfo["Deposit Required"],
        Prepay_H: wowInfo["Prepay H"],
        Net_Days: wowInfo["Net Days"],
        // 初始化 “Balance” = QTY * Cost
        Balance: parseFloat(initialBalance)
      };
    });

    // ============ 6) 解析 paid_Feb25.csv ============
    console.log("📂 解析 paid_Feb25.csv...");
    const paidMap = await parsePaidCSV(paidCsvFile);

    // ============ 7) 计算每行的 "Line_ratio" 并派生新的 paid 值 ============
    // 先过滤掉 "ERD" 为空 或 "Closed" = true 的行
    updatedData = updatedData.filter((line) => {
      // 也可在此打印出被过滤的行信息
      if (!line["Estimated Ready Date / ERD"] || line["Closed"] === true) {
        // console.log(`[Remove invalid line] PO#: ${line["PO #"]}, line#: ${line["PO Line No."]}`);
        // 可以在此统计removed 的invalid line总数
        return false;
      }
      return true;
    });

    // 不合并 lines，但仍按 PO# 做分组以便计算 sum
    const poGroups = {};
    updatedData.forEach(line => {
      const poNum = line["PO #"] || "";
      if (!poGroups[poNum]) {
        poGroups[poNum] = [];
      }
      poGroups[poNum].push(line);
    });

    // 对每个 PO 先计算该 PO 全部行的 Balance 总和，然后给每行计算 ratio
    Object.keys(poGroups).forEach(poNum => {
      const group = poGroups[poNum];
      // 总 Balance
      const sumBalance = group.reduce((acc, line) => acc + (line.Balance || 0), 0);
      // 从 paid.csv 获取到该 PO 的付款总额
      const totalPaid = paidMap.hasOwnProperty(poNum) ? paidMap[poNum] : 0;

      // 为每行计算 ratio、paid、并准备后续使用
      if (sumBalance > 0) {
        group.forEach(line => {
          // line_ratio = line.Balance / sumBalance
          const ratio = line.Balance / sumBalance;
          line["Line_ratio"] = parseFloat(ratio.toFixed(4));
          // paid = totalPaid * ratio
          line["paid"] = parseFloat((totalPaid * ratio).toFixed(2));
        });
      } else {
        // 如果 sumBalance=0，说明全部行都无 cost/quantity，统一让 ratio=0、paid=0
        group.forEach(line => {
          line["Line_ratio"] = 0;
          line["paid"] = 0;
        });
      }
    });

    // 现在 updatedData 中每行都带有:
    // - "Balance" (行本身 QTY*Cost)
    // - "Line_ratio"
    // - "paid" = totalPaid * ratio
    // 后续我们要重命名 "Balance" -> "Line_Values" = "Balance" * ratio

    let finalData = updatedData; // 不需要任何合并

    // ============ 8) 重新处理“Line_Values”和“paid”的逻辑 ============
    // 1) 原先 "Balance" 重命名为 "Line_Values"
    // 2) "Line_Values" = 原Balance * line_ratio
    finalData.forEach(line => {
      const oldBalance = parseFloat(line.Balance || 0);
      const ratio = parseFloat(line["Line_ratio"] || 0);
      const newValue = oldBalance; 

      // 改名
      delete line.Balance; 
      line["Line_Values"] = parseFloat(newValue.toFixed(2));
    });

    // ============ 9) 统计 / 其他报告相关 ============
    // 目前不再有 multiple ERDs Conflict 或 ERDs Conflict Details，所以相关逻辑删除
    // 统计信息若需要可自行扩展

    // ============ 10) 对每行再计算 Deposit / Prepay / Unpaid ============
    // 现在所有押金、预付款、未付款的基准都用 "Line_Values"
    finalData.forEach(line => {
      // 解析数字
      const lineValue = parseFloat(line["Line_Values"] || 0);
      const paidVal   = parseFloat(line["paid"] || 0);

      // Unpaid = lineValue - paid
      const unpaidVal = lineValue - paidVal;
      line["Unpaid"] = {
        value: +unpaidVal.toFixed(2),
      };

      // Deposit
      const depositFrac = parsePct(line["Deposit_Required"]); 
      const dateEntered = parseDateMDY(line["Date Entered"] || "");
      const depositDate = addDays(dateEntered, 14);
      const depositDateStr = formatDateMDY(depositDate);
      const depositAnchor = getAnchor(depositDate);

      let depositDue = 0;
      if (paidVal <= 0) {
        depositDue = depositFrac * lineValue;
      }
      line["Deposit"] = {
        "Deposit Date": depositDateStr,
        "Deposit % Due": line["Deposit_Required"] || "0%",
        "Deposit anchor": depositAnchor,
        "Deposit $ Due": +depositDue.toFixed(2),
      };

      // Prepay
      const prepayFrac = parsePct(line["Prepay_H"]); // 0~1
      const erd = parseDateMDY(line["Estimated Ready Date / ERD"] || "");
      const prepayDateStr = formatDateMDY(erd);
      const prepayAnchor = getAnchor(erd);

      let prepayDue = 0;
      if (paidVal > 0) {
        prepayDue = prepayFrac * unpaidVal;
        if (prepayDue < 0) prepayDue = 0;
      }
      line["Prepay"] = {
        "Prepay Date": prepayDateStr,
        "Prepay % Due": line["Prepay_H"] || "0%",
        "Prepay anchor": prepayAnchor,
        "Prepay $ Due": +prepayDue.toFixed(2),
      };

      // 剩余尾款
      let remainderFrac = 1 - depositFrac - prepayFrac;
      if (remainderFrac < 0) remainderFrac = 0;
      const unpaidPctStr = `${(remainderFrac * 100).toFixed(0)}%`;

      const netDays = parseInt(line["Net_Days"] || "0", 10);
      const unpaidDate = addDays(erd, netDays);
      const unpaidDateStr = formatDateMDY(unpaidDate);
      const unpaidAnchor = getAnchor(unpaidDate);

      let remainderDue = 0;
      if (unpaidVal > 0) {
        const portion = remainderFrac * unpaidVal;
        remainderDue = Math.min(portion, unpaidVal);
      }
      line["Unpaid"]["Unpaid Date"] = unpaidDateStr;
      line["Unpaid"]["Unpaid % Due"] = unpaidPctStr;
      line["Unpaid"]["Unpaid anchor"] = unpaidAnchor;
      line["Unpaid"]["Unpaid $ Due"] = +remainderDue.toFixed(2);
    });

    // ============ 11) 为最终json report删除非关键字段 & term_name为空的处理 ============
    const fieldsToRemove = [
      "As Of Date",
      "Coordinator",
      "Brand",
      "Whse Internal ID",
      "Warehouse",
      "Seller Account",
      "Amazon Store Name",
      "Memo",
      "ESTIMATED READY DATE",
      "SKU",
      "Assembly SKU",
      "Description",
      "Cost in PO Currency",
      "Currency",
      "Early Pickup date",
      "Late Pickup Date",
      "Earliest Delivery Date",
      "LATEST DELIVERY DATE",
      "Quantity Received",
      "Quantity on Inbound Shipments",
      "Supplier Shipping Country Code",
      "Supplier Billing Country Code",
      "Supplier Ship From Country Code (From PO)",
      "Closed",
      "Custom Form",
      "XPO Integration Status",
      "Outbound Doc Sent to XPO Connect",
      "Send to XPO Connect",
      "Destination Type",
      "INCOTERM",
      "ARN#",
      "FBA Shipment ID#",
      "3PL FCID#"
    ];

    finalData.forEach(line => {
      fieldsToRemove.forEach(field => {
        delete line[field];
      });
    });

    // 删掉 term_name 为空的行，并记录其 PO# 与 Supplier
    const emptyTermNamePO = new Set();
    const emptyTermNameVendor = new Set();

    finalData = finalData.filter(line => {
      if (!line.term_name) {
        emptyTermNamePO.add(line["PO #"] || "");
        emptyTermNameVendor.add(line["Supplier"] || "");
        return false;
      }
      return true;
    });

    // 最终结果
    const finalJson = {
      data: finalData,
      "Empty Payment_Terms POs": [...emptyTermNamePO],
      "Empty Payment_Terms Vendors": [...emptyTermNameVendor],
      "Having Payment Term Value but not in PTDefine.csv Vendors": Array.from(undefinePT_vendor),
    };

    // 确保 private 目录存在
    const privateDir = path.resolve(__dirname, "../../private");
    if (!fs.existsSync(privateDir)) {
      fs.mkdirSync(privateDir, { recursive: true });
    }

    fs.writeFileSync(outputFile, JSON.stringify(finalJson, null, 2), "utf8");
    console.log(`✅ 全部处理完成，数据已保存到 ${outputFile}`);

    return outputFile; // 返回输出文件路径
  } catch (error) {
    console.error("❌ 处理失败:", error);
    throw error;
  }
}

// 导出函数
module.exports = {
  processFullSourcing,
};
