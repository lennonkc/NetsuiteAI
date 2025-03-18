// services/fullSourcing.js

const fs = require("fs");
const path = require("path");
const csv = require("csv-parser");

/**
 * @description 获取当前时间，格式为 "Mon_Day" (比如 "Mar_5")
 * @returns {string} 当前日期字符串
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
 * @returns {Promise<object>} 形如 { [poNumber]: number }，表示每个 PO 对应的付款金额
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
 * @param {string} str 待解析的日期字符串
 * @returns {Date|null} 返回 Date 对象或 null
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
 * @param {Date} date 
 * @returns {string} 形如 "3/5/2025"
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
 * @param {Date} date 原日期对象
 * @param {number} days 需要增加的天数
 * @returns {Date|null} 新的日期对象或 null
 */
function addDays(date, days) {
  if (!date) return null;
  const newDate = new Date(date.getTime());
  newDate.setDate(newDate.getDate() + days);
  return newDate;
}

/**
 * @description 将类似 "50%" 的字符串转换为 0.5，小数形式
 * @param {string} pctStr 字符串形式的百分比
 * @returns {number} 对应小数值，如 0.5
 */
function parsePct(pctStr) {
  if (!pctStr) return 0;
  const val = parseFloat(pctStr.replace("%", "").trim());
  if (isNaN(val)) return 0;
  return val / 100;
}

/**
 * @description 根据给定日期返回 "Past Due" 或该日期对应的月份缩写
 * @param {Date} date
 * @returns {string} "Past Due" 或 "Jan", "Feb", ...
 */
const monthNames = ["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"];
function getAnchor(date) {
  if (!date) return "";
  const now = new Date();
  // 若 date < now => "Past Due"；否则返回月份缩写
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
async function processFullSourcing(
  sourceFile,
  vendorFile,
  wowCsvFile,
  paidCsvFile
) {
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
    const updatedData = sourceData.data.map((item) => {
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
        undefinePT_vendor.add(
          item["Supplier"] + "(" + vendorInfo.term_name + ")"
        );
        undefinePT_PO.add(item["PO #"] + "(" + vendorInfo.term_name + ")");
      }

      // 返回合并后的行（带上支付条款）
      return {
        ...item,
        term_name: vendorInfo.term_name,
        Deposit_Required: wowInfo["Deposit Required"],
        Prepay_H: wowInfo["Prepay H"],
        Net_Days: wowInfo["Net Days"],
      };
    });

    // ============ 6) 解析 paid_Feb25.csv ============
    console.log("📂 解析 paid_Feb25.csv...");
    const paidMap = await parsePaidCSV(paidCsvFile);

    // ============ 7) 合并相同 PO 的多行 (基于“行号最小”逻辑) ============
    const poGroups = {};
    updatedData.forEach((line) => {
      const poNum = line["PO #"] || "";
      if (!poGroups[poNum]) {
        poGroups[poNum] = [];
      }
      poGroups[poNum].push(line);
    });

    let removalCount = 0;
    const finalData = [];

    // 拼接工具，用于逗号拼接字符串
    function appendValue(base, addition) {
      if (!base) return addition || "";
      if (!addition) return base;
      return base + "," + addition;
    }

    Object.keys(poGroups).forEach((poNum) => {
      let group = poGroups[poNum];

      // 过滤掉 ERD 为空或 Closed=true 的行
      group = group.filter((line) => {
        if (!line["Estimated Ready Date / ERD"] || line["Closed"] === true) {
          // console.log(`[Remove line => empty ERD or closed] PO#: ${poNum}, line#: ${line["PO Line No."]}`);
          return false;
        }
        return true;
      });

      // 若过滤后无行，跳过
      if (!group.length) {
        return;
      }

      // 判断是否有多个不同ERD => 冲突
      const allERDs = group.map((line) => line["Estimated Ready Date / ERD"]);
      const distinctERDs = [...new Set(allERDs)];
      const hasConflict = distinctERDs.length > 1;

      // 找到行号最小的那一行作为基准行
      let baseLine = group[0];
      let minLineNo = parseInt(baseLine["PO Line No."] || "999999", 10);
      for (let i = 1; i < group.length; i++) {
        const lineNoVal = parseInt(group[i]["PO Line No."] || "999999", 10);
        if (lineNoVal < minLineNo) {
          baseLine = group[i];
          minLineNo = lineNoVal;
        }
      }

      // 合并其他行到 baseLine
      let balanceSum = 0;
      group.forEach((line) => {
        const q = parseFloat(line["Quantity"] || "0") || 0;
        const c = parseFloat(line["Cost in USD"] || "0") || 0;
        balanceSum += q * c;

        if (line !== baseLine) {
          baseLine["PO Line No."] = appendValue(
            baseLine["PO Line No."],
            line["PO Line No."]
          );
          baseLine["Quantity"] = appendValue(
            baseLine["Quantity"],
            line["Quantity"]
          );
          baseLine["Cost in USD"] = appendValue(
            baseLine["Cost in USD"],
            line["Cost in USD"]
          );
          baseLine["ASIN"] = appendValue(
            baseLine["ASIN"],
            line["ASIN"]
          );

          // 其余字段使用“最后一行”的值
          for (const key of Object.keys(line)) {
            if (
              [
                "PO #",
                "PO Line No.",
                "Quantity",
                "Cost in USD",
                "Estimated Ready Date / ERD",
              ].includes(key)
            ) {
              continue;
            }
            baseLine[key] = line[key];
          }
        }
      });

      // 合并结果字段
      baseLine["Balance"] = balanceSum.toFixed(2);
      baseLine["multiple ERDs Conflict"] = hasConflict;
      baseLine["ERDs Conflict Details"] = hasConflict
        ? allERDs.join(",")
        : "";

      removalCount += group.length - 1;
      finalData.push(baseLine);
    });

    // ============ 8) 设置 paid 字段 ============
    finalData.forEach((line) => {
      const poNum = line["PO #"] || "";
      line["paid"] = paidMap.hasOwnProperty(poNum) ? paidMap[poNum] : 0;
    });

    // ============ 9) 统计 ============
    // 统计存在 line 冲突的 PO 数量
    const conflictERDsCount = finalData.filter((line) => {
      return line["multiple ERDs Conflict"] === true;
    }).length;

    // ============ 10) 为每个元素添加“Deposit”、“Prepay”、“Unpaid”等信息 ============
    finalData.forEach((line) => {
      // 解析数字, 这里的Balance是整个PO所有Lines的 QTY*Cost
      const balanceVal = parseFloat(line["Balance"] || "0") || 0;
      const paidVal = parseFloat(line["paid"] || "0") || 0;

      // 1) Unpaid = Balance - paid
      const unpaidVal = balanceVal - paidVal;
      line["Unpaid"] = {
        value: +unpaidVal.toFixed(2),
      };

      // 2) Deposit  (PaidVal <= 0 则需要交押金)
      const depositFrac = parsePct(line["Deposit_Required"]); // 0~1
      const dateEntered = parseDateMDY(line["Date Entered"] || "");
      const depositDate = addDays(dateEntered, 14);
      const depositDateStr = formatDateMDY(depositDate);
      const depositAnchor = getAnchor(depositDate);

      let depositDue = 0;
      if (paidVal <= 0) {
        depositDue = depositFrac * balanceVal;
      }
      line["Deposit"] = {
        "Deposit Date": depositDateStr,
        "Deposit % Due": line["Deposit_Required"] || "0%",
        "Deposit anchor": depositAnchor,
        "Deposit $ Due": +depositDue.toFixed(2),
      };

      // 3) Prepay
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

      // 4) Unpaid (对象部分)
      let remainderFrac = 1 - depositFrac - prepayFrac;
      if (remainderFrac < 0) remainderFrac = 0;
      const unpaidPctStr = `${(remainderFrac * 100).toFixed(0)}%`;

      const netDays = parseInt(line["Net_Days"] || "0", 10);
      const unpaidDate = addDays(erd, netDays);
      const unpaidDateStr = formatDateMDY(unpaidDate);
      const unpaidAnchor = getAnchor(unpaidDate);

      let unpaidDue = 0;
      if (unpaidVal > 0) {
        const portion = remainderFrac * unpaidVal;
        unpaidDue = Math.min(portion, unpaidVal);
      }
      line["Unpaid"]["Unpaid Date"] = unpaidDateStr;
      line["Unpaid"]["Unpaid % Due"] = unpaidPctStr;
      line["Unpaid"]["Unpaid anchor"] = unpaidAnchor;
      line["Unpaid"]["Unpaid $ Due"] = +unpaidDue.toFixed(2);
    });

    // ============ 11) 为最终的 json report 删除非关键字段 ============
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

    // 保留 term_name 不为空的行
    const removed_emptyPT_finalData = finalData.filter(line => {
      if (!line.term_name) {
        emptyTermNamePO.add(line["PO #"] || "");
        emptyTermNameVendor.add(line["Supplier"] || "");
        return false;
      }
      return true;
    });

    // 计算因为 line 冲突导致的误差估计
    let ErrorEstimationDueToLineConflicts = 0;
    removed_emptyPT_finalData.forEach(line => {
      if (line["multiple ERDs Conflict"] === true) {
        // 这里简单地将 10% (0.1) 作为一个冲突导致的误差乘以 Unpaid
        ErrorEstimationDueToLineConflicts += line["Unpaid"]["Unpaid $ Due"] * 0.1;
      }
    });

    // 构造最终输出 JSON
    const finalJson = {
      data: removed_emptyPT_finalData,
      "Removals Dulplicate Line": removalCount,
      "[POs total Amounts] - [POs unvalid Amounts] = POs valid Amounts": `[${finalData.length}] - [${emptyTermNamePO.size}] = ${removed_emptyPT_finalData.length}`,
      "Empty Payment_Terms POs": [...emptyTermNamePO],
      "Empty Payment_Terms Vendors": [...emptyTermNameVendor],
      "Mutiple ERDs conflict PO Count": conflictERDsCount,
      "Error Estimation Due To Line Conflicts": ErrorEstimationDueToLineConflicts.toFixed(2),
      "Having Payment Term Value but not in PTDefine.csv Vendors": Array.from(undefinePT_vendor),
    };

    // 确保 private 目录存在
    const privateDir = path.resolve(__dirname, "../../private");
    if (!fs.existsSync(privateDir)) {
      fs.mkdirSync(privateDir, { recursive: true });
    }

    // 写入最终文件
    fs.writeFileSync(outputFile, JSON.stringify(finalJson, null, 2), "utf8");

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
